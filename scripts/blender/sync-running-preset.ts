import { readFileSync, writeFileSync } from 'node:fs';
import { parseGltfMotion } from '../../src/blender/gltf';
import { bakeMotionAction, motionActionNames } from '../../src/blender/retarget';

const source = parseGltfMotion(readFileSync('src/blender/voxel-motion-library.glb'));
const run = motionActionNames(source).find(({ name }) => name === '03 · Driven Run');
if (!run) throw Error('The Blender motion library is missing Driven Run.');
const clip = bakeMotionAction(source, run.index, { fps: 24 });
writeFileSync(
  'src/blender/running-preset.json',
  JSON.stringify({ ...clip, id: 'preset-Run', name: 'Run' }) + '\n',
);
