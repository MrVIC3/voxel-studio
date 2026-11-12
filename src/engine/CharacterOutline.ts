import * as THREE from 'three';
import { characterFalloffGLSL, characterMaskGLSL } from './character-look';

export type OutlineStyle = {
  outline: number;
  outlineColor: string;
  direction: THREE.Vector3;
  position: THREE.Vector3;
  range: number;
  softness: number;
};
const MAX_RADIUS = 12;

export const outlineFragment = `
  uniform sampler2D tCharacterMask, tCharacterLight, tCharacterDepth, tSceneDepth;
  uniform vec2 uOutlineTexel;
  uniform vec4 uOutlineBounds;
  uniform float uOutlineRadius;
  vec4 characterStroke(vec2 uv) {
    if (uOutlineRadius <= 0.0 || any(lessThan(uv, uOutlineBounds.xy)) ||
        any(greaterThan(uv, uOutlineBounds.zw)) || texture2D(tCharacterMask, uv).a > 0.0)
      return vec4(0.0);
    float sceneDepth = texture2D(tSceneDepth, uv).r;
    vec4 stroke = vec4(0.0);
    vec2 edgeUv = uv;
    for (float r = 1.0; r <= ${MAX_RADIUS}.0; r++) {
      if (r > uOutlineRadius + 1.0) break;
      for (int i = 0; i < 8; i++) {
        float angle = float(i) * 0.78539816;
        vec2 sampleUv = uv + vec2(cos(angle), sin(angle)) * uOutlineTexel * r;
        vec4 mask = texture2D(tCharacterMask, sampleUv);
        float coverage = clamp(mask.a * ${MAX_RADIUS}.0 + 0.5 - r, 0.0, 1.0);
        if (mask.a > 0.0 && coverage > stroke.a &&
            texture2D(tCharacterDepth, sampleUv).r <= sceneDepth + 0.00015) {
          stroke = vec4(mask.rgb, coverage);
          edgeUv = sampleUv;
        }
      }
      if (stroke.a >= 1.0) break;
    }
    if (stroke.a <= 0.0) return stroke;
    vec4 light = texture2D(tCharacterLight, edgeUv);
    if (light.a <= 0.0) return vec4(0.0);
    // Sample the complete silhouette so a dark part cannot create an interior stroke.
    vec2 dx = vec2(uOutlineTexel.x, 0.0), dy = vec2(0.0, uOutlineTexel.y);
    vec2 outward = vec2(
      step(0.001, texture2D(tCharacterMask, edgeUv - dx).a) - step(0.001, texture2D(tCharacterMask, edgeUv + dx).a),
      step(0.001, texture2D(tCharacterMask, edgeUv - dy).a) - step(0.001, texture2D(tCharacterMask, edgeUv + dy).a)
    );
    if (dot(outward, outward) < 0.01) outward = (uv - edgeUv) / uOutlineTexel;
    vec2 direction = light.rg * 2.0 - 1.0;
    float span = length(direction);
    float alignment = dot(normalize(outward), direction / max(span, 0.001));
    float lit = smoothstep(mix(0.54, -0.13, light.b), mix(0.86, 0.48, light.b), alignment);
    stroke.a *= light.a * mix(1.0, lit, smoothstep(0.02, 0.30, span));
    return stroke;
  }`;

type MaskMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

/** Draw the visible actor silhouette once. A screen-space stroke follows it across mesh seams. */
export class CharacterOutline {
  private scene = new THREE.Scene();
  private depth = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  private target = new THREE.WebGLRenderTarget(1, 1, {
    depthTexture: this.depth,
    count: 2,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  });
  private proxies = new Map<THREE.Mesh, MaskMesh>();
  private viewport = new THREE.Vector2();
  private bounds = new THREE.Box3();
  private meshBounds = new THREE.Box3();
  private corner = new THREE.Vector3();
  private clear = new THREE.Color();
  private tint = new THREE.Color();
  private viewLight = new THREE.Vector3();
  private viewPosition = new THREE.Vector3();
  uniforms = {
    tCharacterMask: { value: this.target.texture },
    tCharacterLight: { value: this.target.textures[1] },
    tCharacterDepth: { value: this.depth },
    tSceneDepth: { value: null as THREE.DepthTexture | null },
    uOutlineTexel: { value: new THREE.Vector2(1, 1) },
    uOutlineBounds: { value: new THREE.Vector4() },
    uOutlineRadius: { value: 0 },
  };

