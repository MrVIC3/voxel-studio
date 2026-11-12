import { cubicEase, splineValue, validCurve } from './curves';
import { MAX_PROJECT_BLOCKS } from './import-limits';
import { validWind } from './wind';
import type { WindSettings } from './wind';
import type { CubicEase, TransformChannel } from './curves';
import { upperFrame } from './time-index';
import { validateFaceKeys, validateFaceRig } from './face';
import { validCharacterLayers } from './character-layers';
import { validCharacterLook } from './character-look';
import type { CharacterLook } from './character-look';
import type { CharacterLayers } from './character-layers';
import type { FaceKey, FaceRigConfig } from './face';
import { isCinematicSettings } from './cinematic';
import type { CinematicSettings } from './cinematic';
import { validCameraEffects } from './camera-effects';
import type { CameraEffects } from './camera-effects';
export type Vec3 = [number, number, number];
export type Transform = { position: Vec3; rotation: Vec3; scale: Vec3 };
export type BoneName =
  | 'head'
  | 'body'
  | 'leftArm'
  | 'rightArm'
  | 'leftLeg'
  | 'rightLeg'
  | 'leftForearm'
  | 'rightForearm'
  | 'leftShin'
  | 'rightShin'
  | 'leftHand'
  | 'rightHand'
  | 'leftFoot'
  | 'rightFoot';
export const bones: BoneName[] = [
  'head',
  'body',
  'leftArm',
  'leftForearm',
  'leftHand',
  'rightArm',
  'rightForearm',
  'rightHand',
  'leftLeg',
  'leftShin',
  'leftFoot',
  'rightLeg',
  'rightShin',
  'rightFoot',
];
export const boneLabels: Record<BoneName, string> = {
  head: 'Head',
  body: 'Body',
  leftArm: 'Left arm',
  rightArm: 'Right arm',
  leftLeg: 'Left leg',
  rightLeg: 'Right leg',
  leftForearm: 'Left forearm',
  rightForearm: 'Right forearm',
  leftShin: 'Left shin',
  rightShin: 'Right shin',
  leftHand: 'Left hand',
  rightHand: 'Right hand',
  leftFoot: 'Left foot',
  rightFoot: 'Right foot',
};
export type Keyframe = Transform & {
  frame: number;
  fov?: number;
  interpolation: 'smooth' | 'linear' | 'step' | 'bezier' | 'spline';
  easing?: CubicEase;
  curves?: Partial<Record<TransformChannel, CubicEase>>;
};
export type VoxelData = { palette: string[]; blocks: [number, number, number, number][] };
export type SceneObject = {
  id: string;
  name: string;
  type:
    'character' | 'build' | 'block' | 'light' | 'camera' | 'group' | 'item' | 'effect' | 'control';
  visible: boolean;
  transform: Transform;
  pose?: Partial<Record<BoneName, Transform>>;
  skin?: string;
  slim?: boolean;
  voxels?: VoxelData;
  block?: string;
  color?: string;
  intensity?: number;
  lightType?: 'point' | 'area' | 'spot';
  width?: number;
  height?: number;
  angle?: number;
  lightShadows?: boolean;
  fov?: number;
  cameraRail?: 'smooth' | 'linear';
  cameraEffects?: CameraEffects;
  face?: FaceRigConfig;
  characterLayers?: CharacterLayers;
  characterLook?: CharacterLook;
  placement?: boolean;
  armor?: Partial<Record<ArmorSlot, ArmorMaterial>>;
  equipmentSlot?: 'leftHand' | 'rightHand';
  surfaceEffect?: SurfaceEffect;
  parentId?: string;
  parentBone?: BoneName;
  locked?: boolean;
  cameraTarget?: string;
  targetBone?: BoneName;
  item?: string;
  effect?: ParticleEffect;
  ik?: Partial<Record<LimbName, { targetId: string; pole: Vec3; enabled: boolean }>>;
};
export const armorSlots = ['head', 'body', 'legs', 'feet'] as const;
export const armorMaterials = ['leather','chainmail','iron','gold','diamond','netherite','copper'] as const;
export type ArmorSlot = (typeof armorSlots)[number];
export type ArmorMaterial = (typeof armorMaterials)[number];
export type SurfaceEffect = { color: string; glow: number; rim: number; outline: number; width: number };
export type LimbName = 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';
export type ParticleEffect = {
  kind: 'sparks' | 'embers' | 'ring' | 'vortex';
  seed: number;
  count: number;
  start: number;
  end: number;
  color: string;
  size: number;
  spread: number;
  speed: number;
  gravity: number;
  loop: boolean;
};
export type Lighting = {
  sun: number;
  ambient: number;
  azimuth: number;
  elevation: number;
  warmth: string;
  sky: string;
  fog: number;
  exposure: number;
  shadows: boolean;
  ground: boolean;
  toneMapping?: 'agx' | 'aces' | 'neutral';
  ao?: boolean;
  aoIntensity?: number;
  bloom?: boolean;
  bloomStrength?: number;
  softness?: number;
  environment?: number;
  cinematic?: CinematicSettings;
};
export type Project = {
  version: 1;
  name: string;
  objects: SceneObject[];
  tracks: Record<string, Keyframe[]>;
  duration: number;
  fps: number;
  lighting: Lighting;
  wind?: WindSettings;
  textures?: Record<string, string>;
  assetVersion?: string;
  motionClips?: MotionClip[];
  faceTracks?: Record<string, FaceKey[]>;
  activeCameraId?: string;
  shots?: CameraShot[];
  playbackRange?: [number, number];
  audio?: { name: string; data: string; startFrame: number; volume: number };
};
export type CameraShot = { id: string; name: string; frame: number; cameraId: string; lighting?: Lighting; cameraEffects?: CameraEffects };
export type MotionClip = {
  id: string;
  name: string;
  duration: number;
  sourceFps?: number;
  tracks: Partial<Record<'root' | BoneName, Keyframe[]>>;
  faceKeys?: FaceKey[];
};
export type Selection = { id: string; bone?: BoneName } | null;
export const identity = (): Transform => ({
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
});
export function lookAtTransform(position: Vec3, target: Vec3): Transform {
  const dx = position[0] - target[0],
    dy = position[1] - target[1],
    dz = position[2] - target[2],
    yaw = Math.atan2(dx, dz),
    pitch = -Math.atan2(dy, Math.hypot(dx, dz));
  return {
    position,
    rotation: [
      Math.atan2(Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)),
      Math.asin(Math.sin(yaw) * Math.cos(pitch)),
      Math.atan2(-Math.sin(yaw) * Math.sin(pitch), Math.cos(yaw)),
    ],
    scale: [1, 1, 1],
  };
}
export const uid = () => crypto.randomUUID();
export const trackId = (selection: NonNullable<Selection>) =>
  selection.bone ? `${selection.id}/${selection.bone}` : selection.id;
