import { readFileSync, writeFileSync } from 'node:fs';
import { parseGltfMotion } from '../src/blender/gltf';
import { bakeMotionAction } from '../src/blender/retarget';
import { applyCinematicPreset } from '../src/cinematic';
import { defaultFaceRig } from '../src/face';
import { lookAtTransform, validateProject } from '../src/model';
import type { Keyframe, Project, SceneObject, Vec3 } from '../src/model';
import { applyMotion } from '../src/motion';

const original = validateProject(JSON.parse(readFileSync('showcase/Ember Gate.voxel', 'utf8')));
const source = parseGltfMotion(
  new Uint8Array(readFileSync('src/blender/voxel-motion-library.glb')),
);
const actions = [0, 4, 9, 10].map((index) => bakeMotionAction(source, index, { fps: 24 }));
const lastFrame = 167;
const keep =
  /^(temple$|hero$|rival$|blade$|enemy-blade$|Portal · |Brazier |Gate · Flow$|Temple · Embers$)/;
const objects = original.objects
  .filter((object) => keep.test(object.id))
  .map((object) => {
    if (object.type === 'character') {
      const lead = object.id === 'hero';
      return {
        ...object,
        transform: {
          ...object.transform,
          position: (lead ? [-0.9, 0.5, 0] : [1.0, 0.5, 0.52]) as Vec3,
          rotation: [0, lead ? 1.05 : -1.25, 0] as Vec3,
        },
        ik: undefined,
        face: { ...defaultFaceRig, enabled: true, iris: lead ? '#599872' : '#7799cc' },
      };
    }
    if (object.effect) return { ...object, effect: { ...object.effect, end: lastFrame } };
    return object;
  });
const audio = readFileSync('showcase/Ember Gate - Score.wav');
const sound = Buffer.from(audio.subarray(0, 44 + 4 * 48_000 * 7));
sound.writeUInt32LE(sound.length - 8, 4);
sound.writeUInt32LE(sound.length - 44, 40);
for (let offset = 44; offset < sound.length; offset += 4) {
  const time = (offset - 44) / (4 * 48_000);
  const fade = Math.min(1, time / 0.3, (7 - time) / 0.55);
  // A short low thump ties the cut and burst to the blade's contact.
  const hit = time - 108 / 24;
  const impact =
    hit >= 0 ? Math.sin(Math.PI * 2 * (62 - hit * 21) * hit) * Math.exp(-hit * 13) * 3900 : 0;
  for (let channel = 0; channel < 2; channel++) {
    const sample = sound.readInt16LE(offset + 2 * channel) + impact;
    sound.writeInt16LE(
      Math.round(Math.max(-32768, Math.min(32767, sample * fade))),
      offset + 2 * channel,
    );
  }
}
let scene: Project = {
  ...original,
  name: 'The Gatekeeper',
  duration: lastFrame,
  tracks: {},
  objects,
  shots: [],
  motionClips: actions,
  audio: {
    name: 'Gatekeeper mix.wav',
    data: 'data:audio/wav;base64,' + sound.toString('base64'),
    startFrame: 0,
    volume: 0.82,
  },
};
scene = applyMotion(scene, 'hero', actions[0], 0, 1, 1.6);
scene = applyMotion(scene, 'hero', actions[1], 38, 1, 1.73);
for (const part of ['body', 'head'])
  for (const key of scene.tracks['hero/' + part])
    if (key.frame >= 38 && key.frame < 90) key.rotation[1] *= 0.72;
scene = applyMotion(scene, 'hero', actions[2], 90, 1, 1.0);
scene = applyMotion(scene, 'rival', actions[0], 0, 1, 0.9);
scene = applyMotion(scene, 'rival', actions[3], 102, 1, 0.73);
scene.duration = lastFrame;
for (const keys of Object.values(scene.tracks)) while (keys.at(-1)!.frame > lastFrame) keys.pop();
for (const keys of Object.values(scene.faceTracks || {}))
  while (keys.at(-1)!.frame > lastFrame) keys.pop();

