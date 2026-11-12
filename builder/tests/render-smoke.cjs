const { _electron: electron } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
(async () => {
  const root = path.resolve(__dirname, '../..'),
    data = path.join(root, 'test-results', 'builder-render');
  await fs.mkdir(data, { recursive: true });
  const env = { ...process.env, VOXEL_BUILD_DATA: data };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: process.argv[2] ? path.resolve(process.argv[2]) : require('electron'),
    args: process.argv[2] ? [] : [path.join(root, 'builder/desktop.cjs')],
    env,
    timeout: 60000,
  });
  const errors = [];
  try {
    const page = await app.firstWindow();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForFunction(() => !!window.buildEngine, { timeout: 45000 });
    let session;
    const enginePid = await app.evaluate(() => process.pid);
    for (let i = 0; i < 100; i++) {
      try {
        const candidate = JSON.parse(await fs.readFile(path.join(data, 'session.json'), 'utf8'));
        if (candidate.pid !== enginePid) throw Error('Waiting for fresh engine session');
        session = candidate;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    assert(session, 'Engine HTTP session not created');
    const cmd = async (action, args = {}) => {
      const r = await fetch('http://127.0.0.1:' + session.port + '/command', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + session.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, args }),
      });
      const out = await r.json();
      if (!r.ok) throw Error(JSON.stringify(out));
      return out;
    };
    const id = 'watch-' + Date.now();
    await cmd('init', { id, bounds: { min: [-24, -1, -24], max: [24, 28, 26] }, offline: true });
    const plan = JSON.parse(
      await fs.readFile(path.join(root, 'builder/examples/watch-house-offline.json'), 'utf8'),
    );
    const preparation = await cmd('prepare', { version: 1, projects: [{ id, plan }], renders: [{ views: ['perspective'], size: [1200, 900] }] });
    assert.equal(preparation.phase, 'inspect-images');
    assert.equal(preparation.renders[0].metrics.meshCacheHit, false);
    const renders = await cmd('render', { id, size: [1200, 900] });
    assert.equal(renders.files.length, 6);
    assert.deepEqual(renders.missing, []);
    assert.equal(renders.metrics.meshCacheHit, true);
    const original = await fs.readFile(renders.files[0]);
    const warm = await cmd('render', { id, views: ['perspective'], size: [1200, 900] });
    assert.equal(warm.metrics.meshCacheHit, true);
    assert.deepEqual(await fs.readFile(warm.files[0]), original, 'Cached mesh must render identical pixels');
    assert.equal((await fs.readFile(renders.contactSheet)).subarray(1, 4).toString(), 'PNG');
    for (const file of renders.files) {
      const bytes = await fs.readFile(file);
      assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
      assert(bytes.length > 20000);
    }
    const detail = await cmd('render', {
      id,
      preparation,
      bounds: { min: [-12, 0, -17], max: [12, 26, 12] },
      views: ['perspective'],
      size: [1200, 1000],
    });
    assert.equal(detail.metrics.meshCacheHit, false, 'A crop changes geometry and must invalidate cache');
    const audit = await cmd('audit', {
      id,
      rules: [
        { name: 'entry approach', kind: 'empty', bounds: { min: [-1, 3, -12], max: [1, 5, -9] } },
      ],
    });
    assert.deepEqual(audit.failures, []);
    const scene = await cmd('info', { id });
    assert(scene.changed > 1000);
    assert.equal(await page.isVisible('canvas'), true);
    assert.deepEqual(errors, []);
    const report = {
      id,
      renders,
      warm,
      detail,
      audit,
      scene,
      errors,
      verifiedAt: new Date().toISOString(),
    };
    await fs.writeFile(path.join(data, 'report.json'), JSON.stringify(report, null, 2));
    console.log(
      JSON.stringify({
        passed: true,
        blocks: scene.changed,
        report: path.join(data, 'report.json'),
        renders: renders.files,
      }),
    );
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
