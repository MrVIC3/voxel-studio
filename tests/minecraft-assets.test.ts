import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { decodeMinecraftAssets, MinecraftLibrary } from '../src/engine/minecraft';
import { readZip } from '../src/engine/importers';
import { minecraftMesh } from '../src/engine/minecraft-mesh';
import type { MinecraftAssets } from '../src/engine/minecraft';
import * as THREE from 'three';
const jar = path.join(process.env.APPDATA || '', '.minecraft/versions/1.21.11/1.21.11.jar');
const available = existsSync(jar);
let assets: MinecraftAssets;
const load = () =>
  (assets ??= decodeMinecraftAssets(
    new Uint8Array(readFileSync(jar)),
    '1.21.11',
    'Installed Java',
  ));
test('original installed-game texture bytes are preserved exactly', { skip: !available }, () => {
  const a = load(),
    original = readZip(new Uint8Array(readFileSync(jar)), (name) =>
      /^assets\/minecraft\/textures\/.+\.png$/.test(name),
    );
  assert.equal(Object.keys(a.textures).length, Object.keys(original).length);
  for (const [name, data] of Object.entries(original)) {
    const key = 'minecraft:' + name.split('/textures/')[1].slice(0, -4),
      decoded = Buffer.from(a.textures[key].split(',')[1], 'base64');
    assert.equal(
      createHash('sha256').update(decoded).digest('hex'),
      createHash('sha256').update(data).digest('hex'),
    );
  }
  assert.ok(Object.keys(a.blockstates).length > 1100);
  assert.ok(Object.keys(a.models).length > 2300);
});
test(
  'inherited face textures and rotated block-state variants resolve',
  { skip: !available },
  () => {
    const lib = new MinecraftLibrary(load()),
      log = lib.parts('minecraft:oak_log[axis=y]')[0];
    const top = log.model.elements[0].faces.up!,
      side = log.model.elements[0].faces.north!;
    assert.equal(lib.texture(top.texture, log.model.textures), 'minecraft:block/oak_log_top');
    assert.equal(lib.texture(side.texture, log.model.textures), 'minecraft:block/oak_log');
    const stair = lib.parts(
      'minecraft:oak_stairs[facing=north,half=bottom,shape=straight,waterlogged=false]',
    )[0];
    assert.equal(stair.variant.y, 270);
    assert.equal(stair.model.elements.length, 2);
    assert.equal(
      lib.parts(
        'minecraft:oak_fence[north=true,south=false,east=false,west=false,waterlogged=false]',
      ).length,
      2,
    );
  },
);
test(
  'every installed vanilla block state can be resolved without exceptions',
  { skip: !available },
  () => {
    const lib = new MinecraftLibrary(load());
    for (const name of Object.keys(lib.assets.blockstates))
      assert.doesNotThrow(() => lib.parts(name), name);
  },
);
async function withCanvas<T>(run: () => Promise<T>): Promise<T> {
  const oldDocument = globalThis.document,
    oldImage = globalThis.Image;
  const context = {
    fillStyle: '',
    imageSmoothingEnabled: false,
    fillRect() {},
    clearRect() {},
    drawImage() {},
  };
  (globalThis as any).document = {
    createElement: () => ({ width: 1, height: 1, getContext: () => context }),
  };
  (globalThis as any).Image = class {
    width = 16;
    height = 16;
    onload?: () => void;
    set src(source: string) {
      const png = Buffer.from(source.split(',')[1], 'base64');
      this.width = png.readUInt32BE(16);
      this.height = png.readUInt32BE(20);
      queueMicrotask(() => this.onload?.());
    }
  };
  try {
    return await run();
  } finally {
    globalThis.document = oldDocument;
    globalThis.Image = oldImage;
  }
}
test(
  'model meshing uses slab dimensions, stair geometry, leaf cutout and glass transparency',
  { skip: !available },
  async () =>
    withCanvas(async () => {
      const lib = new MinecraftLibrary(load());
      const slab = minecraftMesh(
        { palette: ['minecraft:stone_slab[type=top,waterlogged=false]'], blocks: [[0, 0, 0, 0]] },
        lib,
      );
      await slab.userData.ready;
      const box = new THREE.Box3().setFromObject(slab);
      assert.equal((slab.children[0] as THREE.Mesh).geometry.getAttribute('color').itemSize, 3);
      assert.equal(box.min.y, 0);
      assert.equal(box.max.y, 0.5);
      const stairs = minecraftMesh(
        {
          palette: ['minecraft:oak_stairs[facing=east,half=bottom,shape=straight]'],
          blocks: [[0, 0, 0, 0]],
        },
        lib,
      );
      await stairs.userData.ready;
      assert.ok((stairs.children[0] as THREE.Mesh).geometry.index!.count > 36);
      const leaves = minecraftMesh(
        { palette: ['minecraft:oak_leaves'], blocks: [[0, 0, 0, 0]] },
        lib,
      );
      await leaves.userData.ready;
      assert.equal(
        ((leaves.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).alphaTest,
        0.5,
      );
      const glass = minecraftMesh({ palette: ['minecraft:glass'], blocks: [[0, 0, 0, 0]] }, lib);
      await glass.userData.ready;
      assert.equal(
        ((glass.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).transparent,
        true,
      );
    }),
);
test('a solid 48-cube build only allocates exposed faces', { skip: !available }, async () =>
  withCanvas(async () => {
    const blocks: [number, number, number, number][] = [];
    for (let x = 0; x < 48; x++)
      for (let y = 0; y < 48; y++) for (let z = 0; z < 48; z++) blocks.push([x, y, z, 0]);
    const model = minecraftMesh(
      { palette: ['minecraft:stone'], blocks },
      new MinecraftLibrary(load()),
    );
    await model.userData.ready;
    const triangles = model.children.reduce(
      (n, o) => n + (o as THREE.Mesh).geometry.index!.count / 3,
      0,
    );
    assert.equal(triangles, 6 * 48 * 48 * 2);
    assert.equal(model.children.length, 26);
  }),
);

test('original animated water textures follow timeline time', { skip: !available }, async () =>
  withCanvas(async () => {
    const model = minecraftMesh(
      { palette: ['minecraft:water'], blocks: [[0, 0, 0, 0]] },
      new MinecraftLibrary(load()),
    );
    await model.userData.ready;
    const texture = ((model.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).map!;
    const first = texture.version;
    model.userData.animate(1);
    assert.ok(texture.version > first, 'water frame must update when timeline advances');
    const second = texture.version;
    model.userData.animate(1);
    assert.equal(texture.version, second, 'unchanged timeline time must not reupload the atlas');
  }),
);
