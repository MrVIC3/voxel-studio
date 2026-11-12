export const cameraEffectKinds = [
  'impact',
  'whip',
  'zoom',
  'flash',
  'glitch',
  'fadeIn',
  'fadeOut',
  'focus',
] as const;
export type CameraEffectKind = (typeof cameraEffectKinds)[number];
export const cameraEffectNames: Record<CameraEffectKind, string> = {
  impact: 'Impact shake',
  whip: 'Whip pan accent',
  zoom: 'Crash zoom',
  flash: 'Light flash',
  glitch: 'Signal glitch',
  fadeIn: 'Fade in',
  fadeOut: 'Fade out',
  focus: 'Rack focus',
};
export const shakeStyles = ['off', 'handheld', 'shoulder', 'vehicle', 'tremor'] as const;
export type ShakeStyle = (typeof shakeStyles)[number];
export type LensEffects = {
  distortion: number;
  fringe: number;
  diffusion: number;
  streak: number;
  grain: number;
  vignette: number;
  matte: number;
  focus: 'scene' | 'manual' | 'subject';
  distance: number;
  aperture: number;
  subject?: string;
};
export type CameraEvent = {
  id: string;
  kind: CameraEffectKind;
  start: number;
  duration: number;
  strength: number;
  color?: string;
  distance?: number;
};
export type CameraEffects = {
  lens: LensEffects;
  shake: { style: ShakeStyle; strength: number; speed: number; roll: number; seed: number };
  events: CameraEvent[];
};
export const defaultLensEffects: LensEffects = {
  distortion: 0,
  fringe: 0,
  diffusion: 0,
  streak: 0,
  grain: 0,
  vignette: 0,
  matte: 0,
  focus: 'scene',
  distance: 4,
  aperture: 0.35,
};
export const defaultCameraEffects: CameraEffects = {
  lens: defaultLensEffects,
  shake: { style: 'off', strength: 0.45, speed: 1, roll: 0.5, seed: 17 },
  events: [],
};
export const lensLooks = [
  { id: 'clean', name: 'Clean Glass', lens: {} },
  {
    id: 'portrait',
    name: 'Portrait Prime',
    lens: { focus: 'manual', aperture: 0.47, diffusion: 0.22, vignette: 0.22 },
  },
  {
    id: 'anamorphic',
    name: 'Anamorphic Scope',
    lens: {
      matte: 0.128,
      streak: 0.65,
      diffusion: 0.24,
      distortion: 0.13,
      fringe: 0.15,
      vignette: 0.18,
    },
  },
  {
    id: 'film',
    name: '35 mm Film',
    lens: { grain: 0.46, diffusion: 0.32, vignette: 0.28, fringe: 0.08 },
  },
  { id: 'wide', name: 'Wide Action', lens: { distortion: 0.46, fringe: 0.13, vignette: 0.28 } },
  {
    id: 'signal',
    name: 'Surveillance',
    lens: { grain: 0.57, distortion: 0.21, fringe: 0.28, vignette: 0.48 },
  },
] as const satisfies readonly { id: string; name: string; lens: Partial<LensEffects> }[];

