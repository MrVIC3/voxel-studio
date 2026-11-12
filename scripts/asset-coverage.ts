import { readFileSync, writeFileSync } from 'node:fs';
import { decodeMinecraftAssets, MinecraftLibrary } from '../src/engine/minecraft';
const assets = decodeMinecraftAssets(
  new Uint8Array(readFileSync(process.env.APPDATA + '/.minecraft/versions/1.21.11/1.21.11.jar')),
  '1.21.11',
  'Local Java',
);
const library = new MinecraftLibrary(assets),
  special: string[] = [];
for (const name of Object.keys(assets.blockstates)) {
  const parts = library.parts(name);
  if (parts.every((part) => !part.model.elements.length)) special.push(name);
}
const report = {
  version: assets.version,
  textures: Object.keys(assets.textures).length,
  models: Object.keys(assets.models).length,
  states: Object.keys(assets.blockstates).length,
  special,
};
writeFileSync('test-results/asset-coverage.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
