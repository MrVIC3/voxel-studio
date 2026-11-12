import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  applyFaceClip,
  captureFaceClip,
  defaultFaceRig,
  evaluateFace,
  neutralFace,
  setFaceKey,
  validateFaceKeys,
  validateFaceRig,
} from '../src/face';
import { AnimatedFaceMesh, installCharacterFace, setCharacterFace } from '../src/engine/face-rig';

test('face keys round-trip, interpolate and edit in time order without mutating inputs', () => {
  const a = setFaceKey(undefined, 0, { ...neutralFace }, 'linear');
  const b = setFaceKey(a, 24, { ...neutralFace, lookX: 1, blink: 1 });
  const c = setFaceKey(b, 12, { ...neutralFace, lookY: -1 }, 'step');
  assert.deepEqual(
    c.map((key) => key.frame),
    [0, 12, 24],
  );
  assert.equal(a.length, 1);
  assert.equal(evaluateFace(defaultFaceRig, b, 6, 24, 'actor').blink, 0.25);
  assert.equal(evaluateFace(defaultFaceRig, c, 18, 24, 'actor').lookY, -1);
  assert.ok(validateFaceKeys(JSON.parse(JSON.stringify(c)), 24));
  assert.equal(validateFaceKeys(c, 12), false);
  assert.equal(validateFaceKeys([c[1], c[0]], 24), false);
  assert.equal(validateFaceKeys([{ ...c[0], pose: { ...neutralFace, jaw: Infinity } }], 24), false);
  assert.equal(validateFaceRig({ ...defaultFaceRig, eyeSpacing: 0 }), false);
  assert.ok(validateFaceRig({ ...defaultFaceRig, iris: '#7355ee' }));
});

test('automatic eyes are actor-specific and deterministic under nonsequential seeks', () => {
  const rig = { ...defaultFaceRig, enabled: true };
  const frames = Array.from({ length: 360 }, (_, i) => i);
  const sequence = frames.map((frame) => evaluateFace(rig, [], frame, 24, 'first'));
  assert.ok(sequence.some((pose) => pose.blink > 0.9));
  assert.ok(sequence.some((pose) => pose.blink === 0));
  for (const frame of [72, 12, 140, 9, 320]) {
    assert.deepEqual(evaluateFace(rig, [], frame, 24, 'first'), sequence[frame]);
  }
  assert.notDeepEqual(evaluateFace(rig, [], 140, 24, 'second'), sequence[140]);
  assert.deepEqual(evaluateFace(rig, [], 140, 24, 'first', false), neutralFace);
  assert.deepEqual(
    evaluateFace(rig, setFaceKey([], 0, neutralFace), 140, 24, 'first'),
    neutralFace,
  );
});

test('face clips repeat and retime with captured endpoint samples', () => {
  const source = setFaceKey(setFaceKey([], 0, neutralFace, 'linear'), 24, {
    ...neutralFace,
    jaw: 1,
  });
  const captured = captureFaceClip(source, 6, 18);
  assert.deepEqual(
    captured.map((key) => [key.frame, key.pose.jaw]),
    [
      [0, 0.25],
      [12, 0.75],
    ],
  );
  const existing = setFaceKey(setFaceKey([], 8, neutralFace), 100, neutralFace);
  const repeated = applyFaceClip(existing, captured, 10, 6, 22, 2, 2);
  assert.deepEqual(
    repeated.map((key) => key.frame),
    [8, 10, 16, 22, 100],
  );
  assert.equal(repeated[2].pose.jaw, 0.25, 'each repeat starts at the source pose');
  assert.equal(repeated[3].pose.jaw, 0.75);
});

test('capturing in the middle of a smooth or held expression preserves the actual performance', () => {
  for (const interpolation of ['smooth', 'step'] as const) {
    const source = setFaceKey(setFaceKey([], 0, neutralFace, interpolation), 24, {
      ...neutralFace,
      lookY: 1,
    });
    const clip = captureFaceClip(source, 7, 22);
    for (let frame = 7; frame <= 22; frame++) {
      assert.equal(
        evaluateFace(undefined, clip, frame - 7, 24, 'a').lookY,
        evaluateFace(undefined, source, frame, 24, 'a').lookY,
      );
    }
  }
});

