import * as THREE from 'three';
import { lookDefaults } from '../character-look';
import type { CharacterLook, LookPart } from '../character-look';
import type { OutlineStyle } from './CharacterOutline';

const vector3 = () => ({ value: new THREE.Vector3() });
const vector4 = () => ({ value: new THREE.Vector4() });
const createUniforms = () => ({
  actorDirection: vector3(),
  actorPosition: vector3(),
  actorLevels: vector4(),
  actorShape: vector4(),
  actorTint: vector4(),
  actorMask: vector4(),
});
type Uniforms = ReturnType<typeof createUniforms>;
const shaders = new WeakMap<THREE.MeshStandardMaterial, Uniforms>();
const state = new WeakMap<
  THREE.Object3D,
  {
    local: THREE.Vector3;
    direction: THREE.Vector3;
    rotation: THREE.Quaternion;
    origin: THREE.Vector3;
    position: THREE.Vector3;
  }
>();
export function characterLightOffset(look: CharacterLook, out: THREE.Vector3) {
  const yaw = THREE.MathUtils.degToRad(look.yaw),
    pitch = THREE.MathUtils.degToRad(look.pitch);
  return out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
}

export function characterMeshTargets(node: THREE.Object3D): LookPart[] {
  const bone = String(node.userData.bone ?? ''),
    layer = node.userData.characterLayer;
  const side = bone.startsWith('left') ? 'left' : 'right';
  const region =
    bone === 'head' || bone === 'body'
      ? ([bone] as LookPart[])
      : /Arm|Hand/.test(bone)
        ? ([`${side}Arm`, 'arms'] as LookPart[])
        : /Leg|Shin|Foot/.test(bone)
          ? ([`${side}Leg`, 'legs'] as LookPart[])
          : [];
  const material: LookPart | undefined =
    layer === 'hair' || layer === 'headwear'
      ? 'hair'
      : layer === 'armor' || layer === 'detail' || layer === 'skin'
        ? layer
        : layer
          ? 'clothes'
          : node.userData.facialLayer === 'mouth'
            ? 'mouth'
            : node.userData.facialLayer
              ? 'eyes'
              : undefined;
  return material ? [material, ...region, 'all'] : [...region, 'all'];
}

export const characterMaskGLSL = `
float characterMaskWeight(vec3 color, vec4 mask) {
  if (mask.a <= 0.0) return 1.0;
  float difference = length(sqrt(max(color, vec3(0.0))) - sqrt(mask.rgb));
  return 1.0 - smoothstep(mask.a * 0.72, mask.a, difference);
}`;

export const characterFalloffGLSL = `
float characterFalloff(float distanceToLight, float range) {
  float fraction = distanceToLight / range;
  float cutoff = max(0.0, 1.0 - fraction * fraction);
  return cutoff * cutoff / (1.0 + 2.0 * fraction * fraction);
}`;

export function updateCharacterLightDirection(root: THREE.Object3D) {
  const light = state.get(root);
  if (light) {
    light.direction.copy(light.local).applyQuaternion(root.getWorldQuaternion(light.rotation));
    light.position.copy(light.origin).applyMatrix4(root.matrixWorld);
  }
}

