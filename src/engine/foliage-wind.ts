import * as THREE from 'three';
import { defaultWind } from '../wind';
import type { WindSettings } from '../wind';
import { parseState } from './minecraft';

export function foliageKind(name: string) {
  const id = parseState(name).id.replace(/^minecraft:/, '');
  if (
    id.endsWith('_leaves') ||
    id === 'vine' ||
    id.endsWith('_vines') ||
    id.endsWith('_vines_plant')
  )
    return 'canopy';
  if (
    /^(short_grass|tall_grass|fern|large_fern|bush|dead_bush|firefly_bush|short_dry_grass|tall_dry_grass|dandelion|poppy|blue_orchid|allium|azure_bluet|oxeye_daisy|cornflower|lily_of_the_valley|wither_rose|torchflower|pink_petals|wildflowers|sunflower|lilac|rose_bush|peony|pitcher_plant)$/.test(
      id,
    ) ||
    id.endsWith('_tulip') ||
    id.endsWith('_sapling')
  )
    return 'stem';
}

export function createFoliageWind() {
  const uniforms = {
    voxelWind: { value: new THREE.Vector4() },
    voxelWindDirection: { value: new THREE.Vector2() },
  };
  const set = (settings: WindSettings = defaultWind) => {
    const angle = THREE.MathUtils.degToRad(settings.direction);
    uniforms.voxelWind.value.setX(settings.enabled ? settings.strength : 0);
    uniforms.voxelWind.value.setY(settings.speed);
    uniforms.voxelWind.value.setZ(settings.gust);
    uniforms.voxelWindDirection.value.set(Math.cos(angle), Math.sin(angle));
  };
  set();
  const install = (material: THREE.Material) => {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = `attribute float voxelWindWeight;
uniform vec4 voxelWind;
uniform vec2 voxelWindDirection;
${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
      if (voxelWind.x > 0.0) {
        vec2 ground = (modelMatrix * vec4(position, 1.0)).xz;
        float time = voxelWind.w * voxelWind.y;
        float phase = dot(ground, voxelWindDirection) * 0.9;
        float gust = 1.0 + voxelWind.z * sin(time * 1.3 - phase * 0.8);
        float sway = (sin(time * 2.4 - phase) + 0.24 * sin(time * 4.1 + phase * 1.6)) * gust;
        vec3 direction = vec3(voxelWindDirection.x, 0.0, voxelWindDirection.y);
        vec3 localDirection = vec3(dot(normalize(modelMatrix[0].xyz), direction),
          dot(normalize(modelMatrix[1].xyz), direction), dot(normalize(modelMatrix[2].xyz), direction));
        transformed += localDirection * (sway * voxelWind.x * voxelWindWeight);
      }`,
      );
    };
  };
  return { set, install, time: (seconds: number) => uniforms.voxelWind.value.setW(seconds) };
}