  constructor(sceneDepth: THREE.DepthTexture) {
    this.uniforms.tSceneDepth.value = sceneDepth;
  }

  render(
    renderer: THREE.WebGLRenderer,
    camera: THREE.PerspectiveCamera,
    roots: Iterable<THREE.Object3D>,
    w: number,
    h: number,
  ) {
    this.bounds.makeEmpty();
    const active = new Set<THREE.Mesh>();
    let maxRadius = 0;
    const collect = (node: THREE.Object3D, style: OutlineStyle, radius: number) => {
      if (!node.visible) return;
      if (node instanceof THREE.Mesh && node.material instanceof THREE.MeshStandardMaterial) {
        active.add(node);
        const proxy = this.proxies.get(node) ?? this.createProxy(node, node.material);
        proxy.geometry = node.geometry;
        proxy.matrix.copy(node.matrixWorld);
        proxy.layers.mask = node.layers.mask;
        proxy.material.userData.stroke.value.set(
          this.tint.r,
          this.tint.g,
          this.tint.b,
          radius / MAX_RADIUS,
        );
        proxy.material.userData.light.value.set(
          this.viewLight.x * 0.5 + 0.5,
          this.viewLight.y * 0.5 + 0.5,
          style.softness,
          Math.min(1, node.userData.outlineLight ?? 0),
        );
        proxy.material.userData.lightPosition.value.set(
          this.viewPosition.x,
          this.viewPosition.y,
          this.viewPosition.z,
          style.range,
        );
        proxy.material.userData.colorMask.value.copy(
          node.userData.outlineMask ?? new THREE.Vector4(),
        );
        proxy.material.color.copy(node.material.color);
        if (
          proxy.material.map !== node.material.map ||
          proxy.material.alphaTest !== node.material.alphaTest ||
          proxy.material.vertexColors !== node.material.vertexColors
        ) {
          proxy.material.map = node.material.map;
          proxy.material.alphaTest = node.material.alphaTest;
          proxy.material.vertexColors = node.material.vertexColors;
          proxy.material.needsUpdate = true;
        }
        if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
        this.bounds.union(
          this.meshBounds.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld),
        );
      }
      for (const child of node.children) if (!child.userData.id) collect(child, style, radius);
    };
    for (const root of roots) {
      const style = root.userData.outlineStyle as OutlineStyle | undefined;
      if (!style?.outline || !root.visible) continue;
      let parent = root.parent;
      while (parent?.visible) parent = parent.parent;
      if (parent) continue;
      const radius = Math.min(MAX_RADIUS, Math.max(0.65, style.outline * Math.min(w, h) * 0.46));
      this.tint.set(style.outlineColor).convertLinearToSRGB();
      this.viewLight.copy(style.direction).transformDirection(camera.matrixWorldInverse);
      this.viewPosition.copy(style.position).applyMatrix4(camera.matrixWorldInverse);
      collect(root, style, radius);
      if (!this.bounds.isEmpty()) maxRadius = Math.max(maxRadius, radius);
    }
    for (const [mesh, proxy] of this.proxies)
      if (!active.has(mesh)) {
        proxy.material.dispose();
        proxy.removeFromParent();
        this.proxies.delete(mesh);
      }
    this.uniforms.uOutlineRadius.value = maxRadius;
    if (!maxRadius) return;

