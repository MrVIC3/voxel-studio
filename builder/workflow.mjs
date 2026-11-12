import { bounds } from './core.mjs';

function projects(spec) {
  if (spec.version !== 1 || !Array.isArray(spec.projects) || !spec.projects.length || spec.projects.length > 32)
    throw Error('Build manifest version 1 requires 1..32 projects');
  const ids = new Set();
  for (const p of spec.projects) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(p.id) || ids.has(p.id)) throw Error('Unique valid project IDs required');
    ids.add(p.id);
    if (p.bounds) bounds(p.bounds);
  }
  return spec.projects;
}
function disjoint(areas) {
  for (let i = 0; i < areas.length; i++) for (let j = 0; j < i; j++)
    if ([0, 1, 2].every((axis) => areas[i].min[axis] <= areas[j].max[axis] && areas[j].min[axis] <= areas[i].max[axis]))
      throw Error('Build districts must have disjoint editing bounds');
}
const compactAudit = (r) => ({ changed: r.changed, failures: r.failures, isolatedSamples: r.isolatedSamples });

// These orchestrators never infer design approval. They run the same guarded commands as the CLI.
export async function prepareBuild(command, spec) {
  const list = projects(spec), states = [];
  // Resolve every project before any draft mutation, and reject accidental overlap.
  for (const p of list) {
    let info;
    try { info = await command('info', { id: p.id }); }
    catch (e) { if (e.code !== 'ENOENT' || !p.bounds) throw e; }
    if (info && p.bounds && JSON.stringify(info.bounds) !== JSON.stringify(bounds(p.bounds)))
      throw Error('Manifest bounds differ from existing project ' + p.id);
    states.push(info);
  }
  disjoint(list.map((p, i) => states[i]?.bounds || p.bounds));
  for (let i = 0; i < list.length; i++) if (!states[i])
    states[i] = await command('init', { ...list[i], brief: spec.brief || '', offline: !!spec.offline });
  if (new Set(states.map((p) => `${p.worldId}/${p.dimension}`)).size !== 1) throw Error('Build projects must share world and dimension');
  const report = { version: 1, phase: 'draft', projects: [], renders: [] };
  for (const p of list) {
    if (p.checkpoint) await command('checkpoint', { id: p.id, name: p.checkpoint, ifAbsent: true });
    const staged = (p.plan || p.design) ? await command('stage', { id: p.id, plan: p.plan, design:p.design, fromCheckpoint: p.fromCheckpoint }) : await command('info', { id: p.id });
    const audit = await command('audit', { id: p.id, ...(p.rules ? { rules: p.rules } : {}) });
    report.projects.push({ id: p.id, revision: staged.revision, unchanged: !!staged.unchanged, audit: compactAudit(audit) });
  }
  if (report.projects.some((p) => p.audit.failures.length)) { report.phase = 'fix-audit'; return report; }
  const context = list.slice(1).map((p) => p.id);
  for (const options of spec.renders || [{}]) {
    const r = await command('render', { ...options, id: list[0].id, context });
    report.renders.push(r);
  }
  report.phase = 'inspect-images';
  return report;
}

export async function deliverBuild(command, spec) {
  const list = projects(spec), infos = [];
  // Refuse an unreviewed district before committing any other district.
  for (const p of list) {
    if (spec.findings) await command('review', { id: p.id, text: spec.findings });
    const info = await command('info', { id: p.id });
    if (!info.review || info.review.revision !== info.revision) throw Error('Visual review required for ' + p.id);
    if ((await command('audit', { id: p.id })).failures.length) throw Error('Audit failed for ' + p.id);
    infos.push(info);
  }
  disjoint(infos.map((p) => p.bounds));
  if (infos.some((p) => !p.worldId) || new Set(infos.map((p) => `${p.worldId}/${p.dimension}`)).size !== 1)
    throw Error('Delivery requires projects captured from the same live world and dimension');
  const revisions = new Map(infos.map((p) => [p.id, p.revision]));
  for (const p of infos) for (const q of p.review.context || []) {
    const current = revisions.get(q.id) ?? (await command('info', { id: q.id })).revision;
    if (q.revision !== current) throw Error('Reviewed context changed; render and review again');
  }
  const report = { version: 1, phase: 'commit', projects: [] };
  for (const p of list) {
    const r = await command('commit', { id: p.id });
    report.projects.push({ id: p.id, committed: r.committed, remaining: r.changed, needsReview: !!r.needsReview });
    if (r.needsReview) { report.phase = 'inspect-images'; return report; }
  }
  for (const p of report.projects) p.verification = await command('verify', { id: p.id });
  report.phase = report.projects.every((p) => p.verification.matches) ? 'verified' : 'fix-mismatches';
  return report;
}
