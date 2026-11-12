import { readFileSync, writeFileSync } from 'node:fs';
import { parseGltfMotion } from '../src/blender/gltf';
import { bakeMotionAction } from '../src/blender/retarget';
import { applyCinematicPreset } from '../src/cinematic';
import { defaultFaceRig, neutralFace, setFaceKey } from '../src/face';
import { lookAtTransform, validateProject } from '../src/model';
import type { Keyframe, ParticleEffect, Project, SceneObject, Vec3 } from '../src/model';
import { applyMotion } from '../src/motion';
import { createStage } from '../src/staging';

const original = validateProject(JSON.parse(readFileSync('showcase/Ember Gate.voxel', 'utf8')));
const source = parseGltfMotion(readFileSync('src/blender/voxel-motion-library.glb'));
const strike = { ...bakeMotionAction(source, 9, { fps: 24 }), id: 'riftbreaker-strike' };
const end = 83,
  impact = 38;
const pose = (position: Vec3, rotation: Vec3 = [0, 0, 0], scale = 1) => ({
  position,
  rotation,
  scale: [scale, scale, scale] as Vec3,
});
const hero: SceneObject = {
  ...original.objects.find((o) => o.id === 'hero')!,
  name: 'Alex · Riftbreaker',
  transform: pose([-0.57, 0.5, 0], [0, 0.66, 0]),
  ik: undefined,
  armor: { body: 'netherite', feet: 'netherite' },
  face: { ...defaultFaceRig, enabled: true, autoLife: false, style: 'cinematic', iris: '#67b992' },
};
const sword: SceneObject = {
  ...original.objects.find((o) => o.id === 'blade')!,
  name: 'Riftsteel',
  equipmentSlot: 'rightHand',
  surfaceEffect: { color: '#62d9ff', glow: 0.19, rim: 1.0, outline: 0.38, width: 0.32 },
};
let scene: Project = {
  version: original.version,
  assetVersion: original.assetVersion,
  name: 'Riftbreaker',
  fps: 24,
  duration: end,
  objects: [
    ...original.objects
      .filter((o) => /^(temple$|Brazier |Portal · )/.test(o.id))
      .map((o) => (o.id.startsWith('Portal') ? { ...o, intensity: (o.intensity || 0) * 0.57 } : o)),
    hero,
    sword,
  ],
  tracks: {},
  lighting: { ...original.lighting },
  motionClips: [strike],
  activeCameraId: 'hero-rail',
  shots: [{ id: 'rift-cut', name: 'Riftbreaker', frame: 0, cameraId: 'hero-rail' }],
};
scene = createStage(scene, hero, 0, 'actor-movement');
const key = (
  frame: number,
  transform: ReturnType<typeof pose>,
  interpolation: Keyframe['interpolation'] = 'smooth',
): Keyframe => ({
  ...transform,
  frame,
  interpolation,
});
scene.tracks['actor-movement'] = [
  key(0, pose([-0.73, 0.5, -0.22])),
  key(20, pose([-0.57, 0.5, 0])),
  key(34, pose([-0.59, 0.5, 0.03])),
  key(impact, pose([-0.36, 0.5, 0.18])),
  key(62, pose([-0.42, 0.5, 0.11])),
];
scene = applyMotion(scene, hero.id, strike, 20, 1, 1, 0, false);
const face = (frame: number, lookX: number, brow: number, blink: number, jaw: number) => {
  scene.faceTracks = {
    ...scene.faceTracks,
    hero: setFaceKey(
      scene.faceTracks?.hero,
      frame,
      { ...neutralFace, lookX, lookY: -0.13, brow, blink, jaw },
      'smooth',
    ),
  };
};
scene.faceTracks = {};
face(0, 0.48, -0.38, 0, 0.08);
face(10, 0.69, -0.63, 0, 0);
face(18, 0.55, -0.9, 0.1, 0.04);
face(34, 0.45, -0.82, 0, 0.12);
face(impact, 0.25, -0.68, 0.72, 0.44);
face(43, 0.66, 0.48, 0, 0.55);
face(57, 0.65, 0.18, 0, 0.13);
face(70, 0.52, -0.16, 0.95, 0.04);
face(73, 0.53, -0.22, 0, 0.02);

