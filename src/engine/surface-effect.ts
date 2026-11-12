import { Color, Mesh, MeshStandardMaterial } from 'three';
import type { Object3D } from 'three';
import type { SurfaceEffect } from '../model';

const inputs = new WeakMap<
  MeshStandardMaterial,
  {
    surfaceColor: { value: Color };
    surfaceStrength: { value: [number, number, number, number] };
  }
>();

export function setSurfaceEffect(root: Object3D, effect?: SurfaceEffect) {
  const update = (node: Object3D) => {
    if (node !== root && node.userData.id) return;
    node.children.forEach(update);
    if (!(node instanceof Mesh) || node.userData.helper) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!(material instanceof MeshStandardMaterial)) continue;
      let uniforms = inputs.get(material);
      if (!uniforms && effect && (effect.glow || effect.rim || effect.outline)) {
        const installed = {
          surfaceColor: { value: new Color() },
          surfaceStrength: { value: [0, 0, 0, 0.15] as [number, number, number, number] },
        };
        uniforms = installed;
        inputs.set(material, installed);
        const previous = material.onBeforeCompile.bind(material);
        const key = material.customProgramCacheKey();
        material.customProgramCacheKey = () => key + '|voxel-surface';
        material.onBeforeCompile = (shader, renderer) => {
          previous(shader, renderer);
          Object.assign(shader.uniforms, installed);
          shader.fragmentShader =
            'uniform vec3 surfaceColor;\nuniform vec4 surfaceStrength;\n' +
            shader.fragmentShader.replace(
              '#include <emissivemap_fragment>',
              `#include <emissivemap_fragment>
            float edgeAngle = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
            float rim = pow(edgeAngle, 3.0) * surfaceStrength.y;
            float outline = smoothstep(1.0 - surfaceStrength.w, 1.0 - surfaceStrength.w * 0.48, edgeAngle) * surfaceStrength.z;
            totalEmissiveRadiance += surfaceColor * (surfaceStrength.x + rim + outline);`,
            );
        };
        material.needsUpdate = true;
      }
      if (uniforms) {
        uniforms.surfaceColor.value.set(effect?.color || '#ffffff');
        uniforms.surfaceStrength.value = effect
          ? [effect.glow, effect.rim, effect.outline, effect.width]
          : [0, 0, 0, 0.15];
      }
    }
  };
  update(root);
}
