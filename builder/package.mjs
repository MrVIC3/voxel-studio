import { createPackage } from '@electron/asar';
import { resedit } from '@electron/packager/resedit';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = path.join(root, '.packaging', 'builder'),
  output = path.join(root, 'release', 'VoxelBuild-win32-x64');
for (const target of [stage, output])
  if (!path.resolve(target).startsWith(root + path.sep)) throw Error('Unsafe packaging target');
// Replace generated staging files; preserve the portable app data directory across upgrades.
await rm(stage, { recursive: true, force: true });
await mkdir(path.join(stage, 'builder'), { recursive: true });
for (const file of ['desktop.cjs', 'server.mjs', 'bridge.mjs', 'core.mjs', 'workflow.mjs', 'architecture.mjs', 'assemblies.mjs', 'spatial-quality.mjs', 'camera-fit.mjs'])
  await cp(path.join(root, 'builder', file), path.join(stage, 'builder', file));
await cp(path.join(root, 'builder-dist'), path.join(stage, 'builder-dist'), { recursive: true });
await writeFile(
  path.join(stage, 'package.json'),
  JSON.stringify({
    name: 'voxel-build',
    productName: 'Voxel Build',
    version: '0.1.0',
    license: 'MIT',
    main: 'builder/desktop.cjs',
  }),
);
await cp(path.join(root, 'LICENSE'), path.join(stage, 'LICENSE'));
await mkdir(output, { recursive: true });
await cp(path.join(root, 'node_modules', 'electron', 'dist'), output, { recursive: true });
await createPackage(stage, path.join(output, 'resources', 'app.asar'));
await rm(path.join(output, 'resources', 'default_app.asar'), { force: true });
const exe = path.join(output, 'VoxelBuild.exe');
await cp(path.join(output, 'electron.exe'), exe);
await rm(path.join(output, 'electron.exe'));
await resedit(exe, {
  iconPath: path.join(root, 'public', 'app.ico'),
  productVersion: '0.1.0',
  fileVersion: '0.1.0',
  productName: 'Voxel Build',
  win32Metadata: {
    CompanyName: 'Voxel Studio',
    FileDescription: 'Local Codex Minecraft world renderer',
    ProductName: 'Voxel Build',
    InternalName: 'VoxelBuild',
    OriginalFilename: 'VoxelBuild.exe',
  },
});
await cp(path.join(root, 'docs', 'VOXEL-BUILD.md'), path.join(output, 'START HERE.md'));
for (const file of [
  'VOXEL-BUILD-VERIFICATION.md',
  'VOXEL-BUILD-PERFORMANCE.md',
  'voxel-build-preview.png',
  'voxel-build-front.png',
])
  await cp(path.join(root, 'docs', file), path.join(output, file));
await cp(path.join(root, 'THIRD_PARTY_NOTICES.md'), path.join(output, 'THIRD_PARTY_NOTICES.md'));
const modDir = path.join(output, 'mods');
await mkdir(modDir, { recursive: true });
await cp(path.join(root, 'release', 'VoxelBuild', 'mods'), modDir, { recursive: true });
await cp(
  path.join(root, 'mod', 'build', 'libs', 'voxel-build-bridge-0.1.0.jar'),
  path.join(modDir, 'voxel-build-bridge-0.1.0.jar'),
);

console.log(
  JSON.stringify({
    executable: exe,
    mods: modDir,
    data: 'builder-data beside executable, or VOXEL_BUILD_DATA override',
  }),
);
