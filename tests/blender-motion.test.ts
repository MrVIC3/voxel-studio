import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Euler, Quaternion, Vector3 } from 'three';
import { parseGltfMotion, sampleChannel } from '../src/blender/gltf';
import type { GltfNode, MotionChannel } from '../src/blender/gltf';
import { bakeMotionAction, listMotionRigs, motionActionNames } from '../src/blender/retarget';
import { demoProject, emptyProject, evaluate, identity, validateProject } from '../src/model';
import type { MotionClip } from '../src/model';
import { applyMotion, presetMotion } from '../src/motion';

const asset = readFileSync(new URL('../src/blender/voxel-motion-library.glb', import.meta.url));
const source = parseGltfMotion(asset);

test('Blender-authored library retargets 21 separate editable body and face actions', () => {
  const json = JSON.parse(asset.toString('utf8', 20, 20 + asset.readUInt32LE(12)));
  assert.match(json.asset.generator, /Blender/i);
  assert.equal(source.document.animations.length, 21);
  assert.equal(Object.keys(listMotionRigs(source)[0].mapping).length, 15);
  const clips = motionActionNames(source).map(({ index }) =>
    bakeMotionAction(source, index, { fps: 24 }),
  );
  assert.ok(
    clips.every(
      (clip) =>
        clip.faceKeys?.length && clip.tracks.leftHand?.length && clip.tracks.rightFoot?.length,
    ),
  );
  assert.ok(clips.every((clip) => clip.sourceFps === 24));
  assert.doesNotThrow(() => validateProject({ ...emptyProject(), motionClips: clips }));
  const find = (name: string) => clips.find((clip) => clip.name.includes(name))!;
  assert.ok(Math.max(...find('Dialogue').faceKeys!.map((key) => key.pose.jaw)) > 0.6);
  assert.equal(Math.max(...find('Idle').faceKeys!.map((key) => key.pose.blink)), 1);
  assert.ok(Math.max(...find('Vault').tracks.root!.map((key) => key.position[1])) > 0.68);
  assert.equal(find('Vault').tracks.root!.at(-1)!.position[2], 0.76);
  assert.equal(bakeMotionAction(source, 0, { fps: 48 }).duration, 192);
});

function ankleAt(clip: MotionClip, side: 'left' | 'right', frame: number) {
  const position = new Vector3(),
    rotation = new Quaternion();
  const sign = side === 'left' ? 1 : -1;
  const chain = [
    ['root', [0, 0, 0]],
    ['body', [0, 0.75, 0]],
    [side + 'Leg', [sign * 0.125, 0, 0]],
    [side + 'Shin', [0, -0.375, 0]],
    [side + 'Foot', [0, -0.375, 0]],
  ] as const;
  for (const [joint, offset] of chain) {
    const t = evaluate(clip.tracks[joint as keyof MotionClip['tracks']], frame, identity());
    position.add(new Vector3(...offset).add(new Vector3(...t.position)).applyQuaternion(rotation));
    rotation.multiply(new Quaternion().setFromEuler(new Euler(...t.rotation)));
  }
  return position;
}

test('stationary performances keep both feet grounded through their interpolated poses', () => {
  for (const index of [0, 4, 5, 6, 7, 12, 13, 14, 15, 16, 17, 18]) {
    const clip = bakeMotionAction(source, index, { fps: 24 });
    for (const side of ['left', 'right'] as const)
      for (let frame = 0; frame <= clip.duration; frame++)
        assert.ok(
          Math.abs(ankleAt(clip, side, frame).y) < 0.032,
          `${clip.name}, ${side} foot at ${frame}`,
        );
  }
});

