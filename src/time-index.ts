export function upperFrame<T extends { frame: number }>(keys: readonly T[], frame: number) {
  let low = 0,
    high = keys.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (keys[mid].frame <= frame) low = mid + 1;
    else high = mid;
  }
  return low;
}
export function lowerFrame<T extends { frame: number }>(keys: readonly T[], frame: number) {
  let low = 0,
    high = keys.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (keys[mid].frame < frame) low = mid + 1;
    else high = mid;
  }
  return low;
}
export function frameTicks(duration: number, pixelsPerFrame: number) {
  const ideal = 62 / Math.max(pixelsPerFrame, 1e-7),
    base = 10 ** Math.floor(Math.log10(ideal));
  return Math.min(
    duration,
    Math.max(1, Math.ceil([1, 2, 5, 10].map((n) => n * base).find((n) => n >= ideal) || base * 10)),
  );
}
