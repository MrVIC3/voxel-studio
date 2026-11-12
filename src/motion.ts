import { bones, clone, evaluate, getTransform, identity, insertKey } from './model';
import type { BoneName, Keyframe, MotionClip, Project, Transform, Vec3 } from './model';
import { applyFaceClip, captureFaceClip, defaultFaceRig } from './face';
import { Euler, Quaternion, Vector3 } from 'three';
import { continuousEuler } from './rotation';
import runningPreset from './blender/running-preset.json';
export const motionNames = ['Walk', 'Run', 'Jump', 'Sword Slash', 'Wave'] as const;
export type MotionName = (typeof motionNames)[number];
const key = (frame: number, rotation: Vec3 = [0, 0, 0], position: Vec3 = [0, 0, 0]): Keyframe => ({
  ...identity(),
  rotation,
  position,
  frame,
  interpolation: 'spline',
});
export function presetMotion(name: MotionName): MotionClip {
  if (name === 'Run') return clone(runningPreset as MotionClip);
  const clip: MotionClip = {
    id: 'preset-' + name,
    name,
    duration: name === 'Jump' ? 36 : name === 'Wave' ? 48 : 24,
    tracks: {},
  };
  for (const bone of bones) clip.tracks[bone] = [];
  if (name === 'Walk') {
    const amp = 0.65;
    for (let i = 0; i <= 8; i++) {
      const phase = (i / 8) * Math.PI * 2,
        frame = (i * clip.duration) / 8,
        swing = Math.cos(phase) * amp;
      clip.tracks.leftLeg!.push(key(frame, [swing, 0, 0]));
      clip.tracks.rightLeg!.push(key(frame, [-swing, 0, 0]));
      clip.tracks.leftArm!.push(key(frame, [-swing * 0.85, 0, -0.06]));
      clip.tracks.rightArm!.push(key(frame, [swing * 0.85, 0, 0.06]));
      clip.tracks.body!.push(
        key(frame, [0, Math.sin(phase) * 0.07, 0], [0, (1 - Math.cos(phase * 2)) * 0.025, 0]),
      );
      clip.tracks.head!.push(key(frame, [-0.03, -Math.sin(phase) * 0.07, 0]));
      clip.tracks.leftForearm!.push(key(frame, [0.12, 0, 0]));
      clip.tracks.rightForearm!.push(key(frame, [0.12, 0, 0]));
      clip.tracks.leftShin!.push(key(frame, [-Math.max(0, -Math.cos(phase)) * 0.35, 0, 0]));
      clip.tracks.rightShin!.push(key(frame, [-Math.max(0, Math.cos(phase)) * 0.35, 0, 0]));
    }
  } else if (name === 'Jump') {
    const frames = [0, 6, 12, 18, 30, 36],
      height = [0, 0, 1.3, 2, 0, 0];
    clip.tracks.root = [];
    frames.forEach((frame, i) => {
      clip.tracks.root!.push(key(frame, [0, 0, 0], [0, height[i], 0]));
      for (const bone of bones) {
        const airborne = i === 2 || i === 3,
          crouch = i === 1 || i === 4;
        let r: Vec3 = [0, 0, 0],
          p: Vec3 = [0, 0, 0];
        if (bone === 'body') {
          r = [crouch ? 0.22 : 0, 0, 0];
          p = [0, crouch ? -0.18 : 0, 0];
        }
        if (bone.endsWith('Arm'))
          r = [airborne ? -2.3 : crouch ? 0.5 : 0, 0, bone === 'leftArm' ? -0.2 : 0.2];
        if (bone.endsWith('Leg')) r = [airborne ? 0.85 : crouch ? -0.3 : 0, 0, 0];
        clip.tracks[bone]!.push(key(frame, r, p));
      }
    });
  } else if (name === 'Sword Slash') {
    const frames = [0, 6, 10, 15, 24],
      arm: Vec3[] = [
        [-0.5, 0, 0.1],
        [-2.6, -0.5, -0.6],
        [-0.6, 0.6, 0.25],
        [-1, 0.45, 0.6],
        [-0.5, 0, 0.1],
      ],
      turn = [0, -0.45, 0.4, 0.25, 0];
    frames.forEach((frame, i) => {
      for (const bone of bones) {
        let r: Vec3 = [0, 0, 0];
        if (bone === 'rightArm') r = arm[i];
        if (bone === 'leftArm') r = [-0.35, -turn[i] * 0.5, -0.2];
        if (bone === 'body') r = [0.08, turn[i], 0];
        if (bone === 'head') r = [0, -turn[i] * 0.5, 0];
        if (bone === 'leftLeg') r = [0.2, 0, -0.08];
        if (bone === 'rightLeg') r = [-0.2, 0, 0.08];
        clip.tracks[bone]!.push(key(frame, r));
      }
    });
  } else {
    [0, 12, 20, 28, 36, 48].forEach((frame, i) => {
      for (const bone of bones)
        clip.tracks[bone]!.push(
          key(
            frame,
            bone === 'rightArm'
              ? [i === 0 || i === 5 ? -0.2 : -2.5, 0, i % 2 ? 0.5 : -0.25]
              : bone === 'head'
                ? [0, -0.15, 0]
                : [0, 0, 0],
          ),
        );
    });
  }
  return clip;
}
export function applyMotion(
  project: Project,
  id: string,
  clip: MotionClip,
  start: number,
  cycles = 1,
  speed = 1,
  travel = 0,
  includeRoot = true,
  endLimit = 36000,
): Project {
  const object = project.objects.find((o) => o.id === id);
  if (object?.type !== 'character' || start >= 36000) return project;
  const rate = clip.sourceFps ? (speed * clip.sourceFps) / project.fps : speed,
    length = Math.max(1, Math.round(clip.duration / rate)),
    end = Math.min(36000, endLimit, start + length * cycles),
    tracks = { ...project.tracks },
    base = getTransform(project, { id }, start);
  const rootRotation = clip.sourceFps
    ? new Quaternion().setFromEuler(new Euler(...base.rotation))
    : null;
  for (const [bone, source] of Object.entries(clip.tracks)) {
    if (bone === 'root' && !includeRoot) continue;
    if (!source?.length) continue;
    const destination = (frame: number) => Math.min(length, Math.round(frame / rate));
    const collides = source.some((key, i) => i > 0 && destination(source[i - 1].frame) === destination(key.frame));
    const samples: [number, Keyframe][] = collides && source.every(key => key.interpolation !== 'step')
      ? Array.from({ length: Math.min(length, end - start) + 1 }, (_, frame) => [frame, {
          ...evaluate(source, frame * clip.duration / length, identity()), frame, interpolation: 'linear',
        }])
      : source.map(key => [destination(key.frame), key]);
    const track = bone === 'root' ? id : `${id}/${bone}`,
      frames = new Map<number, Keyframe>();
    const importedRoot = bone === 'root' ? rootRotation : null;
    const first = source[0],
      last = source.at(-1)!;
    const turn = importedRoot
      ? new Quaternion()
          .setFromEuler(new Euler(...last.rotation))
          .multiply(new Quaternion().setFromEuler(new Euler(...first.rotation)).invert())
      : null;
    const scale = new Vector3(...base.scale);
    const stride = turn
      ? new Vector3(...last.position).sub(new Vector3(...first.position).applyQuaternion(turn))
      : null;
    const cycleShift = new Vector3(),
      cycleTurn = new Quaternion();
    let previousRotation = base.rotation;
    for (let cycle = 0; cycle < cycles && start + cycle * length <= end; cycle++) {
      for (const [offset, original] of samples) {
        const frame = start + cycle * length + offset;
        if (frame > end) continue;
        const k = clone(original);
        k.frame = frame;
        if (bone === 'root') {
          if (importedRoot) {
            const offset = new Vector3(...k.position)
              .applyQuaternion(cycleTurn)
              .add(cycleShift)
              .multiply(scale)
              .applyQuaternion(importedRoot);
            k.position = offset.toArray() as Vec3;
            const rotation = importedRoot
              .clone()
              .multiply(cycleTurn)
              .multiply(new Quaternion().setFromEuler(new Euler(...k.rotation)));
            k.rotation = continuousEuler(rotation, previousRotation);
            previousRotation = k.rotation;
            k.scale = k.scale.map((value, axis) => value * base.scale[axis]) as Vec3;
          } else {
            k.rotation = k.rotation.map((v, i) => v + base.rotation[i]) as Vec3;
          }
          k.position = k.position.map((v, i) => v + base.position[i]) as Vec3;
        }
        frames.set(frame, k);
      }
      if (stride && turn) {
        cycleShift.add(stride.clone().applyQuaternion(cycleTurn));
        cycleTurn.multiply(turn);
      }
    }
    tracks[track] = [
      ...(tracks[track] || []).filter((k) => k.frame < start || k.frame > end),
      ...frames.values(),
    ].sort((a, b) => a.frame - b.frame);
  }
  if (includeRoot && travel !== 0 && end > start) {
    const yaw = base.rotation[1],
      direction = [Math.sin(yaw), 0, Math.cos(yaw)];
    const root = tracks[id] || [];
    const timeline = new Map(root.map((key) => [key.frame, key]));
    for (const frame of [start, end])
      if (!timeline.has(frame))
        timeline.set(frame, { ...evaluate(root, frame, base), frame, interpolation: 'linear' });
    tracks[id] = [...timeline.values()]
      .map((key) => {
        if (key.frame < start || key.frame > end) return key;
        const fraction = (key.frame - start) / (end - start);
        return {
          ...key,
          position: key.position.map((v, i) => v + direction[i] * travel * fraction) as Vec3,
        };
      })
      .sort((a, b) => a.frame - b.frame);
  }
  const faceKeys = clip.faceKeys?.length
    ? applyFaceClip(project.faceTracks?.[id], clip.faceKeys, start, length, end, cycles, rate)
    : undefined;
  return {
    ...project,
    duration: Math.max(project.duration, end),
    tracks,
    ...(faceKeys
      ? {
          objects: project.objects.map((o) =>
            o.id === id ? { ...o, face: { ...(o.face || defaultFaceRig), enabled: true } } : o,
          ),
          faceTracks: { ...project.faceTracks, [id]: faceKeys },
        }
      : {}),
  };
}

