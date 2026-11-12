// An authored architectural fixture: deterministic motifs, no random block sprinkling.
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const operations = [],
  components = {};
const set = (x, y, z, block) => operations.push({ op: 'set', at: [x, y, z], block });
const fill = (from, to, block) => operations.push({ op: 'fill', from, to, block });
const line = (from, to, block) => operations.push({ op: 'line', from, to, block });
const palette = {
  foundation: 'minecraft:stone_bricks',
  base: 'minecraft:polished_andesite',
  wall: 'minecraft:white_terracotta',
  frame: 'minecraft:stripped_spruce_log[axis=y]',
  beamX: 'minecraft:stripped_spruce_log[axis=x]',
  beamZ: 'minecraft:stripped_spruce_log[axis=z]',
  floor: 'minecraft:spruce_planks',
  roof: 'minecraft:deepslate_tiles',
  ridge: 'minecraft:deepslate_tile_slab[type=bottom,waterlogged=false]',
  glass: 'minecraft:glass_pane[east=true,north=false,south=false,waterlogged=false,west=true]',
  sideGlass: 'minecraft:glass_pane[east=false,north=true,south=true,waterlogged=false,west=false]',
};
// A stepped stone plinth, narrow front terrace, and a legible approach.
fill([-9, 0, -8], [9, 0, 9], 'foundation');
fill([-9, 1, -8], [9, 1, 9], 'base');
fill([-8, 2, -7], [8, 2, 8], 'floor');
fill([-5, 0, -13], [5, 0, -9], 'foundation');
fill([-5, 1, -13], [5, 1, -9], 'minecraft:stone_brick_slab[type=bottom,waterlogged=false]');
fill([-2, 0, -23], [2, 0, -14], 'minecraft:gravel');
fill([-3, 0, -23], [-3, 0, -14], 'minecraft:cobblestone');
fill([3, 0, -23], [3, 0, -14], 'minecraft:cobblestone');
for (let x = -2; x <= 2; x++) {
  set(
    x,
    1,
    -14,
    'minecraft:stone_brick_stairs[facing=south,half=bottom,shape=straight,waterlogged=false]',
  );
  set(
    x,
    2,
    -13,
    'minecraft:stone_brick_stairs[facing=south,half=bottom,shape=straight,waterlogged=false]',
  );
}
// Structural frame and recessed infill, with two usable floors.
fill([-8, 3, -7], [8, 11, -7], 'wall');
fill([-8, 3, 8], [8, 11, 8], 'wall');
fill([-8, 3, -6], [-8, 11, 7], 'wall');
fill([8, 3, -6], [8, 11, 7], 'wall');
fill([-7, 7, -6], [7, 7, 7], 'floor');
for (const x of [-8, -4, 0, 4, 8]) for (const z of [-7, 8]) fill([x, 3, z], [x, 11, z], 'frame');
for (const z of [-7, -2, 3, 8]) for (const x of [-8, 8]) fill([x, 3, z], [x, 11, z], 'frame');
for (const y of [3, 7, 11]) {
  fill([-8, y, -7], [8, y, -7], 'beamX');
  fill([-8, y, 8], [8, y, 8], 'beamX');
  fill([-8, y, -6], [-8, y, 7], 'beamZ');
  fill([8, y, -6], [8, y, 7], 'beamZ');
}
// A complete facade bay carries glazing, reveal, lintel and a controlled shutter pair.
components.frontWindow = [
  { op: 'fill', from: [0, 0, 0], to: [1, 1, 0], block: 'glass' },
  {
    op: 'fill',
    from: [-1, -1, -1],
    to: [2, -1, -1],
    block: 'minecraft:spruce_slab[type=top,waterlogged=false]',
  },
  { op: 'fill', from: [-1, 2, -1], to: [2, 2, -1], block: 'beamX' },
  {
    op: 'fill',
    from: [-1, 0, -1],
    to: [-1, 1, -1],
    block:
      'minecraft:spruce_trapdoor[facing=west,half=bottom,open=true,powered=false,waterlogged=false]',
  },
  {
    op: 'fill',
    from: [2, 0, -1],
    to: [2, 1, -1],
    block:
      'minecraft:spruce_trapdoor[facing=east,half=bottom,open=true,powered=false,waterlogged=false]',
  },
];
for (const y of [4, 9])
  for (const x of [-6, 2]) {
    operations.push({ op: 'use', component: 'frontWindow', at: [x, y, -7] });
    operations.push({ op: 'use', component: 'frontWindow', at: [-x - 1, y, 8], rotate: 180 });
  }
