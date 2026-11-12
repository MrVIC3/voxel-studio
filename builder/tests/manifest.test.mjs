import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadManifest } from '../manifest.mjs';
test('manifest paths resolve relative to their file and cannot carry automatic findings', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'build-manifest-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'plans'));
  const plan = { version: 1, operations: [] };
  await writeFile(path.join(root, 'plans/west.json'), JSON.stringify(plan));
  await writeFile(path.join(root, 'brief.md'), 'A pointed vaulted entrance.');
  await writeFile(path.join(root, 'build.json'), JSON.stringify({ version: 1, findings: 'Never accept these automatically', briefFile: 'brief.md', projects: [{ id: 'west', plan: 'plans/west.json' }], renders: [{ views: ['top'] }] }));
  const spec = await loadManifest(path.join(root, 'build.json'));
  assert.deepEqual(spec.projects[0].plan, plan);
  assert.equal(spec.brief, 'A pointed vaulted entrance.');
  assert.equal(spec.findings, undefined);
});
