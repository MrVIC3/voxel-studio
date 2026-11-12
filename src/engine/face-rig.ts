import * as THREE from 'three';
import { faceChannels } from '../face';
import type { FacePose, FaceRigConfig } from '../face';
import { SolidFace } from './solid-face';

const faceSize = 8;
const pixel = 1 / 16;
const limit = 96;
const skinFallback = 0xb78363;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Sample only the base face. Hat and accessory pixels remain untouched. */
function sampleFace(image: CanvasImageSource | undefined): Uint8ClampedArray | undefined {
  try {
    if (!image) return;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = faceSize;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const source = image as HTMLImageElement;
    const scale = (source.naturalWidth || source.width || 64) / 64;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 8 * scale, 8 * scale, 8 * scale, 8 * scale, 0, 0, 8, 8);
    return ctx.getImageData(0, 0, 8, 8).data;
  } catch {
    // A texture that cannot be read (e.g. remote/CORS) still gets a neutral, visible rig.
    return undefined;
  }
}

function swatch(data: Uint8ClampedArray | undefined, x: number, y: number, fallback: number) {
  const i = (Math.floor(clamp(y, 0, 7)) * 8 + Math.floor(clamp(x, 0, 7))) * 4;
  return new THREE.Color(
    data && data[i + 3] > 125 ? (data[i] << 16) | (data[i + 1] << 8) | data[i + 2] : fallback,
  );
}

function makePalette(data: Uint8ClampedArray | undefined, config: FaceRigConfig) {
  const row = config.eyeRow;
  const leftSkin = swatch(data, 1, row + 1, skinFallback),
    rightSkin = swatch(data, 6, row + 1, skinFallback),
    mouthSkin = swatch(data, 2, 6, skinFallback);
  const iris = config.iris ? new THREE.Color(config.iris) : swatch(data, 2, row, 0x477569);
  const skin = leftSkin.clone().lerp(rightSkin, 0.5);
  // Reuse a hue from the skin where practical, but not skin-coloured or white pupils.
  const skinDistance =
    Math.abs(skin.r - iris.r) + Math.abs(skin.g - iris.g) + Math.abs(skin.b - iris.b);
  if (!config.iris && (skinDistance < 0.13 || Math.min(iris.r, iris.g, iris.b) > 0.67))
    iris.setHex(0x477569);
  return {
    leftSkin,
    rightSkin,
    mouthSkin,
    iris,
    leftLid: leftSkin.clone().multiplyScalar(0.57),
    rightLid: rightSkin.clone().multiplyScalar(0.57),
    sclera: new THREE.Color(0xe8edf0),
    pupil: iris.clone().multiplyScalar(0.21),
    highlight: new THREE.Color(0xf0f6ff),
    brow: swatch(data, 0, 1, 0x573727).multiplyScalar(0.57),
    lip: mouthSkin.clone().lerp(new THREE.Color(0x8a4947), 0.58).multiplyScalar(0.73),
    inside: new THREE.Color(0x321a22),
    tongue: new THREE.Color(0x9f5052),
    teeth: new THREE.Color(0xe2d7ca),
  };
}
type Palette = ReturnType<typeof makePalette>;

