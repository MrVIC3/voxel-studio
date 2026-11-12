import { lowerFrame, upperFrame } from './time-index';

export const faceChannels = ['lookX', 'lookY', 'blink', 'brow', 'smile', 'jaw'] as const;
export type FaceChannel = (typeof faceChannels)[number];
export type FacePose = Record<FaceChannel, number>;
export type FaceKey = {
  frame: number;
  interpolation: 'linear' | 'smooth' | 'step';
  pose: FacePose;
};
export const eyeDimensionFields = {
  width: [2.12, 0.5, 3.8],
  height: [1.16, 0.35, 2.65],
  depth: [0.48, 0.05, 1.2],
  offsetX: [0, -1.5, 1.5],
  offsetY: [0, -1.5, 1.5],
  protrusion: [0, 0, 1],
  irisWidth: [0.82, 0.15, 2],
  irisHeight: [0.93, 0.15, 2.2],
  irisDepth: [0.24, 0.02, 0.8],
  pupilWidth: [0.42, 0.08, 1.45],
  pupilHeight: [0.59, 0.08, 1.6],
  pupilDepth: [0.12, 0.015, 0.45],
  upperLid: [0.14, 0.04, 0.65],
  lowerLid: [0.11, 0.04, 0.65],
  tilt: [0, -30, 30],
  upperLidDepth: [0.32, 0.05, 1.4],
  lowerLidDepth: [0.3, 0.05, 1.4],
  upperLidWidth: [1.03, 0.55, 1.18],
  lowerLidWidth: [1.01, 0.55, 1.18],
  gazeX: [0.52, 0, 1.1],
  gazeY: [0.26, 0, 0.8],
} as const;
export type EyeDimensions = Record<keyof typeof eyeDimensionFields, number>;
export const eyeSides = ['both', 'left', 'right'] as const;
export type EyeSide = (typeof eyeSides)[number];
export const facialLayers = [
  'sclera',
  'iris',
  'pupil',
  'catchlight',
  'eyelids',
  'brows',
  'mouth',
] as const;
export type FacialLayer = (typeof facialLayers)[number];
export type FaceRigConfig = {
  enabled: boolean;
  autoLife: boolean;
  style: 'original' | 'classic' | 'pixel3d' | 'story' | 'cinematic';
  eyeRow: number;
  eyeSpacing: number;
  eyeWidth?: number;
  eyeHeight?: number;
  eyeGeometry?: Partial<Record<EyeSide, Partial<EyeDimensions>>>;
  layers?: Partial<Record<FacialLayer, boolean>>;
  mouthWidth?: number;
  mouthHeight?: number;
  mouthRow?: number;
  mouthDepth?: number;
  browWidth?: number;
  browHeight?: number;
  browDepth?: number;
  browOffset?: number;
  iris?: string;
  mouth: boolean;
  pose: FacePose;
};
export function eyeDimensions(config: FaceRigConfig, side: EyeSide): EyeDimensions {
  const result = Object.fromEntries(
    Object.entries(eyeDimensionFields).map(([key, [initial]]) => [key, initial]),
  ) as EyeDimensions;
  if (config.style === 'pixel3d')
    Object.assign(result, {
      width: 2,
      height: 1,
      depth: 0.23,
      irisWidth: 0.94,
      irisHeight: 0.98,
      irisDepth: 0.055,
    });
  if (config.style === 'story')
    Object.assign(result, {
      width: 2.34, height: 1.02, depth: 0.15,
      irisWidth: 0.75, irisHeight: 1, irisDepth: 0.045,
      upperLid: 0.18, lowerLid: 0.09, gazeX: 0.74,
    });
  result.width *= config.eyeWidth ?? 1;
  result.height *= config.eyeHeight ?? 1;
  const depth =
    config.eyeGeometry?.[side]?.depth ?? config.eyeGeometry?.both?.depth ?? result.depth;
  result.upperLidDepth = depth * 1.16;
  result.lowerLidDepth = depth * 1.11;
  return { ...result, ...config.eyeGeometry?.both, ...config.eyeGeometry?.[side] };
}

export const neutralFace: FacePose = { lookX: 0, lookY: 0, blink: 0, brow: 0, smile: 0, jaw: 0 };
export const defaultFaceRig: FaceRigConfig = {
  enabled: false,
  autoLife: true,
  style: 'pixel3d',
  eyeRow: 4,
  eyeSpacing: 2,
  mouth: true,
  pose: neutralFace,
};
export const facePresets = {
  Neutral: neutralFace,
  Smile: { ...neutralFace, smile: 0.8, brow: 0.22, jaw: 0.14 },
  Focus: { ...neutralFace, blink: 0.25, brow: -0.75, smile: -0.2 },
  Surprise: { ...neutralFace, brow: 0.9, jaw: 0.8 },
  Concern: { ...neutralFace, lookY: -0.2, brow: 0.45, smile: -0.7, jaw: 0.1 },
} satisfies Record<string, FacePose>;