test('walk, run and stealth land on a stable contact and match at their loop seams', () => {
  for (const [index, stance] of [
    [1, 14],
    [2, 4],
    [3, 22],
  ]) {
    const clip = bakeMotionAction(source, index, { fps: 24 });
    const contact = ankleAt(clip, 'left', 0);
    for (let f = 1; f <= stance; f++)
      assert.ok(
        ankleAt(clip, 'left', f).distanceTo(contact) < 0.014,
        `${clip.name} planted foot at ${f}`,
      );
    assert.ok(Math.abs(contact.y) < 0.014);
    const right = ankleAt(clip, 'right', clip.duration / 2);
    for (let f = 1; f <= stance; f++) {
      const frame = (clip.duration / 2 + f) % clip.duration;
      const ankle = ankleAt(clip, 'right', frame);
      if (frame < clip.duration / 2) ankle.z += clip.tracks.root!.at(-1)!.position[2];
      assert.ok(ankle.distanceTo(right) < 0.014, `${clip.name} opposite foot at ${f}`);
    }
    const stride = clip.tracks.root!.at(-1)!.position[2];
    for (const side of ['left', 'right'] as const)
      assert.ok(
        ankleAt(clip, side, clip.duration)
          .sub(new Vector3(0, 0, stride))
          .distanceTo(ankleAt(clip, side, 0)) < 0.002,
      );
  }
});

test('the built-in run matches Blender and has two clear flight phases per cycle', () => {
  const run = presetMotion('Run');
  const authored = bakeMotionAction(source, 2, { fps: 24 });
  assert.deepEqual(run.tracks, authored.tracks);
  assert.deepEqual(run.faceKeys, authored.faceKeys);
  const flight = (frame: number) =>
    Math.min(ankleAt(run, 'left', frame).y, ankleAt(run, 'right', frame).y);
  assert.ok(flight(6) > 0.20);
  assert.ok(flight(14) > 0.20);
  assert.ok(Math.abs(flight(0)) < 0.005);
  assert.ok(Math.abs(flight(8)) < 0.005);
  assert.ok(run.tracks.root!.at(-1)!.position[2] > 2.25);
  for (const side of ['left','right'] as const) {
    let backswing = 0;
    const flex = [];
    for (let frame=0;frame<=run.duration;frame++) {
      const rotation = (joint:keyof MotionClip['tracks']) =>
        new Quaternion().setFromEuler(new Euler(...evaluate(run.tracks[joint],frame,identity()).rotation));
      const upper = rotation('body').multiply(rotation(side+'Arm'));
      const lower = upper.clone().multiply(rotation(side+'Forearm'));
      const elbow = new Vector3(0,-.375,0).applyQuaternion(upper);
      const hand = elbow.clone().add(new Vector3(0,-.375,0).applyQuaternion(lower));
      backswing = Math.min(backswing,elbow.z);
      const bend = elbow.angleTo(hand.clone().sub(elbow));
      assert.ok(bend > .08 && bend < .27, `${side} elbow should bend only slightly at frame ${frame}`);
      flex.push(bend);
    }
    assert.ok(backswing < -.23, 'each elbow drives back through the stride');
    assert.ok(Math.max(...flex)-Math.min(...flex)>.15, 'the elbow should flex through the stride');
  }
});

test('repeating an imported walk carries its stride through each cycle and preserves scene facing', () => {
  const scene = demoProject();
  const actor = scene.objects.find((o) => o.type === 'character')!;
  actor.transform = { ...identity(), rotation: [0, Math.PI / 2, 0] };
  scene.tracks[actor.id] = [];
  const clip = bakeMotionAction(source, 1, { fps: 24 });
  const result = applyMotion(scene, actor.id, clip, 0, 3);
  const track = result.tracks[actor.id];
  const stride = clip.tracks.root!.at(-1)!.position[2];
  for (let cycle = 1; cycle <= 3; cycle++) {
    const position = evaluate(track, clip.duration * cycle, identity()).position;
    assert.ok(Math.abs(position[0] - stride * cycle) < 0.001);
    assert.ok(Math.abs(position[2]) < 0.001);
  }
});

