import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { zipSync, strToU8 } = require('fflate');
const { installMod, minecraftCompatible } = require('../install-mod.cjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'voxel-installer-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'bundle'),
    instance = path.join(root, 'instance'),
    mods = path.join(instance, 'mods');
  fs.mkdirSync(source);
  fs.mkdirSync(mods, { recursive: true });
  const jar = (dir, name, id, version, minecraft = '>=1.21.11- <1.21.12-') =>
    fs.writeFileSync(
      path.join(dir, name),
      zipSync({
        'fabric.mod.json': strToU8(JSON.stringify({ id, version, depends: { minecraft } })),
      }),
    );
  jar(source, 'bridge.jar', 'voxel_build_bridge', '0.1.0');
  jar(source, 'fabric-api-bundled.jar', 'fabric-api', '0.141.6+1.21.11');
  return { source, instance, mods, jar };
}
test('keeps the compatible older API even under a renamed JAR', (t) => {
  const f = fixture(t);
  f.jar(f.mods, 'my-api.jar', 'fabric-api', '0.141.4+1.21.11');
  const before = fs.readFileSync(path.join(f.mods, 'my-api.jar'));
  const result = installMod(f.instance, { source: f.source });
  assert.deepEqual(result.installed, ['bridge.jar']);
  assert.deepEqual(result.kept, ['my-api.jar']);
  assert.deepEqual(fs.readFileSync(path.join(f.mods, 'my-api.jar')), before);
  assert.deepEqual(fs.readdirSync(f.mods).sort(), ['bridge.jar', 'my-api.jar']);
});
test('adds the bundled API only when none is installed', (t) => {
  const f = fixture(t),
    result = installMod(f.instance, { source: f.source });
  assert.deepEqual(result.installed, ['bridge.jar', 'fabric-api-bundled.jar']);
  assert.deepEqual(result.kept, []);
});
test('rejects incompatible or duplicate APIs before copying anything', (t) => {
  const f = fixture(t);
  f.jar(f.mods, 'wrong-game.jar', 'fabric-api', '0.140.0+1.21.10', '>=1.21.10- <1.21.11-');
  assert.throws(
    () => installMod(f.instance, { source: f.source }),
    /does not declare compatibility/,
  );
  assert.deepEqual(fs.readdirSync(f.mods), ['wrong-game.jar']);
  f.jar(f.mods, 'second.jar', 'fabric-api', '0.141.4+1.21.11');
  assert.throws(() => installMod(f.instance, { source: f.source }), /Multiple Fabric API/);
  assert.equal(fs.existsSync(path.join(f.mods, 'bridge.jar')), false);
});
test('interprets Fabric Minecraft version constraints', () => {
  assert(minecraftCompatible('>=1.21.11- <1.21.12-'));
  assert(minecraftCompatible(['1.20.1', '~1.21.11-']));
  assert.equal(minecraftCompatible('>=1.21.10- <1.21.11-'), false);
  assert.equal(minecraftCompatible(undefined), false);
});