    this.target.setSize(w, h);
    this.viewport.set(1 / w, 1 / h);
    this.uniforms.uOutlineTexel.value.copy(this.viewport);
    const { min, max } = this.bounds;
    const rect = this.uniforms.uOutlineBounds.value.set(1, 1, 0, 0);
    for (let i = 0; i < 8; i++) {
      this.corner.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z);
      if (this.corner.applyMatrix4(camera.matrixWorldInverse).z > -camera.near) {
        rect.set(0, 0, 1, 1);
        break;
      }
      this.corner.applyMatrix4(camera.projectionMatrix).multiplyScalar(0.5).addScalar(0.5);
      rect.set(
        Math.min(rect.x, this.corner.x),
        Math.min(rect.y, this.corner.y),
        Math.max(rect.z, this.corner.x),
        Math.max(rect.w, this.corner.y),
      );
    }
    rect.add(new THREE.Vector4(-1 / w, -1 / h, 1 / w, 1 / h).multiplyScalar(maxRadius + 1));
    const oldTarget = renderer.getRenderTarget(),
      oldAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clear);
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0, 0);
    renderer.clear();
    try {
      renderer.render(this.scene, camera);
    } finally {
      renderer.setClearColor(this.clear, oldAlpha);
      renderer.setRenderTarget(oldTarget);
    }
  }

  private createProxy(mesh: THREE.Mesh, surface: THREE.MeshStandardMaterial) {
    const material = new THREE.MeshBasicMaterial({ side: surface.side, toneMapped: false });
    const stroke = { value: new THREE.Vector4() };
    const light = { value: new THREE.Vector4() };
    const lightPosition = { value: new THREE.Vector4() };
    const colorMask = { value: new THREE.Vector4() };
    material.userData.stroke = stroke;
    material.userData.light = light;
    material.userData.lightPosition = lightPosition;
    material.userData.colorMask = colorMask;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.actorStroke = stroke;
      shader.uniforms.actorStrokeLight = light;
      shader.uniforms.actorStrokePosition = lightPosition;
      shader.uniforms.actorStrokeMask = colorMask;
      shader.uniforms.actorSceneDepth = this.uniforms.tSceneDepth;
      shader.uniforms.actorMaskTexel = this.uniforms.uOutlineTexel;
      shader.vertexShader =
        'varying vec3 actorStrokeView;\n' +
        shader.vertexShader.replace(
          '#include <project_vertex>',
          '#include <project_vertex>\n actorStrokeView = mvPosition.xyz;',
        );
      shader.fragmentShader = `uniform vec4 actorStroke;
        uniform vec4 actorStrokeLight, actorStrokePosition, actorStrokeMask;
        varying vec3 actorStrokeView;
        layout(location = 1) out highp vec4 characterLight;
        uniform sampler2D actorSceneDepth;
        uniform vec2 actorMaskTexel;
        ${characterMaskGLSL}
        ${characterFalloffGLSL}
        ${shader.fragmentShader}`.replace(
        '#include <opaque_fragment>',
        `
        float depth = texture2D(actorSceneDepth, gl_FragCoord.xy * actorMaskTexel).r;
        if (gl_FragCoord.z > depth + 0.00015) discard;
        gl_FragColor = actorStroke;
        characterLight = actorStrokeLight;
        if (actorStrokePosition.w > 0.0) {
          vec3 offset = actorStrokePosition.xyz - actorStrokeView;
          characterLight.rg = normalize(offset).xy * 0.5 + 0.5;
          characterLight.a *= characterFalloff(length(offset), actorStrokePosition.w);
        }
        characterLight.a *= characterMaskWeight(diffuseColor.rgb, actorStrokeMask);`,
      );
    };
    const proxy = new THREE.Mesh(mesh.geometry, material);
    proxy.matrixAutoUpdate = false;
    this.proxies.set(mesh, proxy);
    this.scene.add(proxy);
    return proxy;
  }

  dispose() {
    for (const proxy of this.proxies.values()) proxy.material.dispose();
    this.proxies.clear();
    this.scene.clear();
    this.target.dispose();
  }
}