export const maxCameraEvents = 64;
export function validCameraEffects(value: unknown): value is CameraEffects {
  if (!value || typeof value !== 'object') return false;
  const { lens, shake, events } = value as CameraEffects;
  const between = (n: number, min: number, max: number) =>
    Number.isFinite(n) && n >= min && n <= max;
  if (!lens || !shake || !Array.isArray(events) || events.length > maxCameraEvents) return false;
  if (
    !between(lens.distortion, -1, 1) ||
    !between(lens.matte, 0, 0.25) ||
    !between(lens.distance, 0.1, 2000) ||
    !['scene', 'manual', 'subject'].includes(lens.focus) ||
    (lens.subject !== undefined && typeof lens.subject !== 'string') ||
    ![lens.fringe, lens.diffusion, lens.streak, lens.grain, lens.vignette, lens.aperture].every(
      (n) => between(n, 0, 1),
    ) ||
    !shakeStyles.includes(shake.style) ||
    !between(shake.strength, 0, 2) ||
    !between(shake.speed, 0.1, 4) ||
    !between(shake.roll, 0, 1) ||
    !Number.isInteger(shake.seed) ||
    !between(shake.seed, 0, 9999)
  )
    return false;
  const ids = new Set<string>();
  return events.every((event) => {
    if (
      !event ||
      typeof event.id !== 'string' ||
      !event.id.length ||
      event.id.length > 100 ||
      ids.has(event.id) ||
      !cameraEffectKinds.includes(event.kind) ||
      !Number.isInteger(event.start) ||
      !between(event.start, 0, 36000) ||
      !Number.isInteger(event.duration) ||
      !between(event.duration, 1, 36000) ||
      event.start + event.duration > 36001 ||
      !between(event.strength, 0, 2) ||
      (event.color !== undefined && !/^#[0-9a-f]{6}$/i.test(event.color)) ||
      (event.distance !== undefined && !between(event.distance, 0.1, 2000))
    )
      return false;
    ids.add(event.id);
    return true;
  });
}

export type CameraFXSample = {
  lens: LensEffects;
  x: number;
  y: number;
  z: number;
  pitch: number;
  yaw: number;
  roll: number;
  zoom: number;
  flash: number;
  flashColor: string;
  fade: number;
  fadeColor: string;
  glitch: number;
  focusDistance?: number;
};
const profiles = {
  handheld: [1.65, 0.027, 0.014, 0.42],
  shoulder: [2.4, 0.052, 0.026, 0.62],
  vehicle: [7, 0.044, 0.022, 0.85],
  tremor: [4.4, 0.094, 0.046, 1],
} as const;
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const drift = (t: number, phase: number) =>
  0.64 * Math.sin(t + phase) +
  0.25 * Math.sin(t * 1.83 + phase * 0.77) +
  0.11 * Math.sin(t * 3.17 + phase * 1.39);

/** Evaluate directly from project time so scrubbing and offline rendering agree. */
export function sampleCameraEffects(fx: CameraEffects, frame: number, fps: number): CameraFXSample {
  const s: CameraFXSample = {
    lens: fx.lens,
    x: 0,
    y: 0,
    z: 0,
    pitch: 0,
    yaw: 0,
    roll: 0,
    zoom: 1,
    flash: 0,
    flashColor: '#ffffff',
    fade: 0,
    fadeColor: '#000000',
    glitch: 0,
  };
  const shake = fx.shake;
  if (shake.style !== 'off' && shake.strength > 0) {
    const [rate, move, rotate, roll] = profiles[shake.style];
    const t = (frame / fps) * rate * shake.speed * Math.PI * 2,
      p = shake.seed * 1.173;
    s.x = drift(t, p) * move * shake.strength;
    s.y = drift(t * 0.89, p + 3) * move * shake.strength;
    s.z = drift(t * 0.6, p + 9) * move * shake.strength * 0.44;
    s.pitch = drift(t * 0.74, p + 12) * rotate * shake.strength;
    s.yaw = drift(t * 0.93, p + 6) * rotate * shake.strength;
    s.roll = drift(t * 0.51, p + 20) * rotate * roll * shake.roll * shake.strength;
  }
  let fade: CameraEvent | undefined;
  const racks: CameraEvent[] = [];
  for (const event of fx.events) {
    if (frame < event.start || event.strength === 0) continue;
    if (event.kind === 'fadeIn' || event.kind === 'fadeOut') {
      if (!fade || event.start >= fade.start) fade = event;
      continue;
    }
    if (event.kind === 'focus') {
      racks.push(event);
      continue;
    }
    const t = (frame - event.start) / event.duration;
    if (t >= 1) continue;
    const pulse = (1 - t) ** 2 * event.strength;
    if (event.kind === 'impact') {
      const ring = ((frame - event.start) / fps) * 34;
      s.y -= Math.cos(ring) * pulse * 0.125;
      s.x += Math.sin(ring * 1.36) * pulse * 0.085;
      s.pitch += Math.cos(ring * 0.76) * pulse * 0.073;
      s.yaw += Math.sin(ring * 1.12) * pulse * 0.05;
      s.roll += Math.cos(ring * 1.24) * pulse * 0.04;
    }
    if (event.kind === 'whip') {
      const swing = Math.sin(Math.PI * t) ** 2 * event.strength;
      s.yaw += swing * 0.42;
      s.roll -= swing * 0.068;
      s.glitch = Math.max(s.glitch, swing * 0.12);
    }
    if (event.kind === 'zoom')
      s.zoom *= 1 + Math.sin(Math.PI * Math.pow(t, 0.58)) ** 2 * event.strength * 0.63;
    if (event.kind === 'flash' && pulse > s.flash) {
      s.flash = pulse;
      s.flashColor = event.color ?? '#ffffff';
    }
    if (event.kind === 'glitch') s.glitch = Math.max(s.glitch, pulse);
  }
  if (fade) {
    const t = smooth(clamp01((frame - fade.start) / fade.duration));
    s.fade = clamp01((fade.kind === 'fadeIn' ? 1 - t : t) * fade.strength);
    s.fadeColor = fade.color ?? '#000000';
  }
  if (racks.length) {
    let distance = fx.lens.distance;
    for (const rack of racks.sort((a, b) => a.start - b.start)) {
      const amount = smooth(clamp01((frame - rack.start) / rack.duration)) * clamp01(rack.strength);
      distance += ((rack.distance ?? 2) - distance) * amount;
    }
    s.focusDistance = distance;
  }
  return s;
}