test('repeated quarter turns retain continuous root angles through 180 degrees', () => {
  const scene = demoProject();
  const actor = scene.objects.find((o) => o.type === 'character')!;
  actor.transform = identity();
  scene.tracks[actor.id] = [];
  const clip = bakeMotionAction(source, 20, { fps: 24 });
  const track = applyMotion(scene, actor.id, clip, 0, 3).tracks[actor.id];
  const rotation = track.at(-1)!.rotation;
  assert.ok(Math.abs(rotation[1] - (3 * Math.PI) / 2) < 0.001);
  assert.ok(
    track.every(
      (k, i) => !i || Math.hypot(...k.rotation.map((n, j) => n - track[i - 1].rotation[j])) < 0.2,
    ),
  );
});

type Spec = {
  node: number;
  path: 'translation' | 'rotation' | 'weights';
  times: number[];
  data: number[];
};
function externalFixture(nodes: GltfNode[], specs: Spec[], meshes: unknown[] = []) {
  const bufferViews: { buffer: number; byteOffset: number; byteLength: number }[] = [],
    accessors: unknown[] = [],
    arrays: Buffer[] = [];
  let length = 0;
  const add = (values: number[], type: string, components: number) => {
    const data = Buffer.alloc(values.length * 4);
    values.forEach((value, i) => data.writeFloatLE(value, i * 4));
    const bufferView = bufferViews.length,
      index = accessors.length;
    arrays.push(data);
    bufferViews.push({ buffer: 0, byteOffset: length, byteLength: data.length });
    length += data.length;
    accessors.push({ bufferView, componentType: 5126, type, count: values.length / components });
    return index;
  };
  const samplers = specs.map((spec) => ({
    input: add(spec.times, 'SCALAR', 1),
    output: add(
      spec.data,
      spec.path === 'weights' ? 'SCALAR' : spec.path === 'rotation' ? 'VEC4' : 'VEC3',
      spec.path === 'weights' ? 1 : spec.path === 'rotation' ? 4 : 3,
    ),
  }));
  const json = {
    asset: { version: '2.0' },
    nodes,
    meshes,
    buffers: [{ uri: 'motion.bin', byteLength: length }],
    bufferViews,
    accessors,
    animations: [
      {
        name: 'Retarget fixture',
        samplers,
        channels: specs.map((spec, i) => ({
          sampler: i,
          target: { node: spec.node, path: spec.path },
        })),
      },
    ],
  };
  return {
    json,
    bytes: new TextEncoder().encode(JSON.stringify(json)),
    bin: Buffer.concat(arrays),
  };
}

test('retargets foreign T-pose bones and folds extra spine animation into mapped controls', () => {
  const turn = (angle: number) =>
    new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), angle).toArray();
  const y = (angle: number) =>
    new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), angle).toArray();
  const fixture = externalFixture(
    [
      { name: 'Armature', children: [1] },
      { name: 'mixamorig:Hips', translation: [0, 0.75, 0], children: [2] },
      { name: 'UpperSpine', children: [3, 4, 6] },
      { name: 'Head', translation: [0, 0.75, 0] },
      { name: 'mixamorig:LeftArm', translation: [0.375, 0.75, 0], children: [5] },
      { name: 'mixamorig:LeftForeArm', translation: [0.375, 0, 0] },
      { name: 'mixamorig:RightArm', translation: [-0.375, 0.75, 0], children: [7] },
      { name: 'mixamorig:RightForeArm', translation: [-0.375, 0, 0] },
    ],
    [
      { node: 2, path: 'rotation', times: [0, 1], data: [...y(0), ...y(0.3)] },
      { node: 4, path: 'rotation', times: [0, 1], data: [...turn(-Math.PI / 2), ...turn(0)] },
    ],
  );
  assert.throws(
    () => bakeMotionAction(parseGltfMotion(fixture.bytes), 0, { fps: 24 }),
    /companion/,
  );
  const parsed = parseGltfMotion(fixture.bytes, new Map([['motion.bin', fixture.bin]]));
  const clip = bakeMotionAction(parsed, 0, { fps: 24 });
  assert.ok(clip.tracks.leftArm![0].rotation.every((value) => Math.abs(value) < 1e-5));
  assert.ok(Math.abs(clip.tracks.head!.at(-1)!.rotation[1] - 0.3) < 1e-5);
  assert.ok(clip.tracks.leftForearm!.at(-1)!.rotation.every((value) => Math.abs(value) < 1e-5));
  const manually = bakeMotionAction(parsed, 0, { fps: 24, mapping: { head: null } });
  assert.equal(manually.tracks.head, undefined);
  assert.throws(
    () => bakeMotionAction(parsed, 0, { fps: 24, mapping: { head: 4 } }),
    /more than one control/,
  );
});

