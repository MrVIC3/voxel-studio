const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'voxelbuild',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);
const root = path.resolve(__dirname, '..');
const data =
  process.env.VOXEL_BUILD_DATA ||
  path.join(app.isPackaged ? path.dirname(app.getPath('exe')) : root, 'builder-data');
app.setPath('userData', path.join(data, 'electron'));
app.commandLine.appendSwitch('disable-renderer-backgrounding');
if (!app.requestSingleInstanceLock()) app.quit();
else
  app
    .whenReady()
    .then(async () => {
      const dist = path.join(root, 'builder-dist');
      protocol.handle('voxelbuild', async (request) => {
        const url = new URL(request.url);
        if (url.hostname !== 'engine') return new Response('Not found', { status: 404 });
        if (url.pathname === '/minecraft.jar') {
          const jar =
            process.env.VOXEL_BUILD_ASSETS ||
            path.join(app.getPath('appData'), '.minecraft', 'versions', '1.21.11', '1.21.11.jar');
          return net.fetch(pathToFileURL(jar).toString());
        }
        const file = path.resolve(dist, '.' + decodeURIComponent(url.pathname));
        if (!file.startsWith(dist + path.sep)) return new Response('Not found', { status: 404 });
        return net.fetch(pathToFileURL(file).toString());
      });
      const win = new BrowserWindow({
        show: process.argv.includes('--show'),
        width: 1200,
        height: 900,
        backgroundColor: '#17232d',
        title: 'Voxel Build • Codex Renderer',
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          backgroundThrottling: false,
        },
      });
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      win.webContents.on('will-navigate', (e, url) => {
        if (!url.startsWith('voxelbuild://engine/')) e.preventDefault();
      });
      win.webContents.session.setPermissionRequestHandler((_w, _p, cb) => cb(false));
      await win.loadURL('voxelbuild://engine/builder/index.html');
      const { startServer } = await import('./server.mjs');
      const engine = await startServer({
        root: data,
        render: async (request) => {
          return win.webContents.executeJavaScript(
            `window.buildEngine.render(${JSON.stringify(request)})`,
          );
        },
        onShutdown: () => app.quit(),
      });
      console.log(`Voxel Build ready on loopback port ${engine.session.port}`);
      app.on('before-quit', () => {
        engine.server.close();
      });
    })
    .catch((e) => {
      console.error(e);
      app.exit(1);
    });
app.on('window-all-closed', () => app.quit());
