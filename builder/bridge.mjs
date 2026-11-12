import { readFile } from 'node:fs/promises';
import { AIR, bounds, inside, key, pack, tiles, unpack } from './core.mjs';

export async function readConnection(file) {
  const c = JSON.parse(await readFile(file, 'utf8'));
  if (
    !Number.isInteger(c.port) ||
    c.port < 1024 ||
    c.port > 65535 ||
    !/^[a-f0-9]{64}$/.test(c.token)
  )
    throw Error('Invalid voxel-build bridge config');
  return { port: c.port, token: c.token };
}
export async function bridge(c, path, body) {
  const response = await fetch(`http://127.0.0.1:${c.port}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || `Bridge returned ${response.status}`);
  return data;
}
export async function capture(c, worldId, dimension, area) {
  bounds(area);
  const map = new Map(),
    protectedPositions = [];
  for (const b of tiles(area)) {
    const s = await bridge(c, '/snapshot', { worldId, dimension, bounds: b });
    if (s.worldId !== worldId || s.dimension !== dimension)
      throw Error('World changed during capture');
    for (const [k, v] of unpack(s)) map.set(k, v);
    protectedPositions.push(...(s.protected || []));
  }
  return { ...pack(map), protected: protectedPositions, capturedAt: new Date().toISOString() };
}
export async function canonicalize(c, edits) {
  const states = [...new Set(Object.values(edits))],
    normalized = new Map();
  for (let i = 0; i < states.length; i += 256) {
    const result = await bridge(c, '/states', { states: states.slice(i, i + 256) });
    result.states.forEach((s, j) => normalized.set(states[i + j], s));
  }
  return Object.fromEntries(Object.entries(edits).map(([k, v]) => [k, normalized.get(v)]));
}
export async function waitJob(c, id, timeout = 180_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await bridge(c, `/job?id=${encodeURIComponent(id)}`);
    if (
      ['complete', 'rolled_back', 'rejected', 'rollback_conflict', 'interrupted'].includes(
        result.phase,
      )
    )
      return result;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw Error(
    `Job ${id} still running or Minecraft is paused. Resume Minecraft and run commit again to reconcile the saved receipt.`,
  );
}
export function advanceBase(project, changes) {
  const map = unpack(project.base);
  for (const c of changes) c.after === AIR ? map.delete(key(c.pos)) : map.set(key(c.pos), c.after);
  project.base = { ...project.base, ...pack(map) };
  for (const c of changes)
    if (project.edits[key(c.pos)] === c.after) delete project.edits[key(c.pos)];
}

export function batches(changes) {
  const sorted = [...changes].sort(
    (a, b) =>
      Math.floor(a.pos[0] / 16) - Math.floor(b.pos[0] / 16) ||
      Math.floor(a.pos[2] / 16) - Math.floor(b.pos[2] / 16) ||
      a.pos[1] - b.pos[1],
  );
  const out = [];
  let batch = [],
    chunks = new Set();
  for (const c of sorted) {
    const chunk = Math.floor(c.pos[0] / 16) + ',' + Math.floor(c.pos[2] / 16);
    if (batch.length === 8192 || (!chunks.has(chunk) && chunks.size === 64)) {
      out.push(batch);
      batch = [];
      chunks = new Set();
    }
    chunks.add(chunk);
    batch.push(c);
  }
  if (batch.length) out.push(batch);
  return out;
}
