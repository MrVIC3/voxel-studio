import * as THREE from 'three';
import type { ArmorMaterial, BoneName, SceneObject, VoxelData } from '../model';
import { installCharacterFace } from './face-rig';
import { defaultDetail, defaultLayer, layerDepth } from '../character-layers';
import type { CharacterLayer } from '../character-layers';
import { readSkinPixels, skinRelief } from './skin-relief';
import {
  jointPivot,
  jointTrimPixels,
  limbJoint,
  skinSideRects,
  socketCapPixels,
} from './limb-joint';
export function defaultSkin(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const fill = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  const box = (u: number, v: number, w: number, h: number, d: number, color: string) => {
    fill(u, v, 2 * w + 2 * d, d + h, color);
  };
  box(0, 0, 8, 8, 8, '#ba8c67');
  box(16, 16, 8, 12, 4, '#698a77');
  box(40, 16, 4, 12, 4, '#bc916e');
  box(32, 48, 4, 12, 4, '#bc916e');
  box(0, 16, 4, 12, 4, '#5c6268');
  box(16, 48, 4, 12, 4, '#5c6268');
  fill(0, 0, 32, 8, '#61452f');
  fill(0, 8, 8, 8, '#694b32');
  fill(24, 8, 8, 8, '#694b32');
  fill(8, 8, 8, 2, '#745037');
  fill(8, 10, 2, 1, '#745037');
  fill(14, 10, 2, 4, '#745037');
  fill(9, 12, 2, 1, '#e6dbcb');
  fill(13, 12, 2, 1, '#e6dbcb');
  fill(10, 12, 1, 1, '#4a6749');
  fill(13, 12, 1, 1, '#4a6749');
  fill(11, 14, 2, 1, '#9e7350');
  fill(11, 15, 2, 1, '#7c5139');
  fill(40, 20, 16, 4, '#698a77');
  fill(32, 52, 16, 4, '#698a77');
  fill(0, 28, 16, 4, '#414444');
  fill(16, 60, 16, 4, '#414444');
  fill(20, 20, 8, 1, '#b38966');
  fill(23, 21, 2, 2, '#b38966');
  fill(20, 30, 8, 2, '#526f60');
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = false;
  return t;
}
function skinBox(
  w: number,
  h: number,
  d: number,
  u: number,
  v: number,
  texture: THREE.Texture,
  skinHeight: number,
  overlay = false,
  slice?: [number, number],
  inflate = overlay ? 0.012 : 0,
  openJoint = false,
) {
  const geo = new THREE.BoxGeometry(
    w / 16 + inflate,
    (slice ? slice[1] - slice[0] : h) / 16 + (openJoint ? 0 : inflate),
    d / 16 + inflate,
  );
  const [right, left, front, back] = skinSideRects(u, v, w, h, d);
  const rects = [right, left, [u + d, v, w, d], [u + d + w, v, w, d], front, back];
  if (openJoint && slice && geo.index) {
    const openTop = slice[0] > 0,
      openBottom = slice[0] < 6;
    const position = geo.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
      if (!openTop && y > 0) position.setY(i, y + inflate / 2);
      if (!openBottom && y < 0) position.setY(i, y - inflate / 2);
    }
    geo.setIndex(
      Array.from(geo.index.array).filter((_, index) => {
        const face = Math.floor(index / 6);
        return !(openTop && face === 2) && !(openBottom && face === 3);
      }),
    );
    geo.clearGroups();
  }
  const uv = geo.attributes.uv;
  rects.forEach(([x, y, rw, rh], i) => {
    if (slice && (i < 2 || i > 3)) {
      y += slice[0];
      rh = slice[1] - slice[0];
    }
    uv.setXY(i * 4, x / 64, 1 - y / skinHeight);
    uv.setXY(i * 4 + 1, (x + rw) / 64, 1 - y / skinHeight);
    uv.setXY(i * 4 + 2, x / 64, 1 - (y + rh) / skinHeight);
    uv.setXY(i * 4 + 3, (x + rw) / 64, 1 - (y + rh) / skinHeight);
  });
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 1,
    alphaTest: overlay ? 0.1 : 0,
    side: overlay ? THREE.DoubleSide : THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
