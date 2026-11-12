import { Aperture, Contrast, RotateCcw, ScanLine, Sun, Unlink } from 'lucide-react';
import { NumberField, Section, Slider } from './components';
import { cinematicLooks } from './cinematic';
import type { CinematicContext, CinematicPresetId, CinematicSettings } from './cinematic';
import type { Lighting } from './model';
import './cinematic-panel.css';

type Props = {
  lighting: Lighting;
  onApply: (mode: CinematicPresetId) => void;
  onChange: (settings: CinematicSettings) => void;
  onPreview: (settings: CinematicSettings) => void;
  onFocus?: () => CinematicContext | undefined;
};

export function CinematicPanel({ lighting, onApply, onChange, onPreview, onFocus }: Props) {
  const settings = lighting.cinematic;
  const change = (patch: Partial<CinematicSettings>) => {
    if (settings) onChange({ ...settings, ...patch });
  };
  const preview = (patch: Partial<CinematicSettings>) => {
    if (settings) onPreview({ ...settings, ...patch });
  };
  const range = (
    key:
      | 'atmosphere'
      | 'lightShafts'
      | 'depthOfField'
      | 'contrast'
      | 'saturation'
      | 'vignette'
      | 'grain'
      | 'bloomThreshold'
      | 'bloomRadius',
    label: string,
    min = 0,
    max = 1,
  ) => (
    <Slider
      label={label}
      min={min}
      max={max}
      value={settings![key]}
      onChange={(value) => change({ [key]: value })}
      onPreview={(value) => preview({ [key]: value })}
    />
  );
  const color = (
    key: 'skyFill' | 'groundFill' | 'hazeTint' | 'shadowTint' | 'highlightTint',
    label: string,
  ) => (
    <label className="color-field">
      {label}
      <input
        type="color"
        aria-label={label}
        value={settings![key]}
        onChange={(event) => change({ [key]: event.target.value })}
      />
    </label>
  );
  return (
    <Section title="Cinematic Looks">
      <p className="cinematic-intro">
        Set the scene with a lighting rig, atmosphere and film finish in one step.
      </p>
      <div className="cinematic-looks" role="group" aria-label="Cinematic lighting presets">
        {cinematicLooks.map((look) => (
          <button
            className="cinematic-look"
            key={look.id}
            type="button"
            onClick={() => onApply(look.id)}
            aria-label={`Apply ${look.name} cinematic lighting`}
            aria-pressed={settings?.mode === look.id}
          >
            <span className="cinematic-swatch" style={{ background: look.swatch }} />
            <span className="cinematic-look-text">
              <strong>{look.name}</strong>
              <small>{look.description}</small>
            </span>
          </button>
        ))}
      </div>
      <p className="hint">
        Preset lights are editable scene objects. They’re placed around the selected subject;
        existing lights stay in the scene.
      </p>
      {settings && (
        <div className="cinematic-custom">
          <details className="cinematic-details">
            <summary>
              <Sun size={13} /> Atmosphere and sky
            </summary>
            <div>
              {range('atmosphere', 'Height haze')}
              {range('lightShafts', 'Sun shafts')}
              <label className="cinematic-value">
                Haze floor{' '}
                <NumberField
                  label="Haze floor"
                  value={settings.hazeBase}
                  min={-1000000}
                  max={1000000}
                  step={0.1}
                  onCommit={(hazeBase) => change({ hazeBase })}
                />
              </label>
              <label className="cinematic-value">
                Haze falloff height{' '}
                <NumberField
                  label="Haze falloff height"
                  value={settings.hazeHeight}
                  min={0.1}
                  max={3000}
                  step={0.1}
                  onCommit={(hazeHeight) => change({ hazeHeight })}
                />
              </label>
              <label className="cinematic-value">
                Haze distance{' '}
                <NumberField
                  label="Haze distance"
                  value={settings.hazeRange}
                  min={1}
                  max={6000}
                  step={1}
                  onCommit={(hazeRange) => change({ hazeRange })}
                />
              </label>
              {color('hazeTint', 'Haze color')}
              {color('skyFill', 'Sky fill color')}
              {color('groundFill', 'Ground bounce color')}
            </div>
          </details>
          <details className="cinematic-details">
            <summary>
              <Aperture size={13} /> Lens and focus
            </summary>
            <div>
              {range('depthOfField', 'Depth of field')}
              <label className="cinematic-value">
                Focus distance{' '}
                <NumberField
                  label="Focus distance"
                  value={settings.focusDistance}
                  min={0.05}
                  max={6000}
                  step={0.1}
                  onCommit={(focusDistance) => change({ focusDistance, focusSubject: undefined })}
                />
              </label>
              {onFocus && (
                <button
                  className="button full"
                  type="button"
                  onClick={() => {
                    const context = onFocus();
                    if (context)
                      change({
                        focusDistance: context.focusDistance,
                        focusSubject: context.focusSubject,
                      });
                  }}
                >
                  <ScanLine size={14} /> Focus selected subject
                </button>
              )}
              {settings.focusSubject && (
                <p className="hint">
                  Tracking the subject as it moves. Enter a focus distance to switch to manual
                  focus.
                </p>
              )}
            </div>
          </details>
          <details className="cinematic-details">
            <summary>
              <Contrast size={13} /> Color and film finish
            </summary>
            <div>
              {range('contrast', 'Film contrast', 0.6, 1.6)}
              {range('saturation', 'Color saturation', 0, 2)}
              {color('shadowTint', 'Shadow tint')}
              {color('highlightTint', 'Highlight tint')}
              {range('bloomThreshold', 'Bloom threshold', 0, 4)}
              {range('bloomRadius', 'Bloom spread')}
              {range('vignette', 'Vignette')}
              {range('grain', 'Film grain')}
            </div>
          </details>
          {!!settings.rigIds.length && (
            <button
              className="button full"
              type="button"
              onClick={() => change({ rigIds: [] })}
              title="Keep these fixtures when applying another cinematic look"
            >
              <Unlink size={13} /> Keep rig lights
            </button>
          )}
          <button
            className="button full cinematic-reset"
            type="button"
            onClick={() => onApply('standard')}
          >
            <RotateCcw size={13} /> Standard lighting
          </button>
          <p className="hint">
            Balanced and High render height haze, shafts and lens blur. Draft keeps the color grade
            and uses a lightweight distance fog.
          </p>
        </div>
      )}
    </Section>
  );
}
