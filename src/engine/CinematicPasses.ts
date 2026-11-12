import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { CinematicSettings } from '../cinematic';

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;
const linearDepth = `
  float viewDepth(sampler2D depth, vec2 uv, vec2 clipping) {
    float z = texture2D(depth, uv).r;
    return clipping.x * clipping.y / (clipping.y - z * (clipping.y - clipping.x));
  }
`;
const white = new THREE.Color(0xffffff);

function material(fragmentShader: string, uniforms: Record<string, THREE.IUniform>) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.NoBlending,
  });
}

function fogTarget() {
  return new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    depthBuffer: false,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  });
}

/** Bounded height-fog integration into a small buffer, then depth-aware upsampling. */
export class AtmospherePass extends Pass {
  private target = fogTarget();
  private filtered = fogTarget();
  private scatter = material(
    `
    #include <packing>
    varying vec2 vUv;
    uniform sampler2D uDepth, uSunShadow;
    uniform mat4 uProjectionInverse, uCameraWorld, uShadowMatrix;
    uniform vec3 uOrigin, uHaze, uSunColor, uSunDirection;
    uniform vec2 uClip;
    uniform float uBase, uFalloff, uRange, uDensity, uShafts, uUseShadow, uLight;
    uniform int uSteps;
    ${linearDepth}

    float sunVisibility(vec3 position) {
      vec4 lightPoint = uShadowMatrix * vec4(position, 1.0);
      vec3 projected = lightPoint.xyz / lightPoint.w;
      if (any(lessThan(projected, vec3(0.0))) || any(greaterThan(projected, vec3(1.0)))) return 1.0;
      float depth = unpackRGBAToDepth(texture2D(uSunShadow, projected.xy));
      float shadow = step(projected.z - 0.0005, depth);
      vec2 edge = min(projected.xy, 1.0 - projected.xy);
      return mix(1.0, shadow, smoothstep(0.0, 0.025, min(edge.x, edge.y)));
    }

    // Integrate the ambient haze exactly so ray-march jitter only affects shadow edges.
    float heightIntegral(float startHeight, float endHeight, float distance) {
      float low = min(startHeight, endHeight);
      float high = max(startHeight, endHeight);
      float span = high - low;
      if (span < 0.0001) return distance * exp(-max(0.0, low) / uFalloff);
      float below = max(0.0, min(0.0, high) - low);
      float aboveStart = max(0.0, low);
      float aboveHeight = max(0.0, high) - aboveStart;
      float above = exp(-aboveStart / uFalloff) * (1.0 - exp(-aboveHeight / uFalloff)) * uFalloff;
      return distance * (below + above) / span;
    }

    void main() {
      vec4 farView = uProjectionInverse * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
      vec3 viewRay = normalize(farView.xyz / farView.w);
      vec3 worldRay = normalize(mat3(uCameraWorld) * viewRay);
      float distanceToSurface = min(uRange, viewDepth(uDepth, vUv, uClip) / max(0.02, -viewRay.z));
      float startHeight = uOrigin.y - uBase;
      float endHeight = startHeight + worldRay.y * distanceToSurface;
      float opticalDepth = uDensity * heightIntegral(startHeight, endHeight, distanceToSurface);
      float transmission = exp(-opticalDepth);
      float cosAngle = clamp(dot(worldRay, uSunDirection), -1.0, 1.0);
      float phase = 0.19 / pow(max(0.10, 1.32 - 1.13 * cosAngle), 1.5);
      float litFraction = 1.0;
      if (uUseShadow > 0.5 && uShafts > 0.002 && opticalDepth > 0.0001) {
        vec2 noise = fract(floor(gl_FragCoord.xy) * vec2(0.1031, 0.1030));
        noise += dot(noise, noise.yx + 19.19);
        float jitter = 0.32 + fract(noise.x * noise.y) * 0.36;
        float litWeight = 0.0;
        float totalWeight = 0.0;
        float marchTransmission = 1.0;
        for (int i = 0; i < 16; i++) {
          if (i >= uSteps) break;
          float from = float(i) / float(uSteps);
          float to = float(i + 1) / float(uSteps);
          float nearT = from * from;
          float farT = to * to;
          float t = mix(nearT, farT, jitter) * distanceToSurface;
          vec3 p = uOrigin + worldRay * t;
          float density = uDensity * exp(-max(0.0, p.y - uBase) / uFalloff);
          float opacity = 1.0 - exp(-density * (farT - nearT) * distanceToSurface);
          float weight = marchTransmission * opacity;
          litWeight += weight * sunVisibility(p);
          totalWeight += weight;
          marchTransmission *= 1.0 - opacity;
        }
        if (totalWeight > 1e-6) litFraction = litWeight / totalWeight;
      }
      vec3 scatteredColor = uHaze * uLight + uSunColor * uShafts * phase * (0.04 + 0.96 * litFraction);
      vec3 inscatter = scatteredColor * (1.0 - transmission);
      gl_FragColor = vec4(inscatter, transmission);
    }
  `,
    {
      uDepth: { value: null },
      uSunShadow: { value: null },
      uProjectionInverse: { value: new THREE.Matrix4() },
      uCameraWorld: { value: new THREE.Matrix4() },
      uShadowMatrix: { value: new THREE.Matrix4() },
      uOrigin: { value: new THREE.Vector3() },
      uHaze: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() },
      uSunDirection: { value: new THREE.Vector3() },
      uClip: { value: new THREE.Vector2() },
      uBase: { value: 0 },
      uFalloff: { value: 1 },
      uRange: { value: 100 },
      uDensity: { value: 0.01 },
      uShafts: { value: 0 },
      uUseShadow: { value: 0 },
      uLight: { value: 0.5 },
      uSteps: { value: 8 },
    },
  );
  private denoise = material(
    `
    varying vec2 vUv;
    uniform sampler2D uDepth, uFog;
    uniform vec2 uClip, uFogSize;
    ${linearDepth}
    void main() {
      float center = viewDepth(uDepth, vUv, uClip);
      vec4 fog = vec4(0.0);
      float total = 0.0;
      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          vec2 offset = vec2(float(x), float(y));
          vec2 uv = vUv + offset / uFogSize;
          float z = viewDepth(uDepth, uv, uClip);
          float difference = abs(z - center) / max(center, 1.0);
          float gaussian = (2.0 - abs(offset.x)) * (2.0 - abs(offset.y));
          float weight = gaussian / (1.0 + 350.0 * difference * difference);
          fog += texture2D(uFog, uv) * weight;
          total += weight;
        }
      }
      gl_FragColor = fog / total;
    }
  `,
    {
      uDepth: { value: null },
      uFog: { value: this.target.texture },
      uClip: { value: new THREE.Vector2() },
      uFogSize: { value: new THREE.Vector2() },
    },
  );
  private composite = material(
    `
    varying vec2 vUv;
    uniform sampler2D uColor, uDepth, uFog;
    uniform vec2 uClip, uFogSize;
    ${linearDepth}
    void main() {
      vec3 color = texture2D(uColor, vUv).rgb;
      float z = viewDepth(uDepth, vUv, uClip);
      vec2 low = vUv * uFogSize - 0.5;
      vec2 cell = floor(low);
      vec2 blend = fract(low);
      vec4 fog = vec4(0.0);
      float total = 0.0;
      for (int i = 0; i < 4; i++) {
        vec2 corner = vec2(float(i - 2 * (i / 2)), float(i / 2));
        vec2 neighbor = (cell + corner + 0.5) / uFogSize;
        float nearDepth = viewDepth(uDepth, neighbor, uClip);
        vec2 bilinear = mix(1.0 - blend, blend, corner);
        float difference = abs(nearDepth - z) / max(z, 1.0);
        float weight = bilinear.x * bilinear.y / (1.0 + 350.0 * difference * difference);
        fog += texture2D(uFog, neighbor) * weight;
        total += weight;
      }
      fog /= max(1e-6, total);
      gl_FragColor = vec4(color * fog.a + fog.rgb, 1.0);
    }
  `,
    {
      uColor: { value: null },
      uDepth: { value: null },
      uFog: { value: this.target.texture },
      uClip: { value: new THREE.Vector2() },
      uFogSize: { value: new THREE.Vector2() },
    },
  );
  private scatterQuad = new FullScreenQuad(this.scatter);
  private denoiseQuad = new FullScreenQuad(this.denoise);
  private compositeQuad = new FullScreenQuad(this.composite);
  private sunPosition = new THREE.Vector3();
  private sunTarget = new THREE.Vector3();
  private width = 1;
  private height = 1;
  private scale = 0.25;
  camera!: THREE.PerspectiveCamera;
  depth!: THREE.DepthTexture;
  constructor(private sun: THREE.DirectionalLight) {
    super();
  }

  configure(settings: CinematicSettings | undefined, quality: string, ambient: number) {
    this.enabled = !!settings && settings.atmosphere > 0.001 && quality !== 'draft';
    if (!this.enabled || !settings) return;
    const u = this.scatter.uniforms;
    u.uHaze.value.set(settings.hazeTint);
    u.uBase.value = settings.hazeBase;
    u.uFalloff.value = settings.hazeHeight;
    u.uRange.value = settings.hazeRange;
    u.uDensity.value = settings.atmosphere * 0.14 * Math.sqrt(45 / settings.hazeRange);
    u.uShafts.value = settings.lightShafts;
    u.uLight.value = 0.52 + ambient * 0.16;
    u.uSteps.value = quality === 'high' ? 16 : 8;
    const scale = quality === 'high' ? 0.5 : 0.25;
    if (this.scale !== scale) {
      this.scale = scale;
      this.setSize(this.width, this.height);
    }
  }
  override setSize(width: number, height: number) {
    this.width = width;
    this.height = height;
    const w = Math.max(1, Math.round(width * this.scale)),
      h = Math.max(1, Math.round(height * this.scale));
    this.target.setSize(w, h);
    this.filtered.setSize(w, h);
    this.denoise.uniforms.uFogSize.value.set(w, h);
    this.composite.uniforms.uFogSize.value.set(w, h);
  }
  override render(
    renderer: THREE.WebGLRenderer,
    write: THREE.WebGLRenderTarget,
    read: THREE.WebGLRenderTarget,
  ) {
    const u = this.scatter.uniforms,
      camera = this.camera,
      sun = this.sun;
    u.uDepth.value = this.depth;
    u.uProjectionInverse.value.copy(camera.projectionMatrixInverse);
    u.uCameraWorld.value.copy(camera.matrixWorld);
    u.uOrigin.value.setFromMatrixPosition(camera.matrixWorld);
    u.uClip.value.set(camera.near, camera.far);
    u.uSunColor.value.copy(sun.color).multiplyScalar(Math.min(2, sun.intensity * 0.55));
    sun.getWorldPosition(this.sunPosition);
    sun.target.getWorldPosition(this.sunTarget);
    u.uSunDirection.value.copy(this.sunPosition).sub(this.sunTarget).normalize();
    u.uUseShadow.value =
      renderer.shadowMap.enabled &&
      sun.shadow.map &&
      sun.castShadow &&
      renderer.shadowMap.type === THREE.PCFShadowMap
        ? 1
        : 0;
    u.uShadowMatrix.value.copy(sun.shadow.matrix);
    u.uSunShadow.value = sun.shadow.map?.texture ?? null;
    renderer.setRenderTarget(this.target);
    this.scatterQuad.render(renderer);
    const c = this.composite.uniforms;
    if (u.uUseShadow.value && u.uShafts.value > 0.03) {
      const filter = this.denoise.uniforms;
      filter.uDepth.value = this.depth;
      filter.uClip.value.copy(u.uClip.value);
      renderer.setRenderTarget(this.filtered);
      this.denoiseQuad.render(renderer);
      c.uFog.value = this.filtered.texture;
    } else {
      c.uFog.value = this.target.texture;
    }
    c.uColor.value = read.texture;
    c.uDepth.value = this.depth;
    c.uClip.value.set(camera.near, camera.far);
    renderer.setRenderTarget(write);
    this.compositeQuad.render(renderer);
  }
  override dispose() {
    this.target.dispose();
    this.filtered.dispose();
    this.scatter.dispose();
    this.denoise.dispose();
    this.composite.dispose();
    this.scatterQuad.dispose();
    this.denoiseQuad.dispose();
    this.compositeQuad.dispose();
  }
}

