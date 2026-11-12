import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { eyeDimensions, faceChannels } from '../face';
import type { FacePose, FaceRigConfig, FacialLayer } from '../face';

type Colors = Record<
  | 'leftSkin'
  | 'rightSkin'
  | 'sclera'
  | 'iris'
  | 'pupil'
  | 'highlight'
  | 'brow'
  | 'lip'
  | 'inside'
  | 'tongue'
  | 'teeth',
  THREE.Color
>;
const px = 1 / 16,
  front = 0.2507;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

export class SolidFace extends THREE.Group {
  private bevel = new RoundedBoxGeometry(1, 1, 1, 2, 0.13);
  private dome = new THREE.SphereGeometry(0.5, 20, 12);
  private pixel = new THREE.BoxGeometry(1, 1, 1);
  private meshes: {
    mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    color: keyof Colors;
  }[] = [];
  private lastConfig?: FaceRigConfig;
  private lastPose?: FacePose;
  private lipVertices = new WeakMap<THREE.Mesh, Float32Array>();
  private eyes = (['left', 'right'] as const).map((side) => {
    const group = new THREE.Group();
    group.name = side === 'left' ? 'Left eye' : 'Right eye';
    this.add(group);
    const make = (
      name: string,
      layer: FacialLayer,
      color: keyof Colors,
      sphere = false,
      roughness = 0.64,
    ) => this.part(group, name, layer, color, sphere, roughness);
    const skin = side === 'left' ? 'leftSkin' : 'rightSkin';
    return {
      side,
      group,
      sclera: make('Sclera', 'sclera', 'sclera', false, 0.34),
      iris: make('Iris', 'iris', 'iris', true, 0.42),
      pupil: make('Pupil', 'pupil', 'pupil', true, 0.21),
      catchlight: make('Catchlight', 'catchlight', 'highlight', true, 0.21),
      top: make('Upper eyelid', 'eyelids', skin),
      bottom: make('Lower eyelid', 'eyelids', skin),
      crease: make('Closed lid crease', 'eyelids', 'brow'),
      brow: make('Brow', 'brows', 'brow'),
    };
  });
  private mouth = (() => {
    const group = new THREE.Group();
    group.name = 'Mouth layers';
    this.add(group);
    return {
      group,
      cavity: this.part(group, 'Mouth cavity', 'mouth', 'inside'),
      top: this.part(group, 'Upper lip', 'mouth', 'lip'),
      bottom: this.part(group, 'Lower lip', 'mouth', 'lip'),
      teeth: this.part(group, 'Teeth', 'mouth', 'teeth'),
      tongue: this.part(group, 'Tongue', 'mouth', 'tongue', true),
    };
  })();

  constructor() {
    super();
    this.name = '3D facial layers';
  }

  private part(
    group: THREE.Group,
    name: string,
    layer: FacialLayer,
    color: keyof Colors,
    sphere = false,
    roughness = 0.72,
  ) {
    const mesh = new THREE.Mesh(
      sphere ? this.dome : this.bevel,
      new THREE.MeshStandardMaterial({ roughness }),
    );
    mesh.name = name;
    mesh.userData.facialLayer = layer;
    mesh.userData.bone = 'head';
    mesh.receiveShadow = true;
    group.add(mesh);
    this.meshes.push({ mesh, color });
    return mesh;
  }

