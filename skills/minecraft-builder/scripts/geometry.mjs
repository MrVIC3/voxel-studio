// Local deterministic geometry helpers. No service, model, world writes or random texturing.
const point = (p) => {
  if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isSafeInteger)) throw Error('Integer xyz required');
  return p;
};
const area = (b) => {
  point(b.min); point(b.max);
  if (b.min.some((v, i) => v > b.max[i])) throw Error('Reversed bounds');
  return b;
};
const inside = (p, b) => p.every((v, i) => v >= b.min[i] && v <= b.max[i]);
const volume = (b) => b.min.reduce((n, v, i) => n * (b.max[i] - v + 1), 1);

export class Voxels {
  constructor(bounds, palette = {}) {
    this.bounds = area(bounds); this.palette = palette;
    if (volume(bounds) > 20_000_000) throw Error('Split geometry into scenes of at most 20 million cells');
    this.width = bounds.max[0] - bounds.min[0] + 1;
    this.depth = bounds.max[2] - bounds.min[2] + 1;
    this.blocks = new Map();
  }
  key(p) { return ((p[1] - this.bounds.min[1]) * this.depth + p[2] - this.bounds.min[2]) * this.width + p[0] - this.bounds.min[0]; }
  pos(k) { return [k % this.width + this.bounds.min[0], Math.floor(k / (this.width * this.depth)) + this.bounds.min[1], Math.floor(k / this.width) % this.depth + this.bounds.min[2]]; }
  set(p, block) {
    point(p); if (!inside(p, this.bounds)) throw Error('Geometry outside bounds: ' + p);
    const value = this.palette[block] || block;
    if (typeof value !== 'string' || !value.length) throw Error('Block state required');
    this.blocks.set(this.key(p), value); return this;
  }
  get(p) { point(p); return inside(p, this.bounds) ? this.blocks.get(this.key(p)) : undefined; }
  fill(min, max, block) {
    area({ min, max });
    for (let y = min[1]; y <= max[1]; y++) for (let z = min[2]; z <= max[2]; z++) for (let x = min[0]; x <= max[0]; x++) this.set([x, y, z], block);
    return this;
  }
  ring(center, outer, inner, block) {
    point(center);
    if (!(outer >= inner && inner >= 0 && Number.isFinite(outer))) throw Error('Invalid ring radii');
    for (let z = Math.ceil(center[2] - outer); z <= center[2] + outer; z++) for (let x = Math.ceil(center[0] - outer); x <= center[0] + outer; x++) {
      const r = Math.hypot(x - center[0], z - center[2]);
      if (r <= outer && r >= inner) this.set([x, center[1], z], block);
    }
    return this;
  }
  ellipsoid(center, radii, block) {
    if (![...center, ...radii].every(Number.isFinite) || radii.some((r) => r <= 0)) throw Error('Positive radii required');
    for (let y = Math.ceil(center[1] - radii[1]); y <= center[1] + radii[1]; y++)
      for (let z = Math.ceil(center[2] - radii[2]); z <= center[2] + radii[2]; z++)
        for (let x = Math.ceil(center[0] - radii[0]); x <= center[0] + radii[0]; x++)
          if ([x, y, z].reduce((s, v, i) => s + ((v - center[i]) / radii[i]) ** 2, 0) <= 1) this.set([x, y, z], block);
    return this;
  }
  // 6-connected centerline prevents diagonal-only horn tips, thin ribs and floating chains.
  tube(points, radius, block) {
    if (points.length < 2 || !Number.isFinite(radius) || radius < 0) throw Error('Tube requires points and nonnegative radius');
    points.forEach(point);
    let previous;
    const stamp = (p) => {
      if (radius > 0) this.ellipsoid(p, [radius, radius, radius], block);
      this.set(p, block);
    };
    for (let j = 1; j < points.length; j++) {
      const a = points[j - 1], b = points[j], steps = Math.max(1, ...a.map((v, i) => Math.abs(v - b[i]))) * 2;
      for (let n = 0; n <= steps; n++) {
        const p = a.map((v, i) => Math.round(v + (b[i] - v) * n / steps));
        if (previous) {
          const q = [...previous];
          for (let i = 0; i < 3; i++) while (q[i] !== p[i]) { q[i] += Math.sign(p[i] - q[i]); stamp([...q]); }
        }
        stamp(p); previous = p;
      }
    }
    return this;
  }
  // Pointed arch in an XY plane. Rotate/repeat its exported component in the engine.
  arch(origin, width, spring, rise, block, radius = 0) {
    point(origin);
    if (![width, spring, rise].every(Number.isSafeInteger) || width < 2 || spring < 0 || rise < 1) throw Error('Invalid arch dimensions');
    const half = width / 2, peak = [origin[0] + Math.round(half), origin[1] + spring + rise, origin[2]];
    for (const side of [0, 1]) {
      const x = origin[0] + side * width, points = [[x, origin[1], origin[2]], [x, origin[1] + spring, origin[2]]];
      for (let n = 1; n <= width; n++) {
        const t = n / width;
        points.push([Math.round(x + (peak[0] - x) * t), Math.round(origin[1] + spring + rise * Math.sin(t * Math.PI / 2)), origin[2]]);
      }
      this.tube(points, radius, block);
    }
    return this;
  }
  connectivity() {
    const occupied = new Set([...this.blocks].filter(([, b]) => !/^(minecraft:)?(air|cave_air|void_air)$/.test(b)).map(([k]) => k));
    const sizes = [], samples = [];
    while (occupied.size) {
      const first = occupied.values().next().value, queue = [first]; occupied.delete(first);
      for (let i = 0; i < queue.length; i++) {
        const p = this.pos(queue[i]);
        for (let axis = 0; axis < 3; axis++) for (const d of [-1, 1]) {
          const q = [...p]; q[axis] += d;
          if (inside(q, this.bounds)) { const k = this.key(q); if (occupied.delete(k)) queue.push(k); }
        }
      }
      sizes.push(queue.length); if (samples.length < 20) samples.push(this.pos(first));
    }
    return { components: sizes.length, sizes: sizes.sort((a, b) => b - a), samples };
  }
  plan(bounds = this.bounds) {
    area(bounds); if (volume(bounds) > 500_000) throw Error('Export disjoint districts of at most 500,000 cells');
    // Maximal X spans preserve exact geometry and explicit air cuts, without one JSON op per voxel.
    const entries = [...this.blocks].filter(([k]) => inside(this.pos(k), bounds)).sort(([a], [b]) => a - b);
    const ops = []; let run;
    for (const [k, block] of entries) {
      const p = this.pos(k);
      if (run && run.block === block && p[1] === run.to[1] && p[2] === run.to[2] && p[0] === run.to[0] + 1) run.to = p;
      else { run = { op: 'fill', from: p, to: [...p], block }; ops.push(run); }
    }
    if (ops.length <= 10_000) return { version: 1, operations: ops };
    const components = {}, operations = [];
    for (let i = 0; i < ops.length; i += 4000) { const name = 'spans' + i; components[name] = ops.slice(i, i + 4000); operations.push({ op: 'use', component: name }); }
    return { version: 1, components, operations };
  }
  partition(districts) {
    for (let i = 0; i < districts.length; i++) {
      area(districts[i].bounds);
      for (let j = 0; j < i; j++) if ([0, 1, 2].every((a) => districts[i].bounds.min[a] <= districts[j].bounds.max[a] && districts[j].bounds.min[a] <= districts[i].bounds.max[a])) throw Error('Overlapping districts');
    }
    for (const k of this.blocks.keys()) if (!districts.some((d) => inside(this.pos(k), d.bounds))) throw Error('Uncovered geometry: ' + this.pos(k));
    return districts.map((d) => ({ ...d, plan: this.plan(d.bounds) }));
  }
}