test('keeps vertical movement when making a clip in place and maps independent facial shapes', () => {
  const fixture = externalFixture(
    [
      { name: 'VoxelRoot', children: [1] },
      { name: 'Body', translation: [0, 0.75, 0], children: [2] },
      { name: 'Head', translation: [0, 0.75, 0], children: [3] },
      { name: 'Face', mesh: 0 },
    ],
    [
      { node: 0, path: 'translation', times: [3, 4], data: [4, 0, 2, 6, 0.5, 7] },
      { node: 3, path: 'weights', times: [3, 4], data: [0, 0, 0, 0.75, 0.6, 1] },
    ],
    [{ extras: { targetNames: ['VoxelLookX', 'JawOpen', 'EyeBlinkLeft'] } }],
  );
  const parsed = parseGltfMotion(fixture.bytes, new Map([['motion.bin', fixture.bin]]));
  const clip = bakeMotionAction(parsed, 0, { fps: 12, inPlace: true });
  assert.equal(clip.duration, 12);
  assert.deepEqual(clip.tracks.root?.[0].position, [0, 0, 0]);
  assert.deepEqual(clip.tracks.root?.at(-1)?.position, [0, 0.5, 0]);
  assert.equal(clip.faceKeys?.at(-1)?.pose.lookX, 0.75);
  assert.equal(clip.faceKeys?.at(-1)?.pose.blink, 1);
  assert.equal(clip.faceKeys?.at(-1)?.pose.jaw, 0.6);
});

test('converts eye and jaw bone rotations into independent facial keys', () => {
  const eye = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 12).toArray();
  const jaw = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 6).toArray();
  const fixture = externalFixture(
    [
      { name: 'body', children: [1] },
      { name: 'head', children: [2, 3, 4] },
      { name: 'DEF-eye.L' },
      { name: 'DEF-eye.R' },
      { name: 'DEF-jaw' },
    ],
    [
      { node: 2, path: 'rotation', times: [0, 1], data: [0, 0, 0, 1, ...eye] },
      { node: 3, path: 'rotation', times: [0, 1], data: [0, 0, 0, 1, ...eye] },
      { node: 4, path: 'rotation', times: [0, 1], data: [0, 0, 0, 1, ...jaw] },
    ],
  );
  const parsed = parseGltfMotion(fixture.bytes, new Map([['motion.bin', fixture.bin]]));
  const clip = bakeMotionAction(parsed, 0, { fps: 24 });
  assert.deepEqual(clip.tracks, {});
  assert.equal(clip.faceKeys?.at(-1)?.pose.lookX, 0.5);
  assert.equal(clip.faceKeys?.at(-1)?.pose.lookY, 0);
  assert.equal(clip.faceKeys?.at(-1)?.pose.jaw, 1);
});

test('samples glTF cubic and step interpolation without introducing unwanted linear motion', () => {
  const channel: MotionChannel = {
    node: 0,
    path: 'weights',
    times: Float32Array.from([0, 2]),
    components: 1,
    interpolation: 'CUBICSPLINE',
    values: Float32Array.from([0, 0, 1, 0, 1, 0]),
  };
  const out: number[] = [];
  sampleChannel(channel, 1, out);
  assert.equal(out[0], 0.75); // Hermite tangents are per second.
  sampleChannel({ ...channel, interpolation: 'STEP', values: Float32Array.from([0, 1]) }, 1.9, out);
  assert.equal(out[0], 0);
  sampleChannel({ ...channel, interpolation: 'STEP', values: Float32Array.from([0, 1]) }, 2, out);
  assert.equal(out[0], 1);
});
