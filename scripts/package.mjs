import { createPackage } from '@electron/asar';
import { resedit } from '@electron/packager/resedit';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = path.join(root, '.packaging', 'studio');
const outputName = process.argv[2] || 'VoxelStudio-win32-x64';
if (!/^VoxelStudio-win32-x64(?:-[a-z0-9]+)*$/i.test(outputName)) {
  throw Error('Invalid portable build folder name.');
}
const output = path.join(root, 'release', outputName);
const temporaryRuntime = path.join(root, '.packaging', 'tmp');
// Only generated build directories inside this workspace can be replaced.
for (const target of [stage, output, temporaryRuntime]) {
  if (!path.resolve(target).startsWith(root + path.sep)) {
    throw Error('Packaging target escaped the workspace.');
  }
}
await rm(stage, { recursive: true, force: true });
await rm(temporaryRuntime, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
await cp(path.join(root, 'dist'), path.join(stage, 'dist'), { recursive: true });
await cp(path.join(root, 'electron'), path.join(stage, 'electron'), { recursive: true });
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
await writeFile(
  path.join(stage, 'package.json'),
  JSON.stringify({
    name: pkg.name,
    productName: 'Voxel Studio',
    version: pkg.version,
    description: pkg.description,
    author: pkg.author,
    license: pkg.license,
    main: pkg.main,
  }),
);
await cp(path.join(root, 'LICENSE'), path.join(stage, 'LICENSE'));

// Reuse the installed and checksum-verified Electron runtime. Copying directly
// avoids Windows directory-rename failures during conventional packaging.
const runtime = path.join(root, 'node_modules', 'electron', 'dist');
await readFile(path.join(runtime, 'version'));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(runtime, output, { recursive: true });
await createPackage(stage, path.join(output, 'resources', 'app.asar'));
const blenderTools = path.join(output, 'resources', 'blender');
await mkdir(blenderTools, { recursive: true });
await cp(
  path.join(root, 'scripts', 'blender', 'bake_motion.py'),
  path.join(blenderTools, 'bake_motion.py'),
);
await rm(path.join(output, 'resources', 'default_app.asar'), { force: true });
const executable = path.join(output, 'VoxelStudio.exe');
await cp(path.join(output, 'electron.exe'), executable);
await rm(path.join(output, 'electron.exe'));
await resedit(executable, {
  iconPath: path.join(root, 'public', 'app.ico'),
  productVersion: pkg.version,
  fileVersion: pkg.version,
  productName: 'Voxel Studio',
  legalCopyright: 'Voxel Studio contributors',
  win32Metadata: {
    CompanyName: 'Voxel Studio',
    FileDescription: 'Minecraft animation workspace',
    ProductName: 'Voxel Studio',
    InternalName: 'VoxelStudio',
    OriginalFilename: 'VoxelStudio.exe',
  },
});
await cp(path.join(root, 'README.md'), path.join(output, 'START HERE.md'));
await cp(path.join(root, 'docs'), path.join(output, 'docs'), { recursive: true });
await cp(path.join(root, 'THIRD_PARTY_NOTICES.md'), path.join(output, 'THIRD_PARTY_NOTICES.md'));
const mediaSource = path.join(output, 'third-party-sources', 'mediabunny');
await mkdir(mediaSource, { recursive: true });
await cp(path.join(root, 'node_modules', 'mediabunny', 'src'), path.join(mediaSource, 'src'), {
  recursive: true,
});
await cp(
  path.join(root, 'node_modules', 'mediabunny', 'LICENSE'),
  path.join(mediaSource, 'LICENSE'),
);
await cp(
  path.join(root, 'node_modules', 'mediabunny', 'package.json'),
  path.join(mediaSource, 'package.json'),
);
console.log('Portable Windows app: ' + executable);
