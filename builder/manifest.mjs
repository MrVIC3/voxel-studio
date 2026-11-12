import { readFile } from 'node:fs/promises';
import path from 'node:path';

// File paths are relative to the manifest, independent of the caller's working directory.
export async function loadManifest(file) {
  const absolute = path.resolve(file), dir = path.dirname(absolute);
  const spec = JSON.parse(await readFile(absolute, 'utf8'));
  const json = async (value) => typeof value === 'string' ? JSON.parse(await readFile(path.resolve(dir, value), 'utf8')) : value;
  if (spec.briefFile) spec.brief = await readFile(path.resolve(dir, spec.briefFile), 'utf8');
  if (Array.isArray(spec.projects)) spec.projects = await Promise.all(spec.projects.map(async (p) => ({
    ...p, ...(p.design ? { design: await json(p.design) } : {}), ...(p.plan ? { plan: await json(p.plan) } : {}), ...(p.rules ? { rules: await json(p.rules) } : {}),
  })));
  if (spec.renders) spec.renders = await Promise.all(spec.renders.map(json));
  // Findings are accepted only in the separate, explicit delivery invocation.
  delete spec.findings;
  return spec;
}