/** Lens blur is a depth-guarded gather; grading operates in linear HDR before tone mapping. */
export class LensGradePass extends Pass {
  private shader = material(
    `
    varying vec2 vUv;
    uniform sampler2D uColor, uDepth;
    uniform vec2 uResolution, uClip;
    uniform vec3 uShadowTint, uHighlightTint;
    uniform float uFocus, uAperture, uContrast, uSaturation, uRadius;
    uniform int uTaps;
    ${linearDepth}
    void main() {
      vec3 c = texture2D(uColor, vUv).rgb;
      if (uAperture > 0.001) {
        float center = viewDepth(uDepth, vUv, uClip);
        float blur = clamp(abs(1.0 - uFocus / center) * uAperture * uRadius * 2.8, 0.0, uRadius);
        if (blur > 0.55) {
          vec3 sum = c;
          float weights = 1.0;
          for (int i = 0; i < 18; i++) {
            if (i >= uTaps) break;
            float radius = sqrt((float(i) + 0.5) / float(uTaps));
            float angle = float(i) * 2.39996323;
            vec2 uv = clamp(vUv + vec2(cos(angle), sin(angle)) * radius * blur / uResolution, 0.0, 1.0);
            float nearby = viewDepth(uDepth, uv, uClip);
            float gap = abs(nearby - center) / max(center, 0.5);
            // Reject strongly nearer samples so sharp foreground silhouettes do not halo.
            float weight = nearby < center ? (1.0 - smoothstep(0.025, 0.12, gap)) : 1.0;
            sum += texture2D(uColor, uv).rgb * weight;
            weights += weight;
          }
          c = mix(c, sum / weights, smoothstep(0.55, 1.45, blur));
        }
      }
      const vec3 luminosity = vec3(0.2126, 0.7152, 0.0722);
      float luminance = max(0.0, dot(c, luminosity));
      c = max(vec3(0.0), mix(vec3(luminance), c, uSaturation));
      float shadow = 1.0 - smoothstep(0.03, 0.48, luminance);
      float light = smoothstep(0.24, 1.45, luminance);
      c *= mix(vec3(1.0), uShadowTint, shadow * 0.42);
      c *= mix(vec3(1.0), uHighlightTint, light * 0.35);
      c *= exp2((uContrast - 1.0) * clamp(log2(max(0.006, luminance) / 0.18), -3.5, 3.0));
      gl_FragColor = vec4(c, 1.0);
    }
  `,
    {
      uColor: { value: null },
      uDepth: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uClip: { value: new THREE.Vector2() },
      uFocus: { value: 10 },
      uAperture: { value: 0 },
      uContrast: { value: 1 },
      uSaturation: { value: 1 },
      uRadius: { value: 8 },
      uTaps: { value: 10 },
      uShadowTint: { value: new THREE.Color() },
      uHighlightTint: { value: new THREE.Color() },
    },
  );
  private quad = new FullScreenQuad(this.shader);
  private high = false;
  private grade = false;
  private aperture = 0;
  private draft = false;
  camera!: THREE.PerspectiveCamera;
  depth!: THREE.DepthTexture;
  focus = 10;