export function setCharacterLook(root: THREE.Object3D, look?: CharacterLook, pivotY = 1) {
  if (look?.enabled === false) look = undefined;
  root.userData.outlineStyle = undefined;
  let light = state.get(root);
  if (!look && !light) return;
  if (look && !light) {
    light = {
      local: new THREE.Vector3(),
      direction: new THREE.Vector3(),
      rotation: new THREE.Quaternion(),
      origin: new THREE.Vector3(),
      position: new THREE.Vector3(),
    };
    state.set(root, light);
  }
  const range = look?.type === 'point' ? (look.range ?? lookDefaults.range) : 0;
  const tint = new THREE.Color(look?.tint ?? lookDefaults.tint);
  if (look && light) {
    characterLightOffset(look, light.local);
    light.origin.copy(light.local).multiplyScalar(look.distance ?? lookDefaults.distance).y +=
      pivotY;
    updateCharacterLightDirection(root);
    if (look.outline) {
      const style: OutlineStyle = {
        outline: look.outline,
        outlineColor: look.outlineColor,
        direction: light.direction,
        position: light.position,
        range,
        softness: look.outlineSoftness ?? look.softness,
      };
      root.userData.outlineStyle = style;
    }
  }
  const visit = (node: THREE.Object3D) => {
    if (node !== root && node.userData.id) return;
    node.children.forEach(visit);
    if (!(node instanceof THREE.Mesh) || !(node.material instanceof THREE.MeshStandardMaterial))
      return;
    const region =
      look &&
      characterMeshTargets(node)
        .map((target) => look.parts[target])
        .find(Boolean);
    const directional = (region?.light ?? 0) * (look?.power ?? lookDefaults.power),
      glow = region?.glow ?? 0;
    const maskColor = new THREE.Color(region?.maskColor ?? '#ffffff');
    const tolerance = region?.maskColor ? (region.maskTolerance ?? lookDefaults.maskTolerance) : 0;
    const mask = new THREE.Vector4(maskColor.r, maskColor.g, maskColor.b, tolerance);
    node.userData.outlineMask = mask;
    node.userData.outlineLight =
      (region?.outline ?? directional) * (look?.outlineOpacity ?? lookDefaults.outlineOpacity);
    const material = node.material;
    let uniforms = shaders.get(material);
    if (!uniforms && light && (directional || glow || region?.specular)) {
      const installed = createUniforms();
      uniforms = installed;
      shaders.set(material, installed);
      const previous = material.onBeforeCompile.bind(material),
        key = material.customProgramCacheKey();
      material.customProgramCacheKey = () => key + '|character-look';
      material.onBeforeCompile = (shader, renderer) => {
        previous(shader, renderer);
        Object.assign(shader.uniforms, installed);
        shader.fragmentShader =
          `uniform vec3 actorDirection, actorPosition;
          uniform vec4 actorLevels, actorShape, actorTint, actorMask;
          ${characterMaskGLSL}
          ${characterFalloffGLSL}\n` +
          shader.fragmentShader.replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
          vec3 actorN = normalize(normal);
          vec3 actorL = mat3(viewMatrix) * actorDirection;
          float actorFalloff = 1.0;
          if (actorShape.x > 0.0) {
            actorL = (viewMatrix * vec4(actorPosition, 1.0)).xyz + vViewPosition;
            actorFalloff = characterFalloff(length(actorL), actorShape.x);
          }
          actorL = normalize(actorL);
          vec3 actorV = normalize(vViewPosition);
          float actorFace = dot(actorN,actorL);
          float actorRim = pow(1.0-abs(dot(actorN,actorV)),actorShape.z);
          float actorKey = smoothstep(actorShape.y-actorLevels.z*0.43,0.8,actorFace);
          float actorSpecular = pow(max(0.0, dot(actorN,normalize(actorL+actorV))),mix(96.0,8.0,roughnessFactor));
          vec3 actorColor = diffuseColor.rgb * mix(vec3(1.0),actorTint.rgb,actorTint.a);
          float actorResponse = actorLevels.x * actorKey * mix(1.0,actorRim,actorLevels.w);
          totalEmissiveRadiance += actorColor * characterMaskWeight(diffuseColor.rgb,actorMask) *
            (actorLevels.y + actorFalloff * (actorResponse + actorShape.w * actorSpecular * max(0.0,actorFace)));`,
          );
      };
      material.needsUpdate = true;
    }
    if (uniforms && light) {
      uniforms.actorDirection.value = light.direction;
      uniforms.actorPosition.value = light.position;
      uniforms.actorLevels.value.set(
        directional,
        glow,
        look?.softness ?? 0.55,
        region?.rim ?? lookDefaults.rim,
      );
      uniforms.actorShape.value.set(
        range,
        look?.spread ?? lookDefaults.spread,
        look?.sharpness ?? lookDefaults.sharpness,
        (region?.specular ?? lookDefaults.specular) * (look?.power ?? lookDefaults.power),
      );
      uniforms.actorTint.value.set(tint.r, tint.g, tint.b, look?.tintMix ?? lookDefaults.tintMix);
      uniforms.actorMask.value.copy(mask);
    }
  };
  visit(root);
}
