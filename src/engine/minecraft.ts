import { readZip } from './importers';
export type FaceName = 'east' | 'west' | 'up' | 'down' | 'south' | 'north';
export const faceNames: FaceName[] = ['east', 'west', 'up', 'down', 'south', 'north'];
export type ModelFace = {
  texture: string;
  uv?: number[];
  rotation?: number;
  cullface?: FaceName;
  tintindex?: number;
};
export type ModelElement = {
  from: number[];
  to: number[];
  rotation?: { origin: number[]; axis: 'x' | 'y' | 'z'; angle: number; rescale?: boolean };
  shade?: boolean;
  faces: Partial<Record<FaceName, ModelFace>>;
};
export type BlockModel = {
  parent?: string;
  textures?: Record<string, string>;
  elements?: ModelElement[];
  ambientocclusion?: boolean;
};
export type ModelVariant = {
  model: string;
  x?: number;
  y?: number;
  uvlock?: boolean;
  weight?: number;
};
export type BlockState = {
  variants?: Record<string, ModelVariant | ModelVariant[]>;
  multipart?: { when?: Record<string, unknown>; apply: ModelVariant | ModelVariant[] }[];
};
export type MinecraftAssets = {
  version: string;
  source: string;
  textures: Record<string, string>;
  models: Record<string, BlockModel>;
  blockstates: Record<string, BlockState>;
  animations?: Record<
    string,
    {
      frametime?: number;
      frames?: (number | { index: number; time?: number })[];
      width?: number;
      height?: number;
    }
  >;
};
export const resourceId = (name: string, namespace = 'minecraft') =>
  name.includes(':') ? name : `${namespace}:${name}`;