function range(value: unknown, low: number, high: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;
}
export function validateFacePose(value: unknown): value is FacePose {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const pose = value as Partial<FacePose>;
  return faceChannels.every((name) =>
    range(pose[name], name === 'blink' || name === 'jaw' ? 0 : -1, 1),
  );
}
export function validateFaceRig(value: unknown): value is FaceRigConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const face = value as Partial<FaceRigConfig>;
  return (
    typeof face.enabled === 'boolean' &&
    typeof face.autoLife === 'boolean' &&
    typeof face.mouth === 'boolean' &&
    (face.style === 'original' ||
      face.style === 'classic' ||
      face.style === 'pixel3d' ||
      face.style === 'story' ||
      face.style === 'cinematic') &&
    range(face.eyeRow, 2, 5.5) &&
    range(face.eyeSpacing, 1.2, 2.6) &&
    [
      face.eyeWidth,
      face.eyeHeight,
      face.mouthWidth,
      face.mouthHeight,
      face.browWidth,
      face.browHeight,
    ].every((scale) => scale === undefined || range(scale, 0.5, 2)) &&
    [face.mouthDepth, face.browDepth].every(
      (depth) => depth === undefined || range(depth, 0.04, 1.2),
    ) &&
    (face.browOffset === undefined || range(face.browOffset, -0.65, 0.65)) &&
    (face.mouthRow === undefined || range(face.mouthRow, 5, 7.2)) &&
    (face.eyeGeometry === undefined ||
      (!!face.eyeGeometry &&
        typeof face.eyeGeometry === 'object' &&
        !Array.isArray(face.eyeGeometry) &&
        Object.entries(face.eyeGeometry).every(
          ([side, dimensions]) =>
            eyeSides.includes(side as EyeSide) &&
            !!dimensions &&
            typeof dimensions === 'object' &&
            !Array.isArray(dimensions) &&
            Object.entries(dimensions).every(([key, n]) => {
              const limits =
                Object.hasOwn(eyeDimensionFields, key) &&
                eyeDimensionFields[key as keyof EyeDimensions];
              return !!limits && range(n, limits[1], limits[2]);
            }),
        ))) &&
    (face.layers === undefined ||
      (!!face.layers &&
        typeof face.layers === 'object' &&
        !Array.isArray(face.layers) &&
        Object.entries(face.layers).every(
          ([layer, visible]) =>
            facialLayers.includes(layer as FacialLayer) && typeof visible === 'boolean',
        ))) &&
    (face.iris === undefined ||
      (typeof face.iris === 'string' && /^#[\da-f]{6}$/i.test(face.iris))) &&
    validateFacePose(face.pose)
  );
}
export function validateFaceKeys(value: unknown, duration: number): value is FaceKey[] {
  if (!Array.isArray(value) || value.length > 36001) return false;
  let previous = -1;
  for (const key of value) {
    if (
      !key ||
      !Number.isInteger(key.frame) ||
      key.frame <= previous ||
      key.frame < 0 ||
      key.frame > duration ||
      !['linear', 'smooth', 'step'].includes(key.interpolation) ||
      !validateFacePose(key.pose)
    )
      return false;
    previous = key.frame;
  }
  return true;
}

export function setFaceKey(
  keys: readonly FaceKey[] = [],
  frame: number,
  pose: FacePose,
  interpolation?: FaceKey['interpolation'],
): FaceKey[] {
  const time = Math.max(0, Math.round(frame));
  const index = lowerFrame(keys, time);
  const previous = keys[index]?.frame === time ? keys[index] : undefined;
  return [
    ...keys.slice(0, index),
    {
      frame: time,
      pose: { ...pose },
      interpolation: interpolation ?? previous?.interpolation ?? 'smooth',
    },
    ...keys.slice(index + (previous ? 1 : 0)),
  ];
}

function hash(value: string) {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return result >>> 0;
}
function random(seed: number, index: number) {
  let value = seed ^ Math.imul(index, 0x9e3779b1);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}
const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));
const smooth = (n: number) => n * n * (3 - 2 * n);

