const { _electron: electron, expect } = require('playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const root = path.resolve(__dirname, '..');
  const out = path.join(root, 'test-results', 'motion-library');
  await fs.mkdir(out, { recursive: true });
  const profile = await fs.mkdtemp(path.join(out, 'profile-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const executable = process.argv[2];
  const app = await electron.launch({
    executablePath: executable ? path.resolve(executable) : require('electron'),
    args: [...(executable ? [] : [root]), '--headless', '--user-data-dir=' + profile],
    env,
    timeout: 45000,
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const button = (name) => page.getByRole('button', { name, exact: true });
  const field = (name) => page.getByRole('spinbutton', { name, exact: true });
  const enter = async (name, value) => {
    await field(name).fill(String(value));
    await field(name).press('Enter');
  };
  try {
    await expect(page.locator('.resource-status')).toContainText('Original Assets', {
      timeout: 40000,
    });
    await button('Alex').first().click();
    await button('Blender Presets').click();
    let dialog = page.getByRole('dialog');
    const actions = page.getByLabel('Blender actions', { exact: true });
    await expect(actions.getByRole('checkbox')).toHaveCount(21);
    await page.getByRole('searchbox', { name: 'Search Blender actions' }).fill('cinematic walk');
    await expect(actions.getByRole('checkbox')).toHaveCount(1);
    await actions.getByLabel('02 · Cinematic Walk').check();
    await dialog.getByRole('button', { name: 'Add 1 Action', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Include clip root motion' }).check();
    await enter('Motion cycles', 3);
    await button('Apply at Playhead').click();

    await page
      .getByLabel('Blender animation file', { exact: true })
      .setInputFiles(path.join(root, 'docs', 'blender', 'voxel-studio-motion-library.blend'));
    dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Bake Animation', exact: true }).click();
    await expect(actions.getByRole('checkbox')).toHaveCount(21, { timeout: 140000 });
    await actions.getByLabel('19 · Pick Up and Inspect').check();
    await dialog.getByRole('button', { name: 'Add 1 Action', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole('combobox', { name: 'Motion clip' }).locator('option:checked'),
    ).toHaveText('19 · Pick Up and Inspect');
    await enter('Motion cycles', 1);
    await enter('Current frame', 74);
    await page.getByRole('checkbox', { name: 'Include clip root motion' }).uncheck();
    await button('Apply at Playhead').click();
    const file = path.join(out, 'walk-and-pickup.voxel');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, file);
    await button('Save').click();
    await expect(page.locator('.status-bar')).toContainText('Ready');
    const saved = JSON.parse(await fs.readFile(file, 'utf8'));
    const rootKeys = saved.tracks.character;
    const dist = (a) => Math.hypot(...a.map((value, i) => value - rootKeys[0].position[i]));
    assert.ok(Math.abs(dist(rootKeys.at(-1).position) - 3.24) < 0.01);
    assert.ok(saved.tracks['character/rightArm'].some((key) => key.frame > 74));
    assert.ok(saved.faceTracks.character.some((key) => key.frame > 74));
    await enter('Current frame', 98);
    await page.screenshot({ path: path.join(out, 'pickup.png') });
    assert.deepEqual(errors, []);
    console.log(
      '21 bundled and native Blender actions loaded, 3 walk cycles travelled 3.24 blocks, and pickup pose and face keys survived save.',
    );
  } finally {
    await app
      .evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
      )
      .catch(() => {});
    await app.close().catch(() => {});
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
