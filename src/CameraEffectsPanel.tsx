import { useState } from 'react';
import { Aperture, Film, Plus, Radio, RotateCcw, Trash2 } from 'lucide-react';
import { NumberField, Section, Slider } from './components';
import { uid } from './model';
import type { CameraShot, SceneObject } from './model';
import {
  cameraEffectKinds,
  cameraEffectNames,
  defaultCameraEffects,
  defaultLensEffects,
  lensLooks,
  maxCameraEvents,
  shakeStyles,
} from './camera-effects';
import type { CameraEffectKind, CameraEffects, CameraEvent, LensEffects } from './camera-effects';
import './camera-effects.css';

type Scope = 'camera' | 'cut';
const glass = [
  ['distortion', 'Lens distortion', -1, 1],
  ['fringe', 'Color fringing', 0, 1],
  ['diffusion', 'Highlight diffusion', 0, 1],
  ['streak', 'Horizontal light streak', 0, 1],
  ['grain', 'Film grain', 0, 1],
  ['vignette', 'Lens vignette', 0, 1],
  ['matte', 'Letterbox', 0, 0.25],
] as const;
const shakeNames = {
  off: 'Off',
  handheld: 'Handheld',
  shoulder: 'Shoulder rig',
  vehicle: 'Vehicle vibration',
  tremor: 'Heavy tremor',
};
const eventTime: Record<CameraEffectKind, number> = {
  impact: 0.65,
  whip: 0.65,
  zoom: 0.8,
  flash: 0.32,
  glitch: 0.55,
  fadeIn: 0.8,
  fadeOut: 0.8,
  focus: 1.4,
};

