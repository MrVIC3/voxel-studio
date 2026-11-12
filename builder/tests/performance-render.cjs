const { _electron: electron } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const root = path.resolve(__dirname, '../..'), data = path.join(root, 'test-results', 'builder-performance', 'renderer');
  const ids = [];
  for (const band of ['lower', 'upper', 'sky']) for (const corner of ['nw', 'ne', 'sw', 'se']) ids.push(`trial-${band}-${corner}`);
  for (const id of ids) {
    const p = JSON.parse(await fs.readFile(path.join(root, 'builder-data/projects', id, 'project.json'), 'utf8'));
    assert.equal(Object.keys(p.edits).length, 0, 'Benchmark only a clean saved build');
    const dir = path.join(data, 'projects', id); await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'project.json'), JSON.stringify({ ...p, worldId: null, renders: [], review: null, receipts: [], rules: [] }));
  }
  const env = { ...process.env, VOXEL_BUILD_DATA: data }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: require('electron'), args: [path.join(root, 'builder/desktop.cjs')], env, timeout: 60000 });
  try {
    const page = await app.firstWindow(); await page.waitForFunction(() => !!window.buildEngine, { timeout: 45000 });
    const enginePid = await app.evaluate(() => process.pid);
    let s;
    for (let i = 0; i < 100; i++) { try { const candidate = JSON.parse(await fs.readFile(path.join(data, 'session.json'), 'utf8')); if (candidate.pid !== enginePid) throw Error('Waiting for fresh session'); s = candidate; break; } catch { await new Promise(r => setTimeout(r, 100)); } }
    assert(s);
    const render = async (reuse = true) => {
      const started = performance.now();
      const r = await fetch(`http://127.0.0.1:${s.port}/command`, { method: 'POST', headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'render', args: { reuse, id: ids[0], context: ids.slice(1), views: ['perspective'], size: [1200, 900], camera: { position: [-483, 242, -336], target: [-583, 173, -454], fov: 58 } } }) });
      const result = await r.json(); if (!r.ok) throw Error(result.error);
      return { ...result, wallMs: Math.round(performance.now() - started), png: await fs.readFile(result.files[0]) };
    };
    const cold = await render(), repeats = [], uncached = [];
    assert.equal(cold.metrics.meshCacheHit, false);
    for (let i = 0; i < 3; i++) {
      const fresh = await render(false); assert.equal(fresh.metrics.meshCacheHit, false); assert.deepEqual(fresh.png, cold.png); uncached.push({ ...fresh.metrics, wallMs: fresh.wallMs });
      const warm = await render(); assert.equal(warm.metrics.meshCacheHit, true); assert.deepEqual(warm.png, cold.png); repeats.push({ ...warm.metrics, wallMs: warm.wallMs });
    }
    const report = { fixture: 'full saved arena plus requested dragon, 12 districts; no world connection', identicalPixels: true, cold: { ...cold.metrics, wallMs: cold.wallMs }, uncached, warm: repeats, preview: cold.files[0], at: new Date().toISOString() };
    await fs.writeFile(path.join(root, 'test-results/builder-performance/render.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await app.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
