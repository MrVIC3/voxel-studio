const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const { unzipSync, strFromU8 } = require('fflate');
const semver = require('semver');

const GAME = '1.21.11';
function metadata(file) {
  if (fs.statSync(file).size > 128 * 1024 * 1024) throw Error('JAR exceeds inspection limit');
  const files = unzipSync(fs.readFileSync(file), {
    filter: (entry) => entry.name === 'fabric.mod.json' && entry.originalSize <= 1024 * 1024,
  });
  return files['fabric.mod.json'] ? JSON.parse(strFromU8(files['fabric.mod.json'])) : null;
}
function minecraftCompatible(requirement) {
  const alternatives = Array.isArray(requirement) ? requirement : [requirement];
  return alternatives.some((range) => {
    if (typeof range !== 'string') return false;
    // Fabric accepts an empty prerelease suffix as a version boundary.
    const normalized = range.replace(/(\d+\.\d+\.\d+)-(?=\s|$|\|)/g, '$1-0');
    return (
      !!semver.validRange(normalized) &&
      semver.satisfies(GAME, normalized, { includePrerelease: true })
    );
  });
}
function installMod(
  directory,
  { source = path.resolve(__dirname, '../release/VoxelBuild/mods') } = {},
) {
  directory = path.resolve(directory.trim().replace(/^"|"$/g, ''));
  if (
    !fs.existsSync(directory) ||
    !['mods', 'config', 'versions', 'options.txt'].some((file) =>
      fs.existsSync(path.join(directory, file)),
    )
  )
    throw Error('Select the Minecraft instance game folder. See docs/VOXEL-BUILD.md.');
  const mods = path.join(directory, 'mods');
  const bundle = fs
    .readdirSync(source)
    .filter((name) => name.endsWith('.jar'))
    .map((name) => ({ name, mod: metadata(path.join(source, name)) }));
  const api = bundle.find(({ mod }) => mod?.id === 'fabric-api');
  const bridge = bundle.find(({ mod }) => mod?.id === 'voxel_build_bridge');
  if (!api || !bridge)
    throw Error(
      'The installer bundle must contain the bridge and Fabric API. No files were changed.',
    );
  const existingApis = [],
    existingBridges = [];
  for (const name of fs.existsSync(mods)
    ? fs.readdirSync(mods).filter((n) => n.endsWith('.jar'))
    : []) {
    let mod;
    try {
      mod = metadata(path.join(mods, name));
    } catch (e) {
      if (/^fabric-api(?:[-_.]|\.jar$)/i.test(name))
        throw Error(`Cannot inspect ${name}: ${e.message}. No files were changed.`);
      continue;
    }
    if (mod?.id === 'fabric-api') existingApis.push({ name, mod });
    if (mod?.id === 'voxel_build_bridge') existingBridges.push({ name, mod });
  }
  if (existingApis.length > 1)
    throw Error(
      'Multiple Fabric API mods are installed: ' +
        existingApis.map(({ name }) => name).join(', ') +
        '. Keep one compatible API before installing. No files were changed.',
    );
  const existing = existingApis[0];
  if (existing && !minecraftCompatible(existing.mod.depends?.minecraft))
    throw Error(
      `${existing.name} does not declare compatibility with Minecraft ${GAME}. Use this game's Fabric API in this instance. No files were changed.`,
    );
  if (existingBridges.some(({ name }) => name !== bridge.name))
    throw Error(
      'Another bridge JAR is installed under a different name. Remove the old bridge before installing this version. No files were changed.',
    );
  // Retain a compatible API regardless of its filename or patch version.
  const files = [bridge.name, ...(existing ? [] : [api.name])];
  fs.mkdirSync(mods, { recursive: true });
  for (const file of files) fs.copyFileSync(path.join(source, file), path.join(mods, file));
  return {
    installed: files,
    kept: existing ? [existing.name] : [],
    directory: mods,
    next: 'Launch this instance with Fabric Loader 0.18.4 or newer on Minecraft 1.21.11, open your world, then prompt Codex.',
  };
}
async function main() {
  let directory = process.argv[2];
  if (!directory) {
    const input = readline.createInterface({ input: process.stdin, output: process.stdout });
    directory = await input.question(
      'Minecraft Fabric 1.21.11 game folder (contains mods/config): ',
    );
    input.close();
  }
  console.log(JSON.stringify(installMod(directory)));
}
if (require.main === module)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
module.exports = { installMod, minecraftCompatible };