const relic: Vec3 = [0.53, 1.22, 0.9];
const addBlock = (
  id: string,
  name: string,
  block: string,
  transform: ReturnType<typeof pose>,
  surfaceEffect?: SceneObject['surfaceEffect'],
) => {
  scene.objects.push({ id, name, block, type: 'block', visible: true, transform, surfaceEffect });
};
addBlock(
  'altar',
  'Polished altar',
  'minecraft:polished_blackstone_bricks',
  pose([0.53, 0.58, 0.9], [0, 0.12, 0], 0.62),
);
addBlock(
  'core',
  'Resonant amethyst',
  'minecraft:amethyst_block',
  pose(relic, [0.28, 0.35, 0.24], 0.44),
  { color: '#9467ff', glow: 0.26, rim: 0.85, outline: 0.52, width: 0.29 },
);
scene.tracks.core = [
  key(0, pose([0.53, 1.15, 0.9], [0.27, 0.15, 0.24], 0.42)),
  key(26, pose([0.53, 1.27, 0.9], [0.54, 1.24, 0.42], 0.47)),
  key(37, pose(relic, [0.78, 1.93, 0.58], 0.52)),
  key(impact, pose(relic, [0.84, 2.04, 0.6], 0.65)),
  key(40, pose(relic, [0.88, 2.12, 0.63], 0.018)),
  key(83, pose([0.53, -2, 0.9], [0, 0, 0], 0.018)),
];
const particle = (
  id: string,
  name: string,
  kind: ParticleEffect['kind'],
  position: Vec3,
  start: number,
  stop: number,
  color: string,
  count: number,
  size: number,
  spread: number,
  speed: number,
  gravity = 0,
  rotation: Vec3 = [0, 0, 0],
) => {
  scene.objects.push({
    id,
    name,
    type: 'effect',
    visible: true,
    transform: pose(position, rotation),
    effect: {
      kind,
      start,
      end: stop,
      color,
      count,
      size,
      spread,
      speed,
      gravity,
      loop: false,
      seed: count + start,
    },
  });
};
particle(
  'charge',
  'Amethyst charge',
  'vortex',
  [0.53, 0.82, 0.9],
  0,
  40,
  '#a064ff',
  240,
  0.047,
  0.52,
  0.98,
);
particle('embers', 'Temple dust', 'embers', [0, 0.55, 0], 0, 83, '#ffb369', 170, 0.022, 6, 3.7);
particle(
  'burst',
  'Cyan impact sparks',
  'sparks',
  relic,
  38,
  66,
  '#55edff',
  300,
  0.059,
  0.79,
  5.5,
  3.2,
);
particle(
  'cinders',
  'Gold contact streaks',
  'sparks',
  relic,
  39,
  66,
  '#ffbc59',
  115,
  0.044,
  0.77,
  7.1,
  4.2,
);
particle(
  'ring',
  'Ground pressure wave',
  'ring',
  [0.53, 0.58, 0.9],
  39,
  62,
  '#67dbff',
  360,
  0.056,
  2.1,
  0,
);
particle(
  'rift-ring',
  'Rift halo',
  'ring',
  [0.53, 1.21, 0.74],
  37,
  54,
  '#aa66ff',
  210,
  0.052,
  1.03,
  0,
  0,
  [Math.PI * 0.42, 0.14, 0],
);
for (let i = 0; i < 14; i++) {
  const angle = i * 2.399963,
    dx = Math.cos(angle),
    dz = Math.sin(angle),
    length = 0.8 + (i % 5) * 0.21;
  const id = 'fragment-' + i,
    size = 0.068 + (i % 4) * 0.027;
  addBlock(
    id,
    `Amethyst fragment ${i + 1}`,
    'minecraft:amethyst_block',
    pose([0.53, -2, 0.9], [0, 0, 0], size),
    { color: '#a37cff', glow: 0.14, rim: 0.67, outline: 0.0, width: 0.2 },
  );
  scene.tracks[id] = [
    key(0, pose([0.53, -2, 0.9], [0, 0, 0], size), 'step'),
    key(
      38,
      pose([relic[0] + dx * 0.09, 1.21, relic[2] + dz * 0.09], [0, angle, 0], size),
      'linear',
    ),
    key(
      46,
      pose(
        [relic[0] + dx * length * 0.63, 1.73 + (i % 4) * 0.21, relic[2] + dz * length * 0.63],
        [0.9, angle + 0.8, 0.8],
        size,
      ),
      'smooth',
    ),
    key(
      66 + (i % 5),
      pose(
        [relic[0] + dx * length, 0.55 + size * 0.5, relic[2] + dz * length],
        [2.4, angle + 1.8, 1.7],
        size,
      ),
    ),
  ];
}
const light = (
  id: string,
  name: string,
  color: string,
  intensity: number,
  width: number,
  position: Vec3,
) =>
  scene.objects.push({
    id,
    name,
    type: 'light',
    lightType: 'point',
    visible: true,
    color,
    intensity,
    width,
    transform: pose(position),
  });
