import { Crosshair, Pipette, RotateCcw } from 'lucide-react';
import { NumberField, Section, Slider } from './components';
import {
  defaultCharacterLook,
  lookDefaults,
  lookFallback,
  lookPartLabel,
  lookParts,
} from './character-look';
import type { CharacterLook, LookPart, LookResponse } from './character-look';

export type HighlightPick = 'target' | 'color';

export function CharacterLookPanel({
  value,
  locked,
  part,
  pick,
  onPart,
  onPick,
  onChange,
  onPreview,
}: {
  value?: CharacterLook;
  locked: boolean;
  part: LookPart;
  pick?: HighlightPick;
  onPart: (part: LookPart) => void;
  onPick: (pick?: HighlightPick) => void;
  onChange: (look: CharacterLook) => void;
  onPreview: (look: CharacterLook) => void;
}) {
  const look = value ?? defaultCharacterLook;
  const enabled = !!value && look.enabled !== false;
  const region = lookFallback(look, part);
  const edit = (change: Partial<CharacterLook>) => onChange({ ...look, ...change });
  const response = (change: Partial<LookResponse>) => ({
    ...look,
    parts: { ...look.parts, [part]: { ...region, ...change } },
  });
  const lookSlider = (
    label: string,
    key: keyof CharacterLook,
    value: number,
    min: number,
    max: number,
    step = 0.01,
  ) => (
    <Slider
      label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      onPreview={(n) => onPreview({ ...look, [key]: n })}
      onChange={(n) => edit({ [key]: n })}
    />
  );
  const responseSlider = (
    label: string,
    key: keyof LookResponse,
    value: number,
    min: number,
    max: number,
  ) => (
    <Slider
      label={label}
      value={value}
      min={min}
      max={max}
      onPreview={(n) => onPreview(response({ [key]: n }))}
      onChange={(n) => onChange(response({ [key]: n }))}
    />
  );
  return (
    <fieldset className="production-fieldset character-look-editor" disabled={locked}>
      <Section
        title="Character light"
        aside={
          enabled && (
            <button
              className="button compact"
              title="Reset light placement"
              aria-label="Reset light placement"
              onClick={() =>
                edit({
                  yaw: defaultCharacterLook.yaw,
                  pitch: defaultCharacterLook.pitch,
                  distance: lookDefaults.distance,
                })
              }
            >
              <RotateCcw size={14} />
            </button>
          )
        }
      >
        <label className="check-row">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => edit({ enabled: e.target.checked })}
          />
          Enable character highlights
        </label>
        {enabled && (
          <>
            <label className="select-row">
              Light type
              <select
                aria-label="Character light type"
                value={look.type ?? 'directional'}
                onChange={(e) => edit({ type: e.target.value as CharacterLook['type'] })}
              >
                <option value="directional">Directional</option>
                <option value="point">Point with falloff</option>
              </select>
            </label>
            <div className="field-pair">
              <label>
                Azimuth{' '}
                <NumberField
                  label="Highlight azimuth"
                  value={look.yaw}
                  min={-180}
                  max={180}
                  step={5}
                  onCommit={(yaw) => edit({ yaw })}
                />
              </label>
              <label>
                Elevation{' '}
                <NumberField
                  label="Highlight elevation"
                  value={look.pitch}
                  min={-85}
                  max={85}
                  step={5}
                  onCommit={(pitch) => edit({ pitch })}
                />
              </label>
            </div>
            {look.type === 'point' && (
              <>
                {lookSlider(
                  'Light distance',
                  'distance',
                  look.distance ?? lookDefaults.distance,
                  0.35,
                  12,
                  0.05,
                )}
                {lookSlider(
                  'Falloff range',
                  'range',
                  look.range ?? lookDefaults.range,
                  0.25,
                  16,
                  0.05,
                )}
              </>
            )}
            {lookSlider('Light power', 'power', look.power ?? lookDefaults.power, 0, 4)}
            {lookSlider('Highlight softness', 'softness', look.softness, 0.05, 1)}
            {lookSlider('Light spread', 'spread', look.spread ?? lookDefaults.spread, -0.8, 0.7)}
            {lookSlider(
              'Rim sharpness',
              'sharpness',
              look.sharpness ?? lookDefaults.sharpness,
              0.4,
              8,
            )}
            <label className="select-row">
              Light tint{' '}
              <input
                type="color"
                aria-label="Light tint"
                value={look.tint ?? lookDefaults.tint}
                onChange={(e) => edit({ tint: e.target.value, tintMix: look.tintMix || 0.35 })}
              />
            </label>
            {lookSlider('Tint mix', 'tintMix', look.tintMix ?? lookDefaults.tintMix, 0, 1)}
          </>
        )}
      </Section>
      {enabled && (
        <>
          <Section title="Surface response">
            <label className="select-row">
              Target
              <select
                aria-label="Highlight target"
                value={part}
                onChange={(e) => onPart(e.target.value as LookPart)}
              >
                {lookParts.map((id) => (
                  <option key={id} value={id}>
                    {lookPartLabel(id)}
                    {look.parts[id] && id !== 'all' ? ' •' : ''}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button full"
              aria-pressed={pick === 'target'}
              onClick={() => onPick(pick === 'target' ? undefined : 'target')}
            >
              <Crosshair size={14} /> Pick target in preview
            </button>
            {responseSlider('Directional highlight', 'light', region.light, 0, 4)}
            {responseSlider('Rim balance', 'rim', region.rim ?? lookDefaults.rim, 0, 1)}
            {responseSlider(
              'Specular highlight',
              'specular',
              region.specular ?? lookDefaults.specular,
              0,
              3,
            )}
            {responseSlider('Texture glow', 'glow', region.glow, 0, 5)}
            {part !== 'all' && look.parts[part] && (
              <button
                className="button full"
                onClick={() => {
                  const parts = { ...look.parts };
                  delete parts[part];
                  edit({ parts });
                }}
              >
                Clear Target Override
              </button>
            )}
          </Section>
          <Section title="Texture color mask">
            <label className="check-row">
              <input
                type="checkbox"
                checked={!!region.maskColor}
                onChange={(e) =>
                  onChange(response({ maskColor: e.target.checked ? '#ffffff' : undefined }))
                }
              />{' '}
              Restrict effects to matching colors
            </label>
            <button
              className="button full"
              aria-pressed={pick === 'color'}
              onClick={() => onPick(pick === 'color' ? undefined : 'color')}
            >
              <Pipette size={14} /> Sample skin color in preview
            </button>
            {region.maskColor && (
              <>
                <label className="select-row">
                  Mask color{' '}
                  <input
                    type="color"
                    aria-label="Highlight mask color"
                    value={region.maskColor}
                    onChange={(e) => onChange(response({ maskColor: e.target.value }))}
                  />
                </label>
                {responseSlider(
                  'Color tolerance',
                  'maskTolerance',
                  region.maskTolerance ?? lookDefaults.maskTolerance,
                  0.02,
                  0.85,
                )}
              </>
            )}
          </Section>
          <Section title="Silhouette outline">
            {lookSlider('Outline width', 'outline', look.outline, 0, 0.05, 0.001)}
            <label className="select-row">
              Outline color{' '}
              <input
                type="color"
                aria-label="Character outline color"
                value={look.outlineColor}
                onChange={(e) => edit({ outlineColor: e.target.value })}
              />
            </label>
            {lookSlider(
              'Outline opacity',
              'outlineOpacity',
              look.outlineOpacity ?? lookDefaults.outlineOpacity,
              0,
              1,
            )}
            {lookSlider(
              'Outline feather',
              'outlineSoftness',
              look.outlineSoftness ?? look.softness,
              0.05,
              1,
            )}
            <label className="check-row">
              <input
                type="checkbox"
                checked={region.outline === undefined}
                onChange={(e) =>
                  onChange(
                    response({ outline: e.target.checked ? undefined : Math.min(1, region.light) }),
                  )
                }
              />{' '}
              Follow target light strength
            </label>
            {region.outline !== undefined &&
              responseSlider(
                `${lookPartLabel(part)} outline weight`,
                'outline',
                region.outline,
                0,
                1,
              )}
          </Section>
        </>
      )}
    </fieldset>
  );
}
