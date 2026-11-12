import { NumberField, Section } from './components';
import type { ParticleEffect } from './model';
export function EffectPanel({
  effect,
  onChange,
}: {
  effect: ParticleEffect;
  onChange: (effect: ParticleEffect) => void;
}) {
  const change = (patch: Partial<ParticleEffect>) => onChange({ ...effect, ...patch });
  return (
    <Section title="Particle Effect">
      <label className="select-row">
        Preset
        <select
          aria-label="Effect type"
          value={effect.kind}
          onChange={(e) => change({ kind: e.target.value as ParticleEffect['kind'] })}
        >
          <option value="sparks">Impact Sparks</option>
          <option value="embers">Floating Embers</option>
          <option value="ring">Shockwave Ring</option>
          <option value="vortex">Energy Vortex</option>
        </select>
      </label>
      <div className="field-pair">
        <label>
          Start
          <NumberField
            label="Effect start frame"
            value={effect.start}
            min={0}
            max={effect.end - 1}
            step={1}
            onCommit={(v) => change({ start: Math.round(v) })}
          />
        </label>
        <label>
          End
          <NumberField
            label="Effect end frame"
            value={effect.end}
            min={effect.start + 1}
            max={36000}
            step={1}
            onCommit={(v) => change({ end: Math.round(v) })}
          />
        </label>
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={effect.loop}
          onChange={(e) => change({ loop: e.target.checked })}
        />
        Loop effect
      </label>
      <label className="color-field">
        Color
        <input
          aria-label="Effect color"
          type="color"
          value={effect.color}
          onChange={(e) => change({ color: e.target.value })}
        />
      </label>
      {(
        [
          { key: 'count', label: 'Particles', min: 1, max: 5000, step: 1 },
          { key: 'size', label: 'Particle Size', min: 0.005, max: 1, step: 0.01 },
          { key: 'spread', label: 'Spread', min: 0, max: 30, step: 0.1 },
          { key: 'speed', label: 'Speed', min: 0, max: 30, step: 0.1 },
          { key: 'gravity', label: 'Gravity', min: -20, max: 20, step: 0.1 },
          { key: 'seed', label: 'Random Seed', min: 0, max: 99999, step: 1 },
        ] as const
      ).map((f) => (
        <label className="select-row" key={f.key}>
          {f.label}
          <NumberField
            label={`Effect ${f.label}`}
            value={effect[f.key]}
            min={f.min}
            max={f.max}
            step={f.step}
            onCommit={(v) => change({ [f.key]: f.step === 1 ? Math.round(v) : v })}
          />
        </label>
      ))}
      <p className="hint">
        Deterministic particles: scrubbing and exported frames match. Attach an effect to a hand,
        prop or moving object. Bloom adds glow in Balanced or High quality.
      </p>
    </Section>
  );
}
