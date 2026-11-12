import { Euler } from 'three';
import type { Quaternion } from 'three';
import type { Vec3 } from './model';

export function continuousEuler(q: Quaternion, previous?: Vec3): Vec3 {
  const { x, y, z } = new Euler().setFromQuaternion(q, 'XYZ');
  if (!previous) return [x, y, z];
  const near = (v: Vec3) =>
    v.map((n, i) => n + 2 * Math.PI * Math.round((previous[i] - n) / (2 * Math.PI))) as Vec3;
  const first = near([x, y, z]),
    second = near([x + Math.PI, Math.PI - y, z + Math.PI]);
  const cost = (v: Vec3) => v.reduce((sum, n, i) => sum + (n - previous[i]) ** 2, 0);
  return cost(first) <= cost(second) ? first : second;
}