export const clone = <T>(data: T): T => structuredClone(data);
export function evaluate(
  keys: Keyframe[] | undefined,
  frame: number,
  fallback: Transform,
): Transform {
  if (!keys?.length) return fallback;
  if (frame <= keys[0].frame) return keys[0];
  if (frame >= keys[keys.length - 1].frame) return keys[keys.length - 1];
  const index = upperFrame(keys,frame),
    a = keys[index - 1],
    b = keys[index];
  const before = keys[index - 2], after = keys[index + 1];
  let t = (frame - a.frame) / (b.frame - a.frame);
  if (a.interpolation === 'step') t = 0;
  if (a.interpolation === 'smooth') t = t * t * (3 - 2 * t);
  const raw = (frame - a.frame) / (b.frame - a.frame);
  const lerp = (x: Vec3, y: Vec3, group: 'position' | 'rotation' | 'scale'): Vec3 =>
    x.map((v, i) => {
      if (a.interpolation === 'spline')
        return splineValue(v, y[i], raw, b.frame - a.frame,
          before?.interpolation === 'spline' ? { value: before[group][i], span: a.frame - before.frame } : undefined,
          after && b.interpolation === 'spline' ? { value: after[group][i], span: after.frame - b.frame } : undefined);
      const curve = a.curves?.[`${group}.${['x', 'y', 'z'][i]}` as TransformChannel] || a.easing;
      const progress =
        a.interpolation === 'bezier' ? cubicEase(raw, curve || [1 / 3, 0, 2 / 3, 1]) : t;
      return v + (y[i] - v) * progress;
    }) as Vec3;
  return {
    position: lerp(a.position, b.position, 'position'),
    rotation: lerp(a.rotation, b.rotation, 'rotation'),
    scale: lerp(a.scale, b.scale, 'scale').map((v) => Math.max(0.001, v)) as Vec3,
  };
}
export function insertKey(
  project: Project,
  selection: NonNullable<Selection>,
  frame: number,
  transform: Transform,
  interpolation: Keyframe['interpolation'],
): Project {
  const key = trackId(selection),
    existing = project.tracks[key]?.find((k) => k.frame === frame),
    keys = [...(project.tracks[key] || [])].filter((k) => k.frame !== frame);
  keys.push({
    ...existing,
    ...clone(transform),
    frame,
    interpolation: existing?.interpolation || interpolation,
  });
  keys.sort((a, b) => a.frame - b.frame);
  return { ...project, tracks: { ...project.tracks, [key]: keys } };
}
export function getTransform(
  project: Project,
  selection: NonNullable<Selection>,
  frame?: number,
): Transform {
  const object = project.objects.find((o) => o.id === selection.id);
  const base = selection.bone
    ? object?.pose?.[selection.bone] || identity()
    : object?.transform || identity();
  return frame === undefined ? base : evaluate(project.tracks[trackId(selection)], frame, base);
}
const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
const vector = (v: unknown) =>
  Array.isArray(v) && v.length === 3 && v.every((n) => finite(n) && Math.abs(n) <= 1e7);