export function keyCharacterPose(project: Project, id: string, frame: number) {
  return bones.reduce(
    (next, bone) =>
      insertKey(next, { id, bone }, frame, getTransform(project, { id, bone }, frame), 'smooth'),
    project,
  );
}

export function smoothCharacterPoseKeys(project: Project, id: string): Project {
  if (project.objects.find(object => object.id === id)?.locked) return project;
  const [first, last] = project.playbackRange ?? [0, project.duration];
  const tracks = { ...project.tracks };
  let changed = false;
  for (const bone of bones) {
    const track = `${id}/${bone}`, keys = tracks[track];
    if (!keys?.some(key => key.frame >= first && key.frame <= last && key.interpolation !== 'spline')) continue;
    tracks[track] = keys.map(key => key.frame >= first && key.frame <= last ? { ...key, interpolation: 'spline' } : key);
    changed = true;
  }
  return changed ? { ...project, tracks } : project;
}
export function captureMotion(
  project: Project,
  id: string,
  start: number,
  end: number,
  name: string,
): MotionClip {
  const tracks: MotionClip['tracks'] = {},
    duration = Math.max(1, end - start),
    base = getTransform(project, { id }, start);
  for (const bone of ['root', ...bones] as const) {
    const selection = bone === 'root' ? { id } : { id, bone },
      source = project.tracks[bone === 'root' ? id : `${id}/${bone}`];
    if (!source?.length) continue;
    const times = [
      ...new Set([
        start,
        ...source.filter((k) => k.frame > start && k.frame < end).map((k) => k.frame),
        end,
      ]),
    ].sort((a, b) => a - b);
    tracks[bone] = times.map((frame) => {
      const t = getTransform(project, selection, frame),
        original = source.find((k) => k.frame === frame);
      const k: Keyframe = {
        ...clone(t),
        ...original,
        frame: frame - start,
        interpolation: original?.interpolation || 'smooth',
      };
      if (bone === 'root') {
        k.position = k.position.map((v, i) => v - base.position[i]) as Vec3;
        k.rotation = k.rotation.map((v, i) => v - base.rotation[i]) as Vec3;
      }
      return k;
    });
  }
  const faceKeys = project.faceTracks?.[id]?.length
    ? captureFaceClip(project.faceTracks[id], start, end)
    : undefined;
  return {
    id: crypto.randomUUID(),
    name: name.trim() || 'Character motion',
    duration,
    tracks,
    faceKeys,
  };
}
export function mirrorPose(project: Project, id: string, frame: number, keyPose: boolean): Project {
  const object = project.objects.find((o) => o.id === id);
  if (object?.type !== 'character') return project;
  const pose: Partial<Record<BoneName, Transform>> = {};
  for (const bone of bones) {
    const other = bone.startsWith('left')
        ? (bone.replace('left', 'right') as BoneName)
        : bone.startsWith('right')
          ? (bone.replace('right', 'left') as BoneName)
          : bone,
      t = clone(getTransform(project, { id, bone: other }, frame));
    t.position[0] *= -1;
    t.rotation[1] *= -1;
    t.rotation[2] *= -1;
    pose[bone] = t;
  }
  let result = {
    ...project,
    objects: project.objects.map((o) => (o.id === id ? { ...o, pose } : o)),
  };
  for (const bone of bones)
    if (keyPose || project.tracks[`${id}/${bone}`]?.length)
      result = insertKey(result, { id, bone }, frame, pose[bone]!, 'smooth');
  return result;
}
