const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

const maxBytes = 128 * 1024 * 1024;
const modes = new Set(['ACTIONS', 'NLA_TRACKS', 'SCENE']);
let converting = false;

async function findBlender() {
  const installations = [
    process.env.ProgramW6432 && path.join(process.env.ProgramW6432, 'Blender Foundation'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Blender Foundation'),
    process.env.LOCALAPPDATA &&
      path.join(process.env.LOCALAPPDATA, 'Programs', 'Blender Foundation'),
  ].filter(Boolean);
  const candidates = new Set();
  for (const folder of new Set(installations)) {
    for (const entry of await fs.readdir(folder, { withFileTypes: true }).catch(() => [])) {
      if (entry.isDirectory() && /^Blender(?: \d+(?:\.\d+){0,2})?$/.test(entry.name)) {
        candidates.add(path.join(folder, entry.name, 'blender.exe'));
      }
    }
  }
  const override = process.env.VOXEL_STUDIO_BLENDER;
  const executables = [...candidates].sort((a, b) =>
    path.basename(path.dirname(b)).localeCompare(path.basename(path.dirname(a)), undefined, {
      numeric: true,
    }),
  );
  if (
    override &&
    path.isAbsolute(override) &&
    path.basename(override).toLowerCase() === 'blender.exe'
  ) {
    executables.unshift(override);
  }
  for (const executable of executables) {
    if ((await fs.stat(executable).catch(() => null))?.isFile()) return executable;
  }
  throw Error(
    'Blender was not found. Install the Windows version, set VOXEL_STUDIO_BLENDER to its executable, or import a GLB.',
  );
}

function runBlender(executable, script, input, output, folder, mode) {
  return new Promise((resolve, reject) => {
    const args = [
      '--background',
      '--disable-autoexec',
      input,
      '--python-exit-code',
      '2',
      '--python',
      script,
      '--',
      output,
    ];
    if (mode) args.push(mode);
    const child = spawn(executable, args, {
      cwd: folder,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let logs = '';
    let timedOut = false;
    const remember = (data) => {
      logs = (logs + data.toString()).slice(-8192);
    };
    child.stdout.on('data', remember);
    child.stderr.on('data', remember);
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 120_000);
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(Error('Could not start Blender: ' + error.message));
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (timedOut)
        return reject(
          Error(
            'Blender took over two minutes. Export a smaller animated GLB from Blender and import that file.',
          ),
        );
      if (code === 0) return resolve();
      const details = logs.trim().split(/\r?\n/).filter(Boolean).slice(-8).join('\n');
      reject(Error('Blender could not bake this file.' + (details ? '\n' + details : '')));
    });
  });
}

async function bakeBlenderMotion(data, mode, script, tempRoot) {
  if (!(data instanceof Uint8Array) || data.byteLength < 12 || data.byteLength > maxBytes) {
    throw Error('Choose a valid .blend file up to 128 MB.');
  }
  if (mode !== undefined && !modes.has(mode)) throw Error('Invalid Blender bake mode.');
  if (converting) throw Error('Blender is already baking an animation.');
  converting = true;
  let folder;
  let root;
  try {
    const executable = await findBlender();
    root = await fs.realpath(tempRoot);
    folder = await fs.mkdtemp(path.join(root, 'voxel-motion-'));
    const input = path.join(folder, 'source.blend');
    const output = path.join(folder, 'motion.glb');
    await fs.writeFile(input, data);
    await runBlender(executable, script, input, output, folder, mode);
    const file = await fs.stat(output).catch(() => null);
    if (!file?.isFile() || file.size > maxBytes) {
      throw Error(
        'Blender did not produce a GLB under 128 MB. Export fewer actions or use a simpler source scene.',
      );
    }
    return new Uint8Array(await fs.readFile(output));
  } finally {
    converting = false;
    if (folder && path.dirname(path.resolve(folder)) === root) {
      await fs.rm(folder, { recursive: true, force: true }).catch(() => {});
    }
  }
}

module.exports = { bakeBlenderMotion };