type Waypoint = [frame: number, from: Vec3, target: Vec3, fov: number];
const addShot = (id: string, name: string, path: Waypoint[]) => {
  const keys: Keyframe[] = path.map(([frame, from, target, fov]) => ({
    ...lookAtTransform(from, target),
    frame,
    fov,
    interpolation: 'smooth',
  }));
  scene.objects.push({
    id,
    name,
    type: 'camera',
    visible: true,
    transform: keys[0],
    fov: keys[0].fov,
    cameraRail: 'smooth',
  });
  scene.tracks[id] = keys;
  scene.shots!.push({ id: 'cut-' + id, cameraId: id, name, frame: keys[0].frame });
};
addShot('gate-wide', 'The Gate', [
  [0, [7.9, 4.8, 11.8], [0, 2.6, -3.6], 44],
  [18, [6.9, 4.05, 10.7], [0, 2.45, -3.35], 43],
  [37, [5.7, 3.7, 9.5], [0, 2.22, -3.0], 41],
]);
addShot('warden-portrait', 'The Warden', [
  [38, [1.19, 2.4, 2.6], [-0.88, 1.92, 0.04], 28],
  [55, [1.1, 2.35, 2.56], [-0.89, 1.95, 0.08], 26],
  [71, [1.53, 2.28, 1.91], [-0.88, 1.96, 0.06], 25],
  [89, [1.35, 2.27, 1.73], [-0.88, 1.99, 0.06], 24],
]);
addShot('blade-pass', 'Crossed Steel', [
  [90, [-2.65, 2.06, 4.1], [-0.1, 1.47, 0.03], 42],
  [108, [-2.02, 1.83, 4.34], [0.13, 1.52, 0.35], 36],
  [134, [-1.4, 1.89, 4.68], [0.2, 1.42, 0.48], 39],
]);
addShot('gate-after', 'After the Echo', [
  [135, [2.0, 2.62, 6.1], [0.02, 2.1, -1.56], 40],
  [150, [2.72, 2.96, 7.05], [0.04, 2.23, -2.32], 42],
  [167, [3.54, 3.68, 8.25], [0.06, 2.43, -3.0], 43],
]);
scene.activeCameraId = 'gate-wide';
const burst = original.objects.find((object) => object.id === 'Blade Clash 136')!;
const flash: SceneObject = {
  id: 'contact-light',
  name: 'Blade contact',
  type: 'light',
  visible: true,
  transform: { ...burst.transform, position: [0.1, 1.48, 0.54] },
  lightType: 'point',
  width: 3.4,
  color: '#b3eaff',
  intensity: 7,
};
scene.objects.push({
  ...burst,
  id: 'contact-sparks',
  name: 'Crossed steel sparks',
  transform: flash.transform,
  effect: { ...burst.effect!, start: 108, end: 129, count: 240, size: 0.049, speed: 6.6 },
});
scene.objects.push(flash);
const parkedFlash = { ...flash.transform, position: [0, -20, 0] as Vec3 };
scene.tracks[flash.id] = [
  { ...parkedFlash, frame: 0, interpolation: 'step' },
  { ...flash.transform, frame: 108, interpolation: 'step' },
  { ...parkedFlash, frame: 111, interpolation: 'step' },
];
scene = applyCinematicPreset(scene, 'blue-hour', {
  center: [-0.4, 1.55, 0.2],
  radius: 2.75,
  floor: 0.5,
  towardCamera: [0.8, 0.4, 1],
  focusDistance: 5,
  focusSubject: 'hero/head',
  sceneRadius: 25,
});
scene.lighting.exposure = 1.05;
scene.lighting.cinematic!.depthOfField = 0.24;
scene.lighting.cinematic!.lightShafts = 0.62;
scene.lighting.cinematic!.contrast = 1.18;
writeFileSync('showcase/The Gatekeeper.voxel', JSON.stringify(validateProject(scene)));
