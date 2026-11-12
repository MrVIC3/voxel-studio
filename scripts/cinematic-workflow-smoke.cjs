const { _electron: electron, expect } = require('playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const root = path.resolve(__dirname, '..');
  const out = path.join(root, 'test-results', 'cinematic-workflow');
  await fs.mkdir(out, { recursive: true });
  const profile = await fs.mkdtemp(path.join(out, 'profile-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const executable = env.VOXEL_STUDIO_QA_EXE;
  const app = await electron.launch({
    executablePath: executable || require('electron'),
    args: [...(executable ? [] : [root]), '--headless', `--user-data-dir=${profile}`],
    env,
    timeout: 45000,
  });
  const checks = [],
    errors = [];
  const page = await app.firstWindow();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error' ||
      /WebGL.*(?:INVALID|framebuffer|compile|feedback)/i.test(message.text())
    )
      errors.push(message.text());
  });
  const button = (name) => page.getByRole('button', { name, exact: true });
  const spin = (name) => page.getByRole('spinbutton', { name, exact: true });
  const combo = (name) => page.getByRole('combobox', { name, exact: true });
  const enter = async (field, value) => {
    await field.fill(String(value));
    await field.press('Enter');
  };
  const saveTarget = async (file) => {
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, file);
  };
  const exportTo = async (filename, format, resolution) => {
    await saveTarget(filename);
    await button('Export').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: 'Export format' }).selectOption(format);
    await dialog.getByRole('combobox', { name: 'Resolution' }).selectOption(resolution);
    await dialog.getByRole('button', { name: 'Export', exact: true }).click();
    await expect(dialog).toHaveCount(0, { timeout: 540000 });
    const data = await fs.readFile(filename);
    assert.ok(data.length > 10000, 'Expected a rendered image or movie');
    return data;
  };
  try {
    await expect(page.locator('.resource-status')).toContainText('Original Assets', {
      timeout: 40000,
    });
    const riftbreaker = process.argv.includes('--riftbreaker');
    if (process.argv.includes('--showcase') || riftbreaker) {
      const title = riftbreaker ? 'Riftbreaker' : 'The Gatekeeper';
      const prefix = riftbreaker ? 'riftbreaker' : 'gatekeeper';
      const posterFrame = riftbreaker ? 44 : 67;
      await page
        .getByLabel('Open project file', { exact: true })
        .setInputFiles(path.join(root, 'showcase', title + '.voxel'));
      await expect(page.getByRole('textbox', { name: 'Project name', exact: true })).toHaveValue(
        title,
      );
      await combo('Viewport quality').selectOption(
        process.argv.includes('--high') ? 'high' : 'balanced',
      );
      const frames = riftbreaker ? [10, 44, 61] : [18, 67, 111, 151];
      for (const frame of process.argv.includes('--skip-stills') ? [] : frames) {
        await enter(spin('Current frame'), frame);
        await exportTo(path.join(out, `${prefix}-${frame}.png`), 'png', '1280');
        console.log('Rendered still ' + frame);
      }
      if (!process.argv.includes('--stills-only')) {
        const file = path.join(root, 'showcase', title + '.mp4');
        const movie = await exportTo(file, 'mp4', '1280');
        assert.equal(movie.subarray(4, 8).toString(), 'ftyp');
        const metadata = await page.evaluate(async (base64) => {
          const media = document.createElement('video');
          const url = URL.createObjectURL(
            new Blob([Uint8Array.fromBase64(base64)], { type: 'video/mp4' }),
          );
          try {
            return await new Promise((resolve, reject) => {
              media.onloadedmetadata = () =>
                resolve({
                  width: media.videoWidth,
                  height: media.videoHeight,
                  duration: media.duration,
                });
              media.onerror = () => reject(Error('The rendered movie could not be decoded.'));
              media.src = url;
            });
          } finally {
            URL.revokeObjectURL(url);
          }
        }, movie.toString('base64'));
        assert.equal(metadata.width, 1280);
        assert.equal(metadata.height, 720);
        assert.ok(Math.abs(metadata.duration - (riftbreaker ? 3.5 : 7)) < 0.08);
        await fs.copyFile(
          path.join(out, `${prefix}-${posterFrame}.png`),
          path.join(root, 'showcase', title + '.png'),
        );
        await fs.writeFile(
          path.join(out, riftbreaker ? 'riftbreaker.json' : 'showcase.json'),
          JSON.stringify({ metadata, bytes: movie.length, errors }, null, 2),
        );
        console.log('Exported and decoded ' + title, metadata);
      }
    } else {
      await button('Alex').first().click();
      await button('Blender Presets').click();
      let dialog = page.getByRole('dialog');
      await dialog.getByLabel('08 · Lively Dialogue', { exact: true }).check();
      await dialog.getByRole('button', { name: 'Add 1 Action', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(combo('Motion clip').locator('option:checked')).toHaveText(
        '08 · Lively Dialogue',
      );
      await button('Apply at Playhead').click();
      await expect(
        page.locator('.timeline').getByRole('button', { name: 'Facial keyframe 0', exact: true }),
      ).toBeVisible();
      checks.push('Bundled Blender action creates editable body and face animation');

      if (!process.argv.includes('--skip-blend')) {
        const file = path.join(root, 'docs', 'blender', 'voxel-studio-motion-library.blend');
        await page.getByLabel('Blender animation file', { exact: true }).setInputFiles(file);
        dialog = page.getByRole('dialog');
        const bake = dialog.getByRole('button', { name: 'Bake Animation', exact: true });
        await bake.click();
        await expect(dialog.getByLabel('10 · Heavy Blade Strike', { exact: true })).toBeVisible({
          timeout: 140000,
        });
        await dialog.getByLabel('10 · Heavy Blade Strike', { exact: true }).check();
        await dialog.getByRole('button', { name: 'Add 1 Action', exact: true }).click();
        await expect(dialog).toHaveCount(0);
        await expect(combo('Motion clip').locator('option:checked')).toHaveText(
          '10 · Heavy Blade Strike',
        );
        checks.push('Native Blender file bakes through the desktop bridge');
      }

      await button('Shots').click();
      const rail = page.getByRole('region', { name: 'Camera path studio' });
      const frame = spin('Current frame');
      await rail.getByRole('button', { name: /^Capture View Key/ }).click();
      await expect(rail.getByRole('button', { name: /^Frame 0/ })).toBeVisible();
      await enter(frame, 24);
      await enter(spin('Capture lens angle'), 55);
      await page.locator('.timeline').focus();
      await page.keyboard.press('k');
      await expect(rail.getByRole('button', { name: /^Frame 24/ })).toContainText('55');
      await rail.getByRole('button', { name: /^Frame 0/ }).click();
      await expect(frame).toHaveValue('0');
      await expect(spin('Capture lens angle')).toHaveValue('40');
      checks.push('Capture, animate lens, and recall a camera waypoint');

      const end = spin('Scene duration in frames');
      const duration = await end.inputValue();
      await enter(end, 12);
      await expect(end).toHaveValue(duration);
      await enter(frame, 20);
      await button('Set range start at playhead ([)').click();
      await enter(frame, 68);
      await button('Set range end at playhead (])').click();
      await expect(page.getByTitle('Clear playback range')).toHaveText('20–68 ×');
      await combo('Timeline track filter').selectOption('animated');
      await page.getByRole('textbox', { name: 'Filter timeline tracks' }).fill('facial');
      await expect(
        page.locator('.timeline').getByRole('button', { name: /^Facial Performance/ }),
      ).toBeVisible();
      await page.getByRole('textbox', { name: 'Filter timeline tracks' }).clear();
      await button('Zoom in timeline').click();
      await button('Fit entire timeline').click();
      checks.push('Timeline filters, view tools and range work without deleting keys');

      await enter(frame, 0);
      await rail.getByRole('button', { name: 'Build Camera Move' }).click();
      await expect(rail.getByText(/Subject Orbit · 5 keys/)).toBeVisible();
      await expect(button('Camera cut Subject Orbit at 0')).toBeVisible();
      await page.screenshot({ path: path.join(out, 'camera-path.png') });
      await button('Lighting').click();
      await button('Apply Blue Hour cinematic lighting').click();
      await saveTarget(path.join(out, 'workflow.voxel'));
      await button('Save').click();
      await expect(page.locator('.status-bar')).toContainText('Ready');
      const scene = JSON.parse(await fs.readFile(path.join(out, 'workflow.voxel'), 'utf8'));
      assert.deepEqual(scene.playbackRange, [20, 68]);
      assert.equal(scene.lighting.cinematic.mode, 'blue-hour');
      assert.ok(scene.faceTracks.character.length > 2);
      assert.ok(
        scene.objects.some(
          (object) => object.name === 'Subject Orbit' && object.cameraRail === 'smooth',
        ),
      );
      assert.ok(
        scene.objects.some(
          (object) =>
            object.type === 'camera' &&
            scene.tracks[object.id]?.some((k) => k.frame === 24 && k.fov === 55),
        ),
      );
      checks.push('New settings, actions, facial keys, camera and play range survive native save');
      await fs.writeFile(
        path.join(out, 'results.json'),
        JSON.stringify({ checks, errors }, null, 2),
      );
      console.log(checks.join('\n'));
    }
    assert.deepEqual(errors, []);
  } catch (error) {
    await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
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
