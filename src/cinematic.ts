import { defaultLighting, lookAtTransform, uid } from './model';
import type { Lighting, Project, SceneObject, Vec3 } from './model';

export const cinematicLooks = [
  {
    id: 'golden-hour',
    name: 'Golden Hour',
    description: 'Low amber sun, cool fill and warm shafts.',
    swatch: '#c0916a',
  },
  {
    id: 'blue-hour',
    name: 'Blue Hour',
    description: 'Soft moonlight, blue haze and silver edges.',
    swatch: '#586da3',
  },
  {
    id: 'noir',
    name: 'Neon Noir',
    description: 'Cool key, magenta rim and deep night contrast.',
    swatch: '#725584',
  },
  {
    id: 'studio',
    name: 'Studio Portrait',
    description: 'Soft key, controlled fill and tracked focus.',
    swatch: '#988e87',
  },
  {
    id: 'overcast',
    name: 'Overcast Film',
    description: 'Broad skylight, mist and muted color.',
    swatch: '#899d9b',
  },
] as const;
export type CinematicMode = (typeof cinematicLooks)[number]['id'];
export type CinematicPresetId = CinematicMode | 'standard';

/** World distances are in blocks. Look controls are independent of render quality. */
export type CinematicSettings = {
  mode: CinematicMode;
  rigIds: string[];
  skyFill: string;
  groundFill: string;
  hazeTint: string;
  atmosphere: number;
  hazeHeight: number;
  hazeBase: number;
  hazeRange: number;
  lightShafts: number;
  focusDistance: number;
  focusSubject?: string;
  depthOfField: number;
  bloomThreshold: number;
  bloomRadius: number;
  contrast: number;
  saturation: number;
  shadowTint: string;
  highlightTint: string;
  vignette: number;
  grain: number;
};

export type CinematicContext = {
  center: Vec3;
  radius: number;
  floor: number;
  towardCamera: Vec3;
  focusDistance: number;
  focusSubject?: string;
  sceneRadius?: number;
};

const fallbackContext: CinematicContext = {
  center: [0, 1, 0],
  radius: 2,
  floor: 0,
  towardCamera: [0, 0, 1],
  focusDistance: 10,
};
type RigLight = {
  name: string;
  offset: Vec3;
  size: number;
  color: string;
  intensity: number;
};
type Profile = {
  lighting: Partial<Lighting>;
  settings: Omit<
    CinematicSettings,
    'mode' | 'rigIds' | 'hazeBase' | 'hazeHeight' | 'hazeRange' | 'focusDistance' | 'focusSubject'
  >;
  rig: RigLight[];
};