export function CameraEffectsPanel(p: {
  camera?: SceneObject;
  shot?: CameraShot;
  objects: SceneObject[];
  frame: number;
  fps: number;
  preview: boolean;
  onCamera: (id: string) => void;
  onCreate: () => void;
  onPreview: (id: string, scope: Scope) => void;
  onChange: (camera: string, scope: Scope, fx?: CameraEffects) => void;
  onFrame: (frame: number) => void;
}) {
  const [selectedScope, setScope] = useState<Scope>('camera');
  const [kind, setKind] = useState<CameraEffectKind>('impact');
  const [eventId, setEventId] = useState<string>();
  const scope = p.shot && selectedScope === 'cut' ? 'cut' : 'camera';
  const camera = scope === 'cut' ? p.objects.find((o) => o.id === p.shot?.cameraId) : p.camera;
  const override = scope === 'cut' ? p.shot?.cameraEffects : camera?.cameraEffects;
  const fx = override ?? camera?.cameraEffects ?? defaultCameraEffects;
  const lens = fx.lens;
  const change = (next?: CameraEffects) => {
    if (camera) p.onChange(camera.id, scope, next);
  };
  const editLens = (patch: Partial<LensEffects>) => change({ ...fx, lens: { ...lens, ...patch } });
  const editShake = (patch: Partial<CameraEffects['shake']>) =>
    change({ ...fx, shake: { ...fx.shake, ...patch } });
  const events = fx.events.slice().sort((a, b) => a.start - b.start);
  const selected = events.find((e) => e.id === eventId);
  const setEvents = (items: CameraEvent[]) => change({ ...fx, events: items });
  const editEvent = (patch: Partial<CameraEvent>) =>
    setEvents(fx.events.map((event) => (event.id === eventId ? { ...event, ...patch } : event)));
  const canAdd = fx.events.length < maxCameraEvents && p.frame < 36000;
  const add = () => {
    if (!canAdd) return;
    const event: CameraEvent = {
      id: uid(),
      kind,
      start: p.frame,
      duration: Math.min(36000 - p.frame, Math.max(1, Math.round(eventTime[kind] * p.fps))),
      strength: 1,
    };
    if (kind === 'focus') event.distance = Math.max(0.1, lens.distance * 0.5);
    setEvents([...fx.events, event]);
    setEventId(event.id);
  };
  if (!camera)
    return (
      <Section title="Camera Effects">
        <button className="button full" onClick={p.onCreate}>
          Create Camera from View
        </button>
      </Section>
    );
  return (
    <div className="camera-effects-panel" aria-label="Camera effects editor">
      <div className="camera-effects-header">
        <label className="select-row">
          Apply to
          <select
            aria-label="Camera effects scope"
            value={scope}
            onChange={(e) => {
              setScope(e.target.value as Scope);
              setEventId(undefined);
            }}
          >
            <option value="camera">Camera</option>
            <option value="cut" disabled={!p.shot}>
              Current cut
            </option>
          </select>
        </label>
        {scope === 'camera' ? (
          <label className="select-row">
            Camera
            <select
              aria-label="Effects camera"
              value={camera.id}
              onChange={(e) => {
                p.onCamera(e.target.value);
                setEventId(undefined);
              }}
            >
              {p.objects
                .filter((o) => o.type === 'camera')
                .map((o) => (
                  <option value={o.id} key={o.id}>
                    {o.name}
                  </option>
                ))}
            </select>
          </label>
        ) : (
          <div className="camera-fx-cut">
            {p.shot?.name}
            <small>{override ? 'Cut effects' : 'Inherits camera'}</small>
          </div>
        )}
        <button className="button full" onClick={() => p.onPreview(camera.id, scope)}>
          <Film size={14} />
          {p.preview ? 'Preview Effects Again' : 'Preview Effects'}
        </button>
        {override && (
          <button
            className="button full"
            disabled={!!camera.locked}
            onClick={() => change(undefined)}
          >
            <RotateCcw size={13} />
            {scope === 'cut' ? 'Use Camera Effects' : 'Reset Camera Effects'}
          </button>
        )}
      </div>
      <fieldset className="production-fieldset" disabled={!!camera.locked}>
        <Section title="Lens and Focus">
          <label className="select-row">
            <span>
              <Aperture size={13} /> Lens preset
            </span>
            <select
              aria-label="Cinematic lens preset"
              value=""
              onChange={(e) => {
                const preset = lensLooks.find((look) => look.id === e.target.value);
                if (preset)
                  change({
                    ...fx,
                    lens: { ...defaultLensEffects, ...preset.lens, distance: lens.distance },
                  });
              }}
            >
              <option value="">Choose preset</option>
              {lensLooks.map((look) => (
                <option key={look.id} value={look.id}>
                  {look.name}
                </option>
              ))}
            </select>
          </label>
          <label className="select-row">
            Focus mode
            <select
              aria-label="Camera focus mode"
              value={lens.focus}
              onChange={(e) => editLens({ focus: e.target.value as LensEffects['focus'] })}
            >
              <option value="scene">Scene settings</option>
              <option value="manual">Manual distance</option>
              <option value="subject">Track subject</option>
            </select>
          </label>
          {lens.focus === 'subject' && (
            <label className="select-row">
              Subject
              <select
                aria-label="Camera focus subject"
                value={lens.subject ?? ''}
                onChange={(e) => editLens({ subject: e.target.value || undefined })}
              >
                <option value="">Use distance</option>
                {p.objects
                  .filter((o) => !['camera', 'light', 'control'].includes(o.type))
                  .map((o) => (
                    <option value={o.id} key={o.id}>
                      {o.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {lens.focus !== 'scene' && (
            <>
              <label className="select-row">
                Focus distance{' '}
                <NumberField
                  label="Camera focus distance"
                  value={lens.distance}
                  min={0.1}
                  max={2000}
                  step={0.25}
                  onCommit={(distance) => editLens({ distance })}
                />
              </label>
              <Slider
                label="Depth of field"
                value={lens.aperture}
                min={0}
                max={1}
                onChange={(aperture) => editLens({ aperture })}
              />
            </>
          )}
          <details className="camera-glass">
            <summary>Lens controls</summary>
            {glass.map(([key, label, min, max]) => (
              <Slider
                key={key}
                label={label}
                value={lens[key]}
                min={min}
                max={max}
                onChange={(v) => editLens({ [key]: v })}
              />
            ))}
          </details>
        </Section>
        <Section title="Camera Shake">
          <label className="select-row">
            <span>
              <Radio size={13} /> Rig
            </span>
            <select
              aria-label="Camera shake preset"
              value={fx.shake.style}
              onChange={(e) =>
                editShake({ style: e.target.value as CameraEffects['shake']['style'] })
              }
            >
              {shakeStyles.map((style) => (
                <option key={style} value={style}>
                  {shakeNames[style]}
                </option>
              ))}
            </select>
          </label>
          {fx.shake.style !== 'off' && (
            <>
              <Slider
                label="Shake strength"
                value={fx.shake.strength}
                min={0}
                max={2}
                onChange={(strength) => editShake({ strength })}
              />
              <Slider
                label="Shake speed"
                value={fx.shake.speed}
                min={0.1}
                max={4}
                onChange={(speed) => editShake({ speed })}
              />
              <Slider
                label="Shake roll"
                value={fx.shake.roll}
                min={0}
                max={1}
                onChange={(roll) => editShake({ roll })}
              />
              <label className="select-row">
                Variation{' '}
                <NumberField
                  label="Shake variation"
                  value={fx.shake.seed}
                  min={0}
                  max={9999}
                  step={1}
                  onCommit={(seed) => editShake({ seed: Math.round(seed) })}
                />
              </label>
            </>
          )}
        </Section>
        <Section title="Timed Effects">
          <div className="camera-fx-add">
            <select
              aria-label="Camera event type"
              value={kind}
              onChange={(e) => setKind(e.target.value as CameraEffectKind)}
            >
              {cameraEffectKinds.map((id) => (
                <option value={id} key={id}>
                  {cameraEffectNames[id]}
                </option>
              ))}
            </select>
            <button
              className="button"
              aria-label="Add effect at playhead"
              title={`Add at frame ${p.frame}`}
              disabled={!canAdd}
              onClick={add}
            >
              <Plus size={14} />
              Add
            </button>
          </div>
          {events.length > 0 && (
            <div className="camera-fx-events" aria-label="Camera effect events">
              {events.map((event) => (
                <button
                  className="camera-fx-event"
                  key={event.id}
                  aria-pressed={selected?.id === event.id}
                  onClick={() => {
                    setEventId(event.id);
                    p.onFrame(event.start);
                  }}
                >
                  <span>{cameraEffectNames[event.kind]}</span>
                  <small>
                    {event.start}–{event.start + event.duration}
                  </small>
                </button>
              ))}
            </div>
          )}
          {selected && (
            <div className="camera-fx-event-edit">
              <label className="select-row">
                Start frame{' '}
                <NumberField
                  label="Camera effect start frame"
                  value={selected.start}
                  min={0}
                  max={36000 - selected.duration}
                  step={1}
                  onCommit={(start) => editEvent({ start: Math.round(start) })}
                />
              </label>
              <label className="select-row">
                Duration (s){' '}
                <NumberField
                  label="Camera effect duration in seconds"
                  value={selected.duration / p.fps}
                  min={1 / p.fps}
                  max={(36000 - selected.start) / p.fps}
                  step={0.1}
                  onCommit={(seconds) =>
                    editEvent({ duration: Math.max(1, Math.round(seconds * p.fps)) })
                  }
                />
              </label>
              <Slider
                label="Effect strength"
                value={selected.strength}
                min={0}
                max={selected.kind === 'focus' ? 1 : 2}
                onChange={(strength) => editEvent({ strength })}
              />
              {['flash', 'fadeIn', 'fadeOut'].includes(selected.kind) && (
                <label className="select-row">
                  Effect color
                  <input
                    type="color"
                    aria-label="Camera effect color"
                    value={selected.color ?? (selected.kind === 'flash' ? '#ffffff' : '#000000')}
                    onChange={(e) => editEvent({ color: e.target.value })}
                  />
                </label>
              )}
              {selected.kind === 'focus' && (
                <label className="select-row">
                  End focus distance{' '}
                  <NumberField
                    label="Rack focus destination"
                    value={selected.distance ?? 2}
                    min={0.1}
                    max={2000}
                    onCommit={(distance) => editEvent({ distance })}
                  />
                </label>
              )}
              <button
                className="button full"
                onClick={() => {
                  setEvents(fx.events.filter((event) => event.id !== selected.id));
                  setEventId(undefined);
                }}
              >
                <Trash2 size={13} />
                Remove Effect
              </button>
            </div>
          )}
        </Section>
      </fieldset>
    </div>
  );
}
