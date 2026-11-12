import { useMemo, useRef, useState } from 'react';
import { evaluate, identity, trackId } from './model';
import type { Keyframe, Project, Selection, Vec3 } from './model';
import type { CubicEase, TransformChannel } from './curves';
import { easePresets } from './curves';
import type { SelectedKey } from './Timeline';
import { NumberField } from './components';
import { sampleCameraRail } from './camera-rail';
import { lowerFrame } from './time-index';
type Props = {
  project: Project;
  selection: Selection;
  frame: number;
  selectedKey: SelectedKey;
  onFrame: (frame: number) => void;
  onSelectKey: (key: SelectedKey, selection: Selection) => void;
  onPatchKey: (track: string, from: number, key: Keyframe) => void;
  onInsert: () => void;
};
const channels = [
  'position.x',
  'position.y',
  'position.z',
  'rotation.x',
  'rotation.y',
  'rotation.z',
  'scale.x',
  'scale.y',
  'scale.z',
] as TransformChannel[];
const channelValue = (key: ReturnType<typeof identity>, channel: TransformChannel) => {
  const [group, axis] = channel.split('.');
  return (
    key[group as keyof ReturnType<typeof identity>]['xyz'.indexOf(axis)] *
    (group === 'rotation' ? 180 / Math.PI : 1)
  );
};
const setValue = (key: Keyframe, channel: TransformChannel, value: number): Keyframe => {
  const [group, axis] = channel.split('.'),
    g = group as 'position' | 'rotation' | 'scale',
    values = [...key[g]] as Vec3;
  values['xyz'.indexOf(axis)] =
    group === 'rotation'
      ? (value * Math.PI) / 180
      : group === 'scale'
        ? Math.max(0.001, value)
        : value;
  return { ...key, [g]: values };
};
export function GraphEditor(p: Props) {
  const [channel, setChannel] = useState<TransformChannel>('rotation.x'),
    [pending, setPending] = useState<{ from: number; key: Keyframe } | null>(null);
  const svg = useRef<SVGSVGElement>(null),
    track = p.selection ? trackId(p.selection) : '',
    original = p.project.tracks[track] || [];
  const camera = p.project.objects.find(
    (o) => o.id === track && o.type === 'camera' && o.cameraRail,
  );
  const railRotation = !!camera && channel.startsWith('rotation');
  const keys = pending
    ? original.map((k) => (k.frame === pending.from ? pending.key : k))
    : original;
  const selected =
    p.selectedKey?.track === track
      ? keys.find((k) => k.frame === p.selectedKey?.frame) ||
        (pending && pending.from === p.selectedKey?.frame ? pending.key : undefined)
      : undefined;
  const selectedIndex = selected ? keys.indexOf(selected) : -1,
    next = keys[selectedIndex + 1];
  const range = useMemo(() => {
    const values = original.map((k) => channelValue(k, channel));
    const low = Math.min(0, ...values),
      high = Math.max(channel.startsWith('scale') ? 1 : 0, ...values);
    const padding = Math.max(0.2, (high - low) * 0.2);
    return { low: low - padding, high: high + padding };
  }, [original, channel]);
  const left = 66,
    right = 984,
    top = 18,
    bottom = 214,
    x = (frame: number) => left + (frame / p.project.duration) * (right - left),
    y = (value: number) =>
      bottom - ((value - range.low) / (range.high - range.low)) * (bottom - top);
  const local = (event: PointerEvent | React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - r.left) / r.width) * 1000,
      y: ((event.clientY - r.top) / r.height) * 240,
    };
  };
  const drag = (event: React.PointerEvent<SVGElement>, key: Keyframe, handle?: 0 | 1) => {
    if (event.button !== 0 || !p.selection) return;
    event.preventDefault();
    event.stopPropagation();
    const selection = p.selection,
      el = event.currentTarget,
      start = local(event),
      index = original.findIndex((k) => k.frame === key.frame),
      following = original[index + 1];
    let updated = key;
    el.setPointerCapture(event.pointerId);
    p.onSelectKey({ track, frame: key.frame }, selection);
    p.onFrame(key.frame);
    const move = (e: PointerEvent) => {
      const point = local(e);
      if (handle !== undefined && following) {
        const curve = [
          ...(key.curves?.[channel] ||
            key.easing ||
            (key.interpolation === 'linear' ? [1 / 3, 1 / 3, 2 / 3, 2 / 3] : [1 / 3, 0, 2 / 3, 1])),
        ] as CubicEase;
        const delta = channelValue(following, channel) - channelValue(key, channel);
        curve[handle * 2] = Math.max(
          0,
          Math.min(
            1,
            (((point.x - left) / (right - left)) * p.project.duration - key.frame) /
              (following.frame - key.frame),
          ),
        );
        curve[handle * 2 + 1] = Math.max(
          -4,
          Math.min(
            4,
            (((bottom - point.y) / (bottom - top)) * (range.high - range.low) +
              range.low -
              channelValue(key, channel)) /
              delta,
          ),
        );
        updated = { ...key, interpolation: 'bezier', curves: { ...key.curves, [channel]: curve } };
      } else {
        const frame = Math.max(
          original[index - 1]?.frame + 1 || 0,
          Math.min(
            original[index + 1] ? original[index + 1].frame - 1 : p.project.duration,
            Math.round(key.frame + ((point.x - start.x) / (right - left)) * p.project.duration),
          ),
        );
        updated = setValue(
          { ...key, frame },
          channel,
          channelValue(key, channel) -
            ((point.y - start.y) / (bottom - top)) * (range.high - range.low),
        );
      }
      setPending({ from: key.frame, key: updated });
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      if (updated !== key) p.onPatchKey(track, key.frame, updated);
      setPending(null);
    };
    const cancel = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      setPending(null);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
  };
  const lines = useMemo(() => {
    const count = Math.min(600, Math.max(120, p.project.duration));
    const samples = Array.from({ length: count + 1 }, (_, i) => {
      const frame = (i / count) * p.project.duration;
      const sample =
        (camera && sampleCameraRail(keys, frame, camera.fov || 40, camera.cameraRail)) ||
        evaluate(keys, frame, identity());
      return { x: x(frame), sample };
    });
    return channels
      .filter((c) => c.split('.')[0] === channel.split('.')[0])
      .map((c) => ({
        channel: c,
        points: samples.map((point) => `${point.x},${y(channelValue(point.sample, c))}`).join(' '),
      }));
  }, [original, pending, p.project.duration, range, channel, camera]);
  const keyMarkers = useMemo(() => {
    if (keys.length <= 450) return keys;
    const markers: Keyframe[] = [];
    for (let i = 0; i < keys.length;) {
      const key = keys[i];
      const bin = Math.floor(x(key.frame) / 4);
      const next = Math.max(
        i + 1,
        lowerFrame(keys, (((bin + 1) * 4 - left) / (right - left)) * p.project.duration),
      );
      markers.push(
        selected && selected.frame >= key.frame && selected.frame <= keys[next - 1].frame
          ? selected
          : key,
      );
      i = next;
    }
    return markers;
  }, [original, pending, selected, p.project.duration]);
  const curve =
    selected?.curves?.[channel] ||
    selected?.easing ||
    (selected?.interpolation === 'linear' ? [1 / 3, 1 / 3, 2 / 3, 2 / 3] : [1 / 3, 0, 2 / 3, 1]);
  const delta =
    selected && next ? channelValue(next, channel) - channelValue(selected, channel) : 0;
  const patch = (key: Keyframe) => {
    if (selected) p.onPatchKey(track, selected.frame, key);
  };
  return (
    <div className="graph-editor">
      <div className="graph-channels" aria-label="Graph channels">
        {channels.map((c) => (
          <button key={c} className={channel === c ? 'selected' : ''} onClick={() => setChannel(c)}>
            <span className={`curve-swatch swatch-${c.at(-1)}`} />
            {c.split('.')[0]} <b>{c.at(-1)?.toUpperCase()}</b>
          </button>
        ))}
      </div>
      <div className="graph-main">
        <div className="graph-controls">
          <span>
            {channel.startsWith('rotation')
              ? 'Degrees'
              : channel.startsWith('position')
                ? 'Blocks'
                : 'Scale'}
          </span>
          {selected ? (
            <>
              <label>
                Value{' '}
                <NumberField
                  label="Graph key value"
                  value={channelValue(selected, channel)}
                  onCommit={(v) => patch(setValue(selected, channel, v))}
                />
              </label>
              <select
                aria-label="Graph interpolation"
                value={selected.interpolation}
                onChange={(e) =>
                  patch({ ...selected, interpolation: e.target.value as Keyframe['interpolation'] })
                }
              >
                <option value="smooth">Smooth</option>
                <option value="linear">Linear</option>
                <option value="step">Constant</option>
                <option value="bezier">Bézier</option>
              </select>
              <select
                aria-label="Curve easing preset"
                value=""
                disabled={railRotation}
                onChange={(e) =>
                  patch({
                    ...selected,
                    interpolation: 'bezier',
                    curves: { ...selected.curves, [channel]: easePresets[e.target.value] },
                  })
                }
              >
                <option value="" disabled>
                  Easing preset…
                </option>
                {Object.keys(easePresets).map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
              <small>
                {railRotation
                  ? 'Camera rotation follows the shortest 3D arc'
                  : 'Drag keys or the two segment handles'}
              </small>
            </>
          ) : (
            <small>Select a key to edit its value and easing</small>
          )}
        </div>
        {keys.length ? (
          <svg
            ref={svg}
            className="curve-canvas"
            viewBox="0 0 1000 240"
            preserveAspectRatio="none"
            role="img"
            aria-label="Animation graph curves"
            onPointerDown={(e) => {
              if (e.button === 0)
                p.onFrame(
                  Math.max(
                    0,
                    Math.min(
                      p.project.duration,
                      Math.round(((local(e).x - left) / (right - left)) * p.project.duration),
                    ),
                  ),
                );
            }}
          >
            <defs>
              <clipPath id="graph-clip">
                <rect
                  x={left - 8}
                  y={top - 6}
                  width={right - left + 16}
                  height={bottom - top + 12}
                />
              </clipPath>
            </defs>
            {Array.from({ length: 6 }, (_, i) => {
              const value = range.low + ((range.high - range.low) * i) / 5;
              return (
                <g key={`y${i}`}>
                  <line x1={left} x2={right} y1={y(value)} y2={y(value)} className="graph-grid" />
                  <text x={left - 8} y={y(value) + 3} textAnchor="end">
                    {Number(value.toFixed(2))}
                  </text>
                </g>
              );
            })}
            {Array.from({ length: 11 }, (_, i) => {
              const frame = (p.project.duration * i) / 10;
              return (
                <g key={i}>
                  <line x1={x(frame)} x2={x(frame)} y1={top} y2={bottom} className="graph-grid" />
                  <text x={x(frame)} y="234" textAnchor="middle">
                    {Math.round(frame)}
                  </text>
                </g>
              );
            })}
            <g clipPath="url(#graph-clip)">
              {lines.map((l) => (
                <polyline
                  key={l.channel}
                  points={l.points}
                  className={`graph-curve ${l.channel === channel ? 'active' : ''}`}
                  strokeDasharray={
                    l.channel.endsWith('.y') ? '6 3' : l.channel.endsWith('.z') ? '2 3' : undefined
                  }
                />
              ))}
              <line
                x1={x(p.frame)}
                x2={x(p.frame)}
                y1={top}
                y2={bottom}
                className="graph-playhead"
              />
              {selected &&
                next &&
                !railRotation &&
                Math.abs(delta) > 1e-8 &&
                ([0, 1] as const).map((handle) => {
                  const hx = x(selected.frame + curve[handle * 2] * (next.frame - selected.frame)),
                    hy = y(channelValue(selected, channel) + curve[handle * 2 + 1] * delta),
                    anchor = handle === 0 ? selected : next;
                  return (
                    <g key={handle}>
                      <line
                        x1={x(anchor.frame)}
                        y1={y(channelValue(anchor, channel))}
                        x2={hx}
                        y2={hy}
                        className="graph-handle-line"
                      />
                      <circle
                        cx={hx}
                        cy={hy}
                        r="5"
                        className="graph-handle"
                        aria-label={`Bezier handle ${handle + 1}`}
                        onPointerDown={(e) => drag(e, selected, handle)}
                      />
                    </g>
                  );
                })}
              {keyMarkers.map((k) => (
                <rect
                  key={k.frame}
                  x={x(k.frame) - 4}
                  y={y(channelValue(k, channel)) - 4}
                  width="8"
                  height="8"
                  className={`graph-key ${selected === k ? 'selected' : ''}`}
                  aria-label={`Graph keyframe ${k.frame}`}
                  onPointerDown={(e) => drag(e, k)}
                />
              ))}
            </g>
          </svg>
        ) : (
          <div className="graph-empty">
            <strong>
              {p.selection ? 'No keyframes on this track' : 'Select an object or a bone'}
            </strong>
            <p>Insert two poses at different frames to shape the motion between them.</p>
            {p.selection && (
              <button className="button" onClick={p.onInsert}>
                Insert Keyframe
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