const profiles: Record<CinematicMode, Profile> = {
  'golden-hour': {
    lighting: {
      sun: 4,
      ambient: 0.56,
      azimuth: -112,
      elevation: 15,
      warmth: '#ffc185',
      sky: '#9c796c',
      exposure: 1.04,
      environment: 0.28,
      softness: 2.6,
      bloomStrength: 0.19,
    },
    settings: {
      skyFill: '#b6c4eb',
      groundFill: '#574038',
      hazeTint: '#c4916c',
      atmosphere: 0.22,
      lightShafts: 0.54,
      depthOfField: 0.12,
      bloomThreshold: 0.93,
      bloomRadius: 0.52,
      contrast: 1.14,
      saturation: 1.04,
      shadowTint: '#adbdff',
      highlightTint: '#ffdda9',
      vignette: 0.22,
      grain: 0.1,
    },
    rig: [
      {
        name: 'Sky bounce',
        offset: [-1.8, 1.2, 2.2],
        size: 2.8,
        color: '#c5d9ff',
        intensity: 1.25,
      },
    ],
  },
  'blue-hour': {
    lighting: {
      sun: 1.5,
      ambient: 0.47,
      azimuth: 155,
      elevation: 32,
      warmth: '#c0d6ff',
      sky: '#2b3e62',
      exposure: 0.98,
      environment: 0.22,
      softness: 2.3,
      bloomStrength: 0.16,
    },
    settings: {
      skyFill: '#99b7fa',
      groundFill: '#2e3454',
      hazeTint: '#6481b0',
      atmosphere: 0.31,
      lightShafts: 0.38,
      depthOfField: 0.09,
      bloomThreshold: 0.86,
      bloomRadius: 0.56,
      contrast: 1.12,
      saturation: 0.88,
      shadowTint: '#92b7f9',
      highlightTint: '#ecf1ff',
      vignette: 0.3,
      grain: 0.11,
    },
    rig: [
      { name: 'Moon rim', offset: [1.7, 2.1, -2.7], size: 1.9, color: '#b5cbff', intensity: 3.2 },
      {
        name: 'Lantern bounce',
        offset: [-1.7, 1.2, 1.9],
        size: 2.1,
        color: '#ffc68c',
        intensity: 0.9,
      },
    ],
  },
  noir: {
    lighting: {
      sun: 0.72,
      ambient: 0.3,
      azimuth: -150,
      elevation: 27,
      warmth: '#a8d6ff',
      sky: '#151524',
      exposure: 1.13,
      environment: 0.2,
      softness: 1.8,
      bloomStrength: 0.28,
    },
    settings: {
      skyFill: '#7e94c7',
      groundFill: '#492c48',
      hazeTint: '#5b5b85',
      atmosphere: 0.22,
      lightShafts: 0.29,
      depthOfField: 0.25,
      bloomThreshold: 0.8,
      bloomRadius: 0.64,
      contrast: 1.22,
      saturation: 1.08,
      shadowTint: '#a3baff',
      highlightTint: '#ffd2ef',
      vignette: 0.37,
      grain: 0.15,
    },
    rig: [
      { name: 'Cyan key', offset: [-2.2, 1.7, 2.2], size: 2.1, color: '#77deff', intensity: 5.8 },
      {
        name: 'Magenta rim',
        offset: [2.4, 1.7, -1.7],
        size: 2.4,
        color: '#ff83c9',
        intensity: 8.2,
      },
      { name: 'Warm fill', offset: [1.9, 0.7, 2.5], size: 2.6, color: '#ffc995', intensity: 1.15 },
    ],
  },
  studio: {
    lighting: {
      sun: 0.2,
      ambient: 0.27,
      azimuth: -65,
      elevation: 43,
      warmth: '#fff1e3',
      sky: '#303035',
      exposure: 1.14,
      environment: 0.32,
      softness: 3.3,
      bloomStrength: 0.08,
    },
    settings: {
      skyFill: '#e1e7ff',
      groundFill: '#51463c',
      hazeTint: '#b3b5c4',
      atmosphere: 0.045,
      lightShafts: 0,
      depthOfField: 0.43,
      bloomThreshold: 1.15,
      bloomRadius: 0.35,
      contrast: 1.08,
      saturation: 0.98,
      shadowTint: '#c7d7f7',
      highlightTint: '#fff1d8',
      vignette: 0.24,
      grain: 0.06,
    },
    rig: [
      {
        name: 'Softbox key',
        offset: [-2.4, 2.4, 2.6],
        size: 2.4,
        color: '#fff0df',
        intensity: 6.3,
      },
      {
        name: 'Softbox fill',
        offset: [2.3, 1.1, 2.6],
        size: 3.1,
        color: '#d4e2ff',
        intensity: 2.3,
      },
      { name: 'Strip rim', offset: [1.2, 1.9, -2.5], size: 1.65, color: '#fff2da', intensity: 6.9 },
    ],
  },
  overcast: {
    lighting: {
      sun: 1.25,
      ambient: 0.9,
      azimuth: -38,
      elevation: 61,
      warmth: '#ebefff',
      sky: '#768889',
      exposure: 1.08,
      environment: 0.39,
      softness: 4.5,
      bloomStrength: 0.08,
    },
    settings: {
      skyFill: '#e1e7ed',
      groundFill: '#5e655e',
      hazeTint: '#9ea9a7',
      atmosphere: 0.3,
      lightShafts: 0.04,
      depthOfField: 0.08,
      bloomThreshold: 1.2,
      bloomRadius: 0.38,
      contrast: 0.99,
      saturation: 0.78,
      shadowTint: '#cadfd9',
      highlightTint: '#fff4df',
      vignette: 0.18,
      grain: 0.085,
    },
    rig: [
      { name: 'Cloud key', offset: [-1.5, 3.1, 1.5], size: 4.5, color: '#e1efff', intensity: 2.5 },
    ],
  },
};