for (const y of [4, 9])
  for (const z of [-4, 1, 5])
    for (const x of [-8, 8]) {
      fill([x, y, z], [x, y + 1, z + 1], 'sideGlass');
      fill([x, y - 1, z], [x, y - 1, z + 1], 'minecraft:spruce_slab[type=top,waterlogged=false]');
    }
// Two-block entry with an open passage behind it. Paired exact-state door halves.
fill([-1, 3, -7], [1, 5, -7], 'minecraft:air');
for (const x of [-1, 0]) {
  const hinge = x === -1 ? 'left' : 'right';
  for (const half of ['lower', 'upper'])
    set(
      x,
      half === 'lower' ? 3 : 4,
      -7,
      `minecraft:spruce_door[facing=north,half=${half},hinge=${hinge},open=false,powered=false]`,
    );
}
fill([-2, 3, -8], [-2, 5, -8], 'frame');
fill([2, 3, -8], [2, 5, -8], 'frame');
fill([-2, 6, -8], [2, 6, -8], 'beamX');
// Tall gables and a thick, continuous pitched roof. No dormer seams to hide.
for (let i = 0; i < 10; i++) {
  const y = 12 + i,
    r = 9 - i;
  fill([-r, y, -7], [r, y, -7], 'wall');
  fill([-r, y, 8], [r, y, 8], 'wall');
}
for (const z of [-7, 8]) {
  fill([0, 12, z], [0, 21, z], 'frame');
  line([-9, 12, z], [0, 21, z], 'beamX');
  line([9, 12, z], [0, 21, z], 'beamX');
  fill([-4, 13, z], [-3, 15, z], 'glass');
  fill([3, 13, z], [4, 15, z], 'glass');
}
for (let i = 0; i < 10; i++) {
  const x = 10 - i,
    y = 12 + i;
  fill(
    [-x, y, -9],
    [-x, y, 10],
    'minecraft:deepslate_tile_stairs[facing=east,half=bottom,shape=straight,waterlogged=false]',
  );
  fill(
    [x, y, -9],
    [x, y, 10],
    'minecraft:deepslate_tile_stairs[facing=west,half=bottom,shape=straight,waterlogged=false]',
  );
  // Under-eave line gives roof edges thickness and a warm structural boundary.
  if (i === 0) {
    fill([-10, 11, -9], [-10, 11, 10], 'beamZ');
    fill([10, 11, -9], [10, 11, 10], 'beamZ');
  }
}
fill([0, 22, -9], [0, 22, 10], 'roof');
fill([0, 23, -9], [0, 23, 10], 'ridge');
// A smaller porch roof, offset below the main facade's upper windows.
for (const x of [-4, 4]) {
  fill([x, 2, -12], [x, 6, -12], 'frame');
  set(
    x,
    2,
    -12,
    'minecraft:stone_brick_wall[east=none,north=none,south=none,up=true,waterlogged=false,west=none]',
  );
}
fill([-4, 6, -12], [4, 6, -12], 'beamX');
for (let i = 0; i < 4; i++) {
  fill(
    [-5 + i, 7 + i, -13],
    [-5 + i, 7 + i, -8],
    'minecraft:spruce_stairs[facing=east,half=bottom,shape=straight,waterlogged=false]',
  );
  fill(
    [5 - i, 7 + i, -13],
    [5 - i, 7 + i, -8],
    'minecraft:spruce_stairs[facing=west,half=bottom,shape=straight,waterlogged=false]',
  );
}
fill([-1, 11, -13], [1, 11, -8], 'minecraft:spruce_slab[type=bottom,waterlogged=false]');
// Close the porch gable into a legible framed triangle, keeping the passage below open.
for (let i = 0; i < 4; i++) fill([-4 + i, 7 + i, -12], [4 - i, 7 + i, -12], 'floor');
fill([0, 7, -12], [0, 10, -12], 'frame');
// A masonry chimney with a closed cap and deliberate shoulder, not floating smoke blocks.
fill([5, 3, 3], [6, 21, 4], 'minecraft:bricks');
fill([4, 22, 2], [7, 22, 5], 'minecraft:brick_slab[type=top,waterlogged=false]');
fill([5, 23, 3], [6, 24, 4], 'minecraft:bricks');
fill([4, 25, 2], [7, 25, 5], 'minecraft:brick_slab[type=top,waterlogged=false]');
// Interior beams, staircase and an upstairs landing with sufficient cutout headroom.
for (const z of [-2, 3]) fill([-7, 6, z], [7, 6, z], 'beamX');
fill([4, 7, -5], [6, 7, 0], 'minecraft:air');
for (let i = 0; i < 5; i++)
  fill(
    [5, 3 + i, -5 + i],
    [6, 3 + i, -5 + i],
    'minecraft:spruce_stairs[facing=south,half=bottom,shape=straight,waterlogged=false]',
  );
