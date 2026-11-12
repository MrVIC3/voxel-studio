const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..'),
  dir = process.env.VOXEL_BUILD_DATA || path.join(root, 'builder-data');
fs.mkdirSync(dir, { recursive: true });
const output = fs.openSync(path.join(dir, 'engine.log'), 'a');
const env = { ...process.env, VOXEL_BUILD_DATA: dir };
delete env.ELECTRON_RUN_AS_NODE;
const portable = path.join(root, 'release', 'VoxelBuild-win32-x64', 'VoxelBuild.exe');
const bundled = fs.existsSync(portable);
const child = spawn(
  bundled ? portable : require('electron'),
  [...(bundled ? [] : [path.join(__dirname, 'desktop.cjs')]), ...process.argv.slice(2)],
  { cwd: root, env, detached: true, windowsHide: true, stdio: ['ignore', output, output] },
);
child.unref();
fs.closeSync(output);
console.log('Hidden renderer starting. Use node builder/cli.mjs status to check readiness.');
