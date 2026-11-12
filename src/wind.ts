export type WindSettings = {
  enabled: boolean;
  strength: number;
  speed: number;
  direction: number;
  gust: number;
};

export const defaultWind: WindSettings = {
  enabled: true,
  strength: 0.07,
  speed: 1,
  direction: 35,
  gust: 0.25,
};

export const windControls = [
  ['strength', 'Sway', 0, 0.45, 0.01],
  ['speed', 'Speed', 0, 5, 0.05],
  ['direction', 'Direction', -180, 180, 1],
  ['gust', 'Gusts', 0, 1, 0.01],
] as const;

export function validWind(value: WindSettings) {
  return (
    value &&
    typeof value.enabled === 'boolean' &&
    windControls.every(
      ([key, , min, max]) => Number.isFinite(value[key]) && value[key] >= min && value[key] <= max,
    )
  );
}