/** Pure time evaluation: arbitrary seeks and offline renders produce the same performance. */
export function evaluateFace(
  rig: FaceRigConfig | undefined,
  keys: readonly FaceKey[] | undefined,
  frame: number,
  fps: number,
  id: string,
  automatic = true,
): FacePose {
  if (keys?.length) {
    if (frame <= keys[0].frame) return keys[0].pose;
    if (frame >= keys[keys.length - 1].frame) return keys[keys.length - 1].pose;
    const index = upperFrame(keys, frame);
    const a = keys[index - 1],
      b = keys[index];
    if (a.interpolation === 'step' || frame === a.frame) return a.pose;
    const mix = (frame - a.frame) / (b.frame - a.frame);
    const t = a.interpolation === 'smooth' ? smooth(mix) : mix;
    const result = { ...a.pose };
    for (const channel of faceChannels) result[channel] += (b.pose[channel] - a.pose[channel]) * t;
    return result;
  }
  const pose = rig?.pose ?? neutralFace;
  if (!rig?.enabled || !rig.autoLife || !automatic) return pose;
  const seed = hash(id),
    seconds = Math.max(0, frame) / Math.max(1, fps);
  // Scheduled blinks with alternating cadence, fast closure and slower release.
  const shifted = seconds + random(seed, 111) * 4.3;
  const cycle = Math.floor(shifted / 4.8);
  const blinkAt = cycle * 4.8 + 0.65 + random(seed, cycle) * 3.2;
  const elapsed = shifted - blinkAt;
  const blink =
    elapsed < 0 || elapsed > 0.205
      ? 0
      : elapsed < 0.075
        ? smooth(elapsed / 0.075)
        : 1 - smooth((elapsed - 0.075) / 0.13);
  const gazeTime = seconds + random(seed, 112) * 2;
  const gazePeriod = 2.1;
  const gazeIndex = Math.floor(gazeTime / gazePeriod);
  const gazeAt = gazeIndex * gazePeriod + 0.12 + random(seed, gazeIndex * 4 + 17003) * 1.4;
  const t = smooth(clamp((gazeTime - gazeAt) / 0.14, 0, 1));
  const gaze = (offset: number) => {
    const previous = random(seed, (gazeIndex - 1) * 4 + offset);
    const current = random(seed, gazeIndex * 4 + offset);
    return (previous + (current - previous) * t) * 2 - 1;
  };
  return {
    ...pose,
    blink: Math.max(pose.blink, blink),
    lookX: clamp(pose.lookX + gaze(17001) * 0.16, -1, 1),
    lookY: clamp(pose.lookY + gaze(17002) * 0.11, -1, 1),
  };
}

export function applyFaceClip(
  existing: readonly FaceKey[] | undefined,
  source: readonly FaceKey[],
  start: number,
  length: number,
  end: number,
  cycles: number,
  speed: number,
): FaceKey[] {
  const frames = new Map(
    (existing ?? [])
      .filter((key) => key.frame < start || key.frame > end)
      .map((key) => [key.frame, key]),
  );
  for (let cycle = 0; cycle < cycles; cycle++) {
    for (const key of source) {
      const frame = start + cycle * length + Math.min(length, Math.round(key.frame / speed));
      if (frame <= end) frames.set(frame, { ...key, frame, pose: { ...key.pose } });
    }
  }
  return [...frames.values()].sort((a, b) => a.frame - b.frame);
}

export function captureFaceClip(keys: readonly FaceKey[], start: number, end: number): FaceKey[] {
  if (!keys.length) return [];
  const times = new Set([
    start,
    ...keys.filter((k) => k.frame > start && k.frame < end).map((k) => k.frame),
    end,
  ]);
  const baked = new Set<number>();
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i],
      b = keys[i + 1];
    // A trimmed smoothstep cannot be expressed by a new ordinary smoothstep. Preserve its
    // frame samples exactly instead of changing the performance at the capture boundaries.
    if (a.interpolation === 'smooth' && (a.frame < start || b.frame > end)) {
      const from = Math.max(start, a.frame),
        to = Math.min(end, b.frame);
      for (let frame = from; frame < to; frame++) {
        times.add(frame);
        baked.add(frame);
      }
    }
  }
  let segment = 0;
  return [...times]
    .sort((a, b) => a - b)
    .map((frame) => {
      while (segment + 1 < keys.length && keys[segment + 1].frame <= frame) segment++;
      return {
        frame: frame - start,
        interpolation: baked.has(frame) ? 'linear' : keys[segment].interpolation,
        pose: { ...evaluateFace(undefined, keys, frame, 1, '', false) },
      };
    });
}
