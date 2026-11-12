import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { skinRelief } from '../src/engine/skin-relief';
import { validCharacterLayers } from '../src/character-layers';

test('opaque skin pixels extrude with raised fronts and exposed side walls', () => {
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  box.geometry.setIndex([16, 18, 17, 18, 19, 17]); // Front face.
  const pixels = {
    width: 2,
    height: 2,
    data: new Uint8ClampedArray([255, 130, 30, 255, 255, 130, 30, 255, 0, 0, 0, 0, 0, 0, 0, 0]),
  };
  const relief = skinRelief(box, pixels, 0.125)!;
  assert.ok(relief);
  // Two fronts and six exposed edges. The shared interior edge has no wall.
  assert.equal(relief.geometry.index!.count, 8 * 6);
  const positions = relief.geometry.getAttribute('position');
  assert.ok(
    Array.from({ length: positions.count }, (_, i) => positions.getZ(i)).some((n) => n === 0.625),
  );
  assert.ok(
    Array.from({ length: positions.count }, (_, i) => positions.getZ(i)).some((n) => n < 0.5),
  );
  assert.equal(
    skinRelief(box, pixels, 0.125, () => false),
    undefined,
  );
  assert.equal(skinRelief(box, pixels, 0), undefined);
});

test('hair color and relief depth survive JSON validation', () => {
  assert.ok(
    validCharacterLayers(
      JSON.parse(
        JSON.stringify({ hair: { visible: true, offset: 0, depth: 1.3, color: '#a54b24' } }),
      ),
    ),
  );
  assert.equal(
    validCharacterLayers({ jacket: { visible: true, offset: 0, depth: Infinity } }),
    false,
  );
});
