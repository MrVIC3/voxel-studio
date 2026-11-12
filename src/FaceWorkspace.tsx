import { useMemo, useState } from 'react';
import type { PointerEvent } from 'react';
import { Copy, DiamondPlus, Eye, Pause, Play, RotateCcw } from 'lucide-react';
import { FacePanel } from './FacePanel';
import type { FaceEdit } from './FacePanel';
import { FacePreview } from './FacePreview';
import type { FaceAngle } from './FacePreview';
import { defaultFaceRig, evaluateFace, setFaceKey } from './face';
import type { FaceKey, FacePose } from './face';
import { lowerFrame, upperFrame } from './time-index';
import { NumberField } from './components';
import { bones, getTransform } from './model';
import type { BoneName, Project, SceneObject, Transform } from './model';
import './face-workspace.css';
import { CharacterLayerPanel } from './CharacterLayerPanel';
import { CharacterLookPanel } from './CharacterLookPanel';
import type { HighlightPick } from './CharacterLookPanel';
import type { CharacterLayers } from './character-layers';
import { lookFallback } from './character-look';
import type { CharacterLook, LookPart } from './character-look';

const emptyKeys: FaceKey[] = [];
const clamp = (n: number, min = -1, max = 1) => Math.min(max, Math.max(min, n));

