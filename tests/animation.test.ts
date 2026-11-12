import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNumber } from '../src/numbers';
import { cubicEase, easePresets } from '../src/curves';
import { demoProject, evaluate, identity, insertKey, validateProject } from '../src/model';
import type { Keyframe } from '../src/model';
import {
  copyKeys,
  moveKeys,
  pasteKeys,
  deleteKeys,
  faceTrackId,
  pasteKeyBatch,
} from '../src/key-tools';
import { defaultFaceRig, neutralFace } from '../src/face';
import { applyMotion } from '../src/motion';

test('continuous pose curves preserve velocity at subframes and keep explicit holds', () => {
  const keys: Keyframe[] = [0, 1, 2].map((frame) => ({
    ...identity(),
    frame,
    position: [frame, 0, 0],
    interpolation: 'spline',
  }));
  assert.ok(evaluate(keys, 0.99, identity()).position[0] < 0.991);
  assert.ok(evaluate(keys, 1.01, identity()).position[0] > 1.009);
  keys[0].interpolation = 'step';
  assert.equal(evaluate(keys, 0.99, identity()).position[0], 0);
  assert.equal(evaluate(keys, 1, identity()).position[0], 1);
});

test('speeding up a dense motion samples source time instead of overwriting colliding keys', () => {
  const keys: Keyframe[] = [0, 1, 2, 3, 4].map((frame) => ({
    ...identity(),
    frame,
    position: [frame, 0, 0],
    interpolation: 'linear',
  }));
  const next = applyMotion(
    demoProject(),
    'character',
    { id: 'fast', name: 'Fast', duration: 4, tracks: { head: keys } },
    0,
    1,
    2,
  );
  assert.deepEqual(
    next.tracks['character/head'].map((key) => key.position[0]),
    [0, 2, 4],
  );
});
test('numeric fields accept bounded arithmetic without executing code', () => {
  assert.equal(parseNumber('90/2'), 45);
  assert.equal(parseNumber('-(2 + 3)*4'), -20);
  assert.equal(parseNumber('0,25 + .5'), 0.75);
  assert.equal(parseNumber('pi*2'), Math.PI * 2);
  for (const input of ['1/0', 'alert(1)', 'Math.PI', '2**3', '2 +', '()', '1;2'])
    assert.equal(parseNumber(input), null, input);
});
test('Bezier timing is evaluated per channel and supports anticipation and overshoot', () => {
  const a: Keyframe = {
      ...identity(),
      frame: 0,
      interpolation: 'bezier',
      curves: { 'position.x': easePresets['Overshoot'], 'position.y': easePresets['Linear'] },
    },
    b: Keyframe = { ...identity(), position: [10, 10, 0], frame: 10, interpolation: 'linear' };
  assert.ok(evaluate([a, b], 8, identity()).position[0] > 10);
  assert.equal(evaluate([a, b], 5, identity()).position[1], 5);
  assert.ok(cubicEase(0.15, easePresets.Anticipation) < 0);
  assert.equal(cubicEase(0, easePresets['Ease In']), 0);
  assert.equal(cubicEase(1, easePresets['Ease In']), 1);
});
test('editing an existing key preserves its custom curves', () => {
  const p = demoProject();
  p.tracks.character = [
    {
      ...identity(),
      frame: 0,
      interpolation: 'bezier',
      curves: { 'position.x': easePresets['Overshoot'] },
    },
  ];
  const next = insertKey(
    p,
    { id: 'character' },
    0,
    { ...identity(), position: [2, 0, 0] },
    'smooth',
  );
  assert.equal(next.tracks.character[0].interpolation, 'bezier');
  assert.deepEqual(next.tracks.character[0].curves, p.tracks.character[0].curves);
});
test('project validation rejects unsafe or invalid curve handles', () => {
  const p = demoProject();
  p.tracks.character = [
    { ...identity(), frame: 0, interpolation: 'bezier', easing: [0.2, 0, 0.8, 1] },
  ];
  assert.doesNotThrow(() => validateProject(p));
  for (const easing of [
    [2, 0, 0.8, 1],
    [0.2, Infinity, 0.8, 1],
    [0.2, 0, 0.8],
  ])
    assert.throws(() =>
      validateProject({ ...p, tracks: { character: [{ ...p.tracks.character[0], easing }] } }),
    );
});
test('batch key editing keeps timing and curves intact and rejects collisions', () => {
  const p = demoProject(),
    track = 'character/rightArm',
    refs = [
      { track, frame: 36 },
      { track, frame: 54 },
    ],
    copied = copyKeys(p, refs);
  const moved = moveKeys(p, refs, 2);
  assert.ok(moved.tracks[track].some((k) => k.frame === 38));
  assert.ok(moved.tracks[track].some((k) => k.frame === 56));
  assert.equal(
    moveKeys(p, [{ track, frame: 36 }], 18),
    p,
    'existing keys must not be silently overwritten by group moves',
  );
  const pasted = pasteKeys(p, copied, 140);
  assert.equal(pasted.duration, 158);
  assert.ok(pasted.tracks[track].some((k) => k.frame === 140));
  assert.equal(deleteKeys(p, refs).tracks[track].length, p.tracks[track].length - 2);
  assert.doesNotThrow(() => validateProject(pasted));
});

test('mixed facial and pose keys can be moved and pasted to another character as one edit', () => {
  const p = demoProject(),
    actor = p.objects.find((o) => o.id === 'character')!;
  p.objects.push({ ...actor, id: 'stand-in', name: 'Stand-in', face: undefined });
  p.faceTracks = {
    character: [{ frame: 40, interpolation: 'smooth', pose: { ...neutralFace, blink: 1 } }],
  };
  const refs = [
    { track: 'character/rightArm', frame: 36 },
    { track: faceTrackId('character'), frame: 40 },
  ];
  const copied = copyKeys(p, refs);
  const moved = moveKeys(p, refs, 5);
  assert.equal(moved.faceTracks?.character[0].frame, 45);
  assert.ok(moved.tracks['character/rightArm'].some((k) => k.frame === 41));
  const result = pasteKeyBatch(p, copied, 90, { target: 'stand-in', character: true });
  assert.deepEqual(
    result.keys.map((k) => [k.track, k.frame]),
    [
      ['stand-in/rightArm', 90],
      ['stand-in/face', 94],
    ],
  );
  assert.equal(result.project.faceTracks?.['stand-in'][0].pose.blink, 1);
  assert.deepEqual(result.project.objects.find((o) => o.id === 'stand-in')?.face, {
    ...defaultFaceRig,
    enabled: true,
  });
  assert.doesNotThrow(() => validateProject(result.project));
  assert.equal(pasteKeyBatch(p, copied, 36).project, p);
  assert.equal(pasteKeyBatch(p, copied, 36, { replace: true }).replaced, 2);
  assert.deepEqual(deleteKeys(p, refs).faceTracks?.character, []);
});
