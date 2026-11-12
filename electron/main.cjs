const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs/promises');
const { bakeBlenderMotion } = require('./blender.cjs');
let window;
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'voxel',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);
app.setAppUserModelId('studio.voxel.desktop');
if (process.platform === 'win32') app.commandLine.appendSwitch('force-high-performance-gpu');
app.whenReady().then(() => {
  const dist = path.resolve(__dirname, '../dist');
  protocol.handle('voxel', (request) => {
    const url = new URL(request.url);
    const file = path.resolve(dist, '.' + decodeURIComponent(url.pathname));
    if (url.hostname !== 'studio' || !file.startsWith(dist + path.sep))
      return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  window = new BrowserWindow({
    show: !process.argv.includes('--headless'),
    width: 1600,
    height: 1000,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#151515',
    title: 'Voxel Studio',
    icon: path.join(__dirname, '../dist/app.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: !process.argv.includes('--headless'),
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('voxel://studio/')) event.preventDefault();
  });
  window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  );
  window.loadURL('voxel://studio/index.html');
});
ipcMain.handle('save-file', async (event, { name, data, type }) => {
  if (
    event.sender !== window.webContents ||
    typeof name !== 'string' ||
    !(data instanceof Uint8Array) ||
    data.byteLength > 1024 * 1024 * 1024
  )
    throw Error('Invalid save request');
  const extension =
    path
      .extname(name)
      .slice(1)
      .replace(/[^a-z0-9]/gi, '') || 'bin';
  const result = await dialog.showSaveDialog(window, {
    defaultPath: path.basename(name),
    filters: [{ name: type || extension.toUpperCase(), extensions: [extension] }],
  });
  if (result.canceled) return false;
  await fs.writeFile(result.filePath, data);
  return true;
});
app.on('window-all-closed', () => app.quit());
const versionsRoot = path.join(app.getPath('appData'), '.minecraft', 'versions');
async function minecraftVersions() {
  const entries = await fs.readdir(versionsRoot, { withFileTypes: true }).catch(() => []),
    result = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+(?:\.\d+){1,2}$/.test(entry.name)) continue;
    const jar = path.join(versionsRoot, entry.name, entry.name + '.jar');
    try {
      const stat = await fs.stat(jar);
      if (stat.isFile() && stat.size < 128 * 1024 * 1024) result.push(entry.name);
    } catch {}
  }
  return result.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}
ipcMain.handle('minecraft-versions', (event) => {
  if (event.sender !== window.webContents) throw Error('Invalid sender');
  return minecraftVersions();
});
ipcMain.handle('minecraft-assets', async (event, version) => {
  if (
    event.sender !== window.webContents ||
    typeof version !== 'string' ||
    !(await minecraftVersions()).includes(version)
  )
    throw Error('Minecraft version is not installed.');
  return {
    version,
    bytes: new Uint8Array(await fs.readFile(path.join(versionsRoot, version, version + '.jar'))),
  };
});
ipcMain.handle('bake-blender-motion', (event, data, mode) => {
  if (
    event.sender !== window?.webContents ||
    event.senderFrame?.url !== 'voxel://studio/index.html'
  ) {
    throw Error('Invalid sender');
  }
  const script = app.isPackaged
    ? path.join(process.resourcesPath, 'blender', 'bake_motion.py')
    : path.resolve(__dirname, '../scripts/blender/bake_motion.py');
  return bakeBlenderMotion(data, mode, script, app.getPath('temp'));
});
