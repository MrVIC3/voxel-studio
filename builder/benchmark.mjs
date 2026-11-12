import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import * as current from './core.mjs';

// Reconstruct only the two previous hot paths for a same-process, same-input comparison.
const source = await readFile(new URL('./core.mjs', import.meta.url), 'utf8');
let previous = source.replace('const palette = snapshot.palette.map(state);', 'const palette = snapshot.palette;')
  .replace('const s = palette[i];', 'const s = state(palette[i]);')
  .replace('out[key(world)] = s;', 'out[key(world)] = rotateState(state(palette[s] || s), q);')
  .replace("const block = o.op === 'use' ? null : resolve(o.block, t.rotation);", 'const block = o.block;');
if (source === previous) throw Error('Reference hot paths not found');
const old = await import('data:text/javascript;base64,' + Buffer.from(previous).toString('base64'));
let project, plan, fixture;
try {
  project = JSON.parse(await readFile('builder-data/projects/trial-lower-nw/project.json', 'utf8'));
  plan = JSON.parse(await readFile('builds/final-trial/full/trial-lower-nw.json', 'utf8'));
  fixture = 'actual saved arena northwest district';
} catch {
  fixture = '120k-cell masonry fixture';
  project = { bounds: { min: [0, 0, 0], max: [99, 11, 99] }, base: { palette: [], blocks: [] }, edits: {} };
  plan = { version: 1, operations: [{ op: 'fill', from: [0, 0, 0], to: [99, 11, 99], block: 'stone_brick_stairs[facing=north,half=top,shape=straight,waterlogged=false]' }] };
  project.base = current.pack(new Map(Object.entries(current.compile(plan, project).edits)));
}
const draft = { ...project, edits: {} };
assert.deepEqual(current.compile(plan, draft), old.compile(plan, draft), 'Compiler output changed');
assert.deepEqual(current.unpack(project.base), old.unpack(project.base), 'Snapshot output changed');
const median = (a) => +a.sort((a, b) => a - b)[Math.floor(a.length / 2)].toFixed(2);
const results = {};
for (const [name, fn] of [['compile', (m) => m.compile(plan, draft)], ['unpack', (m) => m.unpack(project.base)]]) {
  fn(old); fn(current);
  const before = [], after = [];
  // Alternate order to reduce warmup/order bias; report medians, not a single best run.
  for (let i = 0; i < 9; i++) for (const [m, times] of i % 2 ? [[current, after], [old, before]] : [[old, before], [current, after]]) {
    const started = performance.now(); fn(m); times.push(performance.now() - started);
  }
  const beforeMs = median(before), afterMs = median(after);
  results[name] = { beforeMs, afterMs, speedup: +(beforeMs / afterMs).toFixed(2) };
}
await mkdir('test-results/builder-performance', { recursive: true });
const report = { fixture, blocks: project.base.blocks.length, rounds: 9, identicalOutput: true, results, node: process.version, at: new Date().toISOString() };
await writeFile('test-results/builder-performance/cpu.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
