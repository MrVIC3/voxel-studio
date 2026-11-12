import assert from 'node:assert/strict';
import test from 'node:test';
import { Euler, Vector3 } from 'three';
import { cameraLens, designCameraMove, sampleCameraRail } from '../src/camera-rail';
import { copyKeys, moveKeys, pasteKeys } from '../src/key-tools';
import { applyMotion } from '../src/motion';
import { demoProject, identity, validateProject } from '../src/model';
import type { Keyframe, MotionClip } from '../src/model';
import { lowerFrame, upperFrame } from '../src/time-index';

const key = (frame: number, x: number, fov = 40): Keyframe => ({
  ...identity(),
  frame,
  position: [x, 0, 0],
  interpolation: 'smooth',
  fov,
});

test('rail hits waypoints and its monotone segments do not overshoot uneven timing', () => {
  const keys = [key(0, 0, 40), key(2, 1, 36), key(29, 8, 22), key(30, 8, 20), key(41, 2, 31)];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i],
      b = keys[i + 1];
    assert.deepEqual(sampleCameraRail(keys, a.frame, 45)?.position, a.position);
    for (let frame = a.frame; frame < b.frame; frame += 0.1) {
      const sample = sampleCameraRail(keys, frame, 45)!;
      assert.ok(sample.position[0] >= Math.min(a.position[0], b.position[0]) - 1e-6);
      assert.ok(sample.position[0] <= Math.max(a.position[0], b.position[0]) + 1e-6);
    }
  }
  assert.equal(sampleCameraRail(keys, 15.5, 45)?.fov, 29);
  assert.equal(cameraLens(keys, 30, 45), 20);
});

test('rail holds a constant key and takes the short orientation arc over 180 degrees', () => {
  const a: Keyframe = { ...key(0, 0), rotation: [0, (179 * Math.PI) / 180, 0] };
  const b: Keyframe = { ...key(10, 2, 23), rotation: [0, (-179 * Math.PI) / 180, 0] };
  const halfway = sampleCameraRail([a, b], 5, 40)!;
  const direction = new Vector3(0, 0, -1).applyEuler(new Euler(...halfway.rotation));
  assert.ok(direction.z > 0.999);
  const hold = { ...a, interpolation: 'step' as const };
  assert.deepEqual(sampleCameraRail([hold, b], 9.5, 40)?.position, a.position);
  assert.equal(sampleCameraRail([hold, b], 10, 40)?.fov, 23);
});

test('generated shot waypoints aim their camera at the subject', () => {
  const target = new Vector3(2, 1, -3);
  for (const preset of ['orbit', 'push', 'reveal', 'truck'] as const) {
    const keys = designCameraMove(preset, [2, 1, -3], [9, 4, 6], 2, 30, 48, 38);
    assert.deepEqual(
      keys.map((k) => k.frame),
      [30, 42, 54, 66, 78],
    );
    for (const waypoint of keys) {
      const forward = new Vector3(0, 0, -1).applyEuler(new Euler(...waypoint.rotation));
      const facing = target
        .clone()
        .sub(new Vector3(...waypoint.position))
        .normalize();
      assert.ok(forward.dot(facing) > 0.9999);
    }
  }
});

test('dense sorted track lookup and collision checks preserve every existing key', () => {
  const project = demoProject();
  project.duration = 36_000;
  const keys = Array.from({ length: 36_001 }, (_, i) => key(i, i));
  project.tracks.character = keys;
  assert.equal(lowerFrame(keys, 500.5), 501);
  assert.equal(upperFrame(keys, 1500), 1501);
  const source = [{ track: 'character', frame: 18000 }];
  assert.equal(moveKeys(project, source, 1), project);
  assert.equal(pasteKeys(project, copyKeys(project, source), 20_000), project);
  assert.equal(project.tracks.character.length, 36_001);
});

test('imported root travel composes with character facing and survives a frame-rate change', () => {
  const scene = demoProject();
  scene.fps = 48;
  scene.tracks.character = [];
  const actor = scene.objects.find((object) => object.id === 'character')!;
  actor.transform = { ...identity(), rotation: [0, Math.PI / 2, 0] };
  const clip: MotionClip = {
    id: 'foreign',
    name: 'Root travel',
    duration: 24,
    sourceFps: 24,
    tracks: {
      root: [
        { ...identity(), frame: 0, interpolation: 'linear' },
        { ...identity(), frame: 24, position: [0, 0, 2], interpolation: 'linear' },
      ],
    },
  };
  const result = applyMotion(scene, actor.id, clip, 0, 1, 1, 1);
  const end = result.tracks[actor.id].at(-1)!;
  assert.equal(end.frame, 48);
  assert.ok(Math.abs(end.position[0] - 3) < 1e-8);
  assert.ok(Math.abs(end.position[2]) < 1e-8);
  assert.doesNotThrow(() => validateProject(result));
});
