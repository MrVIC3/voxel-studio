const { _electron: electron } = require('playwright');
const path = require('node:path');
const fs = require('node:fs/promises');
(async () => {
  const root = path.resolve(__dirname, '..');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: require('electron'),
    args: [root],
    env,
    timeout: 45000,
  });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.waitForSelector('.viewport-canvas canvas');
    await page.waitForTimeout(2200);
    await page.screenshot({ path: path.join(root, 'docs/workspace.png') });
    console.log(
      JSON.stringify(
        {
          title: await page.title(),
          status: await page.locator('.status-bar').innerText(),
          errors,
        },
        null,
        2,
      ),
    );
    await page.getByRole('button', { name: 'Lighting', exact: true }).click();
    await page.screenshot({ path: path.join(root, 'docs/lighting.png') });
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.screenshot({ path: path.join(root, 'docs/import.png') });
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
