import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultCameraEffects,
  sampleCameraEffects,
  validCameraEffects,
} from '../src/camera-effects';
import { designCameraMove } from '../src/camera-rail';
import { demoProject, identity, validateProject } from '../src/model';

test('camera shake and timed impacts are deterministic across seeks and stop at their bounds', () => {
  const fx = structuredClone(defaultCameraEffects);
  fx.shake.style = 'handheld';
  fx.events = [{ id: 'strike', kind: 'impact', start: 16, duration: 12, strength: 1 }];
  const impact = sampleCameraEffects(fx, 16, 24);
  const before = sampleCameraEffects(fx, 15.9, 24);
  assert.ok(impact.y < before.y - 0.1);
  sampleCameraEffects(fx, 48, 24);
  assert.deepEqual(sampleCameraEffects(fx, 16, 24), impact);
  assert.deepEqual(
    sampleCameraEffects(fx, 28, 24),
    sampleCameraEffects({ ...fx, events: [] }, 28, 24),
  );
});

test('fades hold through the cut and rack focus keeps the destination after the event', () => {
  const fx = structuredClone(defaultCameraEffects);
  fx.events = [
    { id: 'out', kind: 'fadeOut', start: 10, duration: 10, strength: 1 },
    { id: 'in', kind: 'fadeIn', start: 35, duration: 10, strength: 1, color: '#ff0000' },
    { id: 'rack', kind: 'focus', start: 12, duration: 8, strength: 1, distance: 2 },
  ];
  assert.equal(sampleCameraEffects(fx, 15, 24).fade, 0.5);
  assert.equal(sampleCameraEffects(fx, 31, 24).fade, 1);
  assert.equal(sampleCameraEffects(fx, 40, 24).fadeColor, '#ff0000');
  assert.equal(sampleCameraEffects(fx, 47, 24).fade, 0);
  assert.equal(sampleCameraEffects(fx, 16, 24).focusDistance, 3);
  assert.equal(sampleCameraEffects(fx, 31, 24).focusDistance, 2);
});

test('camera and cut effects survive project validation and reject malformed ranges', () => {
  const project = demoProject();
  project.objects.push({
    id: 'camera-fx',
    name: 'Camera',
    visible: true,
    type: 'camera',
    transform: identity(),
    cameraEffects: defaultCameraEffects,
  });
  project.shots = [
    {
      id: 'cut-fx',
      cameraId: 'camera-fx',
      name: 'Cut',
      frame: 0,
      cameraEffects: {
        ...defaultCameraEffects,
        events: [{ id: 'fade', kind: 'fadeIn', start: 0, duration: 12, strength: 1 }],
      },
    },
  ];
  assert.deepEqual(
    validateProject(JSON.parse(JSON.stringify(project))).shots?.[0].cameraEffects,
    project.shots[0].cameraEffects,
  );
  assert.equal(
    validCameraEffects({
      ...defaultCameraEffects,
      events: [{ id: 'x', kind: 'zoom', start: 36000, duration: 9, strength: 1 }],
    }),
    false,
  );
});

test('dolly zoom compensates focal angle for the change in subject distance', () => {
  const keys = designCameraMove('dolly', [0, 0, 0], [0, 0, 10], 1, 0, 48, 38);
  const projection = keys.map(
    (key) => Math.hypot(...key.position) * Math.tan((key.fov! * Math.PI) / 360),
  );
  assert.ok(keys.at(-1)!.fov! > keys[0].fov!);
  assert.ok(projection.every((value) => Math.abs(value - projection[0]) < 1e-7));
});
