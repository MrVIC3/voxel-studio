import test from 'node:test';
import assert from 'node:assert/strict';
import { Voxels } from '../../skills/minecraft-builder/scripts/geometry.mjs';
import { compile, AIR } from '../core.mjs';
const bounds = { min: [-20, -4, -20], max: [20, 30, 20] };
test('curved ribs and arch profiles remain 6-connected and export exact spans including air cuts', () => {
  const v = new Voxels(bounds, { rock: 'minecraft:blackstone' });
  v.tube([[-10, 0, -10], [0, 12, 0], [8, 15, 11]], 0, 'rock');
  assert.equal(v.connectivity().components, 1);
  v.fill([-2, -1, -2], [2, -1, 2], 'rock').set([0, -1, 0], AIR);
  const p = { bounds, edits: {}, base: { palette: [], blocks: [] } };
  const result = compile(v.plan(), p);
  assert.equal(Object.keys(result.edits).length, v.blocks.size);
  for (const [k, value] of v.blocks) assert.equal(result.edits[v.pos(k).join(',')], value);
  assert.equal(result.edits['0,-1,0'], AIR);
  const arch = new Voxels(bounds).arch([-10, 0, 0], 20, 8, 10, 'stone');
  assert.equal(arch.connectivity().components, 1);
  assert.equal(arch.get([0, 18, 0]), 'stone');
});
test('district export refuses missing cells and overlap, preserves every original block exactly once', () => {
  const v = new Voxels(bounds).ring([0, 0, 0], 10, 7, 'minecraft:stone');
  const west = { id: 'west', bounds: { min: [-20, -4, -20], max: [0, 30, 20] } };
  const east = { id: 'east', bounds: { min: [1, -4, -20], max: [20, 30, 20] } };
  assert.throws(() => v.partition([west]), /Uncovered/);
  assert.throws(() => v.partition([west, west]), /Overlapping/);
  const out = v.partition([west, east]);
  assert.equal(out.reduce((n, d) => n + Object.keys(compile(d.plan, { bounds: d.bounds, edits: {} }).edits).length, 0), v.blocks.size);
});
