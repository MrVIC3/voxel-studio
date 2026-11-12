import { createHash } from 'node:crypto';

export const AIR = 'minecraft:air';
export const LIMIT = 500_000;
export const key = (p) => p.join(',');
export const pos = (k) => k.split(',').map(Number);
export const isAir = (s) => /^minecraft:(air|cave_air|void_air)$/.test(s);
export function state(s) {
  if (
    typeof s !== 'string' ||
    s.length > 512 ||
    !/^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]+(?:\[[a-z0-9_=,.-]+\])?$/.test(s)
  )
    throw Error(`Invalid block state: ${s}`);
  let [id, raw] = s.split('[');
  if (!id.includes(':')) id = `minecraft:${id}`;
  if (!raw) return id;
  const entries = raw
    .slice(0, -1)
    .split(',')
    .map((p) => p.split('='));
  if (
    entries.some((p) => p.length !== 2 || !p[0] || !p[1]) ||
    new Set(entries.map((p) => p[0])).size !== entries.length
  )
    throw Error('Invalid state properties');
  return `${id}[${entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map((p) => p.join('='))
    .join(',')}]`;
}
export function point(p) {
  if (
    !Array.isArray(p) ||
    p.length !== 3 ||
    p.some((v) => !Number.isSafeInteger(v) || Math.abs(v) > 30_000_000)
  )
    throw Error('Expected three integer block coordinates');
  return p;
}
export function bounds(b, maxVolume = LIMIT) {
  if (!b || !b.min || !b.max) throw Error('Bounds require min and max');
  point(b.min);
  point(b.max);
  if (b.min.some((n, i) => n > b.max[i])) throw Error('Bounds are reversed');
  const volume = b.min.reduce((v, n, i) => v * (b.max[i] - n + 1), 1);
  if (volume > maxVolume)
    throw Error(`Work area exceeds ${maxVolume} cells; use separate projects for districts`);
  return { min: [...b.min], max: [...b.max] };
}
export const inside = (p, b) => p.every((n, i) => n >= b.min[i] && n <= b.max[i]);
export function* cells(b) {
  for (let y = b.min[1]; y <= b.max[1]; y++)
    for (let z = b.min[2]; z <= b.max[2]; z++)
      for (let x = b.min[0]; x <= b.max[0]; x++) yield [x, y, z];
}
export function* tiles(b, size = 32) {
  for (let y = b.min[1]; y <= b.max[1]; y += size)
    for (let z = b.min[2]; z <= b.max[2]; z += size)
      for (let x = b.min[0]; x <= b.max[0]; x += size)
        yield {
          min: [x, y, z],
          max: [
            Math.min(x + size - 1, b.max[0]),
            Math.min(y + size - 1, b.max[1]),
            Math.min(z + size - 1, b.max[2]),
          ],
        };
}
export function unpack(snapshot) {
  const map = new Map();
  // Snapshots typically contain thousands of cells but only dozens of distinct states.
  const palette = snapshot.palette.map(state);
  for (const [x, y, z, i] of snapshot.blocks) {
    if (!palette[i]) throw Error('Invalid palette index');
    const s = palette[i];
    if (!isAir(s)) map.set(key([x, y, z]), s);
  }
  return map;
}
export function pack(map, b) {
  const palette = [],
    ids = new Map(),
    blocks = [];
  for (const [k, s] of map) {
    const p = pos(k);
    if (isAir(s) || (b && !inside(p, b))) continue;
    if (!ids.has(s)) {
      ids.set(s, palette.length);
      palette.push(s);
    }
    blocks.push([...p, ids.get(s)]);
  }
  return { palette, blocks };
}
export const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function compose(project) {
  const map = unpack(project.base);
  for (const [k, s] of Object.entries(project.edits)) isAir(s) ? map.delete(k) : map.set(k, s);
  return map;
}
export function diff(project) {
  const base = unpack(project.base),
    out = [];
  for (const [k, after] of Object.entries(project.edits)) {
    const before = base.get(k) || AIR;
    if (before !== after) out.push({ pos: pos(k), before, after });
  }
  return out;
}
const directions = ['north', 'east', 'south', 'west'];
export function rotateState(s, quarter) {
  if (!quarter) return s;
  return state(
    s
      .replace(
        /(facing=)(north|east|south|west)/g,
        (_, a, d) => a + directions[(directions.indexOf(d) + quarter) % 4],
      )
      .replace(/axis=([xz])/g, (_, a) => `axis=${quarter % 2 ? (a === 'x' ? 'z' : 'x') : a}`)
      .replace(
        /(?<=\[|,)(north|east|south|west)=/g,
        (_, d) => directions[(directions.indexOf(d) + quarter) % 4] + '=',
      ),
  );
}

// A bounded declarative compiler: no eval, shell, network, or stochastic texture noise.
export function compile(plan, project) {
  if (
    !plan ||
    plan.version !== 1 ||
    !Array.isArray(plan.operations) ||
    plan.operations.length > 10_000
  )
    throw Error('Expected plan version 1 with operations (max 10,000)');
  const out = { ...project.edits },
    palette = plan.palette || {},
    components = plan.components || {};
  let visited = 0;
  const resolved = new Map();
  const resolve = (s, q) => {
    const k = `${q}:${s}`;
    if (!resolved.has(k)) resolved.set(k, rotateState(state(palette[s] || s), q));
    return resolved.get(k);
  };
  const put = (p, s, t) => {
    if (++visited > 2_000_000)
      throw Error('Plan exceeds two million generated placements; split into stages');
    const [x, y, z] = point(p),
      q = t.rotation;
    const r = q === 1 ? [-z, y, x] : q === 2 ? [-x, y, -z] : q === 3 ? [z, y, -x] : [x, y, z];
    const world = r.map((n, i) => n + t.at[i]);
    if (!inside(world, project.bounds)) throw Error(`Placement outside work area: ${world}`);
    out[key(world)] = s;
  };
  const run = (ops, t, depth = 0) => {
    if (depth > 8 || !Array.isArray(ops)) throw Error('Component recursion exceeds eight levels');
    for (const o of ops) {
      if (++visited > 2_000_000) throw Error('Plan expansion limit');
      const block = o.op === 'use' ? null : resolve(o.block, t.rotation);
      if (o.op === 'use') {
        if (!components[o.component]) throw Error(`Unknown component ${o.component}`);
        if (o.rotate !== undefined && ![0, 90, 180, 270].includes(o.rotate))
          throw Error('Rotation must be 0, 90, 180, or 270');
        const count = o.count ?? 1;
        if (!Number.isInteger(count) || count < 1 || count > 4096)
          throw Error('Component count must be 1..4096');
        const step = point(o.step || [0, 0, 0]),
          at = point(o.at || [0, 0, 0]);
        for (let n = 0; n < count; n++) {
          const [x, y, z] = at.map((v, i) => v + n * step[i]),
            q = t.rotation;
          const r = q === 1 ? [-z, y, x] : q === 2 ? [-x, y, -z] : q === 3 ? [z, y, -x] : [x, y, z];
          run(
            components[o.component],
            { at: r.map((v, i) => v + t.at[i]), rotation: (q + (o.rotate || 0) / 90) % 4 },
            depth + 1,
          );
        }
      } else if (o.op === 'set') put(o.at, block, t);
      else if (o.op === 'fill' || o.op === 'box') {
        const b = bounds({ min: o.from, max: o.to });
        for (const p of cells(b))
          if (o.op === 'fill' || p.some((v, i) => v === b.min[i] || v === b.max[i]))
            put(p, block, t);
      } else if (o.op === 'line') {
        const a = point(o.from),
          b = point(o.to),
          n = Math.max(...a.map((v, i) => Math.abs(v - b[i])));
        if (n > 500_000) throw Error('Line too long');
        for (let j = 0; j <= n; j++)
          put(
            a.map((v, i) => Math.round(v + (b[i] - v) * (n ? j / n : 0))),
            block,
            t,
          );
      } else if (o.op === 'ellipsoid' || o.op === 'cylinder') {
        const b = bounds({ min: o.from, max: o.to }),
          c = b.min.map((v, i) => (v + b.max[i]) / 2),
          r = b.min.map((v, i) => (b.max[i] - v + 1) / 2);
        const axes = o.op === 'cylinder' ? [0, 2] : [0, 1, 2];
        const contains = (p) => axes.reduce((v, i) => v + ((p[i] - c[i]) / r[i]) ** 2, 0) <= 1;
        for (const p of cells(b))
          if (
            contains(p) &&
            (!o.hollow ||
              axes.some((i) =>
                [-1, 1].some((d) => {
                  const a = [...p];
                  a[i] += d;
                  return !contains(a);
                }),
              ))
          )
            put(p, block, t);
      } else throw Error(`Unknown operation: ${o.op}`);
    }
  };
  run(plan.operations, { at: point(plan.origin || [0, 0, 0]), rotation: 0 });
  return { edits: out, placements: visited, changes: Object.keys(out).length };
}

export function inspect(project, b = project.bounds, limit = 80) {
  b = bounds(b);
  const map = compose(project),
    counts = {},
    sample = [];
  for (const [k, s] of map)
    if (inside(pos(k), b)) {
      counts[s] = (counts[s] || 0) + 1;
      if (sample.length < limit) sample.push([k, s]);
    }
  return {
    bounds: b,
    blocks: Object.values(counts).reduce((a, b) => a + b, 0),
    materials: Object.entries(counts).sort((a, b) => b[1] - a[1]),
    sample,
  };
}
export function audit(project, rules = []) {
  const map = compose(project),
    changes = diff(project),
    counts = {},
    isolated = [],
    failures = [];
  const neighbors = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  for (const c of changes)
    if (!isAir(c.after)) {
      counts[c.after] = (counts[c.after] || 0) + 1;
      if (!neighbors.some((d) => map.has(key(c.pos.map((v, i) => v + d[i]))))) {
        if (isolated.length < 40) isolated.push(c.pos);
      }
    }
  for (const rule of rules) {
    if (!['empty', 'solid', 'block', 'preserve'].includes(rule.kind))
      throw Error('Audit rule kind must be empty, solid, block, or preserve');
    let count = 0,
      samples = [];
    const b = bounds(rule.bounds);
    if (!inside(b.min, project.bounds) || !inside(b.max, project.bounds))
      throw Error('Audit bounds outside project');
    const preserved = rule.kind === 'preserve' ? unpack(rule.snapshot) : null;
    for (const p of cells(b)) {
      const s = map.get(key(p)) || AIR;
      if (
        rule.kind === 'empty'
          ? !isAir(s)
          : rule.kind === 'solid'
            ? isAir(s)
            : preserved ? s !== (preserved.get(key(p)) || AIR) : s !== state(rule.block)
      ) {
        count++;
        if (samples.length < 8) samples.push(p);
      }
    }
    if (count) failures.push({ name: rule.name, count, samples });
  }
  return {
    revision: project.revision,
    changed: changes.length,
    materials: Object.entries(counts).sort((a, b) => b[1] - a[1]),
    isolatedSamples: isolated,
    failures,
    note: 'Isolated blocks are review hints, not proof of errors. Solid means occupied, not collision-solid. Visual review and live verification are still required.',
  };
}