  update(config: FaceRigConfig, pose: FacePose, colors: Colors, objectId?: string) {
    if (
      this.lastConfig === config &&
      this.lastPose &&
      faceChannels.every((key) => this.lastPose![key] === pose[key])
    )
      return;
    this.lastConfig = config;
    this.lastPose = { ...pose };
    for (const { mesh, color } of this.meshes) {
      mesh.material.color.copy(colors[color]);
      mesh.userData.objectId = objectId;
    }
    const put = (
      mesh: THREE.Mesh,
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      visible = true,
    ) => {
      mesh.position.set(x * px, y * px, z * px);
      mesh.scale.set(Math.max(0.001, w) * px, Math.max(0.001, h) * px, Math.max(0.001, d) * px);
      mesh.visible = visible && config.layers?.[mesh.userData.facialLayer as FacialLayer] !== false;
    };
    const story = config.style === 'story';
    const pixelStyle = story || config.style === 'pixel3d';
    for (const eye of this.eyes) {
      eye.group.visible = config.style !== 'original';
      if (!eye.group.visible) continue;
      eye.sclera.geometry = pixelStyle ? this.pixel : this.bevel;
      eye.iris.geometry = pixelStyle ? this.pixel : this.dome;
      eye.pupil.geometry = pixelStyle ? this.pixel : this.dome;
      const sign = eye.side === 'left' ? 1 : -1,
        d = eyeDimensions(config, eye.side);
      const center = sign * clamp(config.eyeSpacing + d.offsetX, 0.42, 3.53);
      const width = Math.min(d.width, 2 * (3.94 - Math.abs(center)), Math.abs(center) * 2 - 0.12);
      const row = clamp(config.eyeRow + 0.5 + d.offsetY, 1.4, 6.35);
      const height = Math.min(
        d.height * (1 + 0.13 * Math.max(0, pose.brow)),
        2 * Math.min(row - 0.16, 7.86 - row),
      );
      const closure = clamp(pose.blink + Math.max(0, -pose.brow) * 0.07, 0, 1);
      const aperture = height * (1 - closure),
        open = aperture > 0.065;
      const y = -closure * height * 0.28;
      const depth = d.depth,
        irisFront = depth * 0.88;
      eye.group.position.set(center * px, (8 - row) * px, front + d.protrusion * px);
      eye.group.rotation.z = THREE.MathUtils.degToRad(sign * d.tilt);
      put(eye.sclera, 0, y, depth * 0.33, width, aperture, depth, open);
      const iw = Math.min(d.irisWidth, width * 0.78),
        ih = Math.min(d.irisHeight, aperture * 0.97);
      const ix = clamp(
        pose.lookX * d.gazeX - sign * width * (story ? 0.10 : pixelStyle ? 0.23 : 0),
        -(width - iw) * 0.5,
        (width - iw) * 0.5,
      );
      const iy = y + clamp(pose.lookY * d.gazeY, -(aperture - ih) * 0.44, (aperture - ih) * 0.44);
      put(eye.iris, ix, iy, irisFront, iw, ih, d.irisDepth, open);
      const pupilZ = irisFront + d.irisDepth * 0.46;
      put(
        eye.pupil,
        ix,
        iy,
        pupilZ,
        Math.min(iw * 0.85, d.pupilWidth),
        Math.min(ih * 0.91, d.pupilHeight),
        d.pupilDepth,
        open && (!pixelStyle || config.layers?.pupil === true),
      );
      put(
        eye.catchlight,
        ix - iw * 0.17,
        iy + ih * 0.19,
        pupilZ + d.pupilDepth * 0.52,
        Math.min(0.13, iw * 0.2),
        Math.min(0.13, ih * 0.23),
        0.055,
        open && aperture > 0.23 && (!pixelStyle || config.layers?.catchlight === true),
      );
      const top = d.upperLid + closure * height * 0.78,
        bottom = d.lowerLid + closure * height * 0.22;
      put(
        eye.top,
        0,
        y + aperture / 2 + top / 2 - 0.022,
        depth * 0.36,
        width * d.upperLidWidth,
        top,
        d.upperLidDepth,
        story || !pixelStyle || closure > 0.015,
      );
      put(
        eye.bottom,
        0,
        y - aperture / 2 - bottom / 2 + 0.022,
        depth * 0.32,
        width * d.lowerLidWidth,
        bottom,
        d.lowerLidDepth,
        !pixelStyle || closure > 0.015,
      );
      put(eye.crease, 0, y, depth * 0.98, width * 0.86, 0.059, 0.05, !open);
      const browDepth = config.browDepth ?? 0.18;
      put(
        eye.brow,
        0,
        height * 0.59 + 0.27 + pose.brow * 0.27 + (config.browOffset ?? 0),
        browDepth * 0.78,
        width * 0.88 * (config.browWidth ?? 1),
        (story ? 0.21 : 0.14) * (config.browHeight ?? 1),
        browDepth,
        story || !pixelStyle || Math.abs(pose.brow) > 0.05,
      );
      eye.brow.rotation.z = sign * (pose.brow * 0.22 + (story ? 0.045 : 0));
    }
    const { group, cavity, top, bottom, teeth, tongue } = this.mouth;
    group.visible = config.mouth && config.layers?.mouth !== false;
    group.position.set(0, (8 - (config.mouthRow ?? 6.47)) * px, front);
    const width = (1.58 + pose.smile * 0.45) * (config.mouthWidth ?? 1);
    const opening = (0.08 + pose.jaw * 0.88) * (config.mouthHeight ?? 1);
    const depth = config.mouthDepth ?? 0.23;
    put(cavity, 0, -opening * 0.45, depth * 0.46, width, opening, depth * 0.96);
    put(top, 0, 0, depth * 0.76, width, 0.105, depth);
    put(bottom, 0, -opening * 0.89, depth * 0.7, width * 0.92, 0.11, depth * 0.96);
    put(
      teeth,
      0,
      -0.135,
      depth * 0.96,
      width * 0.74,
      Math.min(0.22, opening * 0.39),
      depth * 0.48,
      pose.jaw > 0.19 || pose.smile > 0.46,
    );
    put(
      tongue,
      0,
      -opening * 0.74,
      depth * 0.83,
      width * 0.63,
      opening * 0.29,
      depth * 0.52,
      pose.jaw > 0.45,
    );
    for (const lip of [top, bottom, cavity, teeth, tongue]) {
      let vertices = this.lipVertices.get(lip);
      if (!vertices) {
        lip.geometry = lip.geometry.clone();
        vertices = new Float32Array(lip.geometry.getAttribute('position').array);
        this.lipVertices.set(lip, vertices);
      }
      const attribute = lip.geometry.getAttribute('position');
      const bend = (pose.smile * 0.23 * px) / lip.scale.y;
      for (let i = 0; i < attribute.count; i++)
        attribute.setY(i, vertices[i * 3 + 1] + bend * (vertices[i * 3] * 2) ** 2);
      attribute.needsUpdate = true;
      lip.geometry.computeVertexNormals();
      lip.geometry.computeBoundingSphere();
    }
  }
}
