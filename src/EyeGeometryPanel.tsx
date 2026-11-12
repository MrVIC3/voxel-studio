import { useState } from 'react';
import { NumberField } from './components';
import { eyeDimensions, eyeDimensionFields } from './face';
import type { EyeDimensions, EyeSide, FaceRigConfig } from './face';

const groups: { label: string; fields: [keyof EyeDimensions, string][] }[] = [
  {
    label: 'Shape and placement',
    fields: [
      ['width', 'Eye width'],
      ['height', 'Eye height'],
      ['depth', 'Eye depth'],
      ['offsetX', 'Outward offset'],
      ['offsetY', 'Downward offset'],
      ['protrusion', 'Forward offset'],
      ['tilt', 'Eye tilt'],
    ],
  },
  {
    label: 'Iris and pupil',
    fields: [
      ['irisWidth', 'Iris width'],
      ['irisHeight', 'Iris height'],
      ['irisDepth', 'Iris depth'],
      ['pupilWidth', 'Pupil width'],
      ['pupilHeight', 'Pupil height'],
      ['pupilDepth', 'Pupil depth'],
    ],
  },
  {
    label: 'Eyelids and gaze travel',
    fields: [
      ['upperLid', 'Upper lid height'],
      ['upperLidWidth', 'Upper lid width ratio'],
      ['upperLidDepth', 'Upper lid depth'],
      ['lowerLid', 'Lower lid height'],
      ['lowerLidWidth', 'Lower lid width ratio'],
      ['lowerLidDepth', 'Lower lid depth'],
      ['gazeX', 'Horizontal travel'],
      ['gazeY', 'Vertical travel'],
    ],
  },
];
export function EyeGeometryPanel({
  config,
  onChange,
}: {
  config: FaceRigConfig;
  onChange: (patch: Partial<FaceRigConfig>) => void;
}) {
  const [side, setSide] = useState<EyeSide>('both');
  const geometry = config.eyeGeometry;
  const dimensions = eyeDimensions(config, side);
  const update = (field: keyof EyeDimensions, value: number) => {
    const next = { ...geometry, [side]: { ...geometry?.[side], [field]: value } };
    if (side === 'both')
      for (const individual of ['left', 'right'] as const) {
        if (!next[individual]) continue;
        const override = { ...next[individual] };
        delete override[field];
        next[individual] = override;
      }
    onChange({ eyeGeometry: next });
  };
  const reset = () => {
    if (side === 'both')
      onChange({ eyeGeometry: undefined, eyeWidth: undefined, eyeHeight: undefined });
    else {
      const next = { ...geometry };
      delete next[side];
      onChange({ eyeGeometry: next });
    }
  };
  return (
    <div className="face-layout eye-geometry">
      {(config.style === 'classic' || config.style === 'original') && (
        <button className="button full" onClick={() => onChange({ style: 'pixel3d' })}>
          Switch to 3D Eyes
        </button>
      )}
      <label className="select-row">
        Edit
        <select
          aria-label="Eye to edit"
          value={side}
          onChange={(e) => setSide(e.target.value as EyeSide)}
        >
          <option value="both">Both eyes</option>
          <option value="left">Left eye</option>
          <option value="right">Right eye</option>
        </select>
      </label>
      <p className="hint">
        Sizes and offsets use skin pixels. Tilt uses degrees. Lid width is relative to eye width.
        Editing both eyes replaces that field on each eye.
      </p>
      {groups.map((group, i) => (
        <details key={group.label} open={i === 0 || undefined}>
          <summary>{group.label}</summary>
          {group.fields.map(([field, label]) => {
            const [, min, max] = eyeDimensionFields[field];
            return (
              <label className="select-row" key={field}>
                {label}
                <NumberField
                  label={label}
                  min={min}
                  max={max}
                  step={field === 'tilt' ? 1 : 0.025}
                  value={dimensions[field]}
                  onCommit={(value) => update(field, value)}
                />
              </label>
            );
          })}
        </details>
      ))}
      <button className="button full" onClick={reset}>
        {side === 'both' ? 'Reset Both Eyes' : 'Reset This Eye'}
      </button>
    </div>
  );
}