const ranges = {
  atmosphere: [0, 1],
  hazeHeight: [0.1, 3000],
  hazeBase: [-1000000, 1000000],
  hazeRange: [1, 6000],
  lightShafts: [0, 1],
  focusDistance: [0.05, 6000],
  depthOfField: [0, 1],
  bloomThreshold: [0, 4],
  bloomRadius: [0, 1],
  contrast: [0.6, 1.6],
  saturation: [0, 2],
  vignette: [0, 1],
  grain: [0, 1],
} as const;

export function isCinematicSettings(value: unknown): value is CinematicSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const s = value as CinematicSettings;
  if (!cinematicLooks.some((look) => look.id === s.mode)) return false;
  if (
    !Array.isArray(s.rigIds) ||
    s.rigIds.length > 3 ||
    s.rigIds.some((id) => typeof id !== 'string' || !/^cine-[\w-]{1,70}$/.test(id))
  )
    return false;
  if (
    s.focusSubject !== undefined &&
    (typeof s.focusSubject !== 'string' || s.focusSubject.length > 160)
  )
    return false;
  if (
    ![s.skyFill, s.groundFill, s.hazeTint, s.shadowTint, s.highlightTint].every(
      (color) => typeof color === 'string' && /^#[\da-f]{6}$/i.test(color),
    )
  )
    return false;
  return Object.entries(ranges).every(([key, [low, high]]) => {
    const n = s[key as keyof typeof ranges];
    return typeof n === 'number' && Number.isFinite(n) && n >= low && n <= high;
  });
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function applyCinematicPreset(
  project: Project,
  mode: CinematicPresetId,
  context = fallbackContext,
): Project {
  const owned = new Set(project.lighting.cinematic?.rigIds || []);
  // Leave any fixture the animator has incorporated into a hierarchy or a track in the scene.
  const objects = project.objects.filter(
    (object) =>
      object.type !== 'light' ||
      !owned.has(object.id) ||
      project.tracks[object.id]?.length ||
      project.objects.some(
        (other) => other.parentId === object.id || other.cameraTarget === object.id,
      ),
  );
  const base = { ...defaultLighting, ground: project.lighting.ground };
  if (mode === 'standard') return { ...project, objects, lighting: base };

  const profile = profiles[mode];
  const target = context.center;
  const range = clamp(context.radius * 0.75, 0.85, 25);
  const [dx, , dz] = context.towardCamera;
  const len = Math.hypot(dx, dz);
  const x = len > 1e-6 ? dx / len : 0,
    z = len > 1e-6 ? dz / len : 1;
  const lights: SceneObject[] = profile.rig
    .slice(0, Math.max(0, 500 - objects.length))
    .map((light) => {
      const [right, up, front] = light.offset;
      const position: Vec3 = [
        target[0] + (right * z + front * x) * range,
        target[1] + up * range,
        target[2] + (-right * x + front * z) * range,
      ];
      return {
        id: 'cine-' + uid(),
        name: `Cinema · ${light.name}`,
        visible: true,
        type: 'light',
        lightType: 'area',
        color: light.color,
        intensity: light.intensity,
        width: clamp(light.size * range, 0.1, 100),
        height: clamp(light.size * range * 0.75, 0.1, 100),
        transform: lookAtTransform(position, target),
      };
    });

  return {
    ...project,
    objects: [...objects, ...lights],
    lighting: {
      ...base,
      ...profile.lighting,
      fog: 0,
      bloom: true,
      ao: true,
      aoIntensity: mode === 'noir' ? 0.87 : 0.72,
      cinematic: {
        ...profile.settings,
        mode,
        rigIds: lights.map((light) => light.id),
        hazeBase: clamp(context.floor, -1000000, 1000000),
        hazeHeight: clamp(context.radius * 0.55, 2.3, 3000),
        hazeRange: clamp(Math.max(context.radius * 9, (context.sceneRadius ?? 0) * 2.6), 45, 6000),
        focusDistance: clamp(context.focusDistance, 0.05, 6000),
        focusSubject: context.focusSubject,
        depthOfField: context.focusSubject
          ? profile.settings.depthOfField
          : Math.min(0.12, profile.settings.depthOfField),
      },
    },
  };
}
