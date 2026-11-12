import assert from 'node:assert/strict';
import test from 'node:test';
import { Mesh, MeshStandardMaterial, Raycaster, Vector3 } from 'three';
import { extrudeItemSprite } from '../src/engine/item-mesh';

test('item sprites render front, back, and all four outward walls with front-face culling', () => {
  const geometry = extrudeItemSprite(new Uint8ClampedArray([100, 200, 230, 255]), 1);
  const mesh = new Mesh(geometry, new MeshStandardMaterial());
  const axes = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ] as const;
  for (const axis of axes) {
    for (const sign of [-1, 1]) {
      const outward = new Vector3(...axis).multiplyScalar(sign);
      const ray = new Raycaster(outward.clone().multiplyScalar(2), outward.clone().negate());
      const hit = ray.intersectObject(mesh)[0];
      assert.ok(hit, `missing exterior face ${outward.toArray()}`);
      assert.equal(hit.face?.normal.dot(outward), 1);
      assert.ok(hit.point.dot(outward) > 0, 'the near wall must render before the opposite wall');
    }
  }
  geometry.dispose();
  mesh.material.dispose();
});

test('transparent texels cast no geometry and adjacent texels share the volume', () => {
  const geometry = extrudeItemSprite(
    new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 0, 10, 11, 12, 127]),
    2,
  );
  const mesh = new Mesh(geometry, new MeshStandardMaterial());
  const ray = new Raycaster(new Vector3(-0.25, -0.25, 2), new Vector3(0, 0, -1));
  assert.equal(ray.intersectObject(mesh).length, 0);
  assert.equal(
    geometry.index?.count,
    60,
    'only the two opaque pixels and their perimeter are meshed',
  );
  geometry.dispose();
  mesh.material.dispose();
});
