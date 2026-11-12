import { readFile, writeFile } from 'node:fs/promises';
import { loadManifest } from './manifest.mjs';
import { compareReference } from './reference.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const home = path.dirname(fileURLToPath(import.meta.url));
const [action, ...params] = process.argv.slice(2);
const help = `Voxel Build — local Codex world builder
  node builder/cli.mjs status
  node builder/cli.mjs connect <Minecraft config/voxel-build.json>
  node builder/cli.mjs init <id> <minX,minY,minZ> <maxX,maxY,maxZ> [--offline]
  node builder/cli.mjs stage <id> <plan.json>
  node builder/cli.mjs compare <comparison.json>
  node builder/cli.mjs design <id> <design.json>
  node builder/cli.mjs prepare <build-manifest.json>
  node builder/cli.mjs deliver <build-manifest.json> [inspected-findings.txt]
  node builder/cli.mjs pin <id> <region-and-name.json>
  node builder/cli.mjs unpin <id> <name>
  node builder/cli.mjs timings
  node builder/cli.mjs inspect <id> [region.json]
  node builder/cli.mjs slice <id> <x|y|z> <coordinate> [region.json]
  node builder/cli.mjs render <id> [options.json]
  node builder/cli.mjs audit <id> [rules.json]
  node builder/cli.mjs review <id> <findings.txt>
  node builder/cli.mjs notes <id> <brief.txt>
  node builder/cli.mjs checkpoint|restore <id> <name>
  node builder/cli.mjs info|capture|commit|verify|undo <id>
  node builder/cli.mjs recover <id> [interrupted-job-id]
  node builder/cli.mjs shutdown
All output is compact JSON. Start the app with npm run builder:start.
Set VOXEL_BUILD_DATA to override the workspace-local builder-data directory.`;
if (!action || ['help', '--help', '-h'].includes(action)) {
  console.log(help);
  process.exit(0);
}
const json = async (f) => JSON.parse(await readFile(path.resolve(f), 'utf8'));
try {
  if(action==='compare'){const result=await compareReference(params[0]);console.log(JSON.stringify(result));process.exit(result.calibration?.accepted===false?1:0);}
  let args = { id: params[0] };
  if (['prepare', 'deliver'].includes(action)) {
    args = await loadManifest(params[0]);
    if (action === 'deliver' && params[1]) args.findings = await readFile(path.resolve(params[1]), 'utf8');
  }
  if (action === 'pin') Object.assign(args, await json(params[1]));
  if (action === 'unpin') args.name = params[1];
  if (action === 'connect') {
    delete args.id;
    args.config = path.resolve(params[0]);
  }
  if (action === 'init') {
    args.bounds = { min: params[1].split(',').map(Number), max: params[2].split(',').map(Number) };
    args.offline = params.includes('--offline');
  }
  if (action === 'recover') args.job = params[1];
  if (action === 'stage') args.plan = await json(params[1]);
  if (action === 'design') args.design = await json(params[1]);
  if (action === 'render' && params[1]) Object.assign(args, await json(params[1]));
  if (action === 'inspect' && params[1]) args.bounds = await json(params[1]);
  if (action === 'slice') {
    args.slice = { axis: params[1], at: Number(params[2]) };
    if (params[3]) args.bounds = await json(params[3]);
  }
  if (action === 'audit' && params[1]) args.rules = await json(params[1]);
  if (['review', 'notes'].includes(action))
    args.text = await readFile(path.resolve(params[1]), 'utf8');
  if (['checkpoint', 'restore'].includes(action)) args.name = params[1];
  const root = process.env.VOXEL_BUILD_DATA || path.join(home, '../builder-data');
  const session = await json(path.join(root, 'session.json'));
  const response = await fetch(`http://127.0.0.1:${session.port}/command`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: action === 'slice' ? 'inspect' : action === 'design' ? 'stage' : action, args }),
    signal: AbortSignal.timeout(15 * 60 * 1000),
  });
  const result = await response.json();
  if (['prepare', 'deliver'].includes(action)) {
    const report = path.resolve(params[0]) + `.${action}.report.json`;
    await writeFile(report, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ phase: result.phase, error: result.error, report, projects: result.projects?.map((p) => ({ id: p.id, revision: p.revision, unchanged: p.unchanged, committed: p.committed, mismatches: p.verification?.mismatchCount, failures: p.audit?.failures })), images: result.renders?.map((r) => ({ contactSheet: r.contactSheet, files: r.files, metrics: r.metrics })) }));
  } else console.log(JSON.stringify(result));
  if (!response.ok || result.matches === false || result.failures?.length || ['fix-audit', 'fix-mismatches'].includes(result.phase) || (action === 'deliver' && result.phase !== 'verified')) process.exitCode = 1;
} catch (e) {
  console.error(
    JSON.stringify({
      error: e.message,
      hint: 'Run npm run builder:start; Minecraft must have the bridge mod installed and its world open for live operations.',
    }),
  );
  process.exitCode = 1;
}
