import { ChevronLeft, ChevronRight, DiamondPlus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { EyeGeometryPanel } from './EyeGeometryPanel';
import { IconButton, NumberField, Section, Slider } from './components';
import { defaultFaceRig, evaluateFace, facePresets, facialLayers, setFaceKey } from './face';
import type { FaceChannel, FaceKey, FacePose, FaceRigConfig } from './face';
import { lowerFrame } from './time-index';
import './face-panel.css';

export type FaceEdit = { config?: FaceRigConfig; keys?: FaceKey[] };
const noKeys: FaceKey[] = [];

export function FacePanel({
  config = defaultFaceRig,
  keys = noKeys,
  frame,
  fps,
  id,
  autoKey,
  locked = false,
  onEdit,
  onSeek,
  onPreview,
  headwearVisible,
  onHeadwear,
}: {
  config?: FaceRigConfig;
  keys?: FaceKey[];
  frame: number;
  fps: number;
  id: string;
  autoKey: boolean;
  locked?: boolean;
  onEdit: (edit: FaceEdit) => void;
  onSeek: (frame: number) => void;
  onPreview?: (pose: FacePose) => void;
  headwearVisible?: boolean;
  onHeadwear?: (visible: boolean) => void;
}) {
  const [mode, setMode] = useState<'pose' | 'fit' | 'geometry' | 'layers'>('pose');
  const pose = evaluateFace(config, keys, frame, fps, id, false);
  const first = lowerFrame(keys, frame);
  const activeKey = keys[first]?.frame === frame ? keys[first] : undefined;
  const previous = keys[first - 1],
    next = keys[first + (activeKey ? 1 : 0)];
  const configure = (patch: Partial<FaceRigConfig>) => onEdit({ config: { ...config, ...patch } });
  const editPose = (value: FacePose) => {
    if (autoKey || keys.length) onEdit({ keys: setFaceKey(keys, frame, value) });
    else configure({ pose: { ...value } });
  };
  const channel = (name: FaceChannel, label: string, min = -1) => (
    <Slider
      label={label}
      value={pose[name]}
      min={min}
      max={1}
      onPreview={(value) => onPreview?.({ ...pose, [name]: value })}
      onChange={(value) => {
        if (value !== pose[name]) editPose({ ...pose, [name]: value });
      }}
    />
  );

  return (
    <Section title="Facial Performance">
      <fieldset className="face-controls" disabled={locked}>
        <label className="check-row">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => configure({ enabled: e.target.checked })}
          />
          Animate eyes and expressions
        </label>
        {!config.enabled ? (
          <p className="hint">
            Adds a facial rig over the original skin without changing its texture file.
          </p>
        ) : (
          <>
            <div className="face-mode-switch" aria-label="Face control mode">
              <button
                className="button compact"
                aria-pressed={mode === 'pose'}
                onClick={() => setMode('pose')}
              >
                Expression
              </button>
              <button
                className="button compact"
                aria-pressed={mode === 'fit'}
                onClick={() => setMode('fit')}
              >
                Fit to Skin
              </button>
              <button
                className="button compact"
                aria-pressed={mode === 'geometry'}
                onClick={() => setMode('geometry')}
              >
                Eye Dimensions
              </button>
              <button
                className="button compact"
                aria-pressed={mode === 'layers'}
                onClick={() => setMode('layers')}
              >
                Face Layers
              </button>
            </div>
            {mode === 'geometry' && <EyeGeometryPanel config={config} onChange={configure} />}
            {mode === 'layers' && (
              <div className="face-layout">
                {onHeadwear && (
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={headwearVisible}
                      onChange={(e) => onHeadwear(e.target.checked)}
                    />
                    Headwear
                  </label>
                )}
                {config.style === 'classic' && (
                  <button className="button full" onClick={() => configure({ style: 'pixel3d' })}>
                    Switch to 3D Eyes
                  </button>
                )}
                {facialLayers.map((layer) => (
                  <label className="check-row" key={layer}>
                    <input
                      type="checkbox"
                      checked={
                        config.layers?.[layer] ??
                        !(
                          (config.style === 'pixel3d' || config.style === 'story') &&
                          (layer === 'pupil' || layer === 'catchlight')
                        )
                      }
                      onChange={(e) =>
                        configure({ layers: { ...config.layers, [layer]: e.target.checked } })
                      }
                    />
                    {layer[0].toUpperCase() + layer.slice(1)}
                  </label>
                ))}
                <button className="button full" onClick={() => configure({ layers: undefined })}>
                  Show All Face Layers
                </button>
              </div>
            )}
            {mode === 'pose' && (
              <>
                <label
                  className="check-row"
                  title="Deterministic blinks and small eye movements where there is no facial animation track."
                >
                  <input
                    type="checkbox"
                    checked={config.autoLife}
                    onChange={(e) => configure({ autoLife: e.target.checked })}
                  />
                  Automatic blinks and gaze
                </label>
                <label className="select-row">
                  Expression preset
                  <select
                    aria-label="Expression preset"
                    value=""
                    onChange={(e) => {
                      const preset = facePresets[e.target.value as keyof typeof facePresets];
                      if (preset) editPose(preset);
                    }}
                  >
                    <option value="" disabled>
                      Choose…
                    </option>
                    {Object.keys(facePresets).map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                  </select>
                </label>
                {channel('lookX', 'Eye direction horizontal')}
                {channel('lookY', 'Eye direction vertical')}
                {channel('blink', 'Blink', 0)}
                {channel('brow', 'Brows')}
                {config.mouth && (
                  <>
                    {channel('smile', 'Mouth curve')}
                    {channel('jaw', 'Jaw open', 0)}
                  </>
                )}
                <div className="face-key-tools">
                  <IconButton
                    icon={ChevronLeft}
                    label="Previous face key"
                    disabled={!previous}
                    onClick={() => previous && onSeek(previous.frame)}
                  />
                  <button
                    className="button compact face-key-button"
                    onClick={() => onEdit({ keys: setFaceKey(keys, frame, pose) })}
                  >
                    <DiamondPlus size={14} />
                    {activeKey ? 'Update Face Key' : 'Add Face Key'}
                  </button>
                  <IconButton
                    icon={ChevronRight}
                    label="Next face key"
                    disabled={!next}
                    onClick={() => next && onSeek(next.frame)}
                  />
                  <IconButton
                    icon={Trash2}
                    label="Delete face key"
                    disabled={!activeKey}
                    onClick={() => onEdit({ keys: keys.filter((key) => key.frame !== frame) })}
                  />
                </div>
                {activeKey && (
                  <label className="select-row">
                    Face key easing
                    <select
                      aria-label="Face key easing"
                      value={activeKey.interpolation}
                      onChange={(e) =>
                        onEdit({
                          keys: setFaceKey(
                            keys,
                            frame,
                            activeKey.pose,
                            e.target.value as FaceKey['interpolation'],
                          ),
                        })
                      }
                    >
                      <option value="smooth">Smooth</option>
                      <option value="linear">Linear</option>
                      <option value="step">Hold</option>
                    </select>
                  </label>
                )}
                <p className="hint face-key-hint">
                  {keys.length
                    ? `${keys.length} face ${keys.length === 1 ? 'key' : 'keys'} · frame ${frame}`
                    : 'Set a face key, move the playhead, then change the expression.'}
                </p>
              </>
            )}
            {mode === 'fit' && (
              <div className="face-layout">
                <label className="select-row">
                  Eye style
                  <select
                    aria-label="Eye style"
                    value={config.style}
                    onChange={(e) => configure({ style: e.target.value as FaceRigConfig['style'] })}
                  >
                    <option value="original">Original skin eyes</option>
                    <option value="classic">Classic pixels (flat)</option>
                    <option value="pixel3d">Vanilla 3D</option>
                    <option value="story">Story 3D</option>
                    <option value="cinematic">Cinematic 3D</option>
                  </select>
                </label>
                <label className="select-row">
                  Eye row{' '}
                  <NumberField
                    label="Eye row"
                    value={config.eyeRow}
                    min={2}
                    max={5.5}
                    step={0.25}
                    onCommit={(eyeRow) => configure({ eyeRow })}
                  />
                </label>
                <label className="select-row">
                  Eye spacing{' '}
                  <NumberField
                    label="Eye spacing"
                    value={config.eyeSpacing}
                    min={1.2}
                    max={2.6}
                    step={0.1}
                    onCommit={(eyeSpacing) => configure({ eyeSpacing })}
                  />
                </label>
                <label className="select-row">
                  Iris color{' '}
                  <input
                    aria-label="Iris color"
                    type="color"
                    value={config.iris ?? '#477569'}
                    onChange={(e) => configure({ iris: e.target.value })}
                  />
                </label>
                {(
                  [
                    ['eyeWidth', 'Eye width'],
                    ['eyeHeight', 'Eye height'],
                    ['mouthWidth', 'Mouth width'],
                    ['mouthHeight', 'Mouth height'],
                    ['mouthRow', 'Mouth row'],
                  ] as const
                ).map(([field, label]) => (
                  <label className="select-row" key={field}>
                    {label}
                    <NumberField
                      label={label}
                      value={config[field] ?? (field === 'mouthRow' ? 6.47 : 1)}
                      min={field === 'mouthRow' ? 5 : 0.5}
                      max={field === 'mouthRow' ? 7.2 : 2}
                      step={0.1}
                      onCommit={(value) => configure({ [field]: value })}
                    />
                  </label>
                ))}
                {config.iris && (
                  <button className="button compact" onClick={() => configure({ iris: undefined })}>
                    Sample color from skin
                  </button>
                )}
                {config.style !== 'classic' &&
                  (
                    [
                      ['mouthDepth', 'Mouth depth', 0.23, 0.04, 1.2],
                      ['browWidth', 'Brow width', 1, 0.5, 2],
                      ['browHeight', 'Brow height', 1, 0.5, 2],
                      ['browDepth', 'Brow depth', 0.18, 0.04, 1.2],
                      ['browOffset', 'Brow height offset', 0, -0.65, 0.65],
                    ] as const
                  ).map(([field, label, initial, min, max]) => (
                    <label key={field} className="select-row">
                      {label}
                      <NumberField
                        label={label}
                        value={config[field] ?? initial}
                        min={min}
                        max={max}
                        step={0.025}
                        onCommit={(value) => configure({ [field]: value })}
                      />
                    </label>
                  ))}
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={config.mouth}
                    onChange={(e) => configure({ mouth: e.target.checked })}
                  />
                  Animate mouth
                </label>
                <p className="hint">
                  Adjust eye placement for custom skins. Headwear remains in front of the face.
                </p>
              </div>
            )}
          </>
        )}
      </fieldset>
    </Section>
  );
}