  configure(settings: CinematicSettings | undefined, quality: string) {
    const u = this.shader.uniforms;
    this.high = quality === 'high';
    this.draft = quality === 'draft';
    this.grade = !!settings;
    this.aperture = settings?.depthOfField ?? 0;
    this.cameraAperture();
    u.uContrast.value = settings?.contrast ?? 1;
    u.uSaturation.value = settings?.saturation ?? 1;
    u.uTaps.value = this.high ? 18 : 10;
    u.uShadowTint.value.set(settings?.shadowTint ?? '#ffffff').lerp(white, 0.24);
    u.uHighlightTint.value.set(settings?.highlightTint ?? '#ffffff').lerp(white, 0.3);
  }
  cameraAperture(override?:number) {
    const aperture = this.draft ? 0 : override ?? this.aperture;
    this.enabled = this.grade || aperture > 0;
    this.shader.uniforms.uAperture.value = aperture;
  }
  override setSize(w: number, h: number) {
    this.shader.uniforms.uResolution.value.set(w, h);
  }
  override render(
    renderer: THREE.WebGLRenderer,
    write: THREE.WebGLRenderTarget,
    read: THREE.WebGLRenderTarget,
  ) {
    const u = this.shader.uniforms;
    u.uColor.value = read.texture;
    u.uDepth.value = this.depth;
    u.uClip.value.set(this.camera.near, this.camera.far);
    u.uFocus.value = this.focus;
    u.uRadius.value = Math.min(
      24,
      Math.max(4, u.uResolution.value.y * (this.high ? 0.021 : 0.013)),
    );
    renderer.setRenderTarget(write);
    this.quad.render(renderer);
  }
  override dispose() {
    this.shader.dispose();
    this.quad.dispose();
  }
}