export class AnimatedFaceMesh extends THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  private readonly positions: THREE.BufferAttribute;
  private readonly colors: THREE.BufferAttribute;
  private quadCount = 0;
  private palette?: Palette;
  private last?: FaceRigConfig;
  private pose?: FacePose;
  constructor(private readonly pixels?: Uint8ClampedArray) {
    const geometry = new THREE.BufferGeometry();
    const positions = new THREE.BufferAttribute(new Float32Array(limit * 12), 3);
    const colors = new THREE.BufferAttribute(new Float32Array(limit * 12), 3);
    const normals = new THREE.BufferAttribute(new Float32Array(limit * 12), 3);
    const indices = new Uint16Array(limit * 6);
    for (let i = 0; i < limit; i++) {
      const first = i * 4;
      indices.set([first, first + 2, first + 1, first + 1, first + 2, first + 3], i * 6);
      for (let j = 0; j < 4; j++) normals.setXYZ(first + j, 0, 0, 1);
    }
    geometry.setAttribute('position', positions.setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', colors.setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('normal', normals);
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.setDrawRange(0, 0);
    geometry.boundingBox = new THREE.Box3(
      new THREE.Vector3(-0.25, 0, 0.25),
      new THREE.Vector3(0.25, 0.5, 0.255),
    );
    geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.84 });
    super(geometry, material);
    this.positions = positions;
    this.colors = colors;
    this.name = 'facialPerformance';
    this.userData.bone = 'head';
    this.receiveShadow = true;
  }

  private trapezoid(
    x0: number,
    x1: number,
    top0: number,
    top1: number,
    bottom0: number,
    bottom1: number,
    z: number,
    color: THREE.Color,
  ) {
    if (this.quadCount >= limit || x1 <= x0 || (bottom0 <= top0 && bottom1 <= top1)) return;
    const i = this.quadCount++ * 4;
    this.positions.setXYZ(i, (x0 - 4) * pixel, (8 - top0) * pixel, z);
    this.positions.setXYZ(i + 1, (x1 - 4) * pixel, (8 - top1) * pixel, z);
    this.positions.setXYZ(i + 2, (x0 - 4) * pixel, (8 - bottom0) * pixel, z);
    this.positions.setXYZ(i + 3, (x1 - 4) * pixel, (8 - bottom1) * pixel, z);
    for (let j = 0; j < 4; j++) this.colors.setXYZ(i + j, color.r, color.g, color.b);
  }

  private quad(x0: number, y0: number, x1: number, y1: number, z: number, color: THREE.Color) {
    this.trapezoid(x0, x1, y0, y0, y1, y1, z, color);
  }

  private clipped(
    cx: number,
    cy: number,
    w: number,
    h: number,
    l: number,
    t: number,
    r: number,
    b: number,
    z: number,
    color: THREE.Color,
  ) {
    this.quad(
      Math.max(l, cx - w / 2),
      Math.max(t, cy - h / 2),
      Math.min(r, cx + w / 2),
      Math.min(b, cy + h / 2),
      z,
      color,
    );
  }

  updatePose(config: FaceRigConfig, pose: FacePose, maskOnly = false) {
    this.visible = config.enabled;
    if (!config.enabled) return;
    if (
      this.last === config &&
      this.pose &&
      faceChannels.every((name) => Math.abs(this.pose![name] - pose[name]) < 1e-5)
    )
      return;
    if (!this.palette || this.last?.iris !== config.iris || this.last?.eyeRow !== config.eyeRow) {
      this.palette = makePalette(this.pixels, config);
    }
    this.last = config;
    this.pose = { ...pose };
    this.quadCount = 0;
    const p = this.palette,
      cinematic = config.style === 'cinematic';
    const blink = clamp(pose.blink + Math.max(0, -pose.brow) * 0.1, 0, 1);
    for (const side of [-1, 1]) {
      if (maskOnly) {
        if (config.style === 'original') continue;
        const center = 4 + side * 2;
        this.quad(
          center - 1.02,
          3.98,
          center + 1.02,
          5.04,
          0.2505,
          side < 0 ? p.leftSkin : p.rightSkin,
        );
        continue;
      }
      const center = 4 + side * config.eyeSpacing;
      const width = Math.min(
        (cinematic ? 2.16 : 2) * (config.eyeWidth ?? 1),
        2 * config.eyeSpacing - 0.36,
        2 * (4 - config.eyeSpacing) - 0.14,
      );
      const left = center - width / 2,
        right = center + width / 2;
      const skin = side < 0 ? p.leftSkin : p.rightSkin,
        lid = side < 0 ? p.leftLid : p.rightLid;
      // A very thin skin patch replaces the original static eye texels on the base head.
      this.quad(
        center - Math.max(1, width / 2),
        config.eyeRow,
        center + Math.max(1, width / 2),
        config.eyeRow + 1.02,
        0.2505,
        skin,
      );
      if (config.eyeRow !== 4 || config.eyeSpacing !== 2) {
        const old = 4 + side * 2;
        this.quad(old - 1, 4, old + 1, 5.02, 0.2504, skin);
      }
      const opening =
        ((cinematic ? 1.08 : 1) + Math.max(0, pose.brow) * 0.19) * (config.eyeHeight ?? 1);
      const top = config.eyeRow + (1 - opening) * 0.5 + blink * opening * 0.76;
      const bottom = config.eyeRow + (1 + opening) * 0.5 - blink * opening * 0.24;
      if (bottom - top > 0.05) {
        if (cinematic) this.quad(left, top - 0.065, right, bottom + 0.035, 0.2508, lid);
        this.quad(left, top, right, bottom, 0.251, p.sclera);
        const irisX = center - side * 0.16 + pose.lookX * 0.53;
        const irisY = config.eyeRow + 0.5 - pose.lookY * 0.25;
        const irisW = cinematic ? 0.89 : 0.9,
          irisH = cinematic ? 0.99 : 1;
        this.clipped(irisX, irisY, irisW, irisH, left, top, right, bottom, 0.2514, p.iris);
        if (cinematic) {
          this.clipped(irisX, irisY, 0.43, 0.69, left, top, right, bottom, 0.2518, p.pupil);
          this.clipped(
            irisX - 0.2,
            irisY - 0.21,
            0.17,
            0.17,
            left,
            top,
            right,
            bottom,
            0.2522,
            p.highlight,
          );
        }
      } else {
        const seam = config.eyeRow + 0.77;
        this.quad(left + 0.12, seam, right - 0.12, seam + 0.11, 0.251, lid);
      }
      if (Math.abs(pose.brow) > 0.035) {
        const y = config.eyeRow - 0.3 - pose.brow * 0.35,
          angle = side * pose.brow * 0.18;
        this.trapezoid(
          left + 0.08,
          right - 0.08,
          y - angle,
          y + angle,
          y - angle + 0.15,
          y + angle + 0.15,
          0.252,
          p.brow,
        );
      }
    }
    if (maskOnly && config.mouth) {
      this.quad(2.98, 5.99, 5.02, 7.02, 0.2505, p.mouthSkin);
    } else if (config.mouth && (Math.abs(pose.smile) > 0.035 || pose.jaw > 0.035)) {
      const center = config.mouthRow ?? 6.47;
      this.quad(2.98, 5.99, 5.02, 7.02, 0.2505, p.mouthSkin);
      const width = (1.65 + Math.max(0, pose.smile) * 0.63) * (config.mouthWidth ?? 1);
      const opening = Math.min(7.83 - center, (0.09 + pose.jaw * 0.75) * (config.mouthHeight ?? 1));
      const lip = opening + 0.14;
      for (let i = 0; i < 6; i++) {
        const a = i / 6 - 0.5,
          b = (i + 1) / 6 - 0.5;
        const curve = (x: number) => center - 4 * x * x * pose.smile * 0.34;
        const height = (x: number, amount: number) => amount * (1 - Math.abs(x) * 0.87);
        const x0 = 4 + a * width,
          x1 = 4 + b * width;
        const y0 = curve(a),
          y1 = curve(b);
        this.trapezoid(
          x0,
          x1,
          y0 - 0.07,
          y1 - 0.07,
          y0 + height(a, lip),
          y1 + height(b, lip),
          0.2509,
          p.lip,
        );
        if (pose.jaw > 0.12) {
          this.trapezoid(
            x0,
            x1,
            y0 + 0.05,
            y1 + 0.05,
            y0 + height(a, opening),
            y1 + height(b, opening),
            0.2513,
            p.inside,
          );
          if (i >= 1 && i <= 4 && pose.jaw > 0.24) {
            this.trapezoid(x0, x1, y0 + 0.07, y1 + 0.07, y0 + 0.18, y1 + 0.18, 0.2517, p.teeth);
            if (pose.jaw > 0.55)
              this.trapezoid(
                x0,
                x1,
                y0 + height(a, opening) - 0.12,
                y1 + height(b, opening) - 0.12,
                y0 + height(a, opening) - 0.03,
                y1 + height(b, opening) - 0.03,
                0.2517,
                p.tongue,
              );
          }
        }
      }
    }
    this.geometry.setDrawRange(0, this.quadCount * 6);
    for (const attribute of [this.positions, this.colors]) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, this.quadCount * 12);
      attribute.needsUpdate = true;
    }
  }
}

