import assert from 'node:assert/strict';
import test from 'node:test';
import { demoProject, getTransform, identity, validateProject } from '../src/model';
import { createStage, editVoxel, routeKeys } from '../src/staging';
import { applyMotion, presetMotion } from '../src/motion';
import { shotAtFrame } from '../src/sequence';

test('movement control preserves prior root animation and gets a separate editable path', () => {
  const project = demoProject();
  const actor = project.objects.find((o) => o.type === 'character')!;
  project.tracks[actor.id] = [
    { ...identity(), position: [2, 1, 0], frame: 0, interpolation: 'linear' },
    { ...identity(), position: [6, 1, 0], frame: 24, interpolation: 'linear' },
  ];
  const staged = createStage(project, actor, 12, 'movement');
  const base = getTransform(staged, { id: 'movement' }, 12);
  assert.deepEqual(base.position, [4, 1, 0]);
  for (const frame of [0, 12, 24]) {
    const old = getTransform(project, { id: actor.id }, frame).position;
    assert.deepEqual(
      getTransform(staged, { id: actor.id }, frame).position.map((n, i) => n + base.position[i]),
      old,
    );
  }
  const track = routeKeys(
    [
      [4, 1, 0],
      [5, 1, 0],
      [5, 1, 3],
    ],
    12,
    24,
    { ...base, frame: 12, interpolation: 'linear' },
    0,
  );
  assert.deepEqual(
    track.map((key) => key.frame),
    [12, 18, 36],
  );
  staged.tracks.movement = track;
  const animated = applyMotion(staged, actor.id, presetMotion('Walk'), 12, 1, 1, 0, false);
  assert.equal(animated.tracks.movement, track);
  assert.equal(animated.tracks[actor.id], staged.tracks[actor.id]);
  assert.ok(animated.tracks[actor.id + '/leftLeg'].length);
  assert.doesNotThrow(() => validateProject(animated));
});

test('placing, replacing and removing a schematic block are independent, undoable updates', () => {
  const project = demoProject();
  const build = project.objects.find((o) => o.type === 'build')!;
  const [x, y, z] = build.voxels!.blocks[0];
  assert.equal(editVoxel(project, build.id, [x, y, z], 'minecraft:glass', 'place'), project);
  const replaced = editVoxel(project, build.id, [x, y, z], 'minecraft:glass', 'replace');
  const data = replaced.objects.find((o) => o.id === build.id)!.voxels!;
  assert.equal(data.blocks.length, build.voxels!.blocks.length);
  assert.equal(data.palette[data.blocks[0][3]], 'minecraft:glass');
  const removed = editVoxel(replaced, build.id, [x, y, z], undefined, 'remove');
  const placed = editVoxel(removed, build.id, [x, y, z], 'minecraft:stone', 'place');
  assert.equal(
    removed.objects.find((o) => o.id === build.id)!.voxels!.blocks.length,
    data.blocks.length - 1,
  );
  assert.doesNotThrow(() => validateProject(placed));
});

test('lighting snapshots are selected by cut and validated on reopen', () => {
  const project = demoProject();
  const camera = project.objects.find((o) => o.type === 'camera')!;
  project.shots = [
    { id: 'one', name: 'One', frame: 0, cameraId: camera.id },
    {
      id: 'two',
      name: 'Two',
      frame: 24,
      cameraId: camera.id,
      lighting: { ...project.lighting, exposure: 2 },
    },
  ];
  assert.equal(shotAtFrame(project, 23)?.lighting, undefined);
  assert.equal(shotAtFrame(validateProject(project), 24)?.lighting?.exposure, 2);
  project.shots[1].lighting!.exposure = Infinity;
  assert.throws(() => validateProject(project), /lighting/);
});
