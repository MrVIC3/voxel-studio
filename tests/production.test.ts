import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMotion, captureMotion, mirrorPose, presetMotion } from '../src/motion';
import { descendants, hierarchyRows, removeObjects } from '../src/scene-tools';
import { demoProject, getTransform, identity, validateProject } from '../src/model';
import { cameraAtFrame } from '../src/sequence';
import { effectDefaults, particleState } from '../src/engine/effects';
import { solveTwoBone } from '../src/engine/ik';
import { Vector3 } from 'three';
import * as THREE from 'three';
import {characterMesh} from '../src/engine/assets';
test('motion presets produce valid editable looping animation and extend the scene', () => {
  for (const name of ['Walk', 'Run', 'Jump', 'Sword Slash', 'Wave'] as const) {
    const p = applyMotion(demoProject(), 'character', presetMotion(name), 110, 2, 1, 3);
    assert.doesNotThrow(() => validateProject(p), name);
    assert.ok(p.duration > 120);
    assert.ok(p.tracks['character/rightArm'].length > 4);
    assert.equal(p.tracks['character/rightArm'].at(-1)!.frame, p.duration);
  }
});
test('camera cuts switch at exact frames and invalid cameras are rejected', () => {
  const p = demoProject(),
    first = p.objects.find((o) => o.type === 'camera')!;
  p.objects.push({ ...first, id: 'closeup' });
  p.shots = [
    { id: 'a', name: 'Wide', frame: 0, cameraId: first.id },
    { id: 'b', name: 'Close', frame: 30, cameraId: 'closeup' },
  ];
  assert.equal(cameraAtFrame(p, 29), first.id);
  assert.equal(cameraAtFrame(p, 30), 'closeup');
  assert.doesNotThrow(() => validateProject(p));
  p.shots[1].cameraId = 'missing';
  assert.throws(() => validateProject(p), /camera cut/);
});
test('particle effects are deterministic across seeking and disappear outside their interval', () => {
  for (const kind of ['sparks', 'embers', 'ring', 'vortex'] as const) {
    const effect = { ...effectDefaults, kind };
    assert.deepEqual(particleState(effect, 15, 12), particleState(effect, 15, 12));
    assert.equal(particleState(effect, 15, -1).alpha, 0);
    assert.equal(particleState(effect, 15, 100).alpha, 0);
    assert.ok(particleState(effect, 15, 12).position.every(Number.isFinite));
  }
});
test('two-bone IK preserves bone lengths and remains stable at unreachable targets', () => {
  const start = new Vector3(0, 1.5, 0),
    pole = new Vector3(0, 1, -1);
  for (const target of [
    new Vector3(0.2, 1, -0.3),
    new Vector3(0, 1.5, 0),
    new Vector3(100, 10, 0),
  ]) {
    const solution = solveTwoBone(start, target, pole, 0.375, 0.375);
    assert.ok(Math.abs(solution.elbow.distanceTo(start) - 0.375) < 1e-6);
    assert.ok(Math.abs(solution.end.distanceTo(solution.elbow) - 0.375) < 1e-6);
    assert.ok(solution.end.toArray().every(Number.isFinite));
  }
});
test('asynchronously loaded skins preserve the rig rest height before and after posing',async()=>{
  const original=THREE.TextureLoader.prototype.load,texture=new THREE.Texture();texture.image={width:64,height:64};let loaded:()=>void=()=>{};
  THREE.TextureLoader.prototype.load=function(_url,onLoad){loaded=()=>onLoad?.(texture);return texture;};
  try{const spec={...demoProject().objects.find(o=>o.type==='character')!,skin:'data:image/png;base64,test'},root=characterMesh(spec,()=>{}),body=root.getObjectByName('body')!;
    assert.equal(body.userData.rest.y,.75);body.position.set(0,.6,0);loaded();await root.userData.ready;assert.equal(body.userData.rest.y,.75);
    body.position.copy(body.userData.rest);root.updateMatrixWorld(true);const foot=root.getObjectByName('leftFoot')!.getWorldPosition(new THREE.Vector3());assert.ok(Math.abs(foot.y)<1e-8,'neutral feet must sit at the character origin');
  }finally{THREE.TextureLoader.prototype.load=original;}
});
test('limb joint surfaces stay attached at both ends after bending and twisting', async () => {
  const original = THREE.TextureLoader.prototype.load;
  THREE.TextureLoader.prototype.load = function (_url, onLoad) {
    const texture = new THREE.Texture();
    texture.image = { width: 64, height: _url === 'armor' ? 32 : 64 };
    queueMicrotask(() => onLoad?.(texture));
    return texture;
  };
  try {
    const spec = {...demoProject().objects.find(o=>o.type==='character')!,skin:'test',
      armor:{body:'iron',legs:'iron'} as const,characterLayers:{sleeves:{visible:false,offset:.35}}};
    const root = characterMesh(spec,()=>{},undefined,()=> 'armor');
    await root.userData.ready;
    for (const name of ['rightArm','leftLeg','rightForearm','leftShin']) {
      const node = root.getObjectByName(name)!;
      node.rotation.set(1.72,.57,-.85);
    }
    root.userData.updateJoints();
    root.updateMatrixWorld(true);
    for (const name of ['rightArm Socket Surface','leftLeg Socket Surface','rightForearm Joint Surface','leftShin Joint Surface']) {
      const joints:THREE.Mesh[]=[];
      root.traverse(node=>{ if(node instanceof THREE.Mesh && node.name===name)joints.push(node); });
      assert.equal(joints.length,3);
      for (const joint of joints) {
        if(joint.userData.characterLayer==='sleeves') assert.equal(joint.visible,false);
        const rigNode=root.getObjectByName(joint.userData.bone)!;
        const position=joint.geometry.getAttribute('position');
        const vertex=(i:number)=>joint.localToWorld(new THREE.Vector3().fromBufferAttribute(position,i));
        const candidates=rigNode.children.filter((node):node is THREE.Mesh=>node instanceof THREE.Mesh && !node.name);
        const attached = candidates.some(mesh=>{
          const points=mesh.geometry.getAttribute('position');
          return [4,5,10,11,16,17,22,23].every(index=>{
            const boundary=vertex(index);
            for(let i=0;i<points.count;i++)
              if (boundary.distanceTo(mesh.localToWorld(new THREE.Vector3().fromBufferAttribute(points,i)))<1e-6) return true;
            return false;
          });
        });
        assert.ok(attached,`${name} must meet all four textured edges of the rotated segment`);
        assert.ok(position.array.every(Number.isFinite));
      }
    }
  } finally { THREE.TextureLoader.prototype.load = original; }
});
test('captured motion retargets onto another character and stays in saved projects', () => {
  const p = applyMotion(demoProject(), 'character', presetMotion('Run'), 0, 2);
  const clip = captureMotion(p, 'character', 0, 32, 'Sprint');
  p.motionClips = [clip];
  p.objects.push({
    ...p.objects.find((o) => o.id === 'character')!,
    id: 'second',
    transform: identity(),
  });
  const result = applyMotion(p, 'second', clip, 40);
  assert.equal(result.tracks['second/leftLeg'][0].frame, 40);
  assert.equal(result.tracks['second/leftLeg'].at(-1)!.frame, 72);
  assert.equal(validateProject(JSON.parse(JSON.stringify(result))).motionClips![0].name, 'Sprint');
});
test('mirroring a pose twice restores all channels', () => {
  const p = applyMotion(demoProject(), 'character', presetMotion('Sword Slash'), 0);
  const once = mirrorPose(p, 'character', 6, true),
    twice = mirrorPose(once, 'character', 6, true);
  for (const bone of ['body', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const) {
    const actual = getTransform(twice, { id: 'character', bone }, 6),
      expected = getTransform(p, { id: 'character', bone }, 6);
    assert.deepEqual(actual.rotation, expected.rotation);
    assert.deepEqual(actual.position, expected.position);
  }
});
test('parenting rejects cycles and invalid bone attachments; deleting groups removes descendants', () => {
  const p = demoProject();
  p.objects.push({
    id: 'group',
    name: 'Group',
    type: 'group',
    visible: true,
    transform: identity(),
  });
  p.objects.find((o) => o.id === 'character')!.parentId = 'group';
  p.objects.push({
    id: 'prop',
    name: 'Prop',
    type: 'block',
    visible: true,
    transform: identity(),
    parentId: 'character',
    parentBone: 'rightArm',
  });
  assert.doesNotThrow(() => validateProject(p));
  assert.ok(descendants(p.objects, 'group').has('prop'));
  assert.equal(hierarchyRows(p.objects).find((o) => o.object.id === 'prop')!.depth, 2);
  const removed = removeObjects(p, new Set(['group']));
  assert.ok(!removed.objects.some((o) => o.id === 'prop'));
  assert.ok(!Object.keys(removed.tracks).some((t) => t.startsWith('character')));
  assert.doesNotThrow(() => validateProject(removed));
  p.objects.find((o) => o.id === 'group')!.parentId = 'prop';
  assert.throws(() => validateProject(p), /cycle/);
});