test('facial geometry visibly opens/closes, changes gaze, and stays behind headwear', () => {
  const mesh = new AnimatedFaceMesh(),
    rig = { ...defaultFaceRig, enabled: true, style: 'cinematic' as const };
  mesh.updatePose(rig, neutralFace);
  const attribute = mesh.geometry.getAttribute('position');
  const open = mesh.geometry.drawRange.count;
  const neutral = Array.from(attribute.array.slice(0, open * 2));
  mesh.updatePose(rig, { ...neutralFace, lookX: 0.7, lookY: -0.7 });
  assert.notDeepEqual(Array.from(attribute.array.slice(0, open * 2)), neutral);
  mesh.updatePose(rig, { ...neutralFace, blink: 1 });
  assert.ok(
    mesh.geometry.drawRange.count < open,
    'a closed eyelid replaces sclera and pupil geometry',
  );
  mesh.updatePose(rig, { ...neutralFace, jaw: 1, smile: 1, brow: 0.8 });
  assert.ok(mesh.geometry.drawRange.count > open);
  const count = (mesh.geometry.drawRange.count / 6) * 4;
  for (let i = 0; i < count; i++) {
    assert.ok(Math.abs(attribute.getX(i)) <= 0.25);
    assert.ok(attribute.getY(i) >= 0 && attribute.getY(i) <= 0.5);
    assert.ok(attribute.getZ(i) > 0.25 && attribute.getZ(i) < 0.256);
  }
  const index = mesh.geometry.index!;
  const a = new THREE.Vector3().fromBufferAttribute(attribute, index.getX(0));
  const b = new THREE.Vector3().fromBufferAttribute(attribute, index.getX(1));
  const c = new THREE.Vector3().fromBufferAttribute(attribute, index.getX(2));
  assert.ok(b.sub(a).cross(c.sub(a)).z > 0, 'front winding is outward');
});

test('enabling and undoing the face rig never modifies the original mesh or texture', () => {
  const root = new THREE.Group(),
    head = new THREE.Group();
  root.add(head);
  const texture = new THREE.Texture();
  const original = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.5),
    new THREE.MeshStandardMaterial({ map: texture }),
  );
  head.add(original);
  installCharacterFace(root, head);
  setCharacterFace(root, defaultFaceRig, neutralFace);
  assert.equal(head.children.length, 1);
  setCharacterFace(root, { ...defaultFaceRig, enabled: true, style: 'classic' }, neutralFace);
  assert.equal(head.children.length, 2);
  assert.equal(original.material.map, texture);
  assert.ok(head.children[1].visible);
  setCharacterFace(root, undefined, neutralFace);
  assert.equal(head.children[1].visible, false);
  assert.equal(original.material.map, texture);
});

test('cinematic eyes expose independent volumetric layers and respect dimensions and blinks', () => {
  const root = new THREE.Group(),
    head = new THREE.Group();
  root.add(head);
  installCharacterFace(root, head);
  const rig = {
    ...defaultFaceRig,
    enabled: true,
    style: 'cinematic' as const,
    eyeGeometry: { both: { width: 1.9 }, left: { depth: 0.5, irisDepth: 0.3 } },
  };
  assert.ok(validateFaceRig(rig));
  assert.equal(validateFaceRig({ ...rig, eyeGeometry: { left: { pupilDepth: 3 } } }), false);
  setCharacterFace(root, rig, neutralFace);
  const left = head.getObjectByName('Left eye')!,
    right = head.getObjectByName('Right eye')!;
  const leftWhite = left.getObjectByName('Sclera')!,
    rightWhite = right.getObjectByName('Sclera')!;
  assert.equal(leftWhite.scale.x, rightWhite.scale.x);
  assert.ok(leftWhite.scale.z > rightWhite.scale.z);
  const iris = left.getObjectByName('Iris')!;
  const neutralX = iris.position.x;
  setCharacterFace(root, rig, { ...neutralFace, lookX: 0.65 });
  assert.ok(iris.position.x > neutralX);
  setCharacterFace(root, { ...rig, layers: { pupil: false } }, neutralFace);
  assert.equal(left.getObjectByName('Pupil')!.visible, false);
  setCharacterFace(root, rig, { ...neutralFace, blink: 1 });
  assert.equal(leftWhite.visible, false);
  assert.equal(left.getObjectByName('Closed lid crease')!.visible, true);
});

test('vanilla eyes are shallow pixel geometry and original eyes skip the eye masks', () => {
  const root = new THREE.Group(),
    head = new THREE.Group();
  root.add(head);
  installCharacterFace(root, head);
  const rig = { ...defaultFaceRig, enabled: true };
  setCharacterFace(root, rig, neutralFace);
  const eye = head.getObjectByName('Left eye')!;
  assert.equal((eye.getObjectByName('Iris') as THREE.Mesh).geometry.type, 'BoxGeometry');
  assert.equal(eye.getObjectByName('Catchlight')!.visible, false);
  assert.equal(eye.getObjectByName('Pupil')!.visible, false);
  setCharacterFace(root, { ...rig, style: 'original', mouth: false }, neutralFace);
  assert.equal(eye.visible, false);
  assert.equal(
    (head.getObjectByName('facialPerformance') as THREE.Mesh).geometry.drawRange.count,
    0,
  );
});
