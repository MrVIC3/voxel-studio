const { _electron: electron, expect } = require('playwright/test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const root = path.resolve(__dirname, '..');
  const out = path.join(root, 'test-results', 'cinematic');
  await fs.mkdir(out, { recursive: true });
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.argv[2] ? path.resolve(process.argv[2]) : require('electron');
  const app = await electron.launch({
    executablePath,
    args: [
      ...(process.argv[2] ? [] : [root]),
      '--headless',
      `--user-data-dir=${path.join(out, 'profile')}`,
    ],
    env,
    timeout: 45000,
  });
  const errors = [];
  const renders = [];
  try {
    const page = await app.firstWindow();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (
        message.type() === 'error' ||
        /WebGL.*(?:INVALID|framebuffer|compile|feedback)/i.test(message.text())
      )
        errors.push(message.text());
    });
    await page.waitForSelector('.viewport-canvas canvas');
    const dismissRecovery = page.getByRole('button', { name: 'Dismiss recovery', exact: true });
    if (await dismissRecovery.count()) await dismissRecovery.click();
    await page.getByRole('button', { name: 'Lighting', exact: true }).click();
    const presets = page.getByRole('group', { name: 'Cinematic lighting presets' });
    await expect(presets.getByRole('button')).toHaveCount(5);
    const quality = page.getByRole('combobox', { name: 'Viewport quality', exact: true });
    await quality.selectOption('balanced');

    async function exportStill(name) {
      const filename = path.join(out, name + '.png');
      await app.evaluate(({ dialog }, filePath) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      }, filename);
      await page.getByRole('button', { name: 'Export', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('combobox', { name: 'Resolution' }).selectOption('640');
      await dialog.getByRole('button', { name: 'Export', exact: true }).click();
      await expect(dialog).toHaveCount(0, { timeout: 90000 });
      const png = await fs.readFile(filename);
      assert.equal(png.readUInt32BE(16), 640);
      assert.equal(png.readUInt32BE(20), 360);
      assert.ok(png.length > 12000, `${name} returned a nearly empty frame`);
      renders.push({
        name,
        bytes: png.length,
        hash: createHash('sha256').update(png).digest('hex'),
      });
    }

    await exportStill('standard');
    for (const [name, id] of [
      ['Golden Hour', 'golden-hour'],
      ['Blue Hour', 'blue-hour'],
      ['Neon Noir', 'noir'],
      ['Studio Portrait', 'studio'],
      ['Overcast Film', 'overcast'],
    ]) {
      const preset = presets.getByRole('button', { name: `Apply ${name} cinematic lighting` });
      await preset.click();
      await expect(preset).toHaveAttribute('aria-pressed', 'true');
      await exportStill(id);
    }
    assert.equal(new Set(renders.map((r) => r.hash)).size, renders.length);
    await quality.selectOption('high');
    await exportStill('overcast-high');
    await quality.selectOption('draft');
    await exportStill('overcast-draft');
    await quality.selectOption('balanced');
    await page.getByText('Lens and focus', { exact: true }).click();
    await expect(page.getByRole('slider', { name: 'Depth of field', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Focus selected subject', exact: true }).click();
    await page.screenshot({ path: path.join(out, 'lighting-workspace.png') });
    assert.deepEqual(errors, []);
    await fs.writeFile(
      path.join(out, 'results.json'),
      JSON.stringify({ renders, errors }, null, 2),
    );
    console.log(JSON.stringify({ renders, errors }, null, 2));
  } catch (error) {
    const page = app.windows()[0];
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    console.error(errors);
    throw error;
  } finally {
    await app
      .evaluate(({ BrowserWindow }) => {
        for (const window of BrowserWindow.getAllWindows()) window.destroy();
      })
      .catch(() => {});
    await app.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
