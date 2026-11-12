import { NumberField, Section } from './components';
import {
  characterLayers,
  characterLayerNames,
  defaultDetail,
  defaultLayer,
  layerDepth,
} from './character-layers';
import type { CharacterLayers, CharacterLayerSettings } from './character-layers';

export function CharacterLayerPanel({
  value,
  locked,
  onChange,
}: {
  value?: CharacterLayers;
  locked: boolean;
  onChange: (layers?: CharacterLayers) => void;
}) {
  const detail = value?.detail || defaultDetail;
  const editDetail = (patch: Partial<CharacterLayerSettings>) =>
    onChange({ ...value, detail: { ...detail, ...patch } });
  return (
    <Section title="Character Layers">
      <fieldset className="production-fieldset" disabled={locked}>
        <p className="hint">
          Relief depth raises the visible pixels and builds side walls. Sizes are in skin pixels.
        </p>
        {characterLayers
          .filter((name) => name !== 'detail')
          .map((name) => {
            const layer: CharacterLayerSettings = value?.[name] || defaultLayer;
            const edit = (patch: Partial<CharacterLayerSettings>) =>
              onChange({ ...value, [name]: { ...layer, ...patch } });
            return (
              <div className="select-row" key={name}>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={layer.visible}
                    onChange={(e) => edit({ visible: e.target.checked })}
                  />
                  {characterLayerNames[name]}
                </label>
                <NumberField
                  label={characterLayerNames[name] + (name === 'skin' ? ' offset' : ' depth')}
                  value={name === 'skin' ? layer.offset : (layer.depth ?? layerDepth[name])}
                  min={0}
                  max={name === 'skin' ? 2 : 3}
                  step={0.05}
                  onCommit={(size) => edit(name === 'skin' ? { offset: size } : { depth: size })}
                />
              </div>
            );
          })}
        <label className="select-row">
          Painted hair color
          <input
            type="color"
            aria-label="Painted hair color"
            value={value?.hair?.color ?? '#d98c35'}
            onChange={(event) =>
              onChange({
                ...value,
                hair: { ...(value?.hair || defaultLayer), color: event.target.value },
              })
            }
          />
        </label>
        {value?.hair?.color && (
          <button
            className="button full"
            onClick={() => onChange({ ...value, hair: { ...value.hair!, color: undefined } })}
          >
            Reset Hair Color
          </button>
        )}
        <label className="check-row">
          <input
            type="checkbox"
            checked={detail.visible}
            onChange={(e) => editDetail({ visible: e.target.checked })}
          />{' '}
          Raise painted skin pixels
        </label>
        {detail.visible && (
          <>
            <label className="select-row">
              Match color{' '}
              <input
                type="color"
                aria-label="Painted detail color"
                value={detail.color ?? defaultDetail.color}
                onChange={(e) => editDetail({ color: e.target.value })}
              />
            </label>
            <label className="select-row">
              Region
              <select
                aria-label="Painted detail region"
                value={detail.region ?? 'all'}
                onChange={(e) =>
                  editDetail({ region: e.target.value as CharacterLayerSettings['region'] })
                }
              >
                {['all', 'head', 'body', 'arms', 'legs'].map((region) => (
                  <option value={region} key={region}>
                    {region[0].toUpperCase() + region.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className="select-row">
              Color tolerance{' '}
              <NumberField
                label="Color tolerance"
                value={detail.tolerance ?? defaultDetail.tolerance}
                min={0}
                max={150}
                step={1}
                onCommit={(tolerance) => editDetail({ tolerance })}
              />
            </label>
            <label className="select-row">
              Painted relief depth{' '}
              <NumberField
                label="Painted relief depth"
                value={detail.depth ?? layerDepth.detail}
                min={0}
                max={3}
                step={0.05}
                onCommit={(depth) => editDetail({ depth })}
              />
            </label>
            <p className="hint">
              Select Painted detail in Highlights to light or glow just these pixels.
            </p>
          </>
        )}
        {value && (
          <button className="button full" onClick={() => onChange(undefined)}>
            Reset Character Layers
          </button>
        )}
      </fieldset>
    </Section>
  );
}
