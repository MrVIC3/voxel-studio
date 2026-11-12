import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { TexturePass } from 'three/addons/postprocessing/TexturePass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { Lighting } from '../model';
import { AtmospherePass, LensGradePass } from './CinematicPasses';
import type { CinematicSettings } from '../cinematic';
import { CharacterOutline, outlineFragment } from './CharacterOutline';
import type { CameraFXSample } from '../camera-effects';
export class RenderPipeline {
  composer: EffectComposer;
  renderPass: RenderPass;
  ao: GTAOPass;
  bloom: UnrealBloomPass;
  output: OutputPass;
  private beauty: THREE.WebGLRenderTarget;
  private copyBeauty: TexturePass;
  private atmosphere: AtmospherePass;
  private lens: LensGradePass;
  private outline: CharacterOutline;
  private quad: FullScreenQuad;
  private width = 0;
  private height = 0;
  private cinematic?: CinematicSettings;
  private quality = 'balanced';
  constructor(
    private renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    sun = new THREE.DirectionalLight(),
    private focusFor?: (camera: THREE.PerspectiveCamera, subject: string) => number | undefined,
    private frameNumber = () => 0,
    private outlinedActors: () => Iterable<THREE.Object3D> = () => [],
  ) {
    // Keep scene depth in its own target so post effects never read from a framebuffer
    // that is simultaneously being written. Only the beauty target needs MSAA/depth.
    const depth = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    depth.minFilter = depth.magFilter = THREE.NearestFilter;
    this.beauty = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      depthTexture: depth,
      samples: Math.min(2, renderer.capabilities.maxSamples),
    });
    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
    });
    this.composer = new EffectComposer(renderer, target);
    this.composer.renderToScreen = false;
    this.composer.setPixelRatio(1);
    this.renderPass = new RenderPass(scene, camera);
    this.copyBeauty = new TexturePass(this.beauty.texture);
    this.ao = new GTAOPass(scene, camera, 1, 1);
    // Reuse the real alpha-tested, wind-deformed depth instead of rendering opaque cards for AO.
    this.ao.setGBuffer(depth);
    this.outline = new CharacterOutline(depth);
    this.ao.updateGtaoMaterial({
      radius: 0.5,
      distanceExponent: 2,
      thickness: 1,
      distanceFallOff: 0.5,
      scale: 1,
    });
    this.ao.updatePdMaterial({
      radius: 6,
      lumaPhi: 10,
      depthPhi: 2,
      normalPhi: 3,
      samples: 8,
      rings: 2,
    });
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.12, 0.3, 1.1);
    this.atmosphere = new AtmospherePass(sun);
    this.atmosphere.depth = depth;
    this.atmosphere.enabled = false;
    this.lens = new LensGradePass();
    this.lens.depth = depth;
    this.lens.enabled = false;
    this.output = new OutputPass();
    this.composer.addPass(this.copyBeauty);
    this.composer.addPass(this.ao);
    this.composer.addPass(this.atmosphere);
    this.composer.addPass(this.lens);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        ...this.outline.uniforms,
        tDiffuse: { value: null },
        uVignette: { value: 0 },
        uGrain: { value: 0 },
        uSeed: { value: 0 },
        uGlass: { value: new THREE.Vector4() },
        uScreen: { value: new THREE.Vector4() },
        uFlashColor: { value: new THREE.Color() },
        uFadeColor: { value: new THREE.Color() },
      },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
      fragmentShader: `
        ${outlineFragment}
        uniform sampler2D tDiffuse;
        uniform float uVignette, uGrain, uSeed;
        uniform vec4 uGlass, uScreen;
        uniform vec3 uFlashColor, uFadeColor;
        varying vec2 vUv;
        vec3 bright(vec2 uv){
          vec3 c=texture2D(tDiffuse,clamp(uv,0.0,1.0)).rgb;
          return c * smoothstep(.49,.95,max(c.r,max(c.g,c.b)));
        }
        void main(){
          if(uScreen.z > 0.0 && min(vUv.y,1.0-vUv.y)<uScreen.z){gl_FragColor=vec4(0.0,0.0,0.0,1.0);return;}
          vec2 centered=vUv-.5;
          vec2 uv=.5+centered*(1.0+uGlass.x*(dot(centered,centered)-.24)*.68);
          if(uScreen.x>.001){
            float band=floor(vUv.y*41.0), tick=floor(uSeed*.48);
            float jitter=fract(sin(dot(vec2(band,tick),vec2(15.713,39.175)))*19217.41);
            uv.x+=(jitter-.5)*step(.57,jitter)*uScreen.x*.09;
          }
          uv=clamp(uv,0.0,1.0);
          vec4 color=texture2D(tDiffuse,uv);
          if(uGlass.y+uScreen.x>.001){
            vec2 split=centered*uGlass.y*.023+vec2(uScreen.x*.007,0.0);
            color.r=texture2D(tDiffuse,clamp(uv+split,0.0,1.0)).r;
            color.b=texture2D(tDiffuse,clamp(uv-split,0.0,1.0)).b;
          }
          if(uGlass.z>.001){
            vec2 d=vec2(.008,.014);
            color.rgb+=(bright(uv+vec2(d.x,0.0))+bright(uv-vec2(d.x,0.0))+
                        bright(uv+vec2(0.0,d.y))+bright(uv-vec2(0.0,d.y)))*uGlass.z*.085;
          }
          if(uGlass.w>.001){
            vec3 streak=(bright(uv+vec2(.014,0.0))+bright(uv-vec2(.014,0.0)))*.13;
            streak+=(bright(uv+vec2(.043,0.0))+bright(uv-vec2(.043,0.0)))*.074;
            color.rgb+=streak*vec3(.64,.82,1.0)*uGlass.w;
          }
          vec4 stroke=characterStroke(uv);
          color.rgb=mix(color.rgb,stroke.rgb,stroke.a);
          float radius=length((vUv-.5)*vec2(1.12,1.0));
          color.rgb *= 1.0 - smoothstep(.27,.73,radius) * uVignette * .65;
          if(uGrain > .001){
            vec2 p = fract((floor(gl_FragCoord.xy) + vec2(uSeed * 31.0,uSeed * 71.0)) * vec2(.1031,.1030));
            p += dot(p, p.yx + 19.19);
            float noise = fract(p.x*p.y) - .5;
            float value = dot(color.rgb,vec3(.2126,.7152,.0722));
            color.rgb += noise * uGrain * .105 * (.6 + .4 * (1.0 - value));
          }
          color.rgb=mix(color.rgb,uFlashColor,1.0-exp2(-2.4*uScreen.y));
          color.rgb=mix(color.rgb,uFadeColor,uScreen.w);
          gl_FragColor=vec4(clamp(color.rgb,0.0,1.0),color.a);
        }
      `,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.quad = new FullScreenQuad(material);
  }
  configure(settings: Partial<Lighting>, quality: string) {
    if (this.quality !== quality) this.width = 0;
    const samples = Math.min(
      quality === 'draft' ? 0 : quality === 'high' ? 4 : 2,
      this.renderer.capabilities.maxSamples,
    );
    if (this.beauty.samples !== samples) {
      this.beauty.samples = samples;
      this.beauty.dispose();
    }
    this.cinematic = settings.cinematic;
    this.quality = quality;
    this.ao.enabled = quality !== 'draft' && settings.ao !== false;
    this.ao.blendIntensity = settings.aoIntensity ?? 0.8;
    this.bloom.enabled = quality !== 'draft' && settings.bloom === true;
    this.bloom.strength = settings.bloomStrength ?? 0.12;
    this.bloom.threshold = this.cinematic?.bloomThreshold ?? 1.1;
    this.bloom.radius = this.cinematic?.bloomRadius ?? 0.3;
    this.atmosphere.configure(this.cinematic, quality, settings.ambient ?? 0.8);
    this.lens.configure(this.cinematic, quality);
  }
  render(
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number,
    x = 0,
    y = 0,
    fx?: CameraFXSample,
  ) {
    const ratio = this.renderer.getPixelRatio(),
      w = Math.max(1, Math.round(width * ratio)),
      h = Math.max(1, Math.round(height * ratio));
    if (w !== this.width || h !== this.height) {
      this.beauty.setSize(w, h);
      this.composer.setSize(w, h);
      const scale = this.quality === 'high' ? 1 : 0.5;
      this.ao.setSize(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
      this.width = w;
      this.height = h;
    }
    this.renderPass.camera = camera;
    this.ao.camera = camera;
    this.atmosphere.camera = camera;
    this.lens.camera = camera;
    const cameraFocus = fx && (fx.lens.focus !== 'scene' || fx.focusDistance !== undefined);
    const subject = cameraFocus
      ? fx.lens.focus === 'subject'
        ? fx.lens.subject
        : undefined
      : this.cinematic?.focusSubject;
    this.lens.focus =
      fx?.focusDistance ??
      (subject ? this.focusFor?.(camera, subject) : undefined) ??
      (cameraFocus ? fx.lens.distance : this.cinematic?.focusDistance) ??
      10;
    this.lens.cameraAperture(cameraFocus ? fx.lens.aperture : undefined);
    this.renderer.setScissorTest(false);
    this.renderPass.render(this.renderer, this.beauty, this.beauty, 0, false);
    // The beauty pass already updated all shadows. Avoid repeating that GPU work in GTAO.
    const shadowAuto = this.renderer.shadowMap.autoUpdate;
    this.renderer.shadowMap.autoUpdate = false;
    try {
      this.outline.render(this.renderer, camera, this.outlinedActors(), w, h);
      this.composer.render();
    } finally {
      this.renderer.shadowMap.autoUpdate = shadowAuto;
    }
    this.renderer.setRenderTarget(null);
    this.renderer.setViewport(x, y, width, height);
    this.renderer.setScissor(x, y, width, height);
    this.renderer.setScissorTest(true);
    const film = (this.quad.material as THREE.ShaderMaterial).uniforms;
    film.tDiffuse.value = this.composer.readBuffer.texture;
    film.uSeed.value = this.frameNumber() % 4096;
    film.uVignette.value = Math.max(this.cinematic?.vignette ?? 0, fx?.lens.vignette ?? 0);
    film.uGrain.value = Math.max(this.cinematic?.grain ?? 0, fx?.lens.grain ?? 0);
    film.uGlass.value.set(
      fx?.lens.distortion ?? 0,
      fx?.lens.fringe ?? 0,
      fx?.lens.diffusion ?? 0,
      fx?.lens.streak ?? 0,
    );
    film.uScreen.value.set(fx?.glitch ?? 0, fx?.flash ?? 0, fx?.lens.matte ?? 0, fx?.fade ?? 0);
    if (fx?.flash) film.uFlashColor.value.set(fx.flashColor).convertLinearToSRGB();
    if (fx?.fade) film.uFadeColor.value.set(fx.fadeColor).convertLinearToSRGB();
    this.quad.render(this.renderer);
    this.renderer.setScissorTest(false);
  }
  dispose() {
    this.outline.dispose();
    this.ao.dispose();
    this.bloom.dispose();
    this.atmosphere.dispose();
    this.lens.dispose();
    this.copyBeauty.dispose();
    this.beauty.dispose();
    this.output.dispose();
    this.composer.dispose();
    this.quad.material.dispose();
    this.quad.dispose();
  }
}