export function parseState(name: string) {
  const [id, raw] = name.split('[');
  const properties: Record<string, string> = {};
  for (const pair of (raw || '').replace(']', '').split(',')) {
    const [key, value] = pair.split('=');
    if (key && value) properties[key] = value;
  }
  return { id: resourceId(id), properties };
}
function base64(bytes: Uint8Array) {
  let text = '';
  for (let offset = 0; offset < bytes.length; offset += 16384)
    text += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  return btoa(text);
}
export function decodeMinecraftAssets(
  bytes: Uint8Array,
  version: string,
  source: string,
): MinecraftAssets {
  const files = readZip(bytes, (name) =>
    /^assets\/[^/]+\/(?:textures\/.+\.png(?:\.mcmeta)?|models\/block\/.+\.json|blockstates\/.+\.json)$/.test(
      name,
    ),
  );
  const assets: MinecraftAssets = {
    version,
    source,
    textures: Object.create(null),
    models: Object.create(null),
    blockstates: Object.create(null),
    animations: Object.create(null),
  };
  let total = 0,
    count = 0;
  for (const [path, data] of Object.entries(files)) {
    total += data.length;
    if (total > 96 * 1024 * 1024 || ++count > 20000)
      throw Error('Resource pack exceeds the asset budget.');
    if (path.endsWith('.png.mcmeta')) {
      const namespace = path.split('/')[1],
        key = namespace + ':' + path.split('/textures/')[1].slice(0, -11);
      const metadata = JSON.parse(new TextDecoder().decode(data));
      if (metadata.animation) assets.animations![key] = metadata.animation;
      continue;
    }
    const match = /^assets\/([^/]+)\/(textures|models|blockstates)\/(.+)\.(png|json)$/.exec(path);
    if (!match) continue;
    const [, namespace, kind, name] = match,
      key = `${namespace}:${name}`;
    if (kind === 'textures') {
      if (data.length > 2 * 1024 * 1024) continue;
      assets.textures[key] = `data:image/png;base64,${base64(data)}`;
    } else {
      if (data.length > 512 * 1024) throw Error(`Model definition too large: ${name}`);
      const value = JSON.parse(new TextDecoder().decode(data));
      if (kind === 'models') assets.models[key] = value;
      else assets.blockstates[key] = value;
    }
  }
  if (!Object.keys(assets.textures).length)
    throw Error('No Minecraft texture assets found in this archive.');
  return assets;
}
const defaults: Record<string, string> = {
  axis: 'y',
  facing: 'north',
  half: 'bottom',
  type: 'bottom',
  shape: 'straight',
  snowy: 'false',
  waterlogged: 'false',
  lit: 'false',
  open: 'false',
  powered: 'false',
  persistent: 'false',
  distance: '7',
  age: '0',
  level: '0',
  north: 'false',
  south: 'false',
  east: 'false',
  west: 'false',
  up: 'false',
  down: 'false',
  in_wall: 'false',
  face: 'floor',
  part: 'foot',
  hinge: 'left',
  rotation: '0',
};
function matches(condition: Record<string, unknown>, props: Record<string, string>): boolean {
  if (Array.isArray(condition.OR)) return condition.OR.some((c) => matches(c, props));
  if (Array.isArray(condition.AND)) return condition.AND.every((c) => matches(c, props));
  return Object.entries(condition).every(([key, value]) =>
    String(value)
      .split('|')
      .includes(props[key] ?? defaults[key] ?? 'false'),
  );
}
export type ResolvedModel = {
  elements: ModelElement[];
  textures: Record<string, string>;
  parent?: string;
};
export type ResolvedPart = { model: ResolvedModel; variant: ModelVariant };
export class MinecraftLibrary {
  private models = new Map<string, ResolvedModel>();
  private states = new Map<string, ResolvedPart[]>();
  missing = new Set<string>();
  constructor(public assets: MinecraftAssets) {}
  model(id: string, depth = 0): ResolvedModel {
    id = resourceId(id);
    const cached = this.models.get(id);
    if (cached) return cached;
    if (depth > 24) throw Error('Circular Minecraft model inheritance.');
    const data = this.assets.models[id];
    if (!data) {
      this.missing.add(id);
      return { elements: [], textures: {}, parent: id };
    }
    const parent =
      data.parent && !data.parent.includes('builtin/')
        ? this.model(resourceId(data.parent, id.split(':')[0]), depth + 1)
        : undefined;
    const result = {
      elements: data.elements ?? parent?.elements ?? [],
      textures: { ...parent?.textures, ...data.textures },
      parent: data.parent || parent?.parent,
    };
    this.models.set(id, result);
    return result;
  }
  texture(reference: string, textures: Record<string, string>, namespace = 'minecraft'): string {
    let value = reference;
    const visited = new Set<string>();
    while (value?.startsWith('#')) {
      if (visited.has(value)) return 'minecraft:missingno';
      visited.add(value);
      value = textures[value.slice(1)];
    }
    return value ? resourceId(value, namespace) : 'minecraft:missingno';
  }
  parts(name: string): ResolvedPart[] {
    const cached = this.states.get(name);
    if (cached) return cached;
    const { id, properties } = parseState(name),
      state = this.assets.blockstates[id],
      variants: ModelVariant[] = [];
    if (id.endsWith('_wall')) {
      for (const side of ['north', 'south', 'east', 'west']) properties[side] ??= 'none';
      properties.up ??= 'true';
    }
    if (id.endsWith(':redstone_wire')) {
      for (const side of ['north', 'south', 'east', 'west']) properties[side] ??= 'none';
    }
    if (id.endsWith(':leaf_litter')) properties.segment_amount ??= '1';
    const pick = (v: ModelVariant | ModelVariant[]) => (Array.isArray(v) ? v[0] : v);
    if (state?.variants) {
      const entries = Object.entries(state.variants);
      const found = entries.find(
        ([key]) =>
          !key ||
          matches(Object.fromEntries(key.split(',').map((pair) => pair.split('='))), properties),
      );
      if (found) variants.push(pick(found[1]));
      else if (entries.length) {
        const preferred = entries.sort(([a], [b]) => {
          const score = (key: string) =>
            key.split(',').reduce((n, pair) => {
              const [k, v] = pair.split('=');
              return n + (v === (properties[k] ?? defaults[k]) ? 2 : 0);
            }, 0);
          return score(b) - score(a);
        })[0];
        variants.push(pick(preferred[1]));
      }
    }
    for (const item of state?.multipart || [])
      if (!item.when || matches(item.when, properties)) variants.push(pick(item.apply));
    if (!variants.length) variants.push({ model: `${id.split(':')[0]}:block/${id.split(':')[1]}` });
    const result = variants
      .filter(Boolean)
      .map((variant) => ({ variant, model: this.model(variant.model) }));
    this.states.set(name, result);
    return result;
  }
  textureData(id: string, overrides: Record<string, string> = {}) {
    const short = id.replace(/^minecraft:block\//, '');
    return overrides[id] || overrides[short] || this.assets.textures[id];
  }
}