export function FaceWorkspace(p: {
  actors: SceneObject[];
  actor?: SceneObject;
  project: Project;
  skin?: string;
  textures?: Record<string, string>;
  keys?: FaceKey[];
  frame: number;
  duration: number;
  fps: number;
  autoKey: boolean;
  playing: boolean;
  onActor: (id: string) => void;
  onSeek: (frame: number) => void;
  onPlay: () => void;
  onEdit: (edit: FaceEdit) => void;
  onAutoKey: () => void;
  onHeadwear: (visible: boolean) => void;
  onLayers: (value?: CharacterLayers) => void;
  onLook: (value?: CharacterLook) => void;
}) {
  const [angle, setAngle] = useState<FaceAngle>('front');
  const [mode, setMode] = useState<'face' | 'layers' | 'light'>('face');
  const [part, setPart] = useState<LookPart>('all');
  const [pick, setPick] = useState<HighlightPick>();
  const [showLight, setShowLight] = useState(true);
  const [lookDraft, setLookDraft] = useState<CharacterLook>();
  const [draft, setDraft] = useState<{ id: string; frame: number; pose: FacePose }>();
  const [copied, setCopied] = useState<FacePose>();
  const [range, setRange] = useState(96);
  const [notice, setNotice] = useState('');
  const actor = p.actor,
    keys = p.keys || emptyKeys,
    config = actor?.face || defaultFaceRig;
  const bodyPose = useMemo(() => {
    if (!actor || mode === 'face') return;
    return Object.fromEntries(
      bones.map((bone) => [bone, getTransform(p.project, { id: actor.id, bone }, p.frame)]),
    ) as Record<BoneName, Transform>;
  }, [actor, mode, p.project, p.frame]);
  const look = lookDraft ?? actor?.characterLook;
  const commitLook = (value: CharacterLook) => {
    setLookDraft(undefined);
    p.onLook(value);
  };
  const pickTarget = (target: LookPart, color?: string) => {
    setPart(target);
    setPick(undefined);
    if (look && color)
      commitLook({
        ...look,
        parts: { ...look.parts, [target]: { ...lookFallback(look, target), maskColor: color } },
      });
  };
  const base = evaluateFace(config, keys, p.frame, p.fps, actor?.id || '', false);
  const previewPose = p.playing
    ? evaluateFace(config, keys, p.frame, p.fps, actor?.id || '')
    : draft && draft.id === actor?.id && draft.frame === p.frame
      ? draft.pose
      : base;
  const active =
    keys[lowerFrame(keys, p.frame)]?.frame === p.frame
      ? keys[lowerFrame(keys, p.frame)]
      : undefined;
  const edit = (change: FaceEdit) => {
    setDraft(undefined);
    setNotice('');
    p.onEdit(change);
  };
  const preview = (pose: FacePose) => {
    if (!actor) return;
    if (p.playing) p.onPlay();
    setDraft({ id: actor.id, frame: p.frame, pose });
  };
  const gaze = (x: number, y: number, commit: boolean) => {
    const pose = { ...base, lookX: clamp(x), lookY: clamp(y) };
    if (!commit) preview(pose);
    else if (p.autoKey || keys.length) edit({ keys: setFaceKey(keys, p.frame, pose) });
    else edit({ config: { ...config, pose } });
  };
  const pickGaze = (event: PointerEvent<HTMLDivElement>, commit: boolean) => {
    const box = event.currentTarget.getBoundingClientRect();
    gaze(
      (2 * (event.clientX - box.left)) / box.width - 1,
      1 - (2 * (event.clientY - box.top)) / box.height,
      commit,
    );
  };
  const seek = (frame: number) => {
    setDraft(undefined);
    setNotice('');
    p.onSeek(frame);
  };
  const pageWidth = Math.min(p.duration, range || p.duration);
  const start = Math.min(Math.floor(p.frame / pageWidth) * pageWidth, p.duration - pageWidth);
  const end = start + pageWidth;
  const visible = keys.slice(lowerFrame(keys, start), upperFrame(keys, end));
  const marks = new Map<number, FaceKey>();
  for (const key of visible) {
    const slot = Math.round((160 * (key.frame - start)) / pageWidth);
    if (!marks.has(slot) || key.frame === p.frame) marks.set(slot, key);
  }
  const percent = (frame: number) => (100 * (frame - start)) / pageWidth + '%';
  const canEdit = !!actor && !actor.locked && config.enabled;
  const moveKey = (target: number) => {
    if (!active || !canEdit) return false;
    const frame = Math.round(target);
    if (frame === active.frame) return true;
    if (keys[lowerFrame(keys, frame)]?.frame === frame) {
      setNotice('That frame already has a face key.');
      return false;
    }
    edit({
      keys: setFaceKey(
        keys.filter((key) => key !== active),
        frame,
        active.pose,
        active.interpolation,
      ),
    });
    seek(frame);
    return true;
  };
  return (
    <div
      className="face-workbench"
      tabIndex={0}
      onPointerDown={(event) => {
        if (
          !(event.target as HTMLElement).closest('input,select,textarea,button,[contenteditable]')
        )
          event.currentTarget.focus({ preventScroll: true });
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && pick) {
          event.stopPropagation();
          setPick(undefined);
          return;
        }
        if (
          !(event.ctrlKey || event.metaKey) ||
          !canEdit ||
          mode !== 'face' ||
          (event.target as HTMLElement).closest('input,select,textarea,[contenteditable]')
        )
          return;
        if (event.key.toLowerCase() === 'c') {
          event.preventDefault();
          event.stopPropagation();
          setCopied({ ...previewPose });
        }
        if (event.key.toLowerCase() === 'v' && copied) {
          event.preventDefault();
          event.stopPropagation();
          edit({ keys: setFaceKey(keys, p.frame, copied) });
        }
      }}
    >
      <header className="face-workbench-bar">
        <span className="face-workbench-title">
          <Eye size={16} /> Character Editor
        </span>
        <div className="face-mode-switch character-modes">
          {(
            [
              ['face', 'Face'],
              ['layers', '3D Layers'],
              ['light', 'Highlights'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className="button compact"
              aria-pressed={mode === id}
              onClick={() => {
                setMode(id);
                setPick(undefined);
                setLookDraft(undefined);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <label>
          Actor{' '}
          <select
            aria-label="Character editor actor"
            value={actor?.id || ''}
            onChange={(e) => {
              setDraft(undefined);
              setPick(undefined);
              setLookDraft(undefined);
              setPart('all');
              p.onActor(e.target.value);
            }}
          >
            {!p.actors.length && <option value="">No characters</option>}
            {p.actors.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          View{' '}
          <select
            aria-label="Face preview angle"
            value={angle}
            onChange={(e) => setAngle(e.target.value as FaceAngle)}
          >
            <option value="front">Front</option>
            <option value="three-quarter">Three-quarter</option>
            <option value="profile">Profile</option>
          </select>
        </label>
      </header>
      {!actor ? (
        <div className="face-workbench-empty">
          Add or import a character to start animating its face.
        </div>
      ) : (
        <>
          <div className="face-workbench-body">
            <div className="face-workbench-stage">
              <FacePreview
                actor={actor}
                skin={p.skin}
                config={config}
                pose={previewPose}
                angle={angle}
                textures={p.textures}
                fullBody={mode !== 'face'}
                bodyPose={bodyPose}
                look={look}
                showLight={mode === 'light' && showLight}
                pick={mode === 'light' ? pick : undefined}
                onPick={pickTarget}
                onLight={(value, commit) => (commit ? commitLook(value) : setLookDraft(value))}
              />
              {mode === 'light' && look?.enabled !== false && look && (
                <label className="character-light-visibility check-row">
                  <input
                    type="checkbox"
                    checked={showLight}
                    onChange={(event) => setShowLight(event.target.checked)}
                  />{' '}
                  Show light handle
                </label>
              )}
              <small className="face-preview-help">
                {mode === 'light' && pick
                  ? pick === 'target'
                    ? 'Click a character part to edit it · Esc to cancel'
                    : 'Click a skin pixel to isolate its color · Esc to cancel'
                  : mode === 'light' && look && look.enabled !== false && showLight
                    ? 'Drag light handle to aim · Drag background to orbit · Scroll to zoom'
                    : 'Drag to orbit · Scroll to zoom'}
              </small>
            </div>
            <aside className="face-workbench-controls" aria-label="Character controls">
              {mode === 'layers' && (
                <CharacterLayerPanel
                  value={actor.characterLayers}
                  locked={!!actor.locked}
                  onChange={p.onLayers}
                />
              )}
              {mode === 'light' && (
                <CharacterLookPanel
                  value={look}
                  locked={!!actor.locked}
                  part={part}
                  pick={pick}
                  onPart={setPart}
                  onPick={setPick}
                  onChange={commitLook}
                  onPreview={setLookDraft}
                />
              )}
              {mode === 'face' && (
                <>
                  {config.enabled && (
                    <div className="gaze-editor">
                      <div>
                        <strong>Gaze</strong>
                        <button
                          className="button compact"
                          disabled={!canEdit}
                          onClick={() => gaze(0, 0, true)}
                        >
                          <RotateCcw size={12} /> Center
                        </button>
                      </div>
                      <div
                        className="gaze-pad"
                        tabIndex={canEdit ? 0 : -1}
                        role="group"
                        aria-label="Gaze pad. Drag or use the arrow keys to move both eyes."
                        aria-disabled={!canEdit}
                        onPointerDown={(e) => {
                          if (!canEdit || e.button !== 0) return;
                          e.currentTarget.focus();
                          e.currentTarget.setPointerCapture(e.pointerId);
                          pickGaze(e, false);
                        }}
                        onPointerMove={(e) => {
                          if (canEdit && e.currentTarget.hasPointerCapture(e.pointerId))
                            pickGaze(e, false);
                        }}
                        onPointerUp={(e) => {
                          if (canEdit && e.currentTarget.hasPointerCapture(e.pointerId))
                            pickGaze(e, true);
                        }}
                        onPointerCancel={() => setDraft(undefined)}
                        onKeyDown={(e) => {
                          const axis = {
                            ArrowLeft: [-0.1, 0],
                            ArrowRight: [0.1, 0],
                            ArrowUp: [0, 0.1],
                            ArrowDown: [0, -0.1],
                          }[e.key];
                          if (!canEdit || !axis) return;
                          e.preventDefault();
                          e.stopPropagation();
                          gaze(base.lookX + axis[0], base.lookY + axis[1], true);
                        }}
                      >
                        <span
                          style={{
                            left: (previewPose.lookX + 1) * 50 + '%',
                            top: (1 - previewPose.lookY) * 50 + '%',
                          }}
                        />
                      </div>
                    </div>
                  )}
                  <FacePanel
                    id={actor.id}
                    config={config}
                    keys={keys}
                    frame={p.frame}
                    fps={p.fps}
                    autoKey={p.autoKey}
                    locked={actor.locked}
                    onSeek={seek}
                    onEdit={edit}
                    onPreview={preview}
                    headwearVisible={actor.characterLayers?.headwear?.visible !== false}
                    onHeadwear={p.onHeadwear}
                  />
                </>
              )}
            </aside>
          </div>
          {mode === 'face' && (
            <section className="face-track" aria-label="Face keyframe timeline">
              <div className="face-track-tools">
                <button
                  className="button compact"
                  aria-label={p.playing ? 'Pause face preview' : 'Play face preview'}
                  onClick={p.onPlay}
                >
                  {p.playing ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <label>
                  Frame{' '}
                  <NumberField
                    label="Face current frame"
                    min={0}
                    max={p.duration}
                    step={1}
                    value={p.frame}
                    onCommit={(n) => seek(Math.round(n))}
                  />
                </label>
                <button
                  className="button compact"
                  disabled={!canEdit}
                  onClick={() => edit({ keys: setFaceKey(keys, p.frame, previewPose) })}
                >
                  <DiamondPlus size={14} />
                  {active ? 'Update Key' : 'Insert Key'}
                </button>
                <button
                  className="button compact"
                  disabled={!config.enabled}
                  onClick={() => setCopied({ ...previewPose })}
                >
                  <Copy size={13} /> Copy Pose
                </button>
                <button
                  className="button compact"
                  disabled={!canEdit || !copied}
                  onClick={() => copied && edit({ keys: setFaceKey(keys, p.frame, copied) })}
                >
                  Paste as Key
                </button>
                <label title="Start a facial track when editing a pose">
                  <input type="checkbox" checked={p.autoKey} onChange={p.onAutoKey} /> Auto Key
                </label>
                {active && (
                  <label>
                    Move key{' '}
                    <NumberField
                      label="Move face key to frame"
                      min={0}
                      max={p.duration}
                      step={1}
                      value={active.frame}
                      onCommit={moveKey}
                    />
                  </label>
                )}
                <label className="face-range">
                  Range{' '}
                  <select
                    aria-label="Face timeline zoom"
                    value={range}
                    onChange={(e) => setRange(+e.target.value)}
                  >
                    <option value={24}>24 frames</option>
                    <option value={96}>96 frames</option>
                    <option value={480}>480 frames</option>
                    <option value={0}>Entire scene</option>
                  </select>
                </label>
              </div>
              <div className="face-ruler">
                <input
                  type="range"
                  aria-label="Scrub face timeline"
                  min={start}
                  max={end}
                  value={p.frame}
                  onChange={(e) => seek(+e.target.value)}
                />
                <div className="face-ruler-marks">
                  <span className="face-playhead" style={{ left: percent(p.frame) }} />
                  {[...marks.values()].map((key) => (
                    <button
                      key={key.frame}
                      type="button"
                      className={key.frame === p.frame ? 'current' : ''}
                      style={{ left: percent(key.frame) }}
                      aria-label={`Face key at frame ${key.frame}`}
                      title={`Frame ${key.frame} · ${key.interpolation}`}
                      onClick={() => seek(key.frame)}
                    />
                  ))}
                </div>
                <div className="face-ruler-labels">
                  <span>{start}</span>
                  <span role="status">
                    {notice || `${keys.length} ${keys.length === 1 ? 'key' : 'keys'}`}
                  </span>
                  <span>{end}</span>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
