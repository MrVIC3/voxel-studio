import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { characterMesh, disposeObject } from './assets';
import { MinecraftLibrary } from './minecraft';
import type { MinecraftAssets } from './minecraft';
import { minecraftMesh } from './minecraft-mesh';
import { RenderPipeline } from './RenderPipeline';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { cameraAtFrame, shotAtFrame } from '../sequence';
import { setSurfaceEffect } from './surface-effect';
import { setCharacterLook, updateCharacterLightDirection } from './character-look';
import { cameraLens, sampleCameraRail } from '../camera-rail';
import { CameraFlight } from './CameraFlight';
import { evaluateFace } from '../face';
import type { FacePose } from '../face';
import { setCharacterFace } from './face-rig';
import { itemMesh } from './item-mesh';
import { effectDefaults, effectMesh } from './effects';
import { solveTwoBone } from './ik';
import type { CinematicContext } from '../cinematic';
import { sampleCameraEffects } from '../camera-effects';
import type { CameraFXSample } from '../camera-effects';
import { bones, evaluate, identity, trackId } from '../model';
import type { Lighting, Project, SceneObject, Selection, Transform, Vec3 } from '../model';
export type Quality = 'draft' | 'balanced' | 'high';
type Callbacks = {
  select: (s: Selection) => void;
  transform: (s: NonNullable<Selection>, t: Transform, done: boolean) => void;
  stats: (s: { calls: number; triangles: number; fps: number }) => void;
  error: (message: string) => void;
};
type Entry = {
  root: THREE.Group;
  spec: SceneObject;
  voxels: SceneObject['voxels'];
  skin?: string;
  slim?: boolean;
  block?: string;
  textures: Project['textures'];
  lightType?: SceneObject['lightType'];
  item?: string;
  effect?: SceneObject['effect'];
};
export type ViewportTool =
  | { type: 'route'; height: number; point: (point: Vec3) => void }
  | { type: 'blocks'; id: string; mode: 'place' | 'remove' | 'replace'; point: (cell: Vec3) => void };
