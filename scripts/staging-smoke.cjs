const { _electron: electron, expect } = require('playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const root = path.resolve(__dirname, '..');
  const out = path.join(root, 'test-results', 'staging');
  await fs.mkdir(out, { recursive: true });
  const profile = await fs.mkdtemp(path.join(out, 'profile-'));
  const executable = process.argv[2];
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: executable ? path.resolve(executable) : require('electron'),
    args: [...(executable ? [] : [root]), '--headless', '--user-data-dir=' + profile],
    env,
    timeout: 45000,
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const button = (name) => page.getByRole('button', { name, exact: true });
  const select = (name) => page.getByRole('combobox', { name, exact: true });
  const field = (name) => page.getByRole('spinbutton', { name, exact: true });
  const commitNumber = async (name, value) => {
    await field(name).fill(String(value));
    await field(name).press('Enter');
  };
  const canvas = page.locator('.viewport-canvas canvas');
  const clickCanvas = async (x, y) => {
    const box = await canvas.boundingBox();
    await canvas.click({
      position: { x: Math.round(box.width * x), y: Math.round(box.height * y) },
    });
  };
  try {
    await expect(page.locator('.resource-status')).toContainText('Original Assets', {
      timeout: 40000,
    });
    await button('Alex').first().click();
    await page.keyboard.press('Shift+t');
    await expect(page.getByText('Brought selection to the viewport camera.')).toBeVisible();
    await page.keyboard.press('Control+z');
    await button('Alex').first().click();
    await button('Draw Path · P').click();
    await canvas.focus();
    await page.keyboard.press('7');
    await clickCanvas(0.6, 0.52);
    await clickCanvas(0.66, 0.63);
    await expect(button('Apply Path')).toBeEnabled();
    await page.getByRole('checkbox', { name: 'Add walk cycle to pose tracks' }).check();
    await button('Apply Path').click();
    await expect(
      page.getByText('Movement path saved as editable keys on the Movement control.'),
    ).toBeVisible();
    await button('Alex').first().click();
    await select('Right hand').selectOption('minecraft:item/diamond_sword');
    await select('Helmet').selectOption('diamond');
    await select('Chestplate').selectOption('iron');
    await button('Face').click();
    await page.getByRole('checkbox', { name: 'Animate eyes and expressions', exact: true }).check();
    await button('Fit to Skin').click();
    await commitNumber('Eye width', 1.4);
    await commitNumber('Mouth height', 1.25);
    await button('Layout').click();
    const glow = page.getByRole('slider', { name: 'Glow', exact: true });
    await glow.focus();
    await page.keyboard.press('End');
    await glow.blur();

    await page.locator('.timeline').focus();
    await page.keyboard.press('v');
    await expect(button('Exit fly navigation (V)')).toBeVisible();
    await page.keyboard.press('v');
    await expect(button('Fly navigation (V)')).toBeVisible();
    await page.keyboard.press('Shift+b');
    await expect(button('Place')).toHaveAttribute('aria-pressed', 'true');
    await clickCanvas(0.49, 0.48);
    await button('Replace').click();
    await select('Block brush').selectOption('minecraft:glass');
    await clickCanvas(0.49, 0.48);

    await button('Shots').click();
    await button('Cuts').click();
    await button('Add Cut at Frame 0').click();
    await select('Shot lighting preset').selectOption('crimson');
    await expect(page.getByText(/Shot look saved/)).toBeVisible();
    await button('Path').click();
    await button('Preview Cut').click();
    const save = path.join(out, 'staged.voxel');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, save);
    await button('Save').click();
    await expect(page.locator('.status-bar')).toContainText('Ready');
    const project = JSON.parse(await fs.readFile(save, 'utf8'));
    const actor = project.objects.find((o) => o.id === 'character');
    const movement = project.objects.find((o) => o.id === actor.parentId);
    assert.ok(movement.placement);
    assert.equal(project.tracks[movement.id].length, 3);
    assert.ok(project.tracks['character/leftLeg'].length);
    assert.equal(actor.face.eyeWidth, 1.4);
    assert.equal(actor.face.mouthHeight, 1.25);
    assert.equal(actor.surfaceEffect.glow, 5);
    assert.equal(actor.armor.head, 'diamond');
    assert.equal(
      project.objects.find((o) => o.equipmentSlot === 'rightHand')?.parentBone,
      'rightHand',
    );
    const build = project.objects.find((o) => o.name === 'Block Build');
    assert.equal(build.voxels.blocks.length, 1);
    assert.equal(build.voxels.palette[build.voxels.blocks[0][3]], 'minecraft:glass');
    assert.equal(project.shots[0].lighting.sky, '#290610');
    const still = path.join(out, 'shot.png');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, still);
    await button('Export').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: 'Resolution' }).selectOption('640');
    await dialog.getByRole('button', { name: 'Export', exact: true }).click();
    await expect(dialog).toHaveCount(0, { timeout: 90000 });
    assert.ok((await fs.stat(still)).size > 10000);
    assert.deepEqual(errors, []);
    console.log(
      'Staging, armor and held item, face sizes, shader, WASD toggle, block edit and shot lighting passed.',
    );
  } catch (error) {
    console.error(errors);
    await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    throw error;
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
