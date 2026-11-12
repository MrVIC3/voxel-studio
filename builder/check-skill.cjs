const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const skill = path.resolve(process.argv[2] || 'skills/minecraft-builder');
const file = fs.readFileSync(path.join(skill, 'SKILL.md'), 'utf8').replace(/^\uFEFF/, '');
const front = file.match(/^---\r?\n([\s\S]+?)\r?\n---/);
if (!front) throw Error('Missing skill frontmatter');
const name = front[1].match(/^name: (.+)$/m)?.[1].trim();
if (!name || name.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))
  throw Error('Invalid skill name');
if (!/^description: .{30,}$/m.test(front[1])) throw Error('Missing discriminating description');
for (const reference of file.matchAll(/\]\(([^)]+)\)/g))
  if (!/^https?:/.test(reference[1]) && !fs.existsSync(path.resolve(skill, reference[1])))
    throw Error('Broken reference ' + reference[1]);
for (const child of [
  'references/engine.md',
  'references/craft.md',
  'scripts/vbuild.mjs',
  'scripts/geometry.mjs',
  'references/workflow.md',
  'engine.json',
])
  if (!fs.existsSync(path.join(skill, child))) throw Error('Missing ' + child);
const cfg = JSON.parse(fs.readFileSync(path.join(skill, 'engine.json'), 'utf8'));
if (!fs.existsSync(path.resolve(skill, cfg.root, 'builder/cli.mjs')))
  throw Error('Skill engine path does not resolve');
const syntax = spawnSync(process.execPath, ['--check', path.join(skill, 'scripts/vbuild.mjs')], {
  encoding: 'utf8',
});
if (syntax.status) throw Error(syntax.stderr);
const geometrySyntax = spawnSync(process.execPath, ['--check', path.join(skill, 'scripts/geometry.mjs')], {encoding:'utf8'});
if (geometrySyntax.status) throw Error(geometrySyntax.stderr);
console.log(
  JSON.stringify({
    valid: true,
    name,
    links: 'resolved',
    engine: 'resolved',
    wrapper: 'syntax checked',
  }),
);