const transform = (v: any) =>
  v &&
  vector(v.position) &&
  vector(v.rotation) &&
  vector(v.scale) &&
  v.scale.every((n: number) => n >= 0.001 && n <= 10000);
export function validateProject(value: unknown): Project {
  const p = value as Project;
  if (
    !p ||
    p.version !== 1 ||
    typeof p.name !== 'string' ||
    p.name.length > 200 ||
    !Array.isArray(p.objects) ||
    p.objects.length > 500
  )
    throw Error('This is not a valid Voxel Studio project.');
  if (
    !Number.isInteger(p.duration) ||
    p.duration < 1 ||
    p.duration > 36000 ||
    !Number.isInteger(p.fps) ||
    p.fps < 1 ||
    p.fps > 120
  )
    throw Error('Project timing is outside supported limits.');
  const ids = new Set<string>();
  if (
    p.audio &&
    (!p.audio ||
      typeof p.audio.name !== 'string' ||
      p.audio.name.length > 200 ||
      typeof p.audio.data !== 'string' ||
      p.audio.data.length > 30 * 1024 * 1024 ||
      !/^data:audio\/[a-z0-9+.-]+;base64,/i.test(p.audio.data) ||
      !Number.isInteger(p.audio.startFrame) ||
      p.audio.startFrame < 0 ||
      p.audio.startFrame > 36000 ||
      !finite(p.audio.volume) ||
      p.audio.volume < 0 ||
      p.audio.volume > 2)
  )
    throw Error('Invalid soundtrack.');
  let blocks = 0,
    particles = 0;
  for (const o of p.objects) {
    if (
      !o ||
      typeof o.id !== 'string' ||
      o.id.includes('/') ||
      ids.has(o.id) ||
      typeof o.name !== 'string' ||
      o.name.length > 200 ||
      ![
        'character',
        'build',
        'block',
        'light',
        'camera',
        'group',
        'item',
        'effect',
        'control',
      ].includes(o.type) ||
      typeof o.visible !== 'boolean' ||
      !transform(o.transform)
    )
      throw Error('Invalid scene object.');
    ids.add(o.id);
    if (o.item !== undefined && (typeof o.item !== 'string' || o.item.length > 200))
      throw Error('Invalid item resource.');
    if (o.effect !== undefined) {
      const e = o.effect;
      particles += e.count;
      if (
        !e ||
        !['sparks', 'embers', 'ring', 'vortex'].includes(e.kind) ||
        !Number.isInteger(e.seed) ||
        !Number.isInteger(e.count) ||
        e.count < 1 ||
        e.count > 5000 ||
        particles > 100000 ||
        !Number.isInteger(e.start) ||
        !Number.isInteger(e.end) ||
        e.start < 0 ||
        e.end <= e.start ||
        e.end > 36000 ||
        !/^#[0-9a-f]{6}$/i.test(e.color) ||
        ![e.size, e.spread, e.speed, e.gravity].every(finite) ||
        e.size < 0.005 ||
        e.size > 5 ||
        e.spread < 0 ||
        e.spread > 100 ||
        e.speed < 0 ||
        e.speed > 100 ||
        Math.abs(e.gravity) > 100 ||
        typeof e.loop !== 'boolean'
      )
        throw Error('Invalid particle effect.');
    }
    if (o.locked !== undefined && typeof o.locked !== 'boolean')
      throw Error('Invalid object lock.');
    if (
      o.pose &&
      (typeof o.pose !== 'object' ||
        Object.entries(o.pose).some(([b, t]) => !bones.includes(b as BoneName) || !transform(t)))
    )
      throw Error('Invalid character pose.');
    if (
      o.skin &&
      (typeof o.skin !== 'string' ||
        !o.skin.startsWith('data:image/png;base64,') ||
        o.skin.length > 1500000)
    )
      throw Error('Invalid embedded skin.');
    if (o.voxels) {
      const v = o.voxels;
      if (
        !Array.isArray(v.palette) ||
        v.palette.length > 4096 ||
        !v.palette.every((n) => typeof n === 'string' && n.length <= 500) ||
        !Array.isArray(v.blocks)
      )
        throw Error('Invalid block palette.');
      blocks += v.blocks.length;
      if (blocks > MAX_PROJECT_BLOCKS)
        throw Error(`Project exceeds ${MAX_PROJECT_BLOCKS.toLocaleString()} imported blocks.`);
      if (
        v.blocks.some(
          (b) =>
            !Array.isArray(b) ||
            b.length !== 4 ||
            !b.every(Number.isInteger) ||
            Math.max(Math.abs(b[0]), Math.abs(b[1]), Math.abs(b[2])) > 1e6 ||
            b[3] < 0 ||
            b[3] >= v.palette.length,
        )
      )
        throw Error('Invalid block data.');
    }
    if (
      o.intensity !== undefined &&
      (!finite(o.intensity) || o.intensity < 0 || o.intensity > 1000)
    )
      throw Error('Invalid light intensity.');
    if (o.fov !== undefined && (!finite(o.fov) || o.fov < 10 || o.fov > 120))
      throw Error('Invalid camera lens.');
    if(o.cameraRail!==undefined && (o.type!=='camera'||!['smooth','linear'].includes(o.cameraRail)))throw Error('Invalid camera path interpolation.');
    if (o.cameraEffects !== undefined && (o.type !== 'camera' || !validCameraEffects(o.cameraEffects))) throw Error('Invalid camera effects.');
    if(o.face!==undefined && (o.type!=='character'||!validateFaceRig(o.face)))throw Error('Invalid face rig.');
    if(o.characterLayers!==undefined && (o.type!=='character'||!validCharacterLayers(o.characterLayers)))
      throw Error('Invalid character layers.');
    if(o.characterLook!==undefined && (o.type!=='character'||!validCharacterLook(o.characterLook)))
      throw Error('Invalid character lighting.');
    if (o.color !== undefined && !/^#[0-9a-f]{6}$/i.test(o.color))
      throw Error('Invalid light color.');
    if (o.lightType && !['point', 'area', 'spot'].includes(o.lightType))
      throw Error('Invalid light type.');
    for (const value of [o.width, o.height, o.angle])
      if (value !== undefined && (!finite(value) || value < 0.01 || value > 180))
        throw Error('Invalid light dimensions.');
  }
  for (const o of p.objects) {
    if (o.placement !== undefined && (typeof o.placement !== 'boolean' || o.type !== 'group'))
      throw Error('Invalid movement control.');
    if (o.armor !== undefined && (o.type !== 'character' || !o.armor ||
      typeof o.armor !== 'object' || Array.isArray(o.armor) ||
      Object.entries(o.armor).some(([slot, material]) => !armorSlots.includes(slot as ArmorSlot) || !armorMaterials.includes(material))))
      throw Error('Invalid armor.');
    if (o.equipmentSlot !== undefined && (o.type !== 'item' || o.equipmentSlot !== o.parentBone || !['leftHand','rightHand'].includes(o.equipmentSlot)))
      throw Error('Invalid held item slot.');
    if (o.surfaceEffect !== undefined) {
      const fx = o.surfaceEffect;
      if (!fx || typeof fx.color !== 'string' || !/^#[\da-f]{6}$/i.test(fx.color)
        || ![fx.glow, fx.rim, fx.outline].every(value => finite(value) && value >= 0 && value <= 5)
        || !finite(fx.width) || fx.width < .02 || fx.width > .75) throw Error('Invalid surface effect.');
    }
    if (o.parentBone && (!bones.includes(o.parentBone) || !o.parentId))
      throw Error('Invalid bone attachment.');
    if (o.ik) {
      if (typeof o.ik !== 'object' || o.type !== 'character')
        throw Error('Invalid IK constraints.');
      for (const [limb, constraint] of Object.entries(o.ik)) {
        if (
          !['leftArm', 'rightArm', 'leftLeg', 'rightLeg'].includes(limb) ||
          !constraint ||
          !ids.has(constraint.targetId) ||
          constraint.targetId === o.id ||
          !vector(constraint.pole) ||
          typeof constraint.enabled !== 'boolean'
        )
          throw Error('Invalid IK target.');
      }
    }
    if (o.cameraTarget && (!ids.has(o.cameraTarget) || o.cameraTarget === o.id))
      throw Error('Invalid camera target.');
    if (
      o.targetBone &&
      (!bones.includes(o.targetBone) ||
        p.objects.find((target) => target.id === o.cameraTarget)?.type !== 'character')
    )
      throw Error('Invalid target bone.');
    if (!o.parentId) continue;
    const parent = p.objects.find((candidate) => candidate.id === o.parentId);
    if (!parent || (o.parentBone && parent.type !== 'character'))
      throw Error('Missing parent or invalid character attachment.');
    const chain = new Set([o.id]);
    let cursor: SceneObject | undefined = parent;
    while (cursor) {
      if (chain.has(cursor.id)) throw Error('Object parenting contains a cycle.');
      chain.add(cursor.id);
      cursor = cursor.parentId
        ? p.objects.find((candidate) => candidate.id === cursor!.parentId)
        : undefined;
    }
  }
  if (p.activeCameraId && !p.objects.some((o) => o.id === p.activeCameraId && o.type === 'camera'))
    throw Error('Invalid active camera.');
  if (
    p.playbackRange &&
    (!Array.isArray(p.playbackRange) ||
      p.playbackRange.length !== 2 ||
      !p.playbackRange.every(Number.isInteger) ||
      p.playbackRange[0] < 0 ||
      p.playbackRange[1] > p.duration ||
      p.playbackRange[0] > p.playbackRange[1])
  )
    throw Error('Invalid playback range.');
  if (p.shots !== undefined) {
    if (!Array.isArray(p.shots) || p.shots.length > 256) throw Error('Invalid camera sequence.');
    let last = -1;
    const shotIds = new Set<string>();
    for (const shot of p.shots) {
      if (
        !shot ||
        typeof shot.id !== 'string' ||
        shotIds.has(shot.id) ||
        typeof shot.name !== 'string' ||
        shot.name.length > 100 ||
        !Number.isInteger(shot.frame) ||
        shot.frame < 0 ||
        shot.frame > p.duration ||
        shot.frame <= last ||
        !p.objects.some((o) => o.id === shot.cameraId && o.type === 'camera')
      )
        throw Error('Invalid camera cut.');
      last = shot.frame;
      shotIds.add(shot.id);
      if (shot.lighting !== undefined) validateLighting(shot.lighting);
      if (shot.cameraEffects !== undefined && !validCameraEffects(shot.cameraEffects)) throw Error('Invalid shot camera effects.');
    }
  }
  if (
    !p.tracks ||
    typeof p.tracks !== 'object' ||
    Array.isArray(p.tracks) ||
    Object.keys(p.tracks).length > 5000
  )
    throw Error('Invalid animation tracks.');
  for (const [id, keys] of Object.entries(p.tracks)) {
    const [objectId, bone] = id.split('/');
    if (
      !ids.has(objectId) ||
      (bone && !bones.includes(bone as BoneName)) ||
      !Array.isArray(keys) ||
      keys.length > 36001
    )
      throw Error('Invalid animation track.');
    let last = -1;
    for (const k of keys) {
      if (
        !transform(k) ||
        !Number.isInteger(k.frame) ||
        k.frame < 0 ||
        k.frame > p.duration ||
        k.frame <= last ||
        (k.fov!==undefined&&(!finite(k.fov)||k.fov<10||k.fov>120)) ||
        !['linear', 'smooth', 'step', 'bezier', 'spline'].includes(k.interpolation) ||
        (k.easing !== undefined && !validCurve(k.easing)) ||
        (k.curves !== undefined &&
          (!k.curves ||
            typeof k.curves !== 'object' ||
            Object.entries(k.curves).some(
              ([channel, curve]) =>
                !/^(position|rotation|scale)\.[xyz]$/.test(channel) || !validCurve(curve),
            )))
      )
        throw Error('Invalid keyframe.');
      last = k.frame;
    }
  }
  if(p.faceTracks!==undefined){
    if(!p.faceTracks||typeof p.faceTracks!=='object'||Array.isArray(p.faceTracks)||Object.keys(p.faceTracks).length>500)throw Error('Invalid face tracks.');
    for(const [id,keys] of Object.entries(p.faceTracks))if(!p.objects.some(o=>o.id===id&&o.type==='character')||!validateFaceKeys(keys,p.duration))throw Error('Invalid facial animation.');
  }
  if (p.motionClips !== undefined) {
    if (!Array.isArray(p.motionClips) || p.motionClips.length > 64)
      throw Error('Invalid motion library.');
    for (const clip of p.motionClips) {
      if (
        !clip ||
        typeof clip.id !== 'string' ||
        typeof clip.name !== 'string' ||
        clip.name.length > 100 ||
        !Number.isInteger(clip.duration) ||
        clip.duration < 1 ||
        clip.duration > 36000 ||
        (clip.sourceFps !== undefined &&
          (!Number.isInteger(clip.sourceFps) || clip.sourceFps < 1 || clip.sourceFps > 120)) ||
        !clip.tracks ||
        typeof clip.tracks !== 'object'
      )
        throw Error('Invalid motion clip.');
      if(clip.faceKeys!==undefined&&!validateFaceKeys(clip.faceKeys,clip.duration))throw Error('Invalid motion clip face track.');
      for (const [bone, keys] of Object.entries(clip.tracks)) {
        if (
          (bone !== 'root' && !bones.includes(bone as BoneName)) ||
          !Array.isArray(keys) ||
          keys.length > 36001
        )
          throw Error('Invalid motion clip track.');
        let last = -1;
        for (const k of keys) {
          if (
            !transform(k) ||
            !Number.isInteger(k.frame) ||
            k.frame <= last ||
            k.frame < 0 ||
            k.frame > clip.duration ||
            !['linear', 'smooth', 'step', 'bezier', 'spline'].includes(k.interpolation) ||
            (k.easing && !validCurve(k.easing)) ||
            (k.curves &&
              Object.entries(k.curves).some(
                ([channel, curve]) =>
                  !/^(position|rotation|scale)\.[xyz]$/.test(channel) || !validCurve(curve),
              ))
          )
            throw Error('Invalid motion clip key.');
          last = k.frame;
        }
      }
    }
  }
  validateLighting(p.lighting);
  if (p.wind !== undefined && !validWind(p.wind)) throw Error('Invalid foliage wind settings.');
  if (
    p.textures &&
    (typeof p.textures !== 'object' ||
      Object.keys(p.textures).length > 2048 ||
      Object.values(p.textures).some(
        (t) =>
          typeof t !== 'string' || !t.startsWith('data:image/png;base64,') || t.length > 1500000,
      ))
  )
    throw Error('Invalid resource pack textures.');
  return p;
}
function validateLighting(l: Lighting) {
  if (
    !l ||
    ![l.sun, l.ambient, l.azimuth, l.elevation, l.fog, l.exposure].every(finite) ||
    l.sun < 0 ||
    l.sun > 10 ||
    l.ambient < 0 ||
    l.ambient > 5 ||
    l.azimuth < -360 ||
    l.azimuth > 360 ||
    l.elevation < 0 ||
    l.elevation > 90 ||
    l.fog < 0 ||
    l.fog > 1 ||
    l.exposure < 0.1 ||
    l.exposure > 4 ||
    !/^#[0-9a-f]{6}$/i.test(l.sky) ||
    !/^#[0-9a-f]{6}$/i.test(l.warmth) ||
    typeof l.shadows !== 'boolean' ||
    typeof l.ground !== 'boolean'
  )
    throw Error('Invalid lighting settings.');
  if (l.toneMapping && !['agx', 'aces', 'neutral'].includes(l.toneMapping))
    throw Error('Invalid color management.');
  if(l.cinematic!==undefined&&!isCinematicSettings(l.cinematic))throw Error('Invalid cinematic settings.');
  for (const value of [l.aoIntensity, l.bloomStrength, l.softness, l.environment])
    if (value !== undefined && (!finite(value) || value < 0 || value > 10))
      throw Error('Invalid render setting.');
}
export const defaultLighting: Lighting = {
  sun: 3.2,
  ambient: 0.8,
  azimuth: -35,
  elevation: 38,
  warmth: '#fff0db',
  sky: '#353535',
  fog: 0,
  exposure: 1,
  shadows: true,
  ground: true,
  toneMapping: 'agx',
  ao: true,
  aoIntensity: 0.8,
  bloom: true,
  bloomStrength: 0.12,
  softness: 2.5,
  environment: 0.25,
};
export function demoProject(): Project {
  const data: VoxelData = {
    palette: [
      'minecraft:grass_block',
      'minecraft:dirt',
      'minecraft:stone',
      'minecraft:oak_log',
      'minecraft:oak_leaves',
      'minecraft:oak_planks',
      'minecraft:cobblestone',
      'minecraft:water',
      'minecraft:poppy',
    ],
    blocks: [],
  };
  const blockMap = new Map<string, [number, number, number, number]>();
  const add = (x: number, y: number, z: number, b: number) =>
    blockMap.set(`${x},${y},${z}`, [x, y, z, b]);
  for (let x = -8; x <= 8; x++)
    for (let z = -6; z <= 6; z++) {
      if (Math.abs(x / 9) ** 4 + Math.abs(z / 7) ** 4 > 1) continue;
      const top = x > 3 && z < 0 ? 1 : 0;
      for (let y = -3; y <= top; y++) add(x, y, z, y === top ? 0 : y === -3 ? 2 : 1);
      if (z === 3 && x < 3) add(x, 0, z, 6);
    }
  for (const [tx, tz, h] of [
    [-5, -3, 5],
    [5, -3, 6],
    [-6, 2, 4],
  ]) {
    const base = tx > 3 && tz < 0 ? 1 : 0;
    for (let y = 1; y <= h; y++) add(tx, y + base, tz, 3);
    for (let y = h - 1; y <= h + 1; y++)
      for (let dx = -2; dx <= 2; dx++)
        for (let dz = -2; dz <= 2; dz++)
          if (Math.abs(dx) + Math.abs(dz) < (y === h + 1 ? 3 : 4))
            add(tx + dx, y + base, tz + dz, 4);
  }
  for (let x = -2; x < 2; x++) for (let z = -4; z < -2; z++) add(x, 0, z, 7);
  for (let x = -3; x <= 0; x++) add(x, 1, -3, 5);
  data.blocks = [...blockMap.values()];
  const character: SceneObject = {
    id: 'character',
    name: 'Alex',
    type: 'character',
    visible: true,
    transform: { position: [1, 0.5, 3], rotation: [0, -0.3, 0], scale: [1, 1, 1] },
    pose: {
      leftArm: { ...identity(), rotation: [-0.1, 0, -0.08] },
      rightArm: { ...identity(), rotation: [-0.4, 0, 0.12] },
      head: { ...identity(), rotation: [0, -0.18, 0] },
    },
  };
  return {
    version: 1,
    name: 'Woodland study',
    objects: [
      {
        id: 'woodland',
        name: 'Woodland diorama',
        type: 'build',
        visible: true,
        transform: identity(),
        voxels: data,
      },
      character,
      {
        id: 'camera',
        name: 'Camera 01',
        type: 'camera',
        visible: true,
        transform: lookAtTransform([14, 10, 19], [0, 1, 0]),
        fov: 40,
      },
    ],
    tracks: {
      'character/rightArm': [
        { ...identity(), rotation: [-0.4, 0, 0.12], frame: 0, interpolation: 'smooth' },
        { ...identity(), rotation: [-2.5, 0, 0.5], frame: 36, interpolation: 'smooth' },
        { ...identity(), rotation: [-2.3, 0, -0.3], frame: 54, interpolation: 'smooth' },
        { ...identity(), rotation: [-2.5, 0, 0.5], frame: 72, interpolation: 'smooth' },
        { ...identity(), rotation: [-0.4, 0, 0.12], frame: 120, interpolation: 'smooth' },
      ],
    },
    duration: 120,
    fps: 24,
    lighting: { ...defaultLighting },
  };
}
export function emptyProject(): Project {
  return { ...demoProject(), name: 'Untitled scene', objects: [], tracks: {} };
}
