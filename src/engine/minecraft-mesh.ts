import * as THREE from 'three';
import { faceNames, MinecraftLibrary, parseState } from './minecraft';
import type { FaceName, ModelElement, ModelFace, ResolvedPart } from './minecraft';
import type { VoxelData } from '../model';
import { specialModel } from './special-models';
import { createFoliageWind, foliageKind } from './foliage-wind';
type Mode = 'opaque' | 'cutout' | 'cross' | 'glass' | 'emissive';
type Quad = {
  points: number[][];
  normal: number[];
  uv: number[][];
  texture: string;
  color: THREE.Color;
  mode: Mode;
  cull?: number[];
};
type Compiled = { quads: Quad[]; solid: boolean };
const normals: number[][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
function corners(e: ModelElement, face: FaceName) {
  const [a, b, c] = e.from.map((n) => n / 16 - 0.5),
    [x, y, z] = e.to.map((n) => n / 16 - 0.5);
  switch (face) {
    case 'east':
      return [
        [x, b, z],
        [x, b, c],
        [x, y, z],
        [x, y, c],
      ];
    case 'west':
      return [
        [a, b, c],
        [a, b, z],
        [a, y, c],
        [a, y, z],
      ];
    case 'up':
      return [
        [a, y, z],
        [x, y, z],
        [a, y, c],
        [x, y, c],
      ];
    case 'down':
      return [
        [a, b, c],
        [x, b, c],
        [a, b, z],
        [x, b, z],
      ];
    case 'south':
      return [
        [a, b, z],
        [x, b, z],
        [a, y, z],
        [x, y, z],
      ];
    case 'north':
      return [
        [x, b, c],
        [a, b, c],
        [x, y, c],
        [a, y, c],
      ];
  }
}
function defaultUV(e: ModelElement, f: FaceName) {
  const [a, b, c] = e.from,
    [x, y, z] = e.to;
  switch (f) {
    case 'down':
      return [a, 16 - z, x, 16 - c];
    case 'up':
      return [a, c, x, z];
    case 'north':
      return [16 - x, 16 - y, 16 - a, 16 - b];
    case 'south':
      return [a, 16 - y, x, 16 - b];
    case 'west':
      return [c, 16 - y, z, 16 - b];
    case 'east':
      return [16 - z, 16 - y, 16 - c, 16 - b];
  }
}
function modeFor(name: string, texture: string): Mode {
  if (
    /(?:water|glass|ice|slime_block|honey_block)/.test(name) &&
    !/(packed_ice|blue_ice|tinted_glass)/.test(name)
  )
    return 'glass';
  if (
    /lava|glowstone|sea_lantern|shroomlight|froglight|lit_redstone|end_rod/.test(name) ||
    /(_on|_lit|lava_still|lava_flow)$/.test(texture)
  )
    return 'emissive';
  if (
    /leaves|sapling|flower|poppy|short_grass|tall_grass|fern|vine|rail|torch|door|trapdoor|chain|ladder|pane|bars|crop|wheat|bush|lily|roots|fire|cobweb|lichen|azalea|mushroom(?!_block)|seagrass|kelp|sprouts|tripwire|redstone_wire|cane|bamboo|mangrove_propagule/.test(
      name,
    ) ||
    /overlay/.test(texture)
  )
    return 'cutout';
  return 'opaque';
}
function tintFor(name: string, tinted: boolean, texture: string) {
  if (!tinted) return new THREE.Color('#ffffff');
  if (/banner/.test(name)) {
    const dyes: Record<string, string> = {
      white: '#f9fffe',
      orange: '#f9801d',
      magenta: '#c74ebd',
      light_blue: '#3ab3da',
      yellow: '#fed83d',
      lime: '#80c71f',
      pink: '#f38baa',
      gray: '#474f52',
      light_gray: '#9d9d97',
      cyan: '#169c9c',
      purple: '#8932b8',
      blue: '#3c44aa',
      brown: '#835432',
      green: '#5e7c16',
      red: '#b02e26',
      black: '#1d1d21',
    };
    const dye = name.split(':')[1].replace(/_(wall_)?banner$/, '');
    return new THREE.Color(dyes[dye] || '#ffffff');
  }
  if (/water/.test(name)) return new THREE.Color('#3f76e4');
  if (/spruce/.test(name)) return new THREE.Color('#619961');
  if (/birch/.test(name)) return new THREE.Color('#80a755');
  if (/redstone/.test(name)) return new THREE.Color('#dc2020');
  if (/leaves|vine/.test(name)) return new THREE.Color('#77ab2f');
  return new THREE.Color('#91bd59');
}
function cube(texture: string): ResolvedPart {
  const faces: any = {};
  for (const name of faceNames) faces[name] = { texture, cullface: name };
  return {
    variant: { model: 'builtin' },
    model: { elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces }], textures: {} },
  };
}
function compile(name: string, library: MinecraftLibrary): Compiled {
  const quads: Quad[] = [],
    { id } = parseState(name);
  let parts: ResolvedPart[];
  if (/:(water|lava)$/.test(id)) {
    const texture = `minecraft:block/${id.endsWith('water') ? 'water' : 'lava'}_still`;
    parts = [cube(texture)];
  } else parts = specialModel(name) || library.parts(name);
  if (parts.every((p) => !p.model.elements.length)) {
    const particle = parts[0]
      ? library.texture('#particle', parts[0].model.textures)
      : 'minecraft:missingno';
    const fallback =
      particle !== 'minecraft:missingno'
        ? particle
        : library.assets.textures[id.replace(':', ':block/')]
          ? id.replace(':', ':block/')
          : 'minecraft:missingno';
    parts = [cube(fallback)];
    library.missing.add(id);
  }
  let solid = false;
  for (const part of parts) {
    const variant = new THREE.Matrix4()
      .makeRotationY((-(part.variant.y || 0) * Math.PI) / 180)
      .multiply(new THREE.Matrix4().makeRotationX((-(part.variant.x || 0) * Math.PI) / 180));
    for (const element of part.model.elements) {
      if (!element.faces) continue;
      const matrix = variant.clone();
      if (element.rotation) {
        const r = element.rotation,
          origin = new THREE.Vector3(
            ...(r.origin.map((n) => n / 16 - 0.5) as [number, number, number]),
          ),
          axis = new THREE.Vector3(
            r.axis === 'x' ? 1 : 0,
            r.axis === 'y' ? 1 : 0,
            r.axis === 'z' ? 1 : 0,
          ),
          rotation = new THREE.Matrix4().makeRotationAxis(axis, (r.angle * Math.PI) / 180);
        if (r.rescale) {
          const scale = 1 / Math.cos((r.angle * Math.PI) / 180);
          rotation.scale(
            new THREE.Vector3(
              r.axis === 'x' ? 1 : scale,
              r.axis === 'y' ? 1 : scale,
              r.axis === 'z' ? 1 : scale,
            ),
          );
        }
        matrix
          .multiply(new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z))
          .multiply(rotation)
          .multiply(new THREE.Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z));
      }
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
      for (const [faceName, face] of Object.entries(element.faces) as [FaceName, ModelFace][]) {
        const faceIndex = faceNames.indexOf(faceName),
          texture = library.texture(
            face.texture,
            part.model.textures,
            part.variant.model.split(':')[0],
          ),
          surface = modeFor(id, texture),
          axis = faceIndex >> 1,
          paired = element.from[axis] === element.to[axis] && element.faces[faceNames[faceIndex ^ 1]],
          mode = surface === 'cutout' && paired ? 'cross' : surface;
        let uvRect = face.uv || defaultUV(element, faceName),
          uv = [
            [uvRect[0], uvRect[3]],
            [uvRect[2], uvRect[3]],
            [uvRect[0], uvRect[1]],
            [uvRect[2], uvRect[1]],
          ];
        let rotation = (face.rotation || 0) / 90;
        const normal = new THREE.Vector3(...(normals[faceIndex] as [number, number, number]))
          .applyMatrix3(normalMatrix)
          .normalize();
        if (part.variant.uvlock) {
          const finalIndex = normals.findIndex(
            (n) => normal.dot(new THREE.Vector3(...(n as [number, number, number]))) > 0.99,
          );
          if (finalIndex >= 0) {
            const original = corners({ from: [0, 0, 0], to: [16, 16, 16], faces: {} }, faceName),
              canonical = corners(
                { from: [0, 0, 0], to: [16, 16, 16], faces: {} },
                faceNames[finalIndex],
              ),
              u = new THREE.Vector3(...(original[1] as [number, number, number]))
                .sub(new THREE.Vector3(...(original[0] as [number, number, number])))
                .transformDirection(variant),
              targetU = new THREE.Vector3(...(canonical[1] as [number, number, number]))
                .sub(new THREE.Vector3(...(canonical[0] as [number, number, number])))
                .normalize(),
              targetV = new THREE.Vector3(...(canonical[2] as [number, number, number]))
                .sub(new THREE.Vector3(...(canonical[0] as [number, number, number])))
                .normalize();
            rotation += Math.round(Math.atan2(u.dot(targetV), u.dot(targetU)) / (Math.PI / 2));
          }
        }
        rotation = ((rotation % 4) + 4) % 4;
        for (let turn = 0; turn < rotation; turn++) uv = [uv[1], uv[3], uv[0], uv[2]];
        const points = corners(element, faceName).map((p) =>
          new THREE.Vector3(...(p as [number, number, number])).applyMatrix4(matrix).toArray(),
        );
        const cull = face.cullface
          ? new THREE.Vector3(
              ...(normals[faceNames.indexOf(face.cullface)] as [number, number, number]),
            )
              .transformDirection(variant)
              .toArray()
              .map((n) => Math.round(n))
          : undefined;
        quads.push({
          points,
          normal: normal.toArray(),
          uv,
          texture,
          color: tintFor(id, face.tintindex !== undefined || /:(water)$/.test(id), texture),
          mode,
          cull,
        });
        if (
          element.from.every((v) => v === 0) &&
          element.to.every((v) => v === 16) &&
          Object.keys(element.faces).length === 6 &&
          !element.rotation &&
          (mode === 'opaque' || mode === 'emissive')
        )
          solid = true;
      }
    }
  }
  return { quads, solid };
}
function atlasFor(
  compiled: Compiled[],
  library: MinecraftLibrary,
  overrides: Record<string, string>,
  changed: () => void,
) {
  const ids = [...new Set(compiled.flatMap((c) => c.quads.map((q) => q.texture)))],
    index = new Map(ids.map((id, i) => [id, i])),
    columns = Math.max(1, Math.ceil(Math.sqrt(ids.length))),
    rows = Math.max(1, Math.ceil(ids.length / columns)),
    pixel = ids.some((id) => id.includes(':entity/')) ? 64 : 16,
    tile = pixel + 4;
  const canvas = document.createElement('canvas');
  canvas.width = columns * tile;
  canvas.height = rows * tile;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  let pending = 0;
  const animations: ((seconds: number) => void)[] = [];
  const ready: Promise<void>[] = [];
  ids.forEach((id, i) => {
    const x = (i % columns) * tile + 2,
      y = Math.floor(i / columns) * tile + 2;
    ctx.fillStyle = '#272727';
    ctx.fillRect(x - 2, y - 2, tile, tile);
    ctx.fillStyle = '#aaaaaa';
    ctx.fillRect(x, y, 8, 8);
    ctx.fillRect(x + 8, y + 8, 8, 8);
    const source = library.textureData(id, overrides);
    if (!source) {
      library.missing.add(id);
      return;
    }
    pending++;
    ready.push(
      new Promise((resolve) => {
        const image = new Image();
        image.onload = () => {
          const metadata = library.assets.animations?.[id],
            frameHeight = metadata
              ? metadata.height || Math.min(image.width, image.height)
              : image.height,
            frameWidth = metadata?.width || image.width,
            frameCount = Math.max(1, Math.floor(image.height / frameHeight));
          const paint = (index: number) => {
            ctx.clearRect(x - 2, y - 2, tile, tile);
            ctx.drawImage(
              image,
              0,
              index * frameHeight,
              frameWidth,
              frameHeight,
              x,
              y,
              pixel,
              pixel,
            );
            ctx.drawImage(canvas, x, y, pixel, 1, x, y - 2, pixel, 2);
            ctx.drawImage(canvas, x, y + pixel - 1, pixel, 1, x, y + pixel, pixel, 2);
            ctx.drawImage(canvas, x, y, 1, pixel, x - 2, y, 2, pixel);
            ctx.drawImage(canvas, x + pixel - 1, y, 1, pixel, x + pixel, y, 2, pixel);
            for (const dx of [0, pixel - 1]) for (const dy of [0, pixel - 1])
              ctx.drawImage(canvas, x + dx, y + dy, 1, 1,
                dx ? x + pixel : x - 2, dy ? y + pixel : y - 2, 2, 2);
            texture.needsUpdate = true;
          };
          paint(0);
          if (metadata && frameCount > 1) {
            const frames = (
                metadata.frames?.length
                  ? metadata.frames
                  : Array.from({ length: frameCount }, (_, i) => i)
              ).map((frame) =>
                typeof frame === 'number'
                  ? { index: frame, time: metadata.frametime || 1 }
                  : { index: frame.index, time: frame.time || metadata.frametime || 1 },
              ),
              total = frames.reduce((n, f) => n + f.time, 0);
            let last = 0;
            animations.push((seconds) => {
              let tick = Math.floor(seconds * 20) % total;
              let index = 0;
              for (const frame of frames) {
                if (tick < frame.time) {
                  index = frame.index;
                  break;
                }
                tick -= frame.time;
              }
              index = Math.max(0, Math.min(frameCount - 1, index));
              if (index !== last) {
                paint(index);
                last = index;
              }
            });
          }
          pending--;
          changed();
          resolve();
        };
        image.onerror = () => {
          pending--;
          library.missing.add(id);
          resolve();
        };
        image.src = source;
      }),
    );
  });
  return {
    texture,
    ready: Promise.all(ready),
    animate: (seconds: number) => {
      for (const animation of animations) animation(seconds);
    },
    uv: (id: string, u: number, v: number) => {
      const i = index.get(id) || 0;
      return [
        ((i % columns) * tile + 2 + (u * pixel) / 16) / canvas.width,
        1 - (Math.floor(i / columns) * tile + 2 + (v * pixel) / 16) / canvas.height,
      ];
    },
  };
}
export function minecraftMesh(
  data: VoxelData,
  library: MinecraftLibrary,
  overrides: Record<string, string> = {},
  changed: () => void = () => {},
): THREE.Group {
  const compiled = data.palette.map((name) => compile(name, library)),
    foliage = data.palette.map(foliageKind),
    wind = foliage.some(Boolean) ? createFoliageWind() : undefined,
    atlas = atlasFor(compiled, library, overrides, changed),
    root = new THREE.Group();
  root.userData.ready = atlas.ready;
  root.userData.wind = wind?.set;
  root.userData.animate = (seconds: number) => {
    atlas.animate(seconds);
    wind?.time(seconds);
  };
  const materials: Record<Mode, THREE.MeshStandardMaterial> = {
    opaque: new THREE.MeshStandardMaterial({
      map: atlas.texture,
      vertexColors: true,
      roughness: 0.9,
      alphaTest: 0.5,
    }),
    cutout: new THREE.MeshStandardMaterial({
      map: atlas.texture,
      vertexColors: true,
      roughness: 0.95,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
    // Vanilla cross models have separately mapped front and back faces on the same plane.
    cross: new THREE.MeshStandardMaterial({
      map: atlas.texture,
      vertexColors: true,
      roughness: 0.95,
      alphaTest: 0.5,
      shadowSide: THREE.FrontSide,
    }),
    glass: new THREE.MeshStandardMaterial({
      map: atlas.texture,
      vertexColors: true,
      roughness: 0.12,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    emissive: new THREE.MeshStandardMaterial({
      map: atlas.texture,
      emissiveMap: atlas.texture,
      emissive: '#ffffff',
      emissiveIntensity: 1.35,
      vertexColors: true,
      roughness: 0.65,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    }),
  };
  const occupancy = new Map<string, number>();
  for (const [x, y, z, id] of data.blocks) occupancy.set(`${x},${y},${z}`, id);
  type Bucket = {
    p: number[];
    n: number[];
    uv: number[];
    color: number[];
    index: number[];
    cells: number[];
    mode: Mode;
    wind?: number[];
  };
  const buckets = new Map<string, Bucket>();
  for (const [x, y, z, id] of data.blocks) {
    const block = compiled[id];
    const movement = foliage[id];
    for (const quad of block.quads) {
      if (quad.cull) {
        const [cx, cy, cz] = quad.cull,
          neighbor = occupancy.get(`${x + cx},${y + cy},${z + cz}`);
        if (neighbor !== undefined && (compiled[neighbor].solid || neighbor === id)) continue;
      }
      const key = `${Math.floor(x / 16)},${Math.floor(y / 16)},${Math.floor(z / 16)},${quad.mode}${movement ? ':wind' : ''}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { p: [], n: [], uv: [], color: [], index: [], cells: [], mode: quad.mode, wind: movement ? [] : undefined };
        buckets.set(key, bucket);
      }
      const start = bucket.p.length / 3;
      for (let i = 0; i < 4; i++) {
        const point = quad.points[i];
        bucket.p.push(x + point[0], y + point[1], z + point[2]);
        bucket.n.push(...quad.normal);
        bucket.uv.push(...atlas.uv(quad.texture, ...(quad.uv[i] as [number, number])));
        bucket.color.push(quad.color.r, quad.color.g, quad.color.b);
        bucket.wind?.push(movement === 'canopy' ? 0.45 : THREE.MathUtils.clamp(point[1] + 0.5, 0, 1));
      }
      bucket.index.push(start, start + 1, start + 2, start + 2, start + 1, start + 3);
      bucket.cells.push(x, y, z);
    }
  }
  const movingMaterials = new Map<Mode, { surface: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial; distance: THREE.MeshDistanceMaterial }>();
  for (const bucket of buckets.values()) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.p, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.n, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uv, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(bucket.color, 3));
    geometry.setIndex(bucket.index);
    geometry.computeBoundingSphere();
    let moving = movingMaterials.get(bucket.mode);
    if (bucket.wind && wind) {
      geometry.setAttribute('voxelWindWeight', new THREE.Float32BufferAttribute(bucket.wind, 1));
      if (geometry.boundingSphere) geometry.boundingSphere.radius += 1.12;
      if (!moving) {
        const surface = materials[bucket.mode].clone();
        const cutout = { map: surface.map, alphaTest: surface.alphaTest, side: surface.side };
        moving = {
          surface,
          depth: new THREE.MeshDepthMaterial({ ...cutout, depthPacking: THREE.RGBADepthPacking }),
          distance: new THREE.MeshDistanceMaterial(cutout),
        };
        Object.values(moving).forEach(wind.install);
        movingMaterials.set(bucket.mode, moving);
      }
    }
    const mesh = new THREE.Mesh(geometry, bucket.wind ? moving!.surface : materials[bucket.mode]);
    if (bucket.wind && moving) {
      mesh.customDepthMaterial = moving.depth;
      mesh.customDistanceMaterial = moving.distance;
    }
    mesh.userData.voxelCells = Int32Array.from(bucket.cells);
    mesh.castShadow = bucket.mode !== 'glass';
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  root.userData.blockCount = data.blocks.length;
  return root;
}