light('warm-key', 'Lantern bounce', '#ffad66', 10, 6, [2.7, 3.4, 3.7]);
light('charge-light', 'Amethyst bounce', '#9c57ff', 5.5, 4, [0.55, 1.55, 0.84]);
light('impact-light', 'Cyan impact light', '#71deff', 22, 6, [0.55, -16, 0.84]);
scene.tracks['charge-light'] = [
  key(0, pose([0.55, 1.55, 0.84])),
  key(37, pose([0.55, 1.55, 0.84]), 'step'),
  key(38, pose([0.55, -16, 0.84]), 'step'),
];
scene.tracks['impact-light'] = [
  key(0, pose([0.55, -16, 0.84]), 'step'),
  key(38, pose([0.55, 1.73, 0.84])),
  key(42, pose([0.55, 3.1, 0.84])),
  key(55, pose([0.55, 7, 0.84])),
  key(63, pose([0.55, 12, 0.84])),
];
const rail: [number, Vec3, Vec3, number][] = [
  [0, [2.45, 2.8, 4.2], [-0.29, 1.63, 0.05], 29],
  [19, [1.82, 2.42, 3.96], [-0.31, 1.56, 0.26], 30],
  [34, [1.18, 2.23, 4.04], [-0.23, 1.43, 0.38], 30],
  [38, [0.97, 2.29, 4.26], [-0.12, 1.51, 0.45], 31],
  [41, [0.8, 2.36, 4.31], [-0.1, 1.47, 0.43], 32],
  [59, [0.11, 2.53, 4.43], [-0.03, 1.39, 0.37], 33],
  [83, [-0.56, 2.62, 4.27], [-0.11, 1.43, 0.36], 32],
];
scene.tracks['hero-rail'] = rail.map(([frame, position, aim, fov]) => ({
  ...lookAtTransform(position, aim),
  fov,
  frame,
  interpolation: 'smooth',
}));
scene.objects.push({
  id: 'hero-rail',
  name: 'Continuous orbit',
  type: 'camera',
  visible: true,
  transform: scene.tracks['hero-rail'][0],
  fov: 29,
  cameraRail: 'smooth',
});
scene = applyCinematicPreset(scene, 'blue-hour', {
  center: [-0.27, 1.45, 0.32],
  radius: 2.2,
  floor: 0.54,
  towardCamera: [1, 0.2, 1.8],
  focusDistance: 4,
  focusSubject: 'hero/head',
  sceneRadius: 24,
});
scene.lighting.exposure = 0.92;
scene.lighting.ambient = 0.36;
scene.lighting.bloomStrength = 0.22;
Object.assign(scene.lighting.cinematic!, {
  depthOfField: 0.17,
  atmosphere: 0.17,
  lightShafts: 0.47,
  contrast: 1.22,
  bloomThreshold: 0.89,
  grain: 0.065,
});

// Compose a small stereo sound bed and sync the transient exactly to frame 38.
const rate = 48_000,
  duration = (end + 1) / 24,
  count = duration * rate,
  wave = Buffer.alloc(44 + count * 4);
wave.write('RIFF');
wave.writeUInt32LE(wave.length - 8, 4);
wave.write('WAVEfmt ', 8);
wave.writeUInt32LE(16, 16);
wave.writeUInt16LE(1, 20);
wave.writeUInt16LE(2, 22);
wave.writeUInt32LE(rate, 24);
wave.writeUInt32LE(rate * 4, 28);
wave.writeUInt16LE(4, 32);
wave.writeUInt16LE(16, 34);
wave.write('data', 36);
wave.writeUInt32LE(count * 4, 40);
const tone = (frequency: number, t: number) => Math.sin(2 * Math.PI * frequency * t);
let seed = 711,
  previous = 0;
for (let i = 0; i < count; i++) {
  const t = i / rate,
    hit = t - impact / 24,
    fall = Math.max(0, hit);
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const noise = seed / 2 ** 31 - 1,
    grain = noise - previous;
  previous = noise;
  const fade = Math.min(1, t / 0.11, (duration - t) / 0.4);
  const charge =
    hit < 0
      ? (0.095 * tone(46, t) + 0.036 * tone(102 + 14 * t, t)) * (0.2 + t * 0.6)
      : 0.031 * tone(47, t) * Math.exp(-fall * 1.3);
  const sweep = hit < 0 ? grain * Math.exp(-((hit + 0.12) ** 2) / 0.006) * 0.16 : 0;
  const thump =
    hit >= 0
      ? Math.exp(-fall * 9) *
        (0.46 * tone(49 + 38 * Math.exp(-fall * 15), fall) + 0.16 * grain * Math.exp(-fall * 23))
      : 0;
  const glass =
    hit >= 0
      ? Math.exp(-fall * 3.4) *
        (0.063 * tone(887, fall) + 0.037 * tone(1328, fall) + 0.023 * tone(1789, fall))
      : 0;
  for (let channel = 0; channel < 2; channel++)
    wave.writeInt16LE(
      Math.round(30_000 * fade * (charge + sweep + thump + glass * (channel ? 0.78 : 1))),
      44 + 4 * i + 2 * channel,
    );
}
scene.audio = {
  name: 'Riftbreaker stereo mix.wav',
  data: 'data:audio/wav;base64,' + wave.toString('base64'),
  startFrame: 0,
  volume: 0.9,
};
writeFileSync('showcase/Riftbreaker.voxel', JSON.stringify(validateProject(scene)));