export class StudioEngine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  overlays = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.05, 2000);
  outputCamera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 2000);
  orbit: OrbitControls;
  private flight: CameraFlight;
  private flying = false;
  private cameraGuide = new THREE.Group();
  private routeGuide = new THREE.Group();
  private viewportTool?: ViewportTool;
  private activeLighting?: Lighting;
  private previewCameraId?:string;
  private outputEffects?:CameraFXSample;
  private cameraOffset = new THREE.Vector3();
  private cameraRotationOffset = new THREE.Quaternion();
  private cameraShakeEuler = new THREE.Euler(0,0,0,'YXZ');
  private viewportSuspended = false;
  private showCameraGuide = true;
  gizmo: TransformControls;
  sun = new THREE.DirectionalLight('#ffdfac', 2.8);
  sky = new THREE.HemisphereLight('#e6ecff', '#66615b', 0.8);
  floor: THREE.Mesh;
  grid = new THREE.GridHelper(100, 100, '#555555', '#444444');
  outline = new THREE.BoxHelper(new THREE.Object3D(), '#dddddd');
  library = new MinecraftLibrary({
    version: 'none',
    source: 'No game assets',
    textures: {},
    models: {},
    blockstates: {},
  });
  pipeline: RenderPipeline;
  private environmentTarget: THREE.WebGLRenderTarget;
  private sceneRadius = 20;
  entries = new Map<string, Entry>();
  project: Project | null = null;
  selection: Selection = null;
  frame = 0;
  preview = false;
  dirty = true;
  quality: Quality = 'balanced';
  helpers = true;
  shading: 'rendered' | 'solid' | 'wireframe' = 'rendered';
  exporting = false;
  private raf = 0;
  private observer: ResizeObserver;
  private dead = false;
  private down = { x: 0, y: 0 };
  private lastStats = performance.now();
  private rendered = 0;
  private lastRender = performance.now();
  private onPointerDown: (e: PointerEvent) => void;
  private onPointerUp: (e: PointerEvent) => void;
  constructor(
    private container: HTMLElement,
    private callbacks: Callbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.info.autoReset = false;
    RectAreaLightUniformsLib.init();
    const pmrem = new THREE.PMREMGenerator(this.renderer),
      room = new RoomEnvironment();
    this.environmentTarget = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.environmentTarget.texture;
    room.dispose();
    pmrem.dispose();
    this.pipeline = new RenderPipeline(
      this.renderer, this.scene, this.camera, this.sun,
      (camera, subject) => this.cinematicFocus(camera, subject),
      () => this.frame,
      () => this.outlinedActors(),
    );
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', '3D scene viewport');
    this.renderer.domElement.tabIndex = 0;
    this.camera.position.set(16, 11, 19);
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.flight = new CameraFlight(this.renderer.domElement, this.camera, this.invalidate);
    this.overlays.add(this.cameraGuide);
    this.overlays.add(this.routeGuide);
    this.orbit.target.set(0, 1, 0);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.12;
    this.orbit.minDistance = 0.3;
    this.orbit.maxDistance = 800;
    this.orbit.maxPolarAngle = Math.PI * 0.98;
    this.orbit.addEventListener('change', () => this.invalidate());
    this.gizmo = new TransformControls(this.camera, this.renderer.domElement);
    this.gizmo.setSize(0.75);
    this.gizmo.setColors('#eeeeee', '#999999', '#666666', '#ffffff');
    this.overlays.add(this.gizmo.getHelper());
    this.gizmo.addEventListener('dragging-changed', (event) => {
      this.orbit.enabled = !event.value && !this.preview && !this.flying;
    });
    this.gizmo.addEventListener('objectChange', () => {
      if (this.selection) {
        this.entries.get(this.selection.id)?.root.userData.updateJoints?.();
        this.callbacks.transform(this.selection, this.readTransform(), false);
        this.invalidate();
      }
    });
    this.gizmo.addEventListener('mouseUp', () => {
      if (this.selection) this.callbacks.transform(this.selection, this.readTransform(), true);
    });
    this.scene.add(this.sun, this.sun.target, this.sky);
    this.sun.castShadow = true;
    this.sun.shadow.radius = 2;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.camera.near = 0.1;
    this.sun.shadow.camera.far = 300;
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.MeshStandardMaterial({ color: '#303030', roughness: 1 }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -3.55;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor, this.grid);
    this.overlays.add(this.outline);
    this.grid.position.y = -3.53;
    const gridMaterial = this.grid.material as THREE.LineBasicMaterial;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.17;
    this.outline.visible = false;
    this.outline.material.depthTest = false;
    this.onPointerDown = (e) => {
      this.down = { x: e.clientX, y: e.clientY };
    };
    this.onPointerUp = (e) => {
      if (
        e.button !== 0 ||
        this.gizmo.dragging ||
        (this.gizmo.enabled && this.gizmo.axis) ||
        Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 4
      )
        return;
      this.pick(e);
    };
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp);
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.callbacks.error(
        'The graphics context was lost. Save your project and restart the editor.',
      );
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.setQuality('balanced');
    this.resize();
    const loop = () => {
      if (this.dead) return;
      this.raf = requestAnimationFrame(loop);
      if (this.exporting || this.viewportSuspended || document.hidden) return;
      if(this.flying)this.flight.update(performance.now());
      else if(!this.preview)this.orbit.update();
      if (this.dirty) {
        this.draw();
        this.dirty = false;
        this.rendered++;
        this.lastRender = performance.now();
      }
      const now = performance.now();
      if (now - this.lastStats > 1000) {
        this.callbacks.stats({
          calls: this.renderer.info.render.calls,
          triangles: this.renderer.info.render.triangles,
          fps:
            now - this.lastRender > 250
              ? 0
              : Math.round((this.rendered * 1000) / (now - this.lastStats)),
        });
        this.lastStats = now;
        this.rendered = 0;
      }
    };
    loop();
  }
  private *outlinedActors() {
    for (const entry of this.entries.values())
      if (entry.spec.characterLook?.outline && entry.spec.characterLook.enabled !== false) yield entry.root;
  }
  invalidate = () => {
    this.dirty = true;
  };
  setAssets(assets: MinecraftAssets) {
    this.gizmo.detach();
    for (const entry of this.entries.values()) this.scene.add(entry.root);
    for (const entry of this.entries.values()) {
      this.scene.remove(entry.root);
      disposeObject(entry.root);
    }
    this.entries.clear();
    this.library = new MinecraftLibrary(assets);
    if (this.project) this.setProject(this.project);
    this.invalidate();
  }
  resize() {
    if (this.exporting) return;
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }
  setQuality(quality: Quality) {
    this.quality = quality;
    const ratio =
      quality === 'draft'
        ? 1
        : quality === 'balanced'
          ? Math.min(devicePixelRatio, 1.5)
          : Math.min(devicePixelRatio, 2);
    this.renderer.setPixelRatio(ratio);
    this.activeLighting = undefined;
    this.syncShotLighting();
    const size = quality === 'draft' ? 512 : quality === 'balanced' ? 1024 : 2048;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.invalidate();
  }
  setMode(mode: 'translate' | 'rotate' | 'scale') {
    this.gizmo.setMode(mode);
    this.invalidate();
  }
  setSpace(local: boolean) {
    this.gizmo.setSpace(local ? 'local' : 'world');
    this.invalidate();
  }
  setSnap(enabled: boolean) {
    this.gizmo.setTranslationSnap(enabled ? 0.25 : (null as any));
    this.gizmo.setRotationSnap(enabled ? Math.PI / 12 : (null as any));
    this.gizmo.setScaleSnap(enabled ? 0.1 : (null as any));
    this.invalidate();
  }
  setShading(shading: typeof this.shading) {
    this.shading = shading;
    this.applyShading();
    this.invalidate();
  }
  private applyShading() {
    for (const e of this.entries.values())
      e.root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            if (m instanceof THREE.MeshStandardMaterial) {
              m.wireframe = this.shading === 'wireframe';
              m.userData.studioEmission ??= m.emissive.getHex();
              m.emissive.setHex(this.shading === 'solid' ? 0x555555 : m.userData.studioEmission);
            }
          }
        }
      });
  }
  setHelpers(value: boolean) {
    this.helpers = value;
    this.updateHelpers();
    this.invalidate();
  }
  setPreview(value: boolean) {
    this.preview = value;
    if(!value)this.previewCameraId=undefined;
    if(value && this.flying)this.setFlight(false);
    this.orbit.enabled = !value && !this.flying;
    this.gizmo.enabled = !value && !this.flying && !this.viewportTool;
    this.syncShotLighting();
    this.updateOutputCamera();
    this.updateHelpers();
    this.invalidate();
  }
  setPreviewCamera(id?:string){
    this.previewCameraId=id;
    this.syncShotLighting();
    this.updateOutputCamera();
    this.invalidate();
  }
  setViewportSuspended(value: boolean) {
    this.viewportSuspended = value;
    if (!value) this.invalidate();
  }
  setFlight(value:boolean){
    if(!value && this.flying){
      const distance=Math.max(2,this.camera.position.distanceTo(this.orbit.target));
      this.orbit.target.copy(this.camera.position).addScaledVector(this.camera.getWorldDirection(new THREE.Vector3()),distance);
    }
    this.flying=value && !this.preview;this.flight.setActive(this.flying);
    this.orbit.enabled=!this.flying&&!this.preview;this.gizmo.enabled=!this.flying&&!this.preview&&!this.viewportTool;
    this.updateHelpers();this.invalidate();
  }
  private updateHelpers() {
    this.grid.visible = this.helpers && !this.preview && !this.exporting;
    this.gizmo.getHelper().visible =
      this.helpers && !this.preview && !this.exporting && !this.flying && !this.viewportTool && !!this.selection;
    this.outline.visible = this.helpers && !this.preview && !this.exporting && !!this.selection;
    this.cameraGuide.visible=this.showCameraGuide&&this.helpers&&!this.preview&&!this.exporting;
    for (const e of this.entries.values()) {
      if (e.spec.type === 'light' || e.spec.type === 'camera' || e.spec.type === 'control')
        e.root.traverse((o) => {
          if (o.userData.helper) o.visible = this.helpers && !this.preview && !this.exporting;
        });
    }
  }
  setProject(project: Project) {
    this.project = project;
    for (const entry of this.entries.values())
      if (entry.root.parent !== this.scene) this.scene.add(entry.root);
    for (const [id, entry] of this.entries)
      if (!project.objects.some((o) => o.id === id)) {
        this.scene.remove(entry.root);
        disposeObject(entry.root);
        this.entries.delete(id);
      }
    for (const spec of project.objects) {
      let e = this.entries.get(spec.id);
      if (
        e &&
        (e.voxels !== spec.voxels ||
          e.skin !== spec.skin ||
          e.slim !== spec.slim ||
          e.block !== spec.block ||
          e.lightType !== spec.lightType ||
          e.item !== spec.item ||
          e.spec.armor !== spec.armor ||
          e.spec.characterLayers !== spec.characterLayers ||
          e.effect !== spec.effect ||
          e.textures !== project.textures)
      ) {
        this.scene.remove(e.root);
        disposeObject(e.root);
        this.entries.delete(spec.id);
        e = undefined;
      }
      if (!e) {
        const root = this.createObject(spec, project);
        root.userData.id = spec.id;
        root.traverse((child) => {
          child.userData.objectId = spec.id;
        });
        if (spec.surfaceEffect) setSurfaceEffect(root, spec.surfaceEffect);
        e = {
          root,
          spec,
          voxels: spec.voxels,
          skin: spec.skin,
          slim: spec.slim,
          block: spec.block,
          textures: project.textures,
          lightType: spec.lightType,
          item: spec.item,
          effect: spec.effect,
        };
        this.entries.set(spec.id, e);
        this.scene.add(root);
      }
      if (e.spec.surfaceEffect !== spec.surfaceEffect || (spec.surfaceEffect && e.spec.face !== spec.face))
        setSurfaceEffect(e.root, spec.surfaceEffect);
      e.spec = spec;
      e.root.visible = spec.visible;
      e.root.userData.wind?.(project.wind);
      if (spec.type === 'light') {
        const light = e.root.getObjectByName('point') as
          THREE.PointLight | THREE.RectAreaLight | THREE.SpotLight;
        light.color.set(spec.color || '#ffd8a3');
        light.intensity = spec.intensity ?? 15;
        if (light instanceof THREE.RectAreaLight) {
          light.width = spec.width ?? 4;
          light.height = spec.height ?? 4;
          const helper = e.root.children.find((child) => child.userData.helper) as
            THREE.Mesh | undefined;
          if (helper) {
            const plane = helper.geometry as THREE.PlaneGeometry;
            helper.scale.set(
              light.width / plane.parameters.width,
              light.height / plane.parameters.height,
              1,
            );
          }
        }
        if (light instanceof THREE.SpotLight) {
          light.angle = ((spec.angle ?? 45) * Math.PI) / 180;
          light.castShadow = spec.lightShadows === true;
        }
        if (light instanceof THREE.PointLight) light.castShadow = spec.lightShadows === true;
      }
    }
    this.activeLighting = undefined;
    this.attachHierarchy();
    this.applyShading();
    this.setFrame(this.frame);
    for(const entry of this.entries.values())
      if(entry.spec.type==='character')setCharacterLook(entry.root,entry.spec.characterLook);
    this.select(this.selection);
    this.updateHelpers();
    this.invalidate();
  }
  cinematicContext(selectionId?: string): CinematicContext {
    const eligible = (e: Entry) =>
      e.spec.visible && ['character', 'item', 'build', 'block'].includes(e.spec.type);
    const selected = selectionId ? this.entries.get(selectionId) : undefined;
    const subject =
      selected && eligible(selected)
        ? selected
        : [...this.entries.values()].find((e) => eligible(e) && e.spec.type === 'character');
    const sceneBounds = new THREE.Box3();
    for (const e of this.entries.values()) if (eligible(e)) sceneBounds.expandByObject(e.root);
    const box = subject ? new THREE.Box3().setFromObject(subject.root) : sceneBounds;
    const center = box.isEmpty() ? this.orbit.target.clone() : box.getCenter(new THREE.Vector3());
    const radius = box.isEmpty() ? 2 : Math.max(1, box.getSize(new THREE.Vector3()).length() * 0.5);
    const camera =
      this.preview || (this.project && cameraAtFrame(this.project, this.frame))
        ? this.outputCamera
        : this.camera;
    const towardCamera = camera.getWorldPosition(new THREE.Vector3()).sub(center);
    const focusSubject =
      subject && ['character', 'item', 'block'].includes(subject.spec.type)
        ? subject.spec.id
        : undefined;
    return {
      center: center.toArray() as Vec3,
      radius,
      sceneRadius: sceneBounds.getSize(new THREE.Vector3()).length() * 0.5,
      floor: box.isEmpty() ? 0 : box.min.y,
      towardCamera: towardCamera.toArray() as Vec3,
      focusDistance:
        (focusSubject && this.cinematicFocus(camera, focusSubject)) || towardCamera.length(),
      focusSubject,
    };
  }

  private cinematicFocus(camera: THREE.PerspectiveCamera, subject: string) {
    const entry = this.entries.get(subject);
    if (!entry || !entry.spec.visible) return undefined;
    const head = entry.spec.type === 'character' ? entry.root.getObjectByName('head') : undefined;
    const point = head
      ? head.localToWorld(new THREE.Vector3(0, 0.25, 0))
      : entry.root.getWorldPosition(new THREE.Vector3());
    const distance = -camera.worldToLocal(point).z;
    return distance > camera.near ? Math.min(camera.far, distance) : undefined;
  }

  previewLighting(patch: Partial<Lighting>) {
    if (!this.project) return;
    this.activeLighting = undefined;
    this.applyLighting({ ...this.project.lighting, ...patch });
  }
  private syncShotLighting() {
    if (!this.project) return;
    const shot = this.preview || this.exporting ? shotAtFrame(this.project, this.frame) : undefined;
    const solo = this.preview && !this.exporting ? this.previewCameraId : undefined;
    const lighting = ((!solo || shot?.cameraId===solo) && shot?.lighting) || this.project.lighting;
    if (lighting !== this.activeLighting) {
      this.activeLighting = lighting;
      this.applyLighting(lighting);
    }
  }
  private applyLighting(l: Lighting) {
    this.scene.background = new THREE.Color(l.sky);
    const draftAtmosphere = this.quality === 'draft' ? (l.cinematic?.atmosphere ?? 0) * 0.021 : 0;
    this.scene.fog =
      l.fog > 0 || draftAtmosphere > 0
        ? new THREE.FogExp2(l.cinematic?.hazeTint ?? l.sky, l.fog * 0.04 + draftAtmosphere)
        : null;
    const az = THREE.MathUtils.degToRad(l.azimuth),
      el = THREE.MathUtils.degToRad(l.elevation);
    const distance = Math.max(60, this.sceneRadius * 3);
    this.sun.position
      .copy(this.sun.target.position)
      .add(
        new THREE.Vector3(
          Math.cos(az) * Math.cos(el),
          Math.sin(el),
          Math.sin(az) * Math.cos(el),
        ).multiplyScalar(distance),
      );
    this.sun.shadow.camera.far = distance + this.sceneRadius * 3;
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.intensity = l.sun;
    this.sun.color.set(l.warmth);
    this.sky.intensity = l.ambient;
    this.sky.color.set(l.cinematic?.skyFill ?? '#e6ecff');
    this.sky.groundColor.set(l.cinematic?.groundFill ?? '#66615b');
    this.scene.environmentIntensity = l.environment ?? 0.25;
    this.sun.shadow.radius = l.softness ?? 2.5;
    this.renderer.toneMapping =
      l.toneMapping === 'aces'
        ? THREE.ACESFilmicToneMapping
        : l.toneMapping === 'neutral'
          ? THREE.NeutralToneMapping
          : THREE.AgXToneMapping;
    this.pipeline.configure(l, this.quality);
    this.renderer.toneMappingExposure = l.exposure;
    this.renderer.shadowMap.enabled = l.shadows;
    this.floor.visible = l.ground;
    this.invalidate();
  }
  private createObject(spec: SceneObject, project: Project): THREE.Group {
    if (spec.type === 'effect') return effectMesh(spec.effect || effectDefaults);
    if (spec.type === 'control') {
      const root = new THREE.Group(),
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.13, 8, 4),
          new THREE.MeshBasicMaterial({ color: '#eeeeee', wireframe: true, depthTest: false }),
        );
      mesh.userData.helper = true;
      root.add(mesh);
      return root;
    }
    if (spec.type === 'item')
      return itemMesh(
        this.library.assets.textures[spec.item || 'minecraft:item/diamond_sword'],
        () => {
          this.refreshSurface(spec.id);
          this.invalidate();
        },
      );
    if (spec.type === 'character')
      return characterMesh(
        spec,
        () => {
          this.refreshSurface(spec.id);
          this.attachHierarchy();
          this.setFrame(this.frame);
          const entry=this.entries.get(spec.id);
          if(entry)setCharacterLook(entry.root,entry.spec.characterLook);
          this.select(this.selection);
          this.invalidate();
        },
        this.library.assets.textures[`minecraft:entity/player/${spec.slim ? 'slim' : 'wide'}/alex`],
        (material, leggings) => {
          const name = material;
          return this.library.assets.textures[`minecraft:entity/equipment/${leggings ? 'humanoid_leggings' : 'humanoid'}/${name}`]
            || this.library.assets.textures[`minecraft:models/armor/${name}_layer_${leggings ? 2 : 1}`];
        },
      );
    if (spec.type === 'build' && spec.voxels)
      return minecraftMesh(spec.voxels, this.library, project.textures, this.invalidate);
    if (spec.type === 'block')
      return minecraftMesh(
        { palette: [spec.block || 'minecraft:stone'], blocks: [[0, 0, 0, 0]] },
        this.library,
        project.textures,
        this.invalidate,
      );
    const root = new THREE.Group();
    if (spec.type === 'light') {
      let light: THREE.PointLight | THREE.RectAreaLight | THREE.SpotLight;
      if (spec.lightType === 'area')
        light = new THREE.RectAreaLight(
          spec.color || '#ffffff',
          spec.intensity ?? 15,
          spec.width ?? 4,
          spec.height ?? 4,
        );
      else if (spec.lightType === 'spot') {
        light = new THREE.SpotLight(
          spec.color || '#ffffff',
          spec.intensity ?? 50,
          100,
          ((spec.angle ?? 45) * Math.PI) / 180,
          0.35,
          2,
        );
        light.target.position.set(0, 0, -1);
        root.add(light.target);
        light.castShadow = spec.lightShadows === true;
        light.shadow.mapSize.set(1024, 1024);
        light.shadow.bias = -0.0001;
        light.shadow.normalBias = 0.025;
      } else {
        light = new THREE.PointLight(spec.color || '#ffffff', spec.intensity ?? 15, 100, 2);
        light.castShadow = spec.lightShadows === true;
        light.shadow.mapSize.set(512, 512);
        light.shadow.bias = -0.0001;
        light.shadow.normalBias = 0.025;
        light.shadow.radius = 2;
      }
      light.name = 'point';
      root.add(light);
      const m = new THREE.Mesh(
        spec.lightType === 'area'
          ? new THREE.PlaneGeometry(spec.width ?? 4, spec.height ?? 4)
          : new THREE.OctahedronGeometry(0.12),
        new THREE.MeshBasicMaterial({ color: '#bbbbbb', wireframe: true }),
      );
      m.userData.helper = true;
      root.add(m);
    }
    if (spec.type === 'camera') {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.24, 0.2),
        new THREE.MeshBasicMaterial({ color: '#bcbcbc', wireframe: true }),
      );
      root.add(mesh);
      mesh.userData.helper = true;
      const cone = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.ConeGeometry(0.3, 0.5, 4)),
        new THREE.LineBasicMaterial({ color: '#bcbcbc' }),
      );
      cone.rotation.x = -Math.PI / 2;
      cone.rotation.z = Math.PI / 4;
      cone.position.z = -0.3;
      root.add(cone);
      cone.userData.helper = true;
    }
    return root;
  }
  setFrame(frame: number) {
    this.frame = frame;
    if (!this.project) return;
    this.syncShotLighting();
    for (const [id, e] of this.entries) {
      e.root.userData.animate?.(frame / this.project.fps, frame);
      const track=this.project.tracks[id];
      const rail=e.spec.type==='camera'&&e.spec.cameraRail?sampleCameraRail(track||[],frame,e.spec.fov||40,e.spec.cameraRail):undefined;
      this.applyTransform(e.root, rail||evaluate(track, frame, e.spec.transform));
      if (e.spec.type === 'character') {
        for (const bone of bones) {
          const node = e.root.getObjectByName(bone);
          if (node) {
            const t = evaluate(
              this.project.tracks[`${id}/${bone}`],
              frame,
              e.spec.pose?.[bone] || identity(),
            );
            this.applyTransform(node, t, node.userData.rest);
          }
        }
        setCharacterFace(e.root,e.spec.face,evaluateFace(e.spec.face,this.project.faceTracks?.[id],frame,this.project.fps,id));
      }
    }
    this.applyIK();
    for (const entry of this.entries.values()) {
      entry.root.userData.updateJoints?.();
      if(entry.spec.characterLook)updateCharacterLightDirection(entry.root);
    }
    this.updateOutputCamera();
    this.updateOutline();
    this.invalidate();
  }
  previewFace(id:string,pose:FacePose){const entry=this.entries.get(id);if(entry){setCharacterFace(entry.root,entry.spec.face,pose);this.invalidate();}}
  private refreshSurface(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    const identify = (node: THREE.Object3D) => {
      if (node !== entry.root && node.userData.id) return;
      node.userData.objectId = id;
      node.children.forEach(identify);
    };
    identify(entry.root);
    setSurfaceEffect(entry.root, entry.spec.surfaceEffect);
  }
  private attachHierarchy() {
    for (const entry of this.entries.values()) {
      const parent = entry.spec.parentId ? this.entries.get(entry.spec.parentId)?.root : undefined;
      const target =
        parent && entry.spec.parentBone ? parent.getObjectByName(entry.spec.parentBone) : parent;
      if (target && entry.root.parent !== target) target.add(entry.root);
      else if (!target && entry.root.parent !== this.scene) this.scene.add(entry.root);
    }
  }
  private applyIK() {
    if (
      ![...this.entries.values()].some((entry) =>
        Object.values(entry.spec.ik || {}).some((constraint) => constraint.enabled),
      )
    )
      return;
    this.scene.updateMatrixWorld(true);
    for (const entry of this.entries.values())
      for (const [limb, constraint] of Object.entries(entry.spec.ik || {})) {
        if (!constraint.enabled) continue;
        const upper = entry.root.getObjectByName(limb),
          lower = entry.root.getObjectByName(limb.replace('Arm', 'Forearm').replace('Leg', 'Shin')),
          target = this.entries.get(constraint.targetId)?.root;
        if (!upper || !lower || !target || !upper.parent) continue;
        const targetPoint = upper.parent.worldToLocal(target.getWorldPosition(new THREE.Vector3())),
          pole = upper.parent.worldToLocal(
            entry.root.localToWorld(new THREE.Vector3(...constraint.pole)),
          );
        const result = solveTwoBone(upper.position, targetPoint, pole, 0.375, 0.375),
          down = new THREE.Vector3(0, -1, 0);
        upper.quaternion.setFromUnitVectors(
          down,
          result.elbow.clone().sub(upper.position).normalize(),
        );
        lower.quaternion.setFromUnitVectors(
          down,
          result.end
            .clone()
            .sub(result.elbow)
            .applyQuaternion(upper.quaternion.clone().invert())
            .normalize(),
        );
        upper.updateMatrixWorld(true);
      }
  }
  boneTargetPosition(id: string, bone: string): Vec3 {
    const root = this.entries.get(id)?.root,
      node = root?.getObjectByName(bone);
    if (!root || !node) return [0, 1, 0];
    root.updateWorldMatrix(true, true);
    return root.worldToLocal(node.getWorldPosition(new THREE.Vector3())).toArray() as Vec3;
  }
  attachmentTransform(id: string, parentId?: string, bone?: string): Transform {
    const object = this.entries.get(id)?.root;
    if (!object) return identity();
    object.updateWorldMatrix(true, false);
    const parent = parentId ? this.entries.get(parentId)?.root : undefined,
      target = bone && parent ? parent.getObjectByName(bone) : parent;
    target?.updateWorldMatrix(true, false);
    const matrix = target
      ? new THREE.Matrix4().copy(target.matrixWorld).invert().multiply(object.matrixWorld)
      : object.matrixWorld;
    const position = new THREE.Vector3(),
      quaternion = new THREE.Quaternion(),
      scale = new THREE.Vector3();
    matrix.decompose(position, quaternion, scale);
    const rotation = new THREE.Euler().setFromQuaternion(quaternion);
    return {
      position: position.toArray() as Vec3,
      rotation: [rotation.x, rotation.y, rotation.z],
      scale: scale.toArray() as Vec3,
    };
  }
  private applyTransform(o: THREE.Object3D, t: Transform, rest?: THREE.Vector3) {
    o.position.fromArray(t.position);
    if (rest) o.position.add(rest);
    o.rotation.set(...t.rotation);
    o.scale.fromArray(t.scale);
  }
  private readTransform(): Transform {
    const node = this.gizmo.object!;
    const p = node.position.clone();
    if (this.selection?.bone && node.userData.rest) p.sub(node.userData.rest);
    return {
      position: p.toArray() as Vec3,
      rotation: [node.rotation.x, node.rotation.y, node.rotation.z],
      scale: node.scale.toArray() as Vec3,
    };
  }
  private updateOutputCamera(id?:string) {
    const solo = this.preview && !this.exporting ? this.previewCameraId : undefined;
    const cameraId = id || solo || (this.project ? cameraAtFrame(this.project, this.frame) : undefined);
    const e = cameraId ? this.entries.get(cameraId) : undefined;
    this.outputEffects=undefined;
    if (e) {
      e.root.updateWorldMatrix(true, false);
      e.root.getWorldPosition(this.outputCamera.position);
      e.root.getWorldQuaternion(this.outputCamera.quaternion);
      const keys=this.project?.tracks[e.spec.id]||[];
      this.outputCamera.fov = Math.max(10,Math.min(120,e.spec.cameraRail?sampleCameraRail(keys,this.frame,e.spec.fov||40,e.spec.cameraRail)?.fov??e.spec.fov??40:cameraLens(keys,this.frame,e.spec.fov||40)));
      if (e.spec.cameraTarget) {
        const target = this.entries.get(e.spec.cameraTarget)?.root,
          node = e.spec.targetBone ? target?.getObjectByName(e.spec.targetBone) : target;
        if (node) {
          node.updateWorldMatrix(true, false);
          this.outputCamera.lookAt(node.getWorldPosition(new THREE.Vector3()));
        }
      }
      if(!id && this.project){
        const shot=shotAtFrame(this.project,this.frame);
        const config=(!solo && shot?.cameraId===cameraId ? shot.cameraEffects : undefined) ?? e.spec.cameraEffects;
        if(config){
          const fx=sampleCameraEffects(config,this.frame,this.project.fps);
          this.outputEffects=fx;
          this.outputCamera.position.add(this.cameraOffset.set(fx.x,fx.y,fx.z).applyQuaternion(this.outputCamera.quaternion));
          this.outputCamera.quaternion.multiply(this.cameraRotationOffset.setFromEuler(this.cameraShakeEuler.set(fx.pitch,fx.yaw,fx.roll)));
          if(fx.zoom!==1){
            const half=Math.tan(THREE.MathUtils.degToRad(this.outputCamera.fov)*.5);
            this.outputCamera.fov=Math.max(5,THREE.MathUtils.radToDeg(2*Math.atan(half/fx.zoom)));
          }
        }
      }
      this.outputCamera.updateProjectionMatrix();
    } else {
      this.outputCamera.position.copy(this.camera.position);
      this.outputCamera.quaternion.copy(this.camera.quaternion);
      this.outputCamera.fov = this.camera.fov;
      this.outputCamera.updateProjectionMatrix();
    }
  }
  select(selection: Selection) {
    this.selection = selection;
    const root = selection ? this.entries.get(selection.id)?.root : undefined;
    const object = selection?.bone ? root?.getObjectByName(selection.bone) : root;
    if (object && !this.entries.get(selection!.id)?.spec.locked) this.gizmo.attach(object);
    else this.gizmo.detach();
    this.updateOutline();
    this.updateHelpers();
    this.updateCameraGuide();
    this.invalidate();
  }
  private updateOutline() {
    if (!this.selection) return;
    const root = this.entries.get(this.selection.id)?.root;
    if (root) {
      const object = this.selection.bone ? root.getObjectByName(this.selection.bone) : root;
      if (object) {
        object.updateWorldMatrix(true, true);
        this.outline.setFromObject(object);
      }
    }
  }
  private pick(event: PointerEvent) {
    if (this.preview || (this.flying && !this.viewportTool)) return;
    const rect = this.renderer.domElement.getBoundingClientRect(),
      mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, this.camera);
    if (this.viewportTool) {
      this.pickTool(ray, this.viewportTool);
      return;
    }
    const hit = ray.intersectObjects(
      [...this.entries.values()].filter((e) => e.spec.visible).map((e) => e.root),
      true,
    ).find(hit=>{
      for(let node:THREE.Object3D|null=hit.object;node;node=node.parent)if(!node.visible)return false;
      return true;
    });
    if (hit) {
      const id = hit.object.userData.objectId;
      const bone = hit.object.userData.bone;
      this.callbacks.select({ id, ...(this.selection?.id === id && bone ? { bone } : {}) });
    } else this.callbacks.select(null);
  }
  setViewportTool(tool?: ViewportTool) {
    this.viewportTool = tool;
    this.gizmo.enabled = !tool && !this.flying && !this.preview;
    this.renderer.domElement.style.cursor = tool ? 'crosshair' : '';
    this.updateHelpers();
    this.invalidate();
  }
  setRouteGuide(points: Vec3[]) {
    for (const child of [...this.routeGuide.children]) {
      disposeObject(child);
      child.removeFromParent();
    }
    if (points.length) {
      const vertices = points.map(point => new THREE.Vector3(...point).add(new THREE.Vector3(0, .035, 0)));
      this.routeGuide.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(vertices), new THREE.LineBasicMaterial({ color: '#ffffff', depthTest: false })));
      this.routeGuide.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(vertices), new THREE.PointsMaterial({ color: '#ffffff', size: 7, sizeAttenuation: false, depthTest: false })));
    }
    this.invalidate();
  }
  stageLocal(stageId: string, point: Vec3): Vec3 {
    const world = new THREE.Vector3(...point), parent = this.entries.get(stageId)?.root.parent;
    return (parent ? parent.worldToLocal(world) : world).toArray() as Vec3;
  }
  worldPosition(id: string): Vec3 | undefined {
    return this.entries.get(id)?.root.getWorldPosition(new THREE.Vector3()).toArray() as Vec3 | undefined;
  }
  viewportPosition(id: string): Vec3 {
    const point = this.camera.position.clone().addScaledVector(this.camera.getWorldDirection(new THREE.Vector3()), 2);
    return this.stageLocal(id, point.toArray() as Vec3);
  }
  private pickTool(ray: THREE.Raycaster, tool: ViewportTool) {
    if (tool.type === 'route') {
      const surfaces = [...this.entries.values()].filter(entry => entry.spec.visible && ['build','block'].includes(entry.spec.type));
      const hit = ray.intersectObjects(surfaces.map(entry => entry.root), true)[0];
      const point = hit?.point || ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -tool.height), new THREE.Vector3());
      if (point) tool.point(point.toArray() as Vec3);
      return;
    }
    const root = this.entries.get(tool.id)?.root;
    if (!root?.visible) return;
    const hit = ray.intersectObject(root, true).find(candidate => candidate.object.userData.voxelCells);
    const index = hit?.faceIndex;
    if (hit && typeof index === 'number' && hit.face) {
      const cells = hit.object.userData.voxelCells as Int32Array, offset = Math.floor(index / 2) * 3;
      const cell: Vec3 = [cells[offset], cells[offset + 1], cells[offset + 2]];
      if (tool.mode === 'place') {
        const n = hit.face.normal.toArray();
        const axis = n.reduce((best, value, i) => Math.abs(value) > Math.abs(n[best]) ? i : best, 0);
        cell[axis] += Math.sign(n[axis]);
      }
      tool.point(cell);
    } else if (tool.mode === 'place') {
      root.updateWorldMatrix(true, false);
      const localRay = ray.ray.clone().applyMatrix4(root.matrixWorld.clone().invert());
      const p = localRay.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -.5), new THREE.Vector3());
      if (p) tool.point([Math.round(p.x), 0, Math.round(p.z)]);
    }
  }
  frameSelection(all = false) {
    const box = new THREE.Box3();
    if (!all && this.selection) {
      const e = this.entries.get(this.selection.id);
      if (e) box.setFromObject(e.root);
    } else
      for (const e of this.entries.values())
        if (e.spec.visible && ['character', 'build', 'block'].includes(e.spec.type))
          box.expandByObject(e.root);
    if (box.isEmpty()) {
      this.orbit.target.set(0, 1, 0);
      this.camera.position.set(8, 6, 10);
    } else {
      const center = box.getCenter(new THREE.Vector3()),
        size = box.getSize(new THREE.Vector3()).length(),
        direction = this.camera.position.clone().sub(this.orbit.target).normalize();
      this.orbit.target.copy(center);
      this.camera.position.copy(center).addScaledVector(direction, Math.max(3, size * 1.15));
      const radius = Math.max(15, size * 0.65);
      this.sceneRadius = radius;
      Object.assign(this.sun.shadow.camera, {
        left: -radius,
        right: radius,
        top: radius,
        bottom: -radius,
      });
      this.sun.shadow.camera.updateProjectionMatrix();
      this.sun.target.position.copy(center);
      this.activeLighting = undefined;
      this.syncShotLighting();
    }
    this.orbit.update();
    this.invalidate();
  }
  view(axis: 'front' | 'top' | 'right' | 'perspective') {
    const d = this.camera.position.distanceTo(this.orbit.target),
      offset =
        axis === 'front'
          ? new THREE.Vector3(0, 0, d)
          : axis === 'top'
            ? new THREE.Vector3(0, d, 0.001)
            : axis === 'right'
              ? new THREE.Vector3(d, 0, 0)
              : new THREE.Vector3(1, 0.7, 1).normalize().multiplyScalar(d);
    this.camera.position.copy(this.orbit.target).add(offset);
    this.orbit.update();
    this.invalidate();
  }
  cameraTransform(cameraId?:string): Transform {
    const parent=cameraId?this.entries.get(cameraId)?.root.parent:null;
    if(parent&&parent!==this.scene){
      parent.updateWorldMatrix(true,false);this.camera.updateWorldMatrix(true,false);
      const matrix=parent.matrixWorld.clone().invert().multiply(this.camera.matrixWorld),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();
      matrix.decompose(position,rotation,scale);const e=new THREE.Euler().setFromQuaternion(rotation);
      return {position:position.toArray() as Vec3,rotation:[e.x,e.y,e.z],scale:[1,1,1]};
    }
    return {
      position: this.camera.position.toArray() as Vec3,
      rotation: [this.camera.rotation.x, this.camera.rotation.y, this.camera.rotation.z],
      scale: [1, 1, 1],
    };
  }
  setViewLens(fov:number){this.camera.fov=fov;this.camera.updateProjectionMatrix();this.invalidate();}
  recallCamera(id:string){
    if(this.entries.get(id)?.spec.type!=='camera')return;
    this.updateOutputCamera(id);
    this.camera.position.copy(this.outputCamera.position);this.camera.quaternion.copy(this.outputCamera.quaternion);
    this.setViewLens(this.outputCamera.fov);
    this.orbit.target.copy(this.camera.position).addScaledVector(this.camera.getWorldDirection(new THREE.Vector3()),Math.max(3,this.sceneRadius*.25));
    this.updateOutputCamera();this.invalidate();
  }
  subjectBounds(id?:string){
    const entry=id?this.entries.get(id):undefined;
    const box=entry && !['camera','light','control'].includes(entry.spec.type)?new THREE.Box3().setFromObject(entry.root):null;
    return box&&!box.isEmpty()?{center:box.getCenter(new THREE.Vector3()).toArray() as Vec3,radius:Math.max(.7,box.getSize(new THREE.Vector3()).length()/2)}:
      {center:this.orbit.target.toArray() as Vec3,radius:Math.max(1,this.camera.position.distanceTo(this.orbit.target)*.22)};
  }
  setCameraGuide(value:boolean){this.showCameraGuide=value;this.updateHelpers();this.invalidate();}
  private updateCameraGuide(){
    for(const child of [...this.cameraGuide.children]){disposeObject(child);child.removeFromParent();}
    const id=this.selection?.id,entry=id?this.entries.get(id):undefined,keys=id?this.project?.tracks[id]:undefined;
    if(!entry || (entry.spec.type!=='camera' && !entry.spec.placement) || !keys?.length)return;
    const parent=entry.root.parent;if(parent)parent.updateWorldMatrix(true,false);
    const point=(v:Vec3)=>{const p=new THREE.Vector3(...v);return parent?p.applyMatrix4(parent.matrixWorld):p;};
    const markerKeys=keys.length>1500?keys.filter((_,i)=>i%Math.ceil(keys.length/1500)===0):keys;
    const first=keys[0].frame,last=keys.at(-1)!.frame;
    const sampled=Array.from({length:Math.max(2,Math.min(280,keys.length*14))},(_,i, )=>i);
    const points=sampled.map(i=>{const frame=first+(last-first)*i/(sampled.length-1);
      const transform=entry.spec.cameraRail?sampleCameraRail(keys,frame,entry.spec.fov||40,entry.spec.cameraRail)!:evaluate(keys,frame,entry.spec.transform);
      return point(transform.position);});
    this.cameraGuide.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:'#dddddd',transparent:true,opacity:.75,depthTest:false})));
    this.cameraGuide.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(markerKeys.map(k=>point(k.position))),new THREE.PointsMaterial({color:'#ffffff',size:6,sizeAttenuation:false,depthTest:false})));
  }
  private draw() {
    this.renderer.info.reset();
    const w = this.renderer.domElement.width / this.renderer.getPixelRatio(),
      h = this.renderer.domElement.height / this.renderer.getPixelRatio();
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, w, h);
    if (this.preview) {
      const ratio = 16 / 9,
        vw = Math.min(w, h * ratio),
        vh = vw / ratio;
      this.renderer.setClearColor('#101010');
      this.renderer.clear();
      this.renderer.setViewport((w - vw) / 2, (h - vh) / 2, vw, vh);
      this.renderer.setScissor((w - vw) / 2, (h - vh) / 2, vw, vh);
      this.renderer.setScissorTest(true);
      this.pipeline.render(this.outputCamera, vw, vh, (w - vw) / 2, (h - vh) / 2,this.outputEffects);
      this.renderer.setScissorTest(false);
    } else {
      this.pipeline.render(this.camera, w, h);
      if (this.helpers) {
        const autoClear = this.renderer.autoClear;
        this.renderer.autoClear = false;
        this.renderer.clearDepth();
        this.renderer.render(this.overlays, this.camera);
        this.renderer.autoClear = autoClear;
      }
    }
  }
  private async exportSession<T>(
    width: number,
    height: number,
    consume: (canvas: HTMLCanvasElement) => Promise<T>,
  ): Promise<T> {
    await Promise.all(
      [...this.entries.values()].map((entry) => entry.root.userData.ready).filter(Boolean),
    );
    const oldFrame = this.frame,
      ratio = this.renderer.getPixelRatio();
    this.exporting = true;
    this.updateHelpers();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.outputCamera.aspect = width / height;
    this.outputCamera.updateProjectionMatrix();
    try {
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, width, height);
      return await consume(this.renderer.domElement);
    } finally {
      this.renderer.setPixelRatio(ratio);
      this.exporting = false;
      this.outputCamera.aspect = 16 / 9;
      this.outputCamera.updateProjectionMatrix();
      this.setFrame(oldFrame);
      this.updateHelpers();
      this.resize();
    }
  }
  async capturePNG(width: number, height: number, frame: number): Promise<Uint8Array> {
    return this.exportSession(width, height, async (canvas) => {
      this.setFrame(frame);
      this.pipeline.render(this.outputCamera, width, height,0,0,this.outputEffects);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(Error('Could not encode frame.'))),
          'image/png',
        ),
      );
      return new Uint8Array(await blob.arrayBuffer());
    });
  }
  async captureVideo(
    width: number,
    height: number,
    start: number,
    end: number,
    format: 'webm' | 'mp4',
    options: { isCanceled: () => boolean; onProgress: (value: number) => void },
  ): Promise<Uint8Array> {
    const {
      Output,
      BufferTarget,
      WebMOutputFormat,
      Mp4OutputFormat,
      CanvasSource,
      AudioBufferSource,
      Quality,
      canEncodeVideo,
      canEncodeAudio,
    } = await import('mediabunny');
    const fps = this.project?.fps || 24,
      quality = new Quality('high');
    const codec =
      format === 'mp4'
        ? 'avc'
        : (await canEncodeVideo('vp9', { width, height, frameRate: fps }))
          ? 'vp9'
          : 'vp8';
    if (!(await canEncodeVideo(codec, { width, height, frameRate: fps })))
      throw Error(
        format === 'mp4'
          ? 'H.264 encoding is unavailable on this device. Select WebM video.'
          : 'This device cannot encode video at this resolution. Try a lower resolution or PNG sequence.',
      );
    return this.exportSession(width, height, async (canvas) => {
      const target = new BufferTarget(),
        output = new Output({
          format:
            format === 'mp4'
              ? new Mp4OutputFormat({ fastStart: 'in-memory' })
              : new WebMOutputFormat(),
          target,
        });
      const source = new CanvasSource(canvas, { codec, quality, keyFrameInterval: 1 });
      output.addVideoTrack(source, { frameRate: fps, maximumPacketCount: end - start + 1 });
      let sound: import('mediabunny').AudioBufferSource | undefined,
        audioBuffer: AudioBuffer | undefined;
      if (this.project?.audio) {
        const audio = this.project.audio,
          context = new OfflineAudioContext(2, 1, 48000),
          data = Uint8Array.from(atob(audio.data.split(',')[1]), (c) => c.charCodeAt(0));
        const decoded = await context.decodeAudioData(data.buffer),
          rate = decoded.sampleRate,
          samples = Math.ceil(((end - start + 1) / fps) * rate);
        audioBuffer = new AudioBuffer({
          length: samples,
          numberOfChannels: decoded.numberOfChannels,
          sampleRate: rate,
        });
        const offset = Math.round(((start - audio.startFrame) / fps) * rate);
        for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
          const input = decoded.getChannelData(channel),
            result = audioBuffer.getChannelData(channel);
          for (let i = 0; i < samples; i++) {
            const index = i + offset;
            if (index >= 0 && index < input.length)
              result[i] = Math.max(-1, Math.min(1, input[index] * audio.volume));
          }
        }
        const audioCodec = format === 'mp4' ? 'aac' : 'opus';
        if (
          !(await canEncodeAudio(audioCodec, {
            sampleRate: rate,
            numberOfChannels: decoded.numberOfChannels,
          }))
        )
          throw Error('This audio encoder is unavailable. Choose WebM or remove the soundtrack.');
        sound = new AudioBufferSource({ codec: audioCodec, quality: new Quality('high') });
        output.addAudioTrack(sound);
      }
      let size = 0;
      target.on('write', ({ end: bytes }) => {
        size = Math.max(size, bytes);
      });
      try {
        await output.start();
        if (sound && audioBuffer) {
          await sound.add(audioBuffer);
          sound.close();
        }
        for (let frame = start; frame <= end; frame++) {
          if (options.isCanceled()) throw Error('Render canceled.');
          this.setFrame(frame);
          this.pipeline.render(this.outputCamera, width, height,0,0,this.outputEffects);
          await source.add((frame - start) / fps, 1 / fps, {
            keyFrame: frame === start || !!this.project?.shots?.some((s) => s.frame === frame),
          });
          if (size > 350 * 1024 * 1024)
            throw Error('Video exceeds 350 MB. Export a shorter range.');
          options.onProgress((frame - start + 1) / (end - start + 1));
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        source.close();
        await output.finalize();
        return new Uint8Array(target.buffer!);
      } catch (error) {
        await output.cancel();
        throw error;
      }
    });
  }
  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.orbit.dispose();
    this.gizmo.dispose();
    this.flight.dispose();
    disposeObject(this.cameraGuide);
    disposeObject(this.routeGuide);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp);
    for (const e of this.entries.values()) this.scene.add(e.root);
    for (const e of this.entries.values()) disposeObject(e.root);
    disposeObject(this.floor);
    this.grid.geometry.dispose();
    (this.grid.material as THREE.Material).dispose();
    this.outline.geometry.dispose();
    this.outline.material.dispose();
    this.sun.shadow.map?.dispose();
    this.pipeline.dispose();
    this.environmentTarget.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
