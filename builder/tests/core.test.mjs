import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR,
  audit,
  bounds,
  compile,
  compose,
  diff,
  pack,
  rotateState,
  state,
  unpack,
} from '../core.mjs';
import { batches } from '../bridge.mjs';
const project = () => ({
  bounds: { min: [-20, -5, -20], max: [30, 30, 30] },
  base: { palette: [], blocks: [] },
  edits: {},
  revision: 0,
});
test('bounded plans compose nested repeated rotated motifs and preserve facing/connections', () => {
  const p = project(),
    plan = {
      version: 1,
      components: {
        window: [
          {
            op: 'set',
            at: [2, 0, 0],
            block: 'oak_stairs[facing=north,half=top,shape=straight,waterlogged=false]',
          },
        ],
        facade: [
          { op: 'use', component: 'window', at: [0, 0, 0], rotate: 90, count: 2, step: [0, 0, 4] },
        ],
      },
      operations: [{ op: 'use', component: 'facade', at: [10, 2, 10], rotate: 90 }],
    };
  p.edits = compile(plan, p).edits;
  assert.equal(
    p.edits['8,2,10'],
    'minecraft:oak_stairs[facing=south,half=top,shape=straight,waterlogged=false]',
  );
  assert.equal(p.edits['4,2,10'], p.edits['8,2,10']);
  assert.equal(
    rotateState('minecraft:glass_pane[east=true,north=false,south=false,west=true]', 1),
    'minecraft:glass_pane[east=false,north=true,south=true,west=false]',
  );
  assert.equal(rotateState('minecraft:oak_log[axis=x]', 1), 'minecraft:oak_log[axis=z]');
});
test('last write wins; clearing and failed plans do not mutate the existing draft', () => {
  const p = project();
  p.edits = { '0,0,0': 'minecraft:stone' };
  const output = compile(
    {
      version: 1,
      operations: [
        { op: 'fill', from: [0, 0, 0], to: [3, 3, 3], block: 'stone' },
        { op: 'set', at: [0, 0, 0], block: 'air' },
      ],
    },
    p,
  );
  assert.equal(output.edits['0,0,0'], AIR);
  assert.equal(Object.keys(output.edits).length, 64);
  assert.throws(
    () =>
      compile(
        {
          version: 1,
          operations: [
            { op: 'set', at: [1, 1, 1], block: 'stone' },
            { op: 'set', at: [100, 0, 0], block: 'stone' },
          ],
        },
        p,
      ),
    /outside/,
  );
  assert.deepEqual(p.edits, { '0,0,0': 'minecraft:stone' });
  assert.throws(() => state('stone[facing=north,facing=south]'), /properties/);
  assert.throws(() => bounds({ min: [0, 0, 0], max: [100, 100, 100] }), /exceeds/);
});
test('shape shells, ellipses and sparse world deltas retain absolute negative coordinates', () => {
  const p = project();
  p.base = pack(new Map([['-2,-1,-3', 'minecraft:dirt']]));
  p.edits = compile(
    {
      version: 1,
      operations: [
        { op: 'box', from: [0, 0, 0], to: [4, 4, 4], block: 'stone' },
        { op: 'cylinder', from: [7, 0, 0], to: [11, 4, 4], hollow: true, block: 'oak_log' },
        { op: 'ellipsoid', from: [0, 7, 0], to: [4, 11, 4], block: 'oak_leaves[persistent=true]' },
      ],
    },
    p,
  ).edits;
  const map = compose(p);
  assert.equal(map.get('-2,-1,-3'), 'minecraft:dirt');
  assert.equal(map.has('2,2,2'), false);
  assert.equal(map.has('9,2,2'), false);
  assert.equal(map.has('2,9,2'), true);
  assert.deepEqual(unpack(pack(map)), map);
  assert.equal(
    diff(p).some((c) => c.pos.join(',') === '-2,-1,-3'),
    false,
  );
});
test('audits find obstructed circulation without rejecting deliberate isolated details', () => {
  const p = project();
  p.edits = { '0,0,0': 'minecraft:stone', '10,10,10': 'minecraft:glowstone' };
  const r = audit(p, [{ name: 'door', kind: 'empty', bounds: { min: [0, 0, 0], max: [0, 1, 0] } }]);
  assert.equal(r.failures[0].count, 1);
  assert.equal(r.isolatedSamples.length, 2);
});
test('spatial transaction batching respects chunk and count limits for sparse megastructures', () => {
  const changes = Array.from({ length: 20000 }, (_, i) => ({
    pos: [i * 16, 0, 0],
    before: AIR,
    after: 'minecraft:stone',
  }));
  const result = batches(changes);
  assert.equal(result.flat().length, changes.length);
  for (const b of result) {
    assert(b.length <= 8192);
    assert(
      new Set(b.map((c) => Math.floor(c.pos[0] / 16) + ',' + Math.floor(c.pos[2] / 16))).size <= 64,
    );
  }
});
