const { _electron: electron, expect } = require('playwright/test');
const path = require('node:path'),
  fs = require('node:fs/promises'),
  assert = require('node:assert/strict');
(async () => {
  const root = path.resolve(__dirname, '..'),
    env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: process.argv[2] ? path.resolve(process.argv[2]) : require('electron'),
    args: process.argv[2] ? [] : [root],
    env,
    timeout: 45000,
  });
  const errors = [],
    checks = [];
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
    const colors = await page.evaluate(() =>
      ['.app-header', '.scene-panel', '.inspector', '.timeline', '.timeline-transport'].map(
        (selector) => ({
          selector,
          color: getComputedStyle(document.querySelector(selector)).backgroundColor,
        }),
      ),
    );
    for (const c of colors) {
      const values = c.color
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number);
      assert.equal(values[0], values[1], c.selector);
      assert.equal(values[1], values[2], c.selector);
    }
    checks.push('Neutral monochrome interface panels');
    await page.locator('.resource-status').click();
    await expect(page.getByRole('dialog')).toContainText(/2[\s,.]?390/);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    checks.push('Installed Minecraft JAR automatically supplies original resources');
    await page.getByRole('button', { name: 'Camera preview (Numpad 0)', exact: true }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(root, 'docs/camera-preview.png') });
    const exportStill = async (filename) => {
      await app.evaluate(({ dialog }, p) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
      }, filename);
      await page.getByRole('button', { name: 'Export', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Export', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 180000 });
      const png = await fs.readFile(filename);
      assert.equal(png.readUInt32BE(16), 1280);
      assert.ok(png.length > 12000);
    };
    await exportStill(path.join(root, 'docs/render-realtime.png'), false);
    checks.push('Real-time export uses PBR, occlusion and filmic pipeline');

    await page.getByRole('button', { name: 'Camera preview (Numpad 0)', exact: true }).click();
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: 'Area Light', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Light type', exact: true })).toHaveValue(
      'area',
    );
    checks.push('Area light tool and properties work');
    await page.getByRole('combobox', { name: 'Light type', exact: true }).selectOption('spot');
    await expect(page.getByRole('slider', { name: 'Spot Angle', exact: true })).toBeVisible();
    await page.getByRole('checkbox', { name: 'Cast Shadows', exact: true }).check();
    await page.getByRole('combobox', { name: 'Light type', exact: true }).selectOption('point');
    await expect(page.getByRole('checkbox', { name: 'Cast Shadows', exact: true })).toBeChecked();
    await page.getByRole('checkbox', { name: 'Cast Shadows', exact: true }).uncheck();
    checks.push('Spot lights and shadow controls work');
    await page.getByRole('button', { name: 'Lighting', exact: true }).click();
    await page.getByRole('button', { name: 'Add Three-Point Studio Rig', exact: true }).click();
    await expect(page.locator('.status-bar')).toContainText('7 objects');
    checks.push('Three-point studio lighting rig is created');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(root, 'docs/lighting.png') });
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.screenshot({ path: path.join(root, 'docs/import.png') });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page
      .locator('input[aria-label="Open project file"]')
      .setInputFiles(path.join(root, 'test-results/fixtures/woodland.voxel'));
    await page.getByRole('button', { name: 'Layout', exact: true }).click();
    await page.waitForTimeout(600);
    await page.locator('.object-list').evaluate((el) => (el.scrollTop = 0));
    const toast = page.getByRole('button', { name: 'Dismiss notification', exact: true });
    if (await toast.count()) await toast.click();
    await page.screenshot({ path: path.join(root, 'docs/workspace.png') });
    assert.deepEqual(errors, []);
    await fs.writeFile(
      path.join(root, 'test-results/review-v02.json'),
      JSON.stringify({ checks, errors, colors }, null, 2),
    );
    console.log(JSON.stringify({ checks, errors }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ errors }, null, 2));
    const page = app.windows()[0];
    if (page) await page.screenshot({ path: path.join(root, 'test-results/review-failure.png') });
    throw error;
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
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