fill(
  [4, 8, -5],
  [4, 8, 0],
  'minecraft:spruce_fence[east=false,north=true,south=true,waterlogged=false,west=false]',
);
// The hearth, reading table and benches use ordinary non-entity blocks.
fill([-6, 3, 3], [-4, 3, 5], 'minecraft:stone_bricks');
fill([-6, 4, 5], [-4, 5, 5], 'minecraft:bricks');
set(-5, 4, 4, 'minecraft:glowstone');
set(-5, 4, 3, 'minecraft:iron_bars[east=true,north=false,south=false,waterlogged=false,west=true]');
fill([-2, 3, 1], [1, 3, 3], 'minecraft:dark_oak_slab[type=top,waterlogged=false]');
fill(
  [-3, 3, 1],
  [-3, 3, 3],
  'minecraft:spruce_stairs[facing=east,half=bottom,shape=straight,waterlogged=false]',
);
fill(
  [2, 3, 1],
  [2, 3, 3],
  'minecraft:spruce_stairs[facing=west,half=bottom,shape=straight,waterlogged=false]',
);
for (const x of [-6, 6]) {
  set(x, 8, 2, 'minecraft:glowstone');
  set(
    x,
    8,
    1,
    'minecraft:spruce_trapdoor[facing=north,half=bottom,open=true,powered=false,waterlogged=false]',
  );
}
// Hand-shaped clustered planting beds with explicit persistent leaves.
for (const x of [-8, 8]) {
  fill([x - 1, 0, -17], [x + 1, 0, -15], 'minecraft:mossy_stone_bricks');
  fill([x - 1, 1, -17], [x + 1, 1, -15], 'minecraft:moss_block');
  operations.push({
    op: 'ellipsoid',
    from: [x - 1, 2, -17],
    to: [x + 1, 3, -15],
    block: 'minecraft:azalea_leaves[persistent=true]',
  });
}
// Site pad is an offline preview ground, separate from the live-architecture plan.
const site = [
  { op: 'fill', from: [-24, -1, -24], to: [24, -1, 26], block: 'minecraft:dirt' },
  { op: 'fill', from: [-24, 0, -24], to: [24, 0, 26], block: 'minecraft:grass_block[snowy=false]' },
];
const plan = { version: 1, palette, components, operations };
const dir = path.dirname(fileURLToPath(import.meta.url));
await writeFile(path.join(dir, 'watch-house.json'), JSON.stringify(plan, null, 2));
await writeFile(
  path.join(dir, 'watch-house-offline.json'),
  JSON.stringify({ ...plan, operations: [...site, ...operations] }, null, 2),
);
console.log(
  JSON.stringify({
    operations: operations.length,
    files: ['watch-house.json', 'watch-house-offline.json'],
  }),
);
