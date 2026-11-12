const { _electron: electron, expect } = require('playwright/test');
const path = require('node:path');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');

// Launch the built application, but keep all test data and recovery out of the user's profile.
(async () => {
  const root = path.resolve(__dirname, '..');
  const results = path.join(root, 'test-results');
  await fs.mkdir(results, { recursive: true });
  const out = await fs.mkdtemp(path.join(results, 'face-smoke-'));
  const profile = path.join(out, 'profile');
  await fs.mkdir(profile);
  const main = path.join(out, 'main.cjs');
  await fs.writeFile(
    main,
    `const {app}=require('electron');app.setPath('userData',${JSON.stringify(profile)});require(${JSON.stringify(path.join(root, 'electron', 'main.cjs'))});`,
  );
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const executable = process.argv[2];
  const app = await electron.launch({
    executablePath: executable ? path.resolve(executable) : require('electron'),
    args: [...(executable ? [] : [main]), '--headless', '--user-data-dir=' + profile],
    env,
    timeout: 45000,
  });
  const errors = [];
  const transform = (position) => ({ position, rotation: [0, 0, 0], scale: [1, 1, 1] });
  const project = {
    version: 1,
    name: 'Facial Performance Check',
    duration: 48,
    fps: 24,
    activeCameraId: 'face-camera',
    objects: [
      {
        id: 'face-actor',
        name: 'Face Actor',
        type: 'character',
        visible: true,
        transform: transform([0, 0, 0]),
      },
      {
        id: 'face-camera',
        name: 'Close-Up',
        type: 'camera',
        visible: true,
        fov: 33,
        transform: transform([0, 1.68, 1.95]),
      },
    ],
    lighting: {
      sun: 2,
      ambient: 0.9,
      azimuth: 70,
      elevation: 36,
      warmth: '#fff1df',
      sky: '#263046',
      fog: 0,
      exposure: 1,
      shadows: false,
      ground: false,
      ao: false,
      bloom: false,
    },
    tracks: {},
  };
  const fixture = path.join(out, 'face-source.voxel');
  const save = async (name) =>
    app.evaluate(
      ({ dialog }, filename) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: filename });
      },
      path.join(out, name),
    );
  await fs.writeFile(fixture, JSON.stringify(project));
  try {
    const page = await app.firstWindow();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await expect(page.locator('.resource-status')).toContainText('Original Assets', {
      timeout: 25000,
    });
    await page.locator('input[aria-label="Open project file"]').setInputFiles(fixture);
    await expect(page.getByRole('textbox', { name: 'Project name', exact: true })).toHaveValue(
      project.name,
    );
    await page.getByRole('button', { name: 'Character', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Character editor actor' })).toHaveValue(
      'face-actor',
    );
    await expect(page.locator('.face-preview canvas')).toBeVisible();
    await page.getByRole('checkbox', { name: 'Animate eyes and expressions', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Automatic blinks and gaze', exact: true }).uncheck();
    await page.getByRole('button', { name: 'Fit to Skin', exact: true }).click();
    await page.getByRole('combobox', { name: 'Eye style', exact: true }).selectOption('story');
    await page.getByRole('button', { name: 'Eye Dimensions', exact: true }).click();
    const editNumber = async (label, value) => {
      const input = page.getByRole('spinbutton', { name: label, exact: true });
      await input.fill(String(value));
      await input.press('Enter');
    };
    await editNumber('Eye width', 2.2);
    await page.getByRole('combobox', { name: 'Eye to edit' }).selectOption('left');
    await editNumber('Eye depth', 0.42);
    await page.getByRole('button', { name: 'Face Layers', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Headwear', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'Pupil', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'Pupil', exact: true }).check();
    await page.getByRole('button', { name: 'Expression', exact: true }).click();
    const gaze = page.getByRole('group', { name: /^Gaze pad/ });
    await gaze.focus();
    await page.keyboard.press('ArrowRight');
    await page.getByRole('button', { name: 'Add Face Key', exact: true }).click();
    const frame = page.getByRole('spinbutton', { name: 'Face current frame', exact: true });
    const goTo = async (f) => {
      await frame.fill(String(f));
      await frame.press('Enter');
    };
    await goTo(12);
    await page.getByRole('slider', { name: 'Blink', exact: true }).focus();
    await page.keyboard.press('End');
    await expect(page.getByRole('button', { name: 'Update Face Key', exact: true })).toBeVisible();
    await gaze.focus();
    await page.keyboard.press('Control+c');
    await goTo(18);
    await gaze.focus();
    await page.keyboard.press('Control+v');
    const move = page.getByRole('spinbutton', { name: 'Move face key to frame', exact: true });
    await move.fill('12');
    await move.press('Enter');
    await expect(page.getByText('That frame already has a face key.')).toBeVisible();
    await move.fill('16');
    await move.press('Enter');
    await expect(frame).toHaveValue('16');
    await page.getByRole('button', { name: 'Delete face key', exact: true }).click();
    await page.getByRole('button', { name: 'Animation', exact: true }).click();
    await page.getByRole('button', { name: 'Facial keyframe 0', exact: true }).dblclick();
    await expect(frame).toHaveValue('0');
    await page.getByRole('combobox', { name: 'Face preview angle' }).selectOption('three-quarter');
    await page.getByRole('button', { name: 'Face key at frame 12', exact: true }).click();
    await expect(frame).toHaveValue('12');
    const character = page.locator('.face-workbench');
    await character.getByRole('button', { name: '3D Layers', exact: true }).click();
    await character.getByRole('checkbox', { name: 'Raise painted skin pixels' }).check();
    await character.getByRole('combobox', { name: 'Painted detail region' }).selectOption('body');
    await character.getByRole('button', { name: 'Highlights', exact: true }).click();
    await character.getByRole('checkbox', { name: 'Enable character highlights' }).check();
    await editNumber('Highlight azimuth', -45);
    await character.getByRole('slider', { name: 'Outline width', exact: true }).press('ArrowRight');
    await character.getByRole('combobox', { name: 'Highlight target' }).selectOption('detail');
    await character.getByRole('slider', { name: 'Texture glow', exact: true }).press('ArrowRight');
    await character.getByRole('button', { name: 'Face', exact: true }).click();
    await save('face-keys.voxel');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.status-bar')).toContainText('Ready');
    const actual = JSON.parse(await fs.readFile(path.join(out, 'face-keys.voxel'), 'utf8'));
    assert.equal(actual.objects[0].face.style, 'story');
    assert.equal(actual.objects[0].characterLayers.detail.region, 'body');
    assert.equal(actual.objects[0].characterLook.yaw, -45);
    assert.ok(actual.objects[0].characterLook.outline > 0);
    assert.ok(actual.objects[0].characterLook.parts.detail.glow > 0);
    assert.equal(actual.objects[0].face.eyeGeometry.both.width, 2.2);
    assert.equal(actual.objects[0].face.eyeGeometry.left.depth, 0.42);
    assert.equal(actual.objects[0].characterLayers.headwear.visible, false);
    assert.equal(actual.faceTracks['face-actor'][0].pose.lookX, 0.1);
    assert.deepEqual(
      actual.faceTracks['face-actor'].map(({ frame, pose }) => [frame, pose.blink]),
      [
        [0, 0],
        [12, 1],
      ],
    );
    const render = async (f, name) => {
      await goTo(f);
      await save(name);
      await page.getByRole('button', { name: 'Export', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Export', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 90000 });
      return app.evaluate(
        ({ nativeImage }, filename) => {
          const image = nativeImage.createFromPath(filename);
          const { width, height } = image.getSize();
          return { width, height, pixels: image.toBitmap().toString('base64') };
        },
        path.join(out, name),
      );
    };
    const open = await render(0, 'open.png'),
      closed = await render(12, 'closed.png');
    assert.equal(open.width, closed.width);
    assert.equal(open.height, closed.height);
    const a = Buffer.from(open.pixels, 'base64'),
      b = Buffer.from(closed.pixels, 'base64');
    let difference = 0;
    for (let i = 0; i < a.length; i += 4)
      if (
        Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) >
        10
      )
        difference++;
    assert.ok(
      difference > 40 && difference < open.width * open.height * 0.1,
      `localized blink must change exported pixels, got ${difference}`,
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify(
        {
          passed:
            'Facial key authoring, timeline navigation, project save, and closed lids in PNG export',
          differingPixels: difference,
          out,
        },
        null,
        2,
      ),
    );
  } finally {
    await app
      .evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
      )
      .catch(() => {});
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
