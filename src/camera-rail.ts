import { Euler, Quaternion, Vector3 } from 'three';
import { cubicEase, splineValue } from './curves';
import { lookAtTransform } from './model';
import type { Keyframe, Vec3 } from './model';
import { upperFrame } from './time-index';
function component(keys: readonly Keyframe[], index: number, axis: number, t: number) {
  const a = keys[index],
    b = keys[index + 1],
    p = keys[index - 1],
    n = keys[index + 2];
  return splineValue(
    a.position[axis],
    b.position[axis],
    t,
    b.frame - a.frame,
    p && { value: p.position[axis], span: a.frame - p.frame },
    n && { value: n.position[axis], span: n.frame - b.frame },
  );
}
export function sampleCameraRail(
  keys: readonly Keyframe[],
  frame: number,
  fov: number,
  mode: 'smooth' | 'linear' = 'smooth',
) {
  if (!keys.length) return undefined;
  const next = upperFrame(keys, frame);
  if (next === 0 || next === keys.length) {
    const key = keys[next === 0 ? 0 : keys.length - 1];
    return { ...key, fov: key.fov ?? fov };
  }
  const index = next - 1,
    a = keys[index],
    b = keys[next],
    t = (frame - a.frame) / (b.frame - a.frame),
    hold = a.interpolation === 'step',
    smooth = a.interpolation === 'spline' || (mode === 'smooth' && a.interpolation === 'smooth'),
    eased = hold
      ? 0
      : a.interpolation === 'bezier'
        ? cubicEase(t, a.easing || [1 / 3, 0, 2 / 3, 1])
        : t;
  const blend = (group: 'position' | 'scale', axis: number) => {
    const curve = a.curves?.[`${group}.${(['x', 'y', 'z'] as const)[axis]}`];
    const fraction = a.interpolation === 'bezier' && curve ? cubicEase(t, curve) : eased;
    return a[group][axis] + (b[group][axis] - a[group][axis]) * fraction;
  };
  const position = a.position.map((_, axis) =>
    smooth ? component(keys, index, axis, t) : blend('position', axis),
  ) as Vec3;
  const q = new Quaternion()
    .setFromEuler(new Euler(...a.rotation))
    .slerp(
      new Quaternion().setFromEuler(new Euler(...b.rotation)),
      Math.min(1, Math.max(0, eased)),
    );
  const rotation = new Euler().setFromQuaternion(q);
  const lens = a.fov ?? fov;
  const scale = a.scale.map((_, axis) => Math.max(0.001, blend('scale', axis))) as Vec3;
  return {
    scale,
    position,
    rotation: [rotation.x, rotation.y, rotation.z] as Vec3,
    fov: lens + ((b.fov ?? fov) - lens) * eased,
  };
}
export function cameraLens(keys: readonly Keyframe[], frame: number, fallback: number) {
  const next = upperFrame(keys, frame),
    a = keys[next - 1],
    b = keys[next];
  if (!a) return b?.fov ?? fallback;
  if (!b || a.interpolation === 'step') return a.fov ?? fallback;
  const t = (frame - a.frame) / (b.frame - a.frame),
    v =
      a.interpolation === 'smooth'
        ? t * t * (3 - 2 * t)
        : a.interpolation === 'bezier'
          ? cubicEase(t, a.easing || [1 / 3, 0, 2 / 3, 1])
          : t;
  return (a.fov ?? fallback) + ((b.fov ?? fallback) - (a.fov ?? fallback)) * v;
}
export const cameraMoveNames = {
  orbit: 'Subject Orbit',
  push: 'Push In',
  pull: 'Pull Back',
  reveal: 'Rise & Reveal',
  truck: 'Side Tracking',
  dolly: 'Dolly Zoom',
  crane: 'Crane Down',
  dutch: 'Dutch Reveal',
  overhead: 'Overhead Sweep',
} as const;
export type CameraMove = keyof typeof cameraMoveNames;
export function designCameraMove(
  move: CameraMove,
  target: Vec3,
  from: Vec3,
  radius: number,
  start: number,
  duration: number,
  fov: number,
): Keyframe[] {
  const focus = new Vector3(...target),
    offset = new Vector3(...from).sub(focus),
    length = Math.max(1, radius * 1.7),
    up = new Vector3(0, 1, 0);
  if (offset.length() < length) offset.set(length * 0.65, length * 0.35, length);
  const lateral = new Vector3()
    .crossVectors(up, offset)
    .normalize()
    .multiplyScalar(Math.max(1, offset.length() * 0.48));
  if (lateral.lengthSq() < 1e-7) lateral.set(length * 0.48, 0, 0);
  return [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const point = offset.clone();
    let lens = fov;
    if (move === 'orbit') point.applyAxisAngle(up, t * Math.PI * 0.72);
    if (move === 'push') point.multiplyScalar(1 - t * 0.5);
    if (move === 'pull') point.multiplyScalar(1 + t * 0.7);
    if (move === 'dolly') {
      const distance = 1 - t * 0.43;
      point.multiplyScalar(distance);
      lens = Math.min(
        120,
        (2 * Math.atan(Math.tan((fov * Math.PI) / 360) / distance) * 180) / Math.PI,
      );
    }
    if (move === 'crane')
      point.addScaledVector(up, (1 - t) * length * 1.32).addScaledVector(lateral, (1 - t) * -0.28);
    if (move === 'dutch') point.addScaledVector(lateral, t * 0.48).multiplyScalar(1 - t * 0.24);
    if (move === 'overhead') {
      point.y = Math.max(point.y, offset.length() * 0.88);
      point.x *= 0.58;
      point.z *= 0.58;
      point.applyAxisAngle(up, (t - 0.3) * Math.PI * 0.59);
    }
    if (move === 'reveal')
      point.addScaledVector(lateral, t * 0.95).addScaledVector(up, t * length * 0.8);
    if (move === 'truck') point.addScaledVector(lateral, t * 1.45);
    const position = point.add(focus).toArray() as Vec3;
    const transform = lookAtTransform(position, target);
    if (move === 'dutch') {
      const camera = new Quaternion()
        .setFromEuler(new Euler(...transform.rotation))
        .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -0.25 * (1 - t)));
      const angles = new Euler().setFromQuaternion(camera);
      transform.rotation = [angles.x, angles.y, angles.z];
    }
    return {
      ...transform,
      frame: Math.round(start + t * duration),
      fov: lens,
      interpolation: 'smooth',
    };
  });
}
