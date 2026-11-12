export const characterLayerNames = {
  skin: 'Base skin',
  hair: 'Hair relief',
  headwear: 'Headwear',
  jacket: 'Jacket',
  sleeves: 'Sleeves',
  trousers: 'Trouser overlay',
  armor: 'Armor',
  detail: 'Painted detail',
} as const;
export type CharacterLayer = keyof typeof characterLayerNames;
export type CharacterLayerSettings = {
  visible: boolean;
  offset: number;
  depth?: number;
  color?: string;
  region?: 'all' | 'head' | 'body' | 'arms' | 'legs';
  tolerance?: number;
};
export type CharacterLayers = Partial<Record<CharacterLayer, CharacterLayerSettings>>;
export const characterLayers = Object.keys(characterLayerNames) as CharacterLayer[];
export const defaultLayer = { visible: true, offset: 0 };
export const defaultDetail = {
  visible: false,
  offset: 0,
  color: '#f0b16a',
  region: 'all',
  tolerance: 35,
} as const;
export const layerDepth = {
  skin: 0,
  hair: 0.95,
  headwear: 0.85,
  jacket: 0.58,
  sleeves: 0.5,
  trousers: 0.52,
  armor: 0.48,
  detail: 1.1,
};
export function validCharacterLayers(value: unknown): value is CharacterLayers {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([key, layer]) =>
        key in characterLayerNames &&
        Object.hasOwn(characterLayerNames, key) &&
        layer &&
        typeof layer.visible === 'boolean' &&
        Number.isFinite(layer.offset) &&
        layer.offset >= 0 &&
        layer.offset <= 2 &&
        (layer.depth === undefined ||
          (Number.isFinite(layer.depth) && layer.depth >= 0 && layer.depth <= 3)) &&
        (layer.color === undefined ||
          ((key === 'hair' || key === 'detail') &&
            typeof layer.color === 'string' &&
            /^#[\da-f]{6}$/i.test(layer.color))) &&
        (layer.region === undefined ||
          (key === 'detail' && ['all', 'head', 'body', 'arms', 'legs'].includes(layer.region))) &&
        (layer.tolerance === undefined ||
          (key === 'detail' &&
            Number.isFinite(layer.tolerance) &&
            layer.tolerance >= 0 &&
            layer.tolerance <= 150)),
    )
  );
}
