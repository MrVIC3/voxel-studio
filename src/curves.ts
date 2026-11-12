export type CubicEase = [number, number, number, number];
export type TransformChannel = `${'position' | 'rotation' | 'scale'}.${'x' | 'y' | 'z'}`;
/** A monotone Hermite segment keeps the velocity through intermediate keys without overshoot. */
export function splineValue(
  from: number,
  to: number,
  t: number,
  span: number,
  before?: { value: number; span: number },
  after?: { value: number; span: number },
) {
  const slope = (to - from) / span;
  const tangent = (other: number) =>
    slope * other <= 0 ? 0 : (2 * slope * other) / (slope + other);
  const m0 = before ? tangent((from - before.value) / before.span) * span : 0;
  const m1 = after ? tangent((after.value - to) / after.span) * span : 0;
  const t2 = t * t,
    t3 = t2 * t;
  return from + (to - from) * (3 * t2 - 2 * t3) + m0 * (t3 - 2 * t2 + t) + m1 * (t3 - t2);
}
export const easePresets: Record<string, CubicEase> = {
  'Ease In Out': [0.42, 0, 0.58, 1],
  'Ease In': [0.42, 0, 1, 1],
  'Ease Out': [0, 0, 0.58, 1],
  Anticipation: [0.4, -0.6, 0.6, 1],
  Overshoot: [0.3, 0, 0.6, 1.55],
  Linear: [1 / 3, 1 / 3, 2 / 3, 2 / 3],
};
export function cubicEase(t: number, curve: CubicEase): number {
  if (t <= 0 || t >= 1) return Math.max(0, Math.min(1, t));
  const [x1, y1, x2, y2] = curve;
  const sample = (u: number, a: number, b: number) =>
    3 * (1 - u) ** 2 * u * a + 3 * (1 - u) * u * u * b + u ** 3;
  let low = 0,
    high = 1,
    u = t;
  for (let i = 0; i < 24; i++) {
    const x = sample(u, x1, x2);
    if (Math.abs(x - t) < 1e-7) break;
    if (x < t) low = u;
    else high = u;
    u = (low + high) / 2;
  }
  return sample(u, y1, y2);
}
export function validCurve(value: unknown): value is CubicEase {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((v) => typeof v === 'number' && Number.isFinite(v)) &&
    value[0] >= 0 &&
    value[0] <= 1 &&
    value[2] >= 0 &&
    value[2] <= 1 &&
    value[1] >= -4 &&
    value[1] <= 4 &&
    value[3] >= -4 &&
    value[3] <= 4
  );
}
