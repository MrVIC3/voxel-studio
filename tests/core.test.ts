import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, identity, demoProject, insertKey, validateProject } from '../src/model';
import { importFile, importNBT, readNBT, unpack } from '../src/engine/importers';
import {
  byte,
  bytes,
  compound,
  encode,
  int,
  legacySchematic,
  litematic,
  list,
  region,
  schematic2,
  schematic3,
  short,
  str,
  structure,
} from './fixtures';
import { zipSync } from 'fflate';
test('project round trips with embedded blocks and animation', () => {
  const p = demoProject();
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))), p);
});
test('invalid project content is rejected before GPU allocation', () => {
  for (const patch of [
    { duration: Infinity },
    { fps: 0 },
    { objects: [{ ...demoProject().objects[0], transform: { ...identity(), scale: [0, 1, 1] } }] },
    { lighting: { ...demoProject().lighting, sky: 'javascript:bad' } },
    { tracks: { missing: [{ ...identity(), frame: 0, interpolation: 'smooth' }] } },
  ])
    assert.throws(() => validateProject({ ...demoProject(), ...patch }));
});
test('key insertion replaces the current frame and preserves sorted order', () => {
  let p = insertKey(demoProject(), { id: 'character' }, 20, identity(), 'linear');
  p = insertKey(p, { id: 'character' }, 0, { ...identity(), position: [-2, 0, 0] }, 'linear');
  p = insertKey(p, { id: 'character' }, 20, { ...identity(), position: [2, 0, 0] }, 'linear');
  assert.equal(p.tracks.character.length, 2);
  assert.equal(p.tracks.character[0].frame, 0);
  assert.deepEqual(evaluate(p.tracks.character, 10, identity()).position, [0, 0, 0]);
});
test('smooth, step and boundary interpolation', () => {
  const a = { ...identity(), frame: 0, interpolation: 'smooth' as const },
    b = {
      ...identity(),
      position: [10, 0, 0] as [number, number, number],
      frame: 10,
      interpolation: 'linear' as const,
    };
  assert.equal(evaluate([a, b], 2, identity()).position[0], 1.0400000000000003);
  assert.equal(evaluate([{ ...a, interpolation: 'step' }, b], 8, identity()).position[0], 0);
  assert.equal(evaluate([a, b], 100, identity()).position[0], 10);
  assert.equal(evaluate([a, b], -1, identity()).position[0], 0);
});
test('Sponge v2 imports non-air blocks in YZX order', () => {
  const r = importNBT(schematic2());
  assert.equal(r.voxels.blocks.length, 3);
  assert.equal(r.voxels.palette[0], 'minecraft:stone');
  assert.deepEqual(r.voxels.blocks[1], [0, 0, 1, 1]);
});
test('Sponge v3 nested container imports slabs', () => {
  const r = importNBT(schematic3());
  assert.equal(r.voxels.blocks.length, 1);
  assert.equal(r.voxels.palette[0], 'minecraft:stone_slab[type=top]');
});
test('a one-million-block Sponge schematic imports and survives a project round trip', () => {
  const r = importNBT(encode({
    Width: short(100),
    Height: short(100),
    Length: short(100),
    Palette: compound({ 'minecraft:stone': int(0) }),
    BlockData: { type: 7, value: new Uint8Array(1_000_000) },
  }));
  assert.equal(r.voxels.blocks.length, 1_000_000);
  const p = demoProject();
  p.objects.push({ id: 'large-build', name: 'Large build', type: 'build', visible: true, transform: identity(), voxels: r.voxels });
  const loaded = validateProject(JSON.parse(JSON.stringify(p)));
  assert.equal(loaded.objects.at(-1)?.voxels?.blocks.length, 1_000_000);
});
test('schematic multi-byte VarInt palette indices', () => {
  const r = importNBT(
    encode({
      Width: short(1),
      Height: short(1),
      Length: short(1),
      Palette: compound({ 'minecraft:gold_block': int(128) }),
      BlockData: bytes([128, 1]),
    }),
  );
  assert.equal(r.voxels.palette[0], 'minecraft:gold_block');
});
test('vanilla structure and legacy MCEdit', () => {
  assert.equal(importNBT(structure()).voxels.blocks.length, 2);
  assert.deepEqual(importNBT(legacySchematic()).voxels.palette, [
    'minecraft:stone',
    'minecraft:grass_block',
  ]);
});
test('named palettes preserve slab and other block state properties', () => {
  const data = encode({
    palette: list(10, [
      {
        Name: str('minecraft:stone_slab'),
        Properties: compound({ waterlogged: str('false'), type: str('top') }),
      },
    ]),
    blocks: list(10, [{ pos: list(3, [0, 0, 0]), state: int(0) }]),
  });
  assert.equal(
    importNBT(data).voxels.palette[0],
    'minecraft:stone_slab[type=top,waterlogged=false]',
  );
});
test('negative schematic palette indices are rejected', () => {
  assert.throws(
    () =>
      importNBT(
        encode({
          Width: short(1),
          Height: short(1),
          Length: short(1),
          Palette: compound({ 'minecraft:stone': int(-1) }),
          BlockData: bytes([0]),
        }),
      ),
    /Invalid schematic palette/,
  );
});
test('Litematica negative dimensions and bit-packed states', () => {
  const r = importNBT(litematic());
  assert.equal(r.voxels.blocks.length, 2);
  assert.deepEqual(r.origin, [4, 1, -2]);
  assert.deepEqual(
    r.voxels.blocks.map((b) => b[0]),
    [0, 1],
  );
});
test('packed arrays crossing word boundaries and padded arrays', () => {
  const all = (29n << 60n) | (7n << 65n);
  const data = [all & ((1n << 64n) - 1n), all >> 64n];
  assert.equal(unpack(data, 12, 5, false), 29);
  assert.equal(unpack(data, 13, 5, false), 7);
  assert.equal(unpack([3n << 55n, 9n], 11, 5, true), 3);
  assert.equal(unpack([3n << 55n, 9n], 12, 5, true), 9);
  assert.throws(() => unpack([], 0, 4, true));
});
test('Anvil region crops chunk and Y bounds', () => {
  const r = importFile(region(), 'r.0.0.mca', {
    centerX: 0,
    centerZ: 0,
    radius: 0,
    minY: 5,
    maxY: 5,
  });
  assert.equal(r.voxels.blocks.length, 256);
  assert.equal(r.origin[1], 5);
  assert.ok(r.voxels.blocks.every((b) => b[1] === 0));
  assert.throws(
    () =>
      importFile(region(), 'r.0.0.mca', { centerX: 10, centerZ: 10, radius: 0, minY: 0, maxY: 15 }),
    /No solid blocks/,
  );
});
test('zipped Overworld region loads and excludes Nether', () => {
  const zip = zipSync({
    'World/region/r.0.0.mca': region(),
    'World/DIM-1/region/r.0.0.mca': region(),
  });
  const r = importFile(zip, 'world.zip', { centerX: 0, centerZ: 0, radius: 0, minY: 0, maxY: 0 });
  assert.equal(r.voxels.blocks.length, 256);
});
test('corrupt, oversized and unsupported NBT fails explicitly', () => {
  assert.throws(() => readNBT(new Uint8Array([10, 0, 0, 8, 0, 1, 97, 0, 10])));
  assert.throws(() => importNBT(encode({ hello: str('world') })), /Supported NBT/);
  assert.throws(
    () =>
      importNBT(
        encode({
          Width: short(30000),
          Height: short(30000),
          Length: short(30000),
          Blocks: bytes([]),
        }),
      ),
    /volume/,
  );
});
