import { NumberField, Section, Slider } from './components';
import { armorMaterials, armorSlots } from './model';
import type { ArmorMaterial, SceneObject, SurfaceEffect } from './model';

export function MovementPanel(p: {
  staged: boolean;
  route: number;
  locked: boolean;
  seconds: number;
  facing: boolean;
  walk: boolean;
  onMovement: () => void;
  onStart: () => void;
  onFinish: () => void;
  onCancel: () => void;
  onRemove: () => void;
  onSeconds: (value: number) => void;
  onFacing: (value: boolean) => void;
  onWalk: (value: boolean) => void;
}) {
  return (
    <Section title="Character Movement">
      <fieldset className="production-fieldset" disabled={p.locked}>
        <div className="object-actions">
          <button className="button" onClick={p.onMovement}>
            {p.staged ? 'Select Movement' : 'Separate Movement'}
          </button>
          <button className="button" onClick={p.onStart} disabled={!!p.route}>
            Draw Path · P
          </button>
        </div>
        {p.route > 0 ? (
          <>
            <p className="hint">
              Click the ground or a build to add waypoints. {p.route} / 64 points.
            </p>
            <label className="select-row">
              Travel seconds
              <NumberField
                label="Path duration in seconds"
                value={p.seconds}
                min={0.25}
                max={300}
                step={0.25}
                onCommit={p.onSeconds}
              />
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={p.facing}
                onChange={(e) => p.onFacing(e.target.checked)}
              />{' '}
              Face the path
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={p.walk}
                onChange={(e) => p.onWalk(e.target.checked)}
              />{' '}
              Add walk cycle to pose tracks
            </label>
            <div className="object-actions">
              <button className="button primary" disabled={p.route < 2} onClick={p.onFinish}>
                Apply Path
              </button>
              <button className="button" disabled={p.route < 2} onClick={p.onRemove}>
                Undo Point
              </button>
              <button className="button" onClick={p.onCancel}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <p className="hint">
            The Movement control owns scene position. Pose and imported animation stay on the
            character.
          </p>
        )}
      </fieldset>
    </Section>
  );
}

export type BlockTool = 'place' | 'remove' | 'replace';
export function BlockTools(p: {
  mode?: BlockTool;
  brush: string;
  locked: boolean;
  blocks: string[];
  onMode: (mode?: BlockTool) => void;
  onBrush: (brush: string) => void;
}) {
  return (
    <Section title="Block Editing">
      <fieldset className="production-fieldset" disabled={p.locked}>
        <div className="object-actions">
          {(['place', 'replace', 'remove'] as const).map((mode) => (
            <button
              key={mode}
              className="button"
              aria-pressed={p.mode === mode}
              onClick={() => p.onMode(p.mode === mode ? undefined : mode)}
            >
              {mode[0].toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
        <label className="select-row">
          Brush
          <select
            aria-label="Block brush"
            value={p.brush}
            onChange={(e) => p.onBrush(e.target.value)}
          >
            {[...new Set([p.brush, ...p.blocks])].map((id) => (
              <option key={id} value={id}>
                {id.replace(/^minecraft:/, '').replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <p className="hint">
          {p.mode
            ? 'Click a face to edit the selected build. Esc exits. Ctrl+Z undoes a block edit.'
            : 'Press B to toggle block placement.'}
        </p>
      </fieldset>
    </Section>
  );
}

export function EquipmentPanel(p: {
  actor: SceneObject;
  objects: SceneObject[];
  items: string[];
  onEquip: (slot: 'leftHand' | 'rightHand', item: string) => void;
  onArmor: (armor: SceneObject['armor']) => void;
}) {
  const labels = { head: 'Helmet', body: 'Chestplate', legs: 'Leggings', feet: 'Boots' };
  return (
    <Section title="Equipment">
      <fieldset className="production-fieldset" disabled={p.actor.locked}>
        {(['rightHand', 'leftHand'] as const).map((slot) => {
          const item =
            p.objects.find((o) => o.parentId === p.actor.id && o.equipmentSlot === slot)?.item ||
            '';
          return (
            <label className="select-row" key={slot}>
              {slot === 'rightHand' ? 'Right hand' : 'Left hand'}
              <select value={item} onChange={(e) => p.onEquip(slot, e.target.value)}>
                <option value="">Empty</option>
                {[...new Set([...(item ? [item] : []), ...p.items])].map((id) => (
                  <option key={id} value={id}>
                    {id.split('/').at(-1)?.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
        {armorSlots.map((slot) => (
          <label className="select-row" key={slot}>
            {labels[slot]}
            <select
              value={p.actor.armor?.[slot] || ''}
              onChange={(e) => {
                const armor = { ...p.actor.armor };
                if (e.target.value) armor[slot] = e.target.value as ArmorMaterial;
                else delete armor[slot];
                p.onArmor(Object.keys(armor).length ? armor : undefined);
              }}
            >
              <option value="">None</option>
              {armorMaterials.map((material) => (
                <option key={material}>{material}</option>
              ))}
            </select>
          </label>
        ))}
      </fieldset>
    </Section>
  );
}

const surfaceDefaults: SurfaceEffect = {
  color: '#8fd8ff',
  glow: 0,
  rim: 0,
  outline: 0,
  width: 0.2,
};
export function SurfacePanel({
  value,
  onChange,
}: {
  value?: SurfaceEffect;
  onChange: (effect?: SurfaceEffect) => void;
}) {
  const effect = value || surfaceDefaults;
  return (
    <Section title="Surface Effects">
      <label className="select-row">
        Effect color{' '}
        <input
          aria-label="Surface effect color"
          type="color"
          value={effect.color}
          onChange={(e) => onChange({ ...effect, color: e.target.value })}
        />
      </label>
      {(
        [
          ['glow', 'Glow'],
          ['rim', 'Rim highlight'],
          ['outline', 'Edge outline'],
          ['width', 'Edge width'],
        ] as const
      ).map(([key, label]) => (
        <Slider
          key={key}
          label={label}
          value={effect[key]}
          min={key === 'width' ? 0.02 : 0}
          max={key === 'width' ? 0.75 : 5}
          step={0.01}
          onChange={(number) => onChange({ ...effect, [key]: number })}
        />
      ))}
      {value && (
        <button className="button full" onClick={() => onChange(undefined)}>
          Reset Surface Effects
        </button>
      )}
    </Section>
  );
}