export function characterMesh(
  object: SceneObject,
  changed: () => void,
  defaultSkinData?: string,
  armorSource?: (material: ArmorMaterial, leggings: boolean) => string | undefined,
): THREE.Group {
  const root = new THREE.Group(),
    body = new THREE.Group();
  const joints: (() => void)[] = [];
  root.userData.updateJoints = () => joints.forEach((update) => update());
  let ready: () => void = () => {};
  root.userData.ready = new Promise<void>((resolve) => (ready = resolve));
  body.name = 'body';
  root.add(body);
  body.position.y = 0.75;
  body.userData.rest = new THREE.Vector3(0, 0.75, 0);
  const skinSource = object.skin || defaultSkinData;
  const tex = skinSource
    ? new THREE.TextureLoader().load(
        skinSource,
        () => {
          build();
          changed();
        },
        undefined,
        () => {
          const fallback = defaultSkin();
          tex.image = fallback.image;
          tex.needsUpdate = true;
          fallback.dispose();
          build();
          changed();
        },
      )
    : defaultSkin();
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  const build = () => {
    if (body.children.length) return;
    const modern = (tex.image?.height || 64) === 64,
      h = modern ? 64 : 32,
      arm = object.slim ? 3 : 4;
    const layer = (name: CharacterLayer) => object.characterLayers?.[name] || defaultLayer;
    const thickness = (name: CharacterLayer) => layer(name).offset / 16;
    const pixels = readSkinPixels(tex.image, h);
    const paintedHair = object.characterLayers?.hair?.color;
    const detail = object.characterLayers?.detail;
    const detailColor = detail?.visible ? (detail.color ?? defaultDetail.color) : undefined;
    const detailRGB = detailColor && [1, 3, 5].map((i) => parseInt(detailColor.slice(i, i + 2), 16));
    const hairRGB = paintedHair
      ? [1, 3, 5].map((i) => parseInt(paintedHair.slice(i, i + 2), 16))
      : undefined;
    const hair = (r: number, g: number, b: number) => {
      if (hairRGB) return Math.hypot(r - hairRGB[0], g - hairRGB[1], b - hairRGB[2]) < 69;
      return !object.skin && r > g * 1.15 && g > b * 1.22 && r > 100;
    };
    const tag = (mesh: THREE.Mesh, name: CharacterLayer) => {
      mesh.userData.characterLayer = name;
      mesh.visible = layer(name).visible;
    };
    const armorTextures = new Map<string, THREE.Texture>();
    const armorReady: Promise<void>[] = [];
    const armorReliefs: (() => void)[] = [];
    const getArmor = (material: ArmorMaterial, leggings: boolean) => {
      const data = armorSource?.(material, leggings);
      if (!data) return;
      const key = material + leggings;
      let texture = armorTextures.get(key);
      if (!texture) {
        let finish!: () => void;
        armorReady.push(
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
        );
        texture = new THREE.TextureLoader().load(
          data,
          () => {
            changed();
            finish();
          },
          undefined,
          finish,
        );
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.colorSpace = THREE.SRGBColorSpace;
        armorTextures.set(key, texture);
      }
      return texture;
    };
    const specs: {
      bone: BoneName;
      dims: number[];
      uv: number[];
      outer: number[];
      pivot: number[];
      offset: number[];
    }[] = [
      {
        bone: 'body',
        dims: [8, 12, 4],
        uv: [16, 16],
        outer: [16, 32],
        pivot: [0, 0, 0],
        offset: [0, 0.375, 0],
      },
      {
        bone: 'head',
        dims: [8, 8, 8],
        uv: [0, 0],
        outer: [32, 0],
        pivot: [0, 0.75, 0],
        offset: [0, 0.25, 0],
      },
      {
        bone: 'rightArm',
        dims: [arm, 12, 4],
        uv: [40, 16],
        outer: [40, 32],
        pivot: [-(8 + arm) / 32, 0.75, 0],
        offset: [0, -0.375, 0],
      },
      {
        bone: 'leftArm',
        dims: [arm, 12, 4],
        uv: modern ? [32, 48] : [40, 16],
        outer: [48, 48],
        pivot: [(8 + arm) / 32, 0.75, 0],
        offset: [0, -0.375, 0],
      },
      {
        bone: 'rightLeg',
        dims: [4, 12, 4],
        uv: [0, 16],
        outer: [0, 32],
        pivot: [-0.125, 0, 0],
        offset: [0, -0.375, 0],
      },
      {
        bone: 'leftLeg',
        dims: [4, 12, 4],
        uv: modern ? [16, 48] : [0, 16],
        outer: [0, 48],
        pivot: [0.125, 0, 0],
        offset: [0, -0.375, 0],
      },
    ];
    for (const s of specs) {
      const bone = s.bone === 'body' ? body : new THREE.Group();
      bone.name = s.bone;
      bone.userData.bone = s.bone;
      if (s.bone !== 'body') {
        bone.position.fromArray(s.pivot);
        body.add(bone);
      }
      bone.userData.rest =
        s.bone === 'body' ? new THREE.Vector3(0, 0.75, 0) : bone.position.clone();
      const limb = s.bone.endsWith('Arm') || s.bone.endsWith('Leg');
      const pieces: {
        node: THREE.Group;
        offset: number[];
        slice?: [number, number];
        name: BoneName;
      }[] = [
        {
          node: bone,
          offset: limb ? [0, -0.1875, 0] : s.offset,
          slice: limb ? [0, 6] : undefined,
          name: s.bone,
        },
      ];
      let lower: THREE.Group | undefined;
      if (limb) {
        lower = new THREE.Group();
        const lowerName = s.bone.replace('Arm', 'Forearm').replace('Leg', 'Shin') as BoneName;
        lower.name = lowerName;
        lower.userData.bone = lowerName;
        lower.position.y = -jointPivot;
        lower.userData.rest = lower.position.clone();
        bone.add(lower);
        pieces.push({ node: lower, offset: [0, -0.1875, 0], slice: [6, 12], name: lowerName });
        const end = new THREE.Group();
        end.name = s.bone.replace('Arm', 'Hand').replace('Leg', 'Foot');
        end.userData.bone = end.name;
        end.position.y = -0.375;
        end.userData.rest = end.position.clone();
        lower.add(end);
      }
      const mirrored = !modern && (s.bone === 'leftArm' || s.bone === 'leftLeg');
      const clothing =
        s.bone === 'head'
          ? 'headwear'
          : s.bone === 'body'
            ? 'jacket'
            : s.bone.endsWith('Arm')
              ? 'sleeves'
              : 'trousers';
      const skinInflate = thickness('skin'),
        clothingInflate = skinInflate + 0.012 + thickness(clothing);
      const connect = (
        texture: THREE.Texture,
        uv: number[],
        height: number,
        overlay: boolean,
        inflate: number,
        width: number,
        mirror = false,
        name: CharacterLayer = 'skin',
      ) => {
        if (!lower) return;
        const joint = limbJoint(
          lower,
          [width, s.dims[1], s.dims[2]],
          [uv[0], uv[1]],
          texture,
          height,
          overlay,
          inflate,
          mirror,
        );
        bone.add(joint.mesh);
        tag(joint.mesh, name);
        joints.push(joint.update);
        const anchor = bone.userData.rest as THREE.Vector3;
        const socket = limbJoint(
          bone,
          [width, s.dims[1], s.dims[2]],
          [uv[0], uv[1]],
          texture,
          height,
          overlay,
          inflate,
          mirror,
          anchor,
        );
        body.add(socket.mesh);
        tag(socket.mesh, name);
        joints.push(socket.update);
        const cap = skinBox(
          width,
          s.dims[1],
          s.dims[2],
          uv[0],
          uv[1],
          texture,
          height,
          overlay,
          [0, socketCapPixels],
          inflate,
          true,
        );
        cap.position.copy(anchor);
        cap.position.y -= socketCapPixels / 32;
        cap.userData.bone = s.bone;
        if (mirror) cap.scale.x = -1;
        body.add(cap);
        tag(cap, name);
      };
      connect(tex, s.uv, h, false, skinInflate, s.dims[0], mirrored);
      if (modern) connect(tex, s.outer, h, true, clothingInflate, s.dims[0], false, clothing);
      const arm = s.bone.endsWith('Arm'),
        leg = s.bone.endsWith('Leg');
      const gearUV = arm ? [40, 16] : leg ? [0, 16] : s.uv;
      const joinedArmor = arm
        ? object.armor?.body
        : leg && !object.armor?.feet
          ? object.armor?.legs
          : undefined;
      const armorOffset = skinInflate + thickness('armor');
      const gearInflate = (leg ? 0.044 : 0.074) + armorOffset;
      const armorLayer = joinedArmor && getArmor(joinedArmor, leg);
      if (armorLayer)
        connect(armorLayer, gearUV, 32, true, gearInflate, arm ? 4 : s.dims[0], false, 'armor');
      for (const piece of pieces) {
        const trimOffset = piece.slice?.[0] === 6 ? -jointTrimPixels / 32 : 0;
        const trimSlice =
          piece.slice &&
          ((piece.slice[0] === 0
            ? [jointTrimPixels, 6 - jointTrimPixels]
            : [6 + jointTrimPixels, 12]) as [number, number] | undefined);
        const setOffset = (mesh: THREE.Mesh, connected: boolean) => {
          mesh.position.fromArray(piece.offset);
          if (connected) mesh.position.y += trimOffset;
        };
        const m = skinBox(
          s.dims[0],
          s.dims[1],
          s.dims[2],
          s.uv[0],
          s.uv[1],
          tex,
          h,
          false,
          trimSlice,
          skinInflate,
          !!lower,
        );
        setOffset(m, !!lower);
        m.userData.bone = piece.name;
        tag(m, 'skin');
        piece.node.add(m);
        if (mirrored) m.scale.x = -1;
        const raise = (
          source: typeof m,
          name: CharacterLayer,
          mask?: Parameters<typeof skinRelief>[3],
        ) => {
          if (!pixels || !layer(name).visible) return;
          const depth = (object.characterLayers?.[name]?.depth ?? layerDepth[name]) / 16;
          const raised = skinRelief(source, pixels, depth, mask);
          if (!raised) return;
          raised.name = name + ' relief';
          raised.userData.bone = piece.name;
          raised.scale.copy(source.scale);
          tag(raised, name);
          piece.node.add(raised);
        };
        if (s.bone === 'head' || s.bone === 'body')
          raise(
            m,
            'hair',
            (r, g, b, face, row) =>
              (s.bone !== 'head' || (face !== 3 && (face !== 4 || row < 4 || !!hairRGB))) &&
              hair(r, g, b),
          );
        if (!object.skin && s.bone !== 'head')
          raise(m, clothing, (r, g, b, face, row) => {
            if (hair(r, g, b)) return false;
            if (s.bone === 'body') return face >= 4;
            if (leg) return true;
            const inside = s.bone === 'leftArm' ? 1 : 0;
            return face !== inside && (trimSlice?.[0] ?? 0) + row < 4 && (g >= r * 0.88 || r < 90);
          });
        const detailRegion = arm ? 'arms' : leg ? 'legs' : s.bone;
        if (detailRGB && (!detail?.region || detail.region === 'all' || detail.region === detailRegion))
          raise(m, 'detail', (r, g, b) =>
            Math.hypot(r - detailRGB[0], g - detailRGB[1], b - detailRGB[2]) <= (detail?.tolerance ?? defaultDetail.tolerance),
          );
        if (modern || s.bone === 'head') {
          const overlay = skinBox(
            s.dims[0],
            s.dims[1],
            s.dims[2],
            s.outer[0],
            s.outer[1],
            tex,
            h,
            true,
            trimSlice,
            clothingInflate,
            !!lower,
          );
          setOffset(overlay, !!lower);
          overlay.userData.bone = piece.name;
          tag(overlay, clothing);
          piece.node.add(overlay);
          raise(overlay, clothing);
        }
        const slot =
          s.bone === 'head'
            ? 'head'
            : s.bone.endsWith('Leg')
              ? piece.slice?.[0] === 6 && object.armor?.feet
                ? 'feet'
                : 'legs'
              : 'body';
        const material = object.armor?.[slot];
        const armor = material && getArmor(material, slot === 'legs');
        if (armor) {
          const gear = skinBox(
            arm ? 4 : s.dims[0],
            s.dims[1],
            s.dims[2],
            gearUV[0],
            gearUV[1],
            armor,
            32,
            true,
            armorLayer ? trimSlice : piece.slice,
            (slot === 'legs' ? 0.044 : 0.074) + armorOffset,
            !!armorLayer,
          );
          setOffset(gear, !!armorLayer);
          gear.userData.bone = piece.name;
          tag(gear, 'armor');
          piece.node.add(gear);
          armorReliefs.push(() => {
            if (!layer('armor').visible) return;
            const materialPixels = readSkinPixels(armor.image, 32);
            if (!materialPixels) return;
            const relief = skinRelief(
              gear,
              materialPixels,
              (object.characterLayers?.armor?.depth ?? layerDepth.armor) / 16,
            );
            if (!relief) return;
            relief.name = 'Armor relief';
            relief.userData.bone = piece.name;
            tag(relief, 'armor');
            piece.node.add(relief);
          });
        }
      }
    }
    const head = body.getObjectByName('head');
    if (head)
      installCharacterFace(root, head, tex.image, thickness('skin') / 2, layer('skin').visible);
    void Promise.all(armorReady).then(() => {
      armorReliefs.forEach((add) => add());
      if (armorReliefs.length) changed();
      ready();
    });
  };
  if (!skinSource) build();
  return root;
}
export function disposeObject(object: THREE.Object3D) {
  const materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>();
  object.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    if (m.customDepthMaterial) materials.add(m.customDepthMaterial);
    if (m.customDistanceMaterial) materials.add(m.customDistanceMaterial);
    if (m.material)
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) materials.add(mat);
  });
  for (const m of materials) {
    const map = (m as THREE.MeshStandardMaterial).map;
    if (map) textures.add(map);
    m.dispose();
  }
  for (const t of textures) t.dispose();
}
