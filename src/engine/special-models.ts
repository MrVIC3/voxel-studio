import type { ModelElement, ModelFace, ResolvedPart } from './minecraft';
import { faceNames, parseState } from './minecraft';
function entityBox(
  from: number[],
  to: number[],
  u: number,
  v: number,
  texture: string,
  tw = 64,
  th = 64,
  dimensions?: number[],
): ModelElement {
  const [w, h, d] = dimensions || to.map((n, i) => n - from[i]);
  const rects: Record<string, number[]> = {
    east: [u + d + w, v + d, u + 2 * d + w, v + d + h],
    west: [u, v + d, u + d, v + d + h],
    up: [u + d, v, u + d + w, v + d],
    down: [u + d + w, v, u + d + 2 * w, v + d],
    north: [u + d, v + d, u + d + w, v + d + h],
    south: [u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h],
  };
  const faces: Partial<Record<(typeof faceNames)[number], ModelFace>> = {};
  for (const face of faceNames)
    faces[face] = { texture, uv: rects[face].map((n, i) => (n / (i % 2 ? th : tw)) * 16) };
  return { from, to, faces };
}
export function specialModel(name: string): ResolvedPart[] | null {
  const { id, properties: p } = parseState(name),
    short = id.split(':')[1],
    elements: ModelElement[] = [];
  let y = p.facing
    ? ({ north: 0, east: 270, south: 180, west: 90 } as Record<string, number>)[p.facing] || 0
    : -(Number(p.rotation) || 0) * 22.5;
  const box = (
    from: number[],
    to: number[],
    u: number,
    v: number,
    texture: string,
    tw = 64,
    th = 64,
    dims?: number[],
  ) => elements.push(entityBox(from, to, u, v, 'minecraft:' + texture, tw, th, dims));
  if (/(?:^|_)chest$/.test(short)) {
    let kind = short.includes('ender')
      ? 'ender'
      : short.includes('trapped')
        ? 'trapped'
        : short.includes('copper')
          ? 'copper' +
            (short.includes('oxidized')
              ? '_oxidized'
              : short.includes('weathered')
                ? '_weathered'
                : short.includes('exposed')
                  ? '_exposed'
                  : '')
          : 'normal';
    if (p.type === 'left' || p.type === 'right') kind += '_' + p.type;
    const tex = 'entity/chest/' + kind;
    box([1, 0, 1], [15, 10, 15], 0, 19, tex);
    box([1, 9, 1], [15, 14, 15], 0, 0, tex, 64, 64, [14, 5, 14]);
    box([7, 7, 0], [9, 11, 1], 0, 0, tex);
  } else if (/shulker_box$/.test(short)) {
    const color = short.replace('_shulker_box', ''),
      tex = 'entity/shulker/shulker' + (short === 'shulker_box' ? '' : '_' + color);
    box([0, 0, 0], [16, 8, 16], 0, 28, tex);
    box([0, 4, 0], [16, 16, 16], 0, 0, tex);
    y = 0;
  } else if (/_bed$/.test(short)) {
    const tex = 'entity/bed/' + short.replace('_bed', '');
    box([0, 3, 0], [16, 9, 16], 0, p.part === 'head' ? 0 : 22, tex, 64, 64, [16, 6, 16]);
    const z = p.part === 'head' ? 0 : 13;
    box([0, 0, z], [3, 3, z + 3], 50, 0, tex);
    box([13, 0, z], [16, 3, z + 3], 50, 6, tex);
  } else if (/sign$/.test(short)) {
    const wood = short.replace(/_(wall_)?(hanging_)?sign$/, ''),
      hanging = short.includes('hanging'),
      wall = short.includes('wall'),
      tex = 'entity/signs/' + (hanging ? 'hanging/' : '') + wood;
    if (hanging) {
      box([1, 1, 7], [15, 11, 9], 0, 12, tex, 64, 32);
      box([2, 11, 7], [3, 16, 8], 0, 0, tex, 64, 32);
      box([13, 11, 7], [14, 16, 8], 0, 0, tex, 64, 32);
    } else {
      box([0, 6, 7.333], [16, 14, 8.667], 0, 0, tex, 64, 32, [24, 12, 2]);
      if (!wall) box([7.333, 0, 7.333], [8.667, 9.333, 8.667], 0, 14, tex, 64, 32, [2, 14, 2]);
    }
  } else if (/banner$/.test(short)) {
    const tex = 'entity/banner/base';
    box([3, 6, 7.5], [13, 26, 8], 0, 0, tex, 64, 64, [20, 40, 1]);
    for (const face of Object.values(elements[0].faces)) if (face) face.tintindex = 0;
    box([7.5, 0, 7.5], [8.5, 28, 8.5], 44, 0, tex, 64, 64, [2, 42, 2]);
    box([2.5, 26, 7.5], [13.5, 27.5, 8.5], 0, 42, tex, 64, 64, [20, 2, 2]);
  } else if (/(head|skull)$/.test(short)) {
    let tex = short.includes('skeleton')
      ? 'entity/skeleton/' + (short.includes('wither') ? 'wither_skeleton' : 'skeleton')
      : short.includes('zombie')
        ? 'entity/zombie/zombie'
        : short.includes('creeper')
          ? 'entity/creeper/creeper'
          : short.includes('piglin')
            ? 'entity/piglin/piglin'
            : short.includes('dragon')
              ? 'entity/enderdragon/dragon'
              : 'entity/player/wide/steve';
    const wall = short.includes('wall'),
      h = short.includes('skeleton') || short.includes('creeper') ? 32 : 64;
    box([4, wall ? 4 : 0, wall ? 0 : 4], [12, wall ? 12 : 8, wall ? 8 : 12], 0, 0, tex, 64, h);
  } else if (short === 'conduit') {
    box([5, 5, 5], [11, 11, 11], 0, 0, 'entity/conduit/base', 32, 16);
  } else if (short === 'decorated_pot') {
    const faces: any = {};
    for (const face of faceNames)
      faces[face] = {
        texture: 'minecraft:entity/decorated_pot/decorated_pot_side',
        uv: [0, 0, 16, 16],
      };
    elements.push({ from: [1, 0, 1], to: [15, 14, 15], faces });
    box([5, 14, 5], [11, 16, 11], 0, 0, 'entity/decorated_pot/decorated_pot_base', 32, 32);
  } else if (short.includes('copper_golem_statue')) {
    const age = short.includes('oxidized')
        ? 'oxidized_'
        : short.includes('weathered')
          ? 'weathered_'
          : short.includes('exposed')
            ? 'exposed_'
            : '',
      tex = 'entity/copper_golem/' + age + 'copper_golem';
    box([3, 14, 3], [13, 22, 11], 0, 0, tex, 64, 64, [10, 8, 8]);
    box([4, 6, 4], [12, 14, 10], 0, 16, tex, 64, 64, [8, 8, 6]);
    box([1, 6, 5], [4, 14, 8], 28, 16, tex, 64, 64, [3, 8, 3]);
    box([12, 6, 5], [15, 14, 8], 28, 16, tex, 64, 64, [3, 8, 3]);
    box([4, 0, 5], [7, 6, 8], 0, 30, tex, 64, 64, [3, 6, 3]);
    box([9, 0, 5], [12, 6, 8], 0, 30, tex, 64, 64, [3, 6, 3]);
  } else return null;
  return [{ variant: { model: 'minecraft:builtin/entity', y }, model: { textures: {}, elements } }];
}
