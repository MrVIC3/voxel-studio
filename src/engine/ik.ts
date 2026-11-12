import { Vector3 } from 'three';
/** Analytic two-bone solver with a stable bend plane and clamped reach. */
export function solveTwoBone(
  start: Vector3,
  target: Vector3,
  pole: Vector3,
  upper: number,
  lower: number,
) {
  const direction = target.clone().sub(start);
  if (direction.lengthSq() < 1e-12) direction.set(0, -1, 0);
  direction.normalize();
  const distance = Math.max(
    Math.abs(upper - lower) + 1e-5,
    Math.min(upper + lower - 1e-5, target.distanceTo(start)),
  );
  const bend = pole
    .clone()
    .sub(start)
    .addScaledVector(direction, -pole.clone().sub(start).dot(direction));
  if (bend.lengthSq() < 1e-10) {
    bend.set(0, 0, 1).addScaledVector(direction, -direction.z);
    if (bend.lengthSq() < 1e-10) bend.set(1, 0, 0);
  }
  bend.normalize();
  const cosine = Math.max(
      -1,
      Math.min(1, (upper * upper + distance * distance - lower * lower) / (2 * upper * distance)),
    ),
    sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));
  return {
    elbow: start
      .clone()
      .addScaledVector(direction, upper * cosine)
      .addScaledVector(bend, upper * sine),
    end: start.clone().addScaledVector(direction, distance),
  };
}
