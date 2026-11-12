import http from 'node:http';
import path from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, readdir, rm, open } from 'node:fs/promises';
import { prepareBuild, deliverBuild } from './workflow.mjs';
import { compileArchitecture, assessArchitecture } from './architecture.mjs';
import {
  AIR,
  audit,
  bounds,
  compile,
  compose,
  diff,
  digest,
  inside,
  inspect,
  key,
  pack,
  pos,
  unpack,
} from './core.mjs';
import {
  advanceBase,
  batches,
  bridge,
  canonicalize,
  capture,
  readConnection,
  waitJob,
} from './bridge.mjs';

const identifier = (s) => {
  if (typeof s !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(s))
    throw Error('Names use 1..80 letters, digits, underscores or hyphens');
  return s;
};
export async function atomic(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  const handle = await open(tmp, 'w');
  try {
    await handle.writeFile(JSON.stringify(data));
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmp, file);
}
export async function startServer({ root, render, onShutdown = () => {} }) {
  await mkdir(root, { recursive: true });
  const sessionFile = path.join(root, 'session.json'),
    connectionFile = path.join(root, 'connection.json');
  const token = randomBytes(32).toString('hex');
  let busy = false;
  let renderSnapshot;
  const rulesOf = (p) => [...(p.rules || []), ...(p.archRules || [])];
  const connection = async () => JSON.parse(await readFile(connectionFile, 'utf8'));
  const projectFile = (id) => path.join(root, 'projects', identifier(id), 'project.json');
  const load = async (id) => JSON.parse(await readFile(projectFile(id), 'utf8'));
  const save = async (p) => {
    p.updatedAt = new Date().toISOString();
    await atomic(projectFile(p.id), p);
  };
  const summary = (p) => ({
    id: p.id,
    revision: p.revision,
    bounds: p.bounds,
    worldId: p.worldId,
    dimension: p.dimension,
    changed: diff(p).length,
    review: p.review || null,
    architecture: p.architecture || null,
    pending: p.pending?.id || null,
  });
  const checkWorld = async (p, c) => {
    const s = await bridge(c, '/status');
    if (s.worldId !== p.worldId || !s.dimensions.includes(p.dimension))
      throw Error(
        'Connected world does not match this project. Capture a new project for this world.',
      );
  };
  const reconcile = async (p, c) => {
    if (!p.pending) return;
    await bridge(c, '/apply', {
      id: p.pending.id,
      worldId: p.worldId,
      dimension: p.dimension,
      changes: p.pending.changes,
    });
    const result = await waitJob(c, p.pending.id);
    if (result.phase !== 'complete') {
      p.failedJob = { ...p.pending, result };
      delete p.pending;
      await save(p);
      throw Error(
        `Minecraft job ${result.phase}: ${result.error || ''}. Inspect the bridge journal before continuing.`,
      );
    }
    advanceBase(p, p.pending.changes);
    if (p.pending.undoOf) {
      if (p.receipts.at(-1)?.id !== p.pending.undoOf) throw Error('Undo receipt order mismatch');
      p.receipts.pop();
      p.revision++;
      p.review = null;
    } else {
      const receipt = {
        id: p.pending.id,
        changes: p.pending.changes,
        at: new Date().toISOString(),
      };
      await atomic(
        path.join(path.dirname(projectFile(p.id)), 'receipts', receipt.id + '.json'),
        receipt,
      );
      p.receipts.push({ id: receipt.id, changed: receipt.changes.length, at: receipt.at });
    }
    delete p.pending;
    await save(p);
  };
  async function command(action, a = {}) {
    const started = performance.now();
    try {
      const result = await execute(action, a);
      await recordTiming(action, a.id, started, true);
      return result;
    } catch (e) {
      await recordTiming(action, a.id, started, false);
      throw e;
    }
  }
  async function recordTiming(action, id, started, ok) {
    // No plans, credentials or block lists in telemetry. A bounded local history only.
    timings.push({ action, id, ms: Math.round(performance.now() - started), ok, at: new Date().toISOString() });
    if (timings.length > 200) timings.shift();
    await atomic(path.join(root, 'timings.json'), timings).catch(() => {});
  }
  const timings = [];
  async function execute(action, a) {
    if (action === 'prepare') return prepareBuild(command, a);
    if (action === 'deliver') return deliverBuild(command, a);
    if (action === 'timings') return { commands: timings };
    if (action === 'status') {
      const projects = await readdir(path.join(root, 'projects')).catch(() => []);
      let minecraft;
      try {
        minecraft = await bridge(await connection(), '/status');
      } catch (e) {
        minecraft = { connected: false, error: e.message };
      }
      return { engine: 'Voxel Build', protocol: 1, capabilities: ['build-manifests', 'pins', 'render-cache', 'contact-sheets', 'timings', 'atomic-stage-source'], minecraft, projects, root };
    }
    if (action === 'connect') {
      const c = await readConnection(a.config),
        status = await bridge(c, '/status');
      await atomic(connectionFile, c);
      return status;
    }
    if (action === 'init') {
      identifier(a.id);
      const area = bounds(a.bounds);
      try {
        await readFile(projectFile(a.id));
        throw Error('Project already exists');
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
      let worldId = null,
        base = { palette: [], blocks: [], protected: [] };
      const dimension = a.dimension || 'minecraft:overworld';
      if (!a.offline) {
        const c = await connection(),
          status = await bridge(c, '/status');
        worldId = status.worldId;
        base = await capture(c, worldId, dimension, area);
      }
      const p = {
        version: 1,
        id: a.id,
        revision: 0,
        bounds: area,
        worldId,
        dimension,
        base,
        edits: {},
        receipts: [],
        notes: a.brief || '',
        createdAt: new Date().toISOString(),
      };
      await save(p);
      return summary(p);
    }
    if (action === 'shutdown') {
      setTimeout(onShutdown, 100);
      return { stopping: true };
    }
    const p = await load(a.id),
      dir = path.dirname(projectFile(p.id));
    if (['stage', 'restore', 'capture'].includes(action) && p.pending)
      throw Error('Pending commit: run commit to reconcile before changing the draft');
    if (action === 'info')
      return {
        ...summary(p),
        notes: p.notes,
        receipts: p.receipts.map(({ id, at, changes, changed }) => ({
          id,
          at,
          changed: changed ?? changes.length,
        })),
      };
    if (action === 'notes') {
      p.notes = a.text;
      await save(p);
      return { saved: true };
    }
    if (action === 'capture') {
      if (diff(p).length)
        throw Error(
          'Capture requires a clean draft. Checkpoint and create a new project to preserve edits.',
        );
      const c = await connection(),
        s = await bridge(c, '/status');
      if (p.worldId && s.worldId !== p.worldId) throw Error('World mismatch');
      p.worldId = s.worldId;
      p.base = await capture(c, p.worldId, p.dimension, p.bounds);
      p.revision++;
      p.review = null;
      await save(p);
      return summary(p);
    }
    if (action === 'stage') {
      if(p.architecture&&!a.design)throw Error('Architectural drafts require a design source');
      if(a.design&&p.architecture?.sourceBaseHash&&p.architecture.sourceBaseHash!==digest(p.base))throw Error('Committed baseline changed; create a new edit project for the next architectural stage');
      let source = p;
      if (a.fromCheckpoint) {
        const snap = JSON.parse(await readFile(path.join(dir, 'checkpoints', `${identifier(a.fromCheckpoint)}.json`), 'utf8'));
        if (snap.baseHash !== digest(p.base)) throw Error('Checkpoint belongs to an earlier world baseline');
        source = { ...p, edits: snap.edits };
      }
      if(a.design&&!a.fromCheckpoint){
        if(!p.architecture&&Object.keys(p.edits).length)throw Error('Architecture requires a clean project or source checkpoint');
        source={...p,edits:{}};
      }
      const architecture=a.design?compileArchitecture(a.design,source):null;
      const plan=architecture?.plan||a.plan;
      const result = compile(plan, source);
      const protectedSet = new Set((p.base.protected || []).map(key));
      if (Object.keys(result.edits).some((k) => protectedSet.has(k)))
        throw Error('Draft touches a protected block entity. Change the plan or work area.');
      const edits = p.worldId ? await canonicalize(await connection(), result.edits) : result.edits;
      const entries = Object.entries(edits);
      if (entries.length === Object.keys(p.edits).length && entries.every(([k, v]) => p.edits[k] === v) && (!architecture || architecture.metadata.hash===p.architecture?.hash))
        return { ...summary(p), placements: result.placements, unchanged: true };
      p.edits = edits;
      p.revision++;
      p.review = null;
      if(architecture){
        p.architecture={...architecture.metadata,sourceBaseHash:digest(p.base)};p.archRules=architecture.rules;
        await atomic(path.join(dir,'designs',String(p.revision)+'.json'),a.design);
        await atomic(path.join(dir,'provenance',String(p.revision)+'.json'),architecture.provenance);
      }
      await atomic(path.join(dir, 'plans', String(p.revision)+'.json'), plan);
      await save(p);
      return { ...summary(p), placements: result.placements };
    }
    if (action === 'inspect') {
      const b = a.bounds || p.bounds;
      if (a.slice) {
        const axis = ['x', 'y', 'z'].indexOf(a.slice.axis);
        if (axis < 0 || !Number.isInteger(a.slice.at))
          throw Error('Slice requires axis x/y/z and integer at');
        const area = bounds(b),
          map = compose(p),
          horizontal = axis === 0 ? 2 : 0,
          vertical = axis === 1 ? 2 : 1;
        if (a.slice.at < area.min[axis] || a.slice.at > area.max[axis])
          throw Error('Slice outside bounds');
        if (
          (area.max[horizontal] - area.min[horizontal] + 1) *
            (area.max[vertical] - area.min[vertical] + 1) >
          16384
        )
          throw Error('Narrow the slice to 16,384 cells');
        const legend = ['.'],
          rows = [],
          ids = new Map([[AIR, 0]]);
        for (let v = area.max[vertical]; v >= area.min[vertical]; v--) {
          const row = [];
          for (let h = area.min[horizontal]; h <= area.max[horizontal]; h++) {
            const at = [0, 0, 0];
            at[axis] = a.slice.at;
            at[horizontal] = h;
            at[vertical] = v;
            const s = map.get(key(at)) || AIR;
            if (!ids.has(s)) {
              ids.set(s, legend.length);
              legend.push(s);
            }
            row.push(ids.get(s));
          }
          rows.push(row);
        }
        return {
          slice: a.slice,
          horizontal: ['x', 'y', 'z'][horizontal],
          vertical: ['x', 'y', 'z'][vertical],
          bounds: area,
          legend,
          rows,
        };
      }
      return inspect(p, b, a.limit ?? 40);
    }
    if (action === 'audit') {
      const pins = (p.rules || []).filter((r) => r.kind === 'preserve');
      p.rules = a.rules ? [...a.rules.filter((r) => !pins.some((pin) => pin.name === r.name)), ...pins] : p.rules || [];
      const result = audit(p, rulesOf(p));
      await save(p);
      return result;
    }
    if (action === 'pin') {
      const area = bounds(a.bounds);
      if (!inside(area.min, p.bounds) || !inside(area.max, p.bounds)) throw Error('Pin outside project');
      const name = identifier(a.name);
      const rule = { name, kind: 'preserve', bounds: area, snapshot: pack(compose(p), area) };
      p.rules = [...(p.rules || []).filter((r) => r.name !== name), rule];
      p.review = null;
      await save(p);
      return { pinned: name, bounds: area, blocks: rule.snapshot.blocks.length };
    }
    if (action === 'unpin') {
      p.rules = (p.rules || []).filter((r) => r.kind !== 'preserve' || r.name !== a.name);
      p.review = null;
      await save(p);
      return { unpinned: a.name };
    }
    if (action === 'checkpoint') {
      const file = path.join(dir, 'checkpoints', `${identifier(a.name)}.json`);
      if (a.ifAbsent) {
        try { await readFile(file); return { saved: a.name, existing: true }; }
        catch (e) { if (e.code !== 'ENOENT') throw e; }
      }
      await atomic(file, {
        revision: p.revision,
        edits: p.edits,
        notes: p.notes,
        baseHash: digest(p.base),
        rules: p.rules || [],
        architecture: p.architecture || null,
        archRules: p.archRules || [],
      });
      return { saved: a.name, revision: p.revision };
    }
    if (action === 'restore') {
      const snap = JSON.parse(
        await readFile(path.join(dir, 'checkpoints', `${identifier(a.name)}.json`), 'utf8'),
      );
      if (snap.baseHash !== digest(p.base))
        throw Error(
          'Checkpoint belongs to an earlier world baseline; undo committed stages before restoring it',
        );
      p.edits = snap.edits;
      p.architecture=snap.architecture||null;p.archRules=snap.archRules||[];
      p.notes = snap.notes;
      const pins = (p.rules || []).filter((r) => r.kind === 'preserve');
      p.rules = [...(snap.rules || []).filter((r) => !pins.some((pin) => pin.name === r.name)), ...pins];
      p.revision++;
      p.review = null;
      await save(p);
      return summary(p);
    }
    if (action === 'render') {
      if(a.label==='reference'&&p.architecture?.reference){
        a.camera=p.architecture.reference.camera;
        const size=a.size||[960,720],aspect=size[0]/size[1];
        if(Math.abs(aspect-p.architecture.reference.aspect)>.001)throw Error('Reference render aspect must match camera calibration');
      }
      if(p.architecture){
        if(a.label==='detail'&&!a.camera&&!a.bounds)throw Error('Detail evidence needs a close camera or crop');
        if(a.label==='interior'&&!a.camera)throw Error('Interior evidence needs an explicit player-eye camera');
        if(a.label==='section'&&!a.bounds)throw Error('Section evidence needs explicit cutaway bounds');
      }
      if (!render) throw Error('Rendering requires the hidden Electron app');
      if (a.context !== undefined && (!Array.isArray(a.context) || a.context.length > 31))
        throw Error('Render context must contain at most 31 project IDs');
      const projects = [p];
      for (const id of new Set(a.context || [])) {
        if (id === p.id) continue;
        const other = await load(id);
        if (other.worldId !== p.worldId || other.dimension !== p.dimension)
          throw Error('Render context must belong to the same world and dimension');
        projects.push(other);
      }
      const union = {
        min: [0, 1, 2].map((i) => Math.min(...projects.map((q) => q.bounds.min[i]))),
        max: [0, 1, 2].map((i) => Math.max(...projects.map((q) => q.bounds.max[i]))),
      };
      const area = bounds(a.bounds || (projects.length===1&&p.architecture?.frame) || union, 20_000_000);
      // Ignore notes/review metadata but fingerprint the actual source blocks, not just revisions.
      // This also detects external project-file corrections and avoids false cache hits.
      const sourceKey = digest({ area, projects: projects.map((q) => ({ base: q.base, edits: q.edits })) });
      const snapshotCacheHit = a.reuse !== false && renderSnapshot?.sourceKey === sourceKey;
      if (!snapshotCacheHit) {
        const combined = new Map();
        for (const q of projects)
          for (const [k, value] of compose(q)) {
            if (!inside(pos(k), area)) continue;
            if (combined.has(k) && combined.get(k) !== value)
              throw Error('Conflicting overlapping render projects');
            combined.set(k, value);
            if (combined.size > 500_000)
              throw Error('Render exceeds 500,000 non-air blocks; crop the scene');
          }
        const snapshot = pack(combined);
        renderSnapshot = { sourceKey, snapshot, meshKey: digest({ snapshot, area }) };
      }
      const { snapshot, meshKey } = renderSnapshot;
      const renderKey = digest({ meshKey, views: a.views, size: a.size, camera: a.camera, night: a.night, lighting:a.lighting }).slice(0, 16);
      const views = a.views || ['perspective', 'front', 'back', 'left', 'right', 'top'];
      if (
        !Array.isArray(views) ||
        views.length === 0 ||
        views.length > 8 ||
        views.some(
          (v) => !['perspective', 'front', 'back', 'left', 'right', 'top', 'interior'].includes(v),
        )
      )
        throw Error('Invalid views');
      const result = await render({
        ...snapshot,
        bounds: area,
        views,
        camera: a.camera,
        size: a.size || [960, 720],
        night: !!a.night,
        meshKey,
        reuse: a.reuse !== false,
        lighting:a.lighting,
      });
      const files = [];
      for (const shot of result.images) {
        const file = path.join(
          dir,
          'renders',
          `${p.revision}-${renderKey}-${identifier(shot.view)}${a.night ? '-night' : ''}.png`,
        );
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, Buffer.from(shot.png, 'base64'));
        files.push(file);
      }
      const receipt = {
        id: randomUUID(),
        label: a.label || 'overview',
        camera: a.camera || null,
        size: a.size || [960,720],
        revision: p.revision,
        views,
        files,
        contactSheet: null,
        metrics: { ...(result.metrics || {}), snapshotCacheHit },
        missing: result.missing,
        assets: result.assets,
        context: projects.map((q) => ({ id: q.id, revision: q.revision })),
        bounds: area,
        at: new Date().toISOString(),
      };
      if (result.contactSheet) {
        receipt.contactSheet = path.join(dir, 'renders', `${p.revision}-${renderKey}-contact.png`);
        await writeFile(receipt.contactSheet, Buffer.from(result.contactSheet, 'base64'));
      }
      for (const q of projects) {
        const own = { ...receipt, revision: q.revision };
        q.renders = [...(q.renders || []).filter((r) => r.revision === q.revision), own].slice(-16);
        await save(q);
      }
      return receipt;
    }
    if (action === 'review') {
      const report = audit(p, rulesOf(p));
      if (report.failures.length)
        throw Error('Fix failing audit rules before marking this revision reviewed');
      const renders = [];
      for (const r of (p.renders || []).filter((r) => r.revision === p.revision)) {
        let current = true;
        for (const q of r.context || []) if ((await load(q.id)).revision !== q.revision) current = false;
        if (current) renders.push(r);
      }
      const views = new Set(renders.flatMap((r) => r.views));
      if (!views.has('top') || !views.has('perspective') || views.size < 4)
        throw Error(
          'Render and inspect top, perspective, and at least two elevations for this revision',
        );
      if (renders.some((r) => r.missing.length))
        throw Error('Missing models/textures must be resolved before review');
      let assessment;
      if(p.architecture){
        let supplied=a.assessment;
        if(!supplied)try{supplied=JSON.parse(a.text);}catch{}
        assessment=assessArchitecture(p,renders,supplied);
        a.text=assessment.criteria.map(c=>c.category+': '+c.findings).join('\n');
      }
      if (typeof a.text !== 'string' || a.text.trim().length < 40)
        throw Error('Record specific visual findings and remaining limitations');
      p.review = { revision: p.revision, text: a.text, assessment, context: [...new Map(renders.flatMap((r) => r.context || []).map((q) => [q.id, q])).values()], at: new Date().toISOString() };
      await save(p);
      return p.review;
    }
    if (action === 'commit') {
      if (!p.worldId)
        throw Error(
          'Offline projects cannot commit. Capture the actual world in a new project and stage the plan there.',
        );
      const c = await connection();
      await checkWorld(p, c);
      await reconcile(p, c);
      if (!p.review || p.review.revision !== p.revision)
        throw Error('This revision requires visual review before commit');
      for (const q of p.review.context || [])
        if ((await load(q.id)).revision !== q.revision) throw Error('Reviewed context changed; render and review again');
      if (audit(p, rulesOf(p)).failures.length) throw Error('Audit failed');
      const normalized = await canonicalize(c, p.edits);
      // Minecraft supplies defaults; canonicalization can change the visible shape. Require a fresh review.
      if (JSON.stringify(normalized) !== JSON.stringify(p.edits)) {
        p.edits = normalized;
        p.revision++;
        p.review = null;
        await save(p);
        return {
          ...summary(p),
          needsReview: true,
          reason:
            'Minecraft canonicalized block properties. Render the normalized draft and review again.',
        };
      }
      let committed = 0;
      const receiptIds = [];
      for (const changes of batches(diff(p))) {
        const id = randomUUID();
        p.pending = { id, changes };
        await save(p);
        // Persist intent before submitting. On ambiguous network errors retry the identical id/body.
        await reconcile(p, c);
        committed += changes.length;
        receiptIds.push(id);
      }
      return { ...summary(p), committed, receipts: receiptIds };
    }
    if (action === 'undo') {
      const c = await connection();
      await checkWorld(p, c);
      const pendingUndo = p.pending?.undoOf
        ? { id: p.pending.undoOf, blocks: p.pending.changes.length }
        : null;
      await reconcile(p, c);
      if (pendingUndo)
        return { undone: pendingUndo.id, blocks: pendingUndo.blocks, reconciled: true };
      if (diff(p).length)
        throw Error('Checkpoint the draft and finish or restore it before undoing a live commit');
      const receipt = p.receipts.at(-1);
      if (!receipt) throw Error('No committed transaction to undo');
      const original =
        receipt.changes ||
        JSON.parse(await readFile(path.join(dir, 'receipts', receipt.id + '.json'), 'utf8'))
          .changes;
      const changes = original.map((c) => ({ pos: c.pos, before: c.after, after: c.before }));
      const id = randomUUID();
      p.pending = { id, changes, undoOf: receipt.id };
      await save(p);
      await reconcile(p, c);
      return { undone: receipt.id, blocks: changes.length };
    }
    if (action === 'recover') {
      const c = await connection();
      await checkWorld(p, c);
      const id = a.job || p.failedJob?.id || p.pending?.id;
      if (!id) throw Error('Supply the interrupted job ID');
      await bridge(c, '/recover', { id, worldId: p.worldId, dimension: p.dimension });
      const result = await waitJob(c, id);
      if (result.phase !== 'rolled_back')
        throw Error('Recovery requires manual inspection: ' + JSON.stringify(result));
      if (p.pending?.id === id) delete p.pending;
      if (p.failedJob?.id === id) delete p.failedJob;
      p.review = null;
      p.revision++;
      await save(p);
      return result;
    }
    if (action === 'verify') {
      const c = await connection();
      await checkWorld(p, c);
      const live = unpack(await capture(c, p.worldId, p.dimension, p.bounds)),
        expected = compose(p),
        mismatches = [];
      let count = 0;
      for (const k of new Set([...live.keys(), ...expected.keys()]))
        if ((live.get(k) || AIR) !== (expected.get(k) || AIR)) {
          count++;
          if (mismatches.length < 30)
            mismatches.push({
              pos: pos(k),
              expected: expected.get(k) || AIR,
              actual: live.get(k) || AIR,
            });
        }
      const report = {
        matches: count === 0,
        mismatchCount: count,
        mismatches,
        at: new Date().toISOString(),
      };
      await atomic(path.join(dir, 'verification.json'), report);
      return report;
    }
    throw Error(`Unknown action: ${action}`);
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    const auth = Buffer.from(req.headers.authorization || ''),
      wanted = Buffer.from(`Bearer ${token}`);
    if (req.headers.origin || auth.length !== wanted.length || !timingSafeEqual(auth, wanted)) {
      res.writeHead(403);
      res.end('{"error":"Forbidden"}');
      return;
    }
    if (req.method !== 'POST' || req.url !== '/command') {
      res.writeHead(404);
      res.end('{}');
      return;
    }
    if (busy) {
      res.writeHead(409);
      res.end('{"error":"Another engine command is running"}');
      return;
    }
    busy = true;
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 32 * 1024 * 1024) throw Error('Request exceeds 32 MB');
        chunks.push(chunk);
      }
      const { action, args = {} } = JSON.parse(Buffer.concat(chunks).toString());
      const result = await command(action, args);
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: e.message }));
    } finally {
      busy = false;
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const session = { port: server.address().port, token, pid: process.pid, protocol: 1 };
  await atomic(sessionFile, session);
  return {
    server,
    session,
    command,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      await rm(sessionFile, { force: true });
    },
  };
}
