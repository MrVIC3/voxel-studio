export const lookParts = [
  'all',
  'head',
  'body',
  'arms',
  'leftArm',
  'rightArm',
  'legs',
  'leftLeg',
  'rightLeg',
  'skin',
  'hair',
  'clothes',
  'armor',
  'eyes',
  'mouth',
  'detail',
] as const;
export type LookPart = (typeof lookParts)[number];
export type LookResponse = {
  light: number;
  glow: number;
  rim?: number;
  specular?: number;
  outline?: number;
  maskColor?: string;
  maskTolerance?: number;
};
export type CharacterLook = {
  enabled?: boolean;
  yaw: number;
  pitch: number;
  softness: number;
  outline: number;
  outlineColor: string;
  type?: 'directional' | 'point';
  distance?: number;
  range?: number;
  power?: number;
  spread?: number;
  sharpness?: number;
  tint?: string;
  tintMix?: number;
  outlineOpacity?: number;
  outlineSoftness?: number;
  parts: Partial<Record<LookPart, LookResponse>>;
};
export const lookDefaults = {
  distance: 1.65,
  range: 4,
  power: 1,
  spread: 0.3,
  sharpness: 1.65,
  tint: '#ffffff',
  tintMix: 0,
  outlineOpacity: 1,
  rim: 0.73,
  specular: 0,
  maskTolerance: 0.15,
} as const;
const partLabels: Partial<Record<LookPart, string>> = {
  all: 'Whole character',
  detail: 'Painted detail',
  leftArm: 'Left arm',
  rightArm: 'Right arm',
  leftLeg: 'Left leg',
  rightLeg: 'Right leg',
};
export const lookPartLabel = (part: LookPart) =>
  partLabels[part] ?? part[0].toUpperCase() + part.slice(1);
export const lookFallback = (look: CharacterLook, part: LookPart): LookResponse =>
  look.parts[part] ??
  (part === 'eyes' || part === 'mouth'
    ? look.parts.head
    : part.endsWith('Arm')
      ? look.parts.arms
      : part.endsWith('Leg')
        ? look.parts.legs
        : undefined) ??
  look.parts.all ?? { light: 0, glow: 0 };
export const defaultCharacterLook: CharacterLook = {
  yaw: 45,
  pitch: 30,
  softness: 0.55,
  outline: 0,
  outlineColor: '#ffffff',
  parts: { all: { light: 1.15, glow: 0 } },
};
export function validCharacterLook(value: unknown): value is CharacterLook {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const look = value as CharacterLook;
  const inRange = (n: number, min: number, max: number) =>
    Number.isFinite(n) && n >= min && n <= max;
  const optional = (n: number | undefined, min: number, max: number) =>
    n === undefined || inRange(n, min, max);
  const color = (value: unknown) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
  return (
    (look.enabled === undefined || typeof look.enabled === 'boolean') &&
    inRange(look.yaw, -180, 180) &&
    inRange(look.pitch, -85, 85) &&
    inRange(look.softness, 0.05, 1) &&
    inRange(look.outline, 0, 0.05) &&
    color(look.outlineColor) &&
    (look.type === undefined || look.type === 'directional' || look.type === 'point') &&
    optional(look.distance, 0.35, 12) &&
    optional(look.range, 0.25, 16) &&
    optional(look.power, 0, 4) &&
    optional(look.spread, -0.8, 0.7) &&
    optional(look.sharpness, 0.4, 8) &&
    (look.tint === undefined || color(look.tint)) &&
    optional(look.tintMix, 0, 1) &&
    optional(look.outlineOpacity, 0, 1) &&
    optional(look.outlineSoftness, 0.05, 1) &&
    !!look.parts &&
    typeof look.parts === 'object' &&
    !Array.isArray(look.parts) &&
    Object.entries(look.parts).every(
      ([id, v]) =>
        lookParts.includes(id as LookPart) &&
        v &&
        inRange(v.light, 0, 4) &&
        inRange(v.glow, 0, 5) &&
        optional(v.rim, 0, 1) &&
        optional(v.specular, 0, 3) &&
        optional(v.outline, 0, 1) &&
        optional(v.maskTolerance, 0.02, 0.85) &&
        (v.maskColor === undefined || color(v.maskColor)),
    )
  );
}
