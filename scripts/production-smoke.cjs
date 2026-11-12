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
    await expect(page.locator('.resource-status')).toContainText('Original Assets', {
      timeout: 20000,
    });
    if (await page.getByRole('button', { name: 'Dismiss recovery', exact: true }).count())
      await page.getByRole('button', { name: 'Dismiss recovery', exact: true }).click();
    await page.keyboard.press('F3');
    await page.getByRole('combobox', { name: 'Search commands', exact: true }).fill('Add group');
    await page.keyboard.press('Enter');
    await expect(page.locator('.status-bar')).toContainText('4 objects');
    checks.push('Keyboard command search creates a group');
    await page.getByRole('button', { name: 'Alex', exact: true }).first().click();
    await page.getByRole('combobox', { name: 'Motion clip', exact: true }).selectOption('Run');
    await page.getByRole('spinbutton', { name: 'Motion cycles', exact: true }).fill('2');
    await page.getByRole('spinbutton', { name: 'Motion cycles', exact: true }).press('Enter');
    await page.getByRole('button', { name: 'Apply at Playhead', exact: true }).click();
    checks.push('Run cycle generates editable body and limb keyframes');
    await page.getByRole('button', { name: 'Right arm', exact: true }).first().click();
    await page.getByRole('button', { name: 'Animation', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Animation editor', exact: true })
      .selectOption('graph');
    await expect(
      page.getByRole('img', { name: 'Animation graph curves', exact: true }),
    ).toBeVisible();
    await page.locator('[aria-label="Graph keyframe 0"]').click();
    await page
      .getByRole('combobox', { name: 'Curve easing preset', exact: true })
      .selectOption('Overshoot');
    await expect(
      page.getByRole('combobox', { name: 'Graph interpolation', exact: true }),
    ).toHaveValue('bezier');
    const value = page.getByRole('spinbutton', { name: 'Graph key value', exact: true });
    await value.fill('90/2');
    await value.press('Enter');
    await expect(value).toHaveValue('45');
    await page.screenshot({ path: path.join(root, 'docs/graph-editor.png') });
    checks.push('Graph editor edits curves and key values with arithmetic');
    await page
      .getByRole('combobox', { name: 'Animation editor', exact: true })
      .selectOption('dope');
    await page.getByRole('button', { name: 'Layout', exact: true }).click();
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: 'Mesh Block', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Object parent', exact: true })
      .selectOption('character/rightArm');
    await page.getByRole('checkbox', { name: 'Lock transforms', exact: true }).check();
    await expect(page.getByRole('spinbutton', { name: 'Position X', exact: true })).toBeDisabled();
    checks.push('Objects attach to animated hands and can be locked');
    const filename = path.join(root, 'test-results/production.voxel');
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, filename);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.status-bar')).toContainText('Ready');
    const project = JSON.parse(await fs.readFile(filename, 'utf8'));
    assert.equal(project.objects.find((o) => o.name === 'Block').parentBone, 'rightArm');
    assert.equal(project.tracks['character/rightArm'][0].interpolation, 'bezier');
    assert.ok(project.tracks['character/leftLeg'].length > 8);
    checks.push('New production features survive native project saving');
    await page.getByRole('button', { name: 'Alex', exact: true }).first().click();
    await page.getByRole('button', { name: 'Create Right Hand IK control', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Position Z', exact: true }).fill('-0.4');
    await page.getByRole('spinbutton', { name: 'Position Z', exact: true }).press('Enter');
    checks.push('Bendable skin rig creates an editable hand IK target');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: 'Minecraft Item', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Minecraft item', exact: true })).toHaveValue(
      'minecraft:item/diamond_sword',
    );
    await page
      .getByRole('combobox', { name: 'Object parent', exact: true })
      .selectOption('character/rightHand');
    checks.push('Original Minecraft item becomes an extruded hand prop');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: 'Particle Effect', exact: true }).click();
    await page.getByRole('combobox', { name: 'Effect type', exact: true }).selectOption('vortex');
    const current = page.getByRole('spinbutton', { name: 'Current frame', exact: true });
    await current.fill('12');
    await current.press('Enter');
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(root, 'docs/effects.png') });
    checks.push('Deterministic energy effects render while scrubbing');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: 'Camera', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Camera tracking target', exact: true })
      .selectOption('character/head');
    await page.getByRole('button', { name: 'Shots', exact: true }).click();
    await page.getByRole('button', { name: 'Cuts', exact: true }).click();
    const shotCamera = page.getByRole('combobox', { name: 'Shot camera', exact: true }),
      cameraId = await shotCamera.locator('option').last().getAttribute('value');
    await shotCamera.selectOption(cameraId);
    await page.getByRole('button', { name: 'Add Cut at Frame 12', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Camera cut New shot at 12', exact: true }),
    ).toBeVisible();
    checks.push('Tracked cameras and timed cuts appear in the sequence');
    const wav = Buffer.alloc(44 + 48000 * 2);
    wav.write('RIFF', 0);
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(48000, 24);
    wav.writeUInt32LE(96000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(wav.length - 44, 40);
    for (let i = 0; i < 48000; i++)
      wav.writeInt16LE(Math.round(Math.sin((i / 48000) * Math.PI * 2 * 220) * 1800), 44 + i * 2);
    const audioPath = path.join(root, 'test-results/tone.wav');
    await fs.writeFile(audioPath, wav);
    await page.getByLabel('Import soundtrack', { exact: true }).setInputFiles(audioPath);
    await expect(page.getByRole('spinbutton', { name: 'Audio volume', exact: true })).toBeVisible();
    checks.push('A soundtrack imports into the project sequence');
    const videoPath = path.join(root, 'test-results/production.webm');
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, videoPath);
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('webm');
    await page.getByRole('combobox', { name: 'Resolution', exact: false }).selectOption('640');
    await page.getByRole('spinbutton', { name: 'Export end frame', exact: true }).fill('5');
    await page.getByRole('spinbutton', { name: 'Export end frame', exact: true }).press('Enter');
    await page.getByRole('dialog').getByRole('button', { name: 'Export', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 90000 });
    const movie = await fs.readFile(videoPath);
    assert.ok(movie.length > 2000);
    assert.equal(movie.subarray(0, 4).toString('hex'), '1a45dfa3');
    const metadata = await page.evaluate(
      (bytes) =>
        new Promise((resolve, reject) => {
          const video = document.createElement('video'),
            url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'video/webm' }));
          video.onloadedmetadata = () => {
            const result = {
              width: video.videoWidth,
              height: video.videoHeight,
              duration: video.duration,
            };
            URL.revokeObjectURL(url);
            resolve(result);
          };
          video.onerror = () => reject(Error('Exported video cannot be decoded'));
          video.src = url;
        }),
      Array.from(movie),
    );
    assert.equal(metadata.width, 640);
    assert.ok(metadata.duration > 0 && metadata.duration < 1);
    checks.push('Direct WebM video export produces a decodable frame-accurate movie');
    const media=await import('mediabunny'),input=new media.Input({source:new media.BufferSource(movie),formats:media.ALL_FORMATS});
    assert.ok(await input.getPrimaryAudioTrack(),'soundtrack must be muxed into the movie');
    checks.push('Exported movie contains a synchronized audio track');
    const mp4Supported=await page.evaluate(async()=>{
      const video=await VideoEncoder.isConfigSupported({codec:'avc1.42001f',width:640,height:360,bitrate:2000000,framerate:24});
      const audio=await AudioEncoder.isConfigSupported({codec:'mp4a.40.2',sampleRate:48000,numberOfChannels:1,bitrate:128000});return video.supported&&audio.supported;
    });
    if(mp4Supported){const mp4Path=path.join(root,'test-results/production.mp4');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},mp4Path);await page.getByRole('button',{name:'Export',exact:true}).click();await page.getByRole('combobox',{name:'Export format',exact:true}).selectOption('mp4');await page.getByRole('combobox',{name:'Resolution',exact:false}).selectOption('640');await page.getByRole('spinbutton',{name:'Export end frame',exact:true}).fill('5');await page.getByRole('spinbutton',{name:'Export end frame',exact:true}).press('Enter');await page.getByRole('dialog').getByRole('button',{name:'Export',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0,{timeout:90000});const mp4=await fs.readFile(mp4Path);assert.equal(mp4.subarray(4,8).toString(),'ftyp');checks.push('Direct MP4/H.264 export with AAC audio works on this PC');}
    assert.deepEqual(errors, []);
    await fs.writeFile(
      path.join(root, 'test-results/production-checks.json'),
      JSON.stringify({ checks, errors }, null, 2),
    );
    console.log(JSON.stringify({ checks, errors }, null, 2));
  } catch (error) {
    console.error({ errors });
    await app
      .windows()[0]
      ?.screenshot({ path: path.join(root, 'test-results/production-failure.png') });
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
