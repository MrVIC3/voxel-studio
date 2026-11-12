const { _electron: electron, expect } = require('playwright/test');
const path = require('node:path');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const { unzipSync } = require('fflate');
(async () => {
  const root = path.resolve(__dirname, '..'),
    out = path.join(root, 'test-results');
  await fs.mkdir(out, { recursive: true });
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.argv[2] ? path.resolve(process.argv[2]) : require('electron');
  const app = await electron.launch({
    executablePath,
    args: process.argv[2] ? [] : [root],
    env,
    timeout: 45000,
  });
  const errors = [];
  const checks = [];
  try {
    const page = await app.firstWindow();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.waitForSelector('.viewport-canvas canvas');
    await expect(page.locator('.resource-status')).toContainText('Original Assets', {
      timeout: 20000,
    });
    if (await page.getByRole('button', { name: 'Dismiss recovery', exact: true }).count())
      await page.getByRole('button', { name: 'Dismiss recovery', exact: true }).click();
    await expect(page.locator('.status-bar')).toContainText('3 objects');
    checks.push('Native app starts with a rendered scene');
    const fill = async (label, value) => {
      const input = page.getByRole('spinbutton', { name: label, exact: true });
      await input.fill(String(value));
      await input.press('Enter');
    };
    await page.getByRole('button', { name: 'Right arm', exact: true }).first().click();
    await fill('Current frame', 24);
    await fill('Rotation X', -90);
    await page.getByRole('button', { name: 'Insert keyframe', exact: false }).first().click();
    await expect(
      page.getByRole('button', { name: 'Right arm keyframe 24', exact: true }),
    ).toBeVisible();
    checks.push('Bone posing and keyframe insertion');
    await page
      .getByRole('combobox', { name: 'Keyframe interpolation', exact: true })
      .selectOption('linear');
    const key = page.getByRole('button', { name: 'Right arm keyframe 24', exact: true });
    const keyBox = await key.boundingBox();
    await key.hover();
    await page.mouse.down();
    await page.mouse.move(keyBox.x + 45, keyBox.y + 12, { steps: 5 });
    await page.mouse.up();
    checks.push('Timeline keys drag without renderer errors');
    const before = await page
      .getByRole('spinbutton', { name: 'Current frame', exact: true })
      .inputValue();
    await page.getByRole('button', { name: 'Play (Space)', exact: true }).click();
    await page.waitForTimeout(280);
    await page.getByRole('button', { name: 'Pause (Space)', exact: true }).click();
    assert.notEqual(
      await page.getByRole('spinbutton', { name: 'Current frame', exact: true }).inputValue(),
      before,
    );
    checks.push('Playback advances frames');
    await page.getByRole('button', { name: 'Lighting', exact: true }).click();
    await page.getByRole('button', { name: 'Golden hour', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Viewport quality', exact: true })
      .selectOption('draft');
    checks.push('Lighting preset and quality controls');
    await page.getByRole('button', { name: 'Layout', exact: true }).click();
    const importFile = async (tab, file) => {
      await page.getByRole('button', { name: 'Import', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: tab, exact: true }).click();
      await page
        .locator('input[aria-label="Choose import file"]')
        .setInputFiles(path.join(out, 'fixtures', file));
    };
    await importFile('Build', 'tiny.schem');
    await page.getByRole('button', { name: 'Import asset', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Import complete', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Continue editing', exact: true }).click();
    await expect(page.locator('.status-bar')).toContainText('4 objects');
    checks.push('Worker imports Sponge schematic in the packaged protocol');
    await importFile('Java world', 'r.0.0.mca');
    await fill('Center chunk X', 0);
    await fill('Center chunk Z', 0);
    await fill('Minimum Y', 0);
    await fill('Maximum Y', 0);
    await page.getByRole('button', { name: 'Import asset', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Import complete', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Continue editing', exact: true }).click();
    await expect(page.locator('.status-bar')).toContainText('5 objects');
    checks.push('Anvil import respects selected chunk and height');
    const skin = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#b58a62';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#517e85';
      ctx.fillRect(16, 16, 24, 16);
      ctx.fillStyle = '#593e2d';
      ctx.fillRect(0, 0, 32, 8);
      return c.toDataURL().split(',')[1];
    });
    await fs.writeFile(path.join(out, 'fixtures/test-skin.png'), Buffer.from(skin, 'base64'));
    await importFile('Character', 'test-skin.png');
    await page.getByRole('button', { name: 'Import asset', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.status-bar')).toContainText('6 objects');
    checks.push('Skin PNG creates a rendered rig');
    const dialogPath = path.join(out, 'saved.voxel');
    await app.evaluate(({ dialog }, p) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
    }, dialogPath);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect
      .poll(async () => {
        try {
          return (await fs.stat(dialogPath)).size;
        } catch {
          return 0;
        }
      })
      .toBeGreaterThan(1000);
    const saved = JSON.parse(await fs.readFile(dialogPath, 'utf8'));
    assert.equal(saved.objects.length, 6);
    assert.ok(saved.objects.find((o) => o.skin));
    assert.equal(
      saved.tracks['character/rightArm'].find((k) => k.interpolation === 'linear').interpolation,
      'linear',
    );
    checks.push('Native save writes an embedded project');
    await page.locator('input[aria-label="Open project file"]').setInputFiles(dialogPath);
    await expect(page.locator('.status-bar')).toContainText('6 objects');
    checks.push('Saved project reopens');
    const pngPath = path.join(out, 'render.png');
    await app.evaluate(({ dialog }, p) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
    }, pngPath);
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Export', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 20000 });
    const png = await fs.readFile(pngPath);
    assert.equal(png.readUInt32BE(16), 1280);
    assert.equal(png.readUInt32BE(20), 720);
    assert.ok(png.length > 10000);
    checks.push('Native PNG export renders a 1280 × 720 scene');
    const zipPath = path.join(out, 'frames.zip');
    await app.evaluate(({ dialog }, p) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
    }, zipPath);
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('button', { name: 'Animation PNG sequence · ZIP', exact: false }).click();
    await fill('Export end frame', 2);
    await page.getByRole('dialog').getByRole('button', { name: 'Export', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
    const zip = unzipSync(await fs.readFile(zipPath));
    assert.equal(Object.keys(zip).filter((n) => n.endsWith('.png')).length, 3);
    checks.push('Deterministic frame sequence exports valid PNG files');
    await importFile('Build', 'stress.schem');
    const stressStart = Date.now();
    await page.getByRole('button', { name: 'Import asset', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Import complete', exact: true })).toBeVisible({
      timeout: 30000,
    });
    await page.getByRole('button', { name: 'Continue editing', exact: true }).click();
    const importMilliseconds = Date.now() - stressStart;
    await page.getByRole('button', { name: 'Frame All', exact: true }).click();
    await page.waitForTimeout(1300);
    const stressStatus = await page.locator('.status-bar').innerText();
    await page.screenshot({ path: path.join(out, 'stress.png') });
    const triangles = Number(
      stressStatus.match(/([\d, \u00a0\u202f]+) triangles/)[1].replace(/\D/g, ''),
    );
    assert.ok(triangles > 10000 && triangles < 100000, stressStatus);
    checks.push(
      `110,592-block stress import: ${importMilliseconds} ms; ${triangles.toLocaleString()} rendered triangles including shadows and other objects`,
    );
    // Return to the bundled example for a clean delivery screenshot.
    await page
      .locator('input[aria-label="Open project file"]')
      .setInputFiles(path.join(out, 'fixtures/woodland.voxel'));
    await page.waitForTimeout(500);
    await page
      .getByRole('combobox', { name: 'Viewport quality', exact: true })
      .selectOption('balanced');
    await page.getByRole('button', { name: 'Frame All', exact: true }).click();
    const toast = page.getByRole('button', { name: 'Dismiss notification', exact: true });
    if (await toast.count()) await toast.click();
    await page.locator('.object-list').evaluate((el) => (el.scrollTop = 0));
    await page.getByRole('button', { name: 'Move (G)', exact: true }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(root, 'docs/workspace.png') });
    await page.getByRole('button', { name: 'Camera preview (Numpad 0)', exact: true }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(root, 'docs/camera-preview.png') });
    assert.deepEqual(errors, []);
    const result = { checks, errors, status: await page.locator('.status-bar').innerText() };
    console.log(JSON.stringify(result, null, 2));
    await fs.writeFile(path.join(out, 'smoke-results.json'), JSON.stringify(result, null, 2));
  } finally {
    const page = app.windows()[0];
    if (page)
      await page
        .evaluate(
          () =>
            new Promise((resolve) => {
              const r = indexedDB.open('voxel-studio', 1);
              r.onsuccess = () => {
                const db = r.result,
                  tx = db.transaction('recovery', 'readwrite');
                tx.objectStore('recovery').clear();
                tx.oncomplete = () => {
                  db.close();
                  resolve(true);
                };
              };
              r.onerror = () => resolve(false);
            }),
        )
        .catch(() => {});
    await app
      .evaluate(({ BrowserWindow }) => {
        for (const w of BrowserWindow.getAllWindows()) w.destroy();
      })
      .catch(() => {});
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
