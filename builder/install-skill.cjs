const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '..'),
  source = path.join(root, 'skills', 'minecraft-builder');
const targets = [
  path.join(root, '.agents', 'skills', 'minecraft-builder'),
  path.join(
    process.env.CODEX_HOME || path.join(os.homedir(), '.codex'),
    'skills',
    'minecraft-builder',
  ),
];
const files = ['SKILL.md', 'references/engine.md', 'references/craft.md', 'scripts/vbuild.mjs', 'scripts/geometry.mjs', 'references/workflow.md', 'references/architecture.md'];
for (const target of targets) {
  const existing = path.join(target, 'SKILL.md');
  if (fs.existsSync(existing) && !fs.readFileSync(existing, 'utf8').includes('Voxel Build'))
    throw Error('An unrelated skill already uses this name: ' + target);
  fs.mkdirSync(target, { recursive: true });
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
    fs.copyFileSync(path.join(source, file), path.join(target, file));
  }
  fs.writeFileSync(path.join(target, 'engine.json'), JSON.stringify({ root }, null, 2));
}
console.log(JSON.stringify({ installed: targets, engine: root }));