const mounts = new WeakMap<
  THREE.Object3D,
  {
    head: THREE.Object3D;
    source?: CanvasImageSource;
    mesh?: AnimatedFaceMesh;
    solid?: SolidFace;
    pixels?: Uint8ClampedArray;
    palette?: Palette;
    config?: FaceRigConfig;
    offset: number;
    skinVisible: boolean;
  }
>();

export function installCharacterFace(
  root: THREE.Object3D,
  head: THREE.Object3D,
  image?: CanvasImageSource,
  offset = 0,
  skinVisible = true,
) {
  mounts.set(root, { head, source: image, offset, skinVisible });
}

export function setCharacterFace(
  root: THREE.Object3D,
  config: FaceRigConfig | undefined,
  pose: FacePose,
) {
  const mount = mounts.get(root);
  if (!mount) return;
  if (!config?.enabled) {
    if (mount.mesh) mount.mesh.visible = false;
    if (mount.solid) mount.solid.visible = false;
    return;
  }
  if (!mount.mesh) {
    mount.pixels = sampleFace(mount.source);
    mount.mesh = new AnimatedFaceMesh(mount.pixels);
    mount.mesh.position.z = mount.offset;
    mount.mesh.userData.objectId = root.userData.id;
    const material = mount.head.children.find((child) => child instanceof THREE.Mesh)?.material;
    if (material instanceof THREE.MeshStandardMaterial) {
      mount.mesh.material.wireframe = material.wireframe;
      mount.mesh.material.emissive.copy(material.emissive);
      mount.mesh.material.userData.studioEmission = 0;
    }
    mount.head.add(mount.mesh);
  }
  const cinematic = config.style !== 'classic';
  mount.mesh.updatePose(config, pose, cinematic);
  mount.mesh.visible = mount.skinVisible || !cinematic;
  if (cinematic && !mount.solid) {
    mount.solid = new SolidFace();
    mount.solid.position.z = mount.offset;
    mount.head.add(mount.solid);
  }
  if (mount.solid) {
    mount.solid.visible = cinematic;
    if (cinematic) {
      if (
        !mount.palette ||
        mount.config?.iris !== config.iris ||
        mount.config?.eyeRow !== config.eyeRow
      )
        mount.palette = makePalette(mount.pixels, config);
      mount.config = config;
      mount.solid.update(config, pose, mount.palette, root.userData.id);
    }
  }
}
