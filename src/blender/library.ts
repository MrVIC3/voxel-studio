import { parseGltfMotion } from './gltf';
import type { GltfSource } from './gltf';
import { bakeMotionAction, motionActionNames } from './retarget';
import type { ImportedMotion } from './retarget';

let source: Promise<GltfSource> | undefined;
const presetCache = new Map<number, Promise<ImportedMotion[]>>();

export function loadBlenderLibrarySource() {
  source ??= fetch(new URL('./voxel-motion-library.glb', import.meta.url))
    .then(async (response) => {
      if (!response.ok) throw Error('Could not load the bundled Blender library.');
      return parseGltfMotion(new Uint8Array(await response.arrayBuffer()));
    })
    .catch((error) => {
      source = undefined;
      throw error;
    });
  return source;
}

export function loadBlenderPresets(fps: number) {
  let pending = presetCache.get(fps);
  if (!pending) {
    pending = loadBlenderLibrarySource()
      .then((source) =>
        motionActionNames(source).map(({ index }) => ({
          ...bakeMotionAction(source, index, { fps }),
          id: `blender-preset-${index}`,
        })),
      )
      .catch((error) => {
        presetCache.delete(fps);
        throw error;
      });
    if (presetCache.size > 4) presetCache.delete(presetCache.keys().next().value!);
    presetCache.set(fps, pending);
  }
  return pending;
}
