import * as THREE from 'three';
import type { Vec3 } from '../model';

/** Build a closed extrusion of the opaque texels, with outward-facing walls. */
export function extrudeItemSprite(pixels: Uint8ClampedArray, size: number): THREE.BufferGeometry {
  const positions: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const color = new THREE.Color();
  const front = 0.03,
    back = -front;
  const opaque = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < size && y < size && pixels[(y * size + x) * 4 + 3] >= 128;
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) => {
    const start = positions.length / 3;
    positions.push(...a, ...b, ...c, ...d);
    for (let corner = 0; corner < 4; corner++) colors.push(color.r, color.g, color.b);
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!opaque(x, y)) continue;
      const left = x / size - 0.5,
        right = (x + 1) / size - 0.5;
      const top = 0.5 - y / size,
        bottom = 0.5 - (y + 1) / size;
      const index = (y * size + x) * 4;
      color.setRGB(
        pixels[index] / 255,
        pixels[index + 1] / 255,
        pixels[index + 2] / 255,
        THREE.SRGBColorSpace,
      );

      // Counterclockwise as seen from outside. Transparent texels emit no geometry.
      quad([left, bottom, front], [right, bottom, front], [right, top, front], [left, top, front]);
      quad([right, bottom, back], [left, bottom, back], [left, top, back], [right, top, back]);
      if (!opaque(x - 1, y))
        quad([left, bottom, back], [left, bottom, front], [left, top, front], [left, top, back]);
      if (!opaque(x + 1, y))
        quad(
          [right, bottom, front],
          [right, bottom, back],
          [right, top, back],
          [right, top, front],
        );
      if (!opaque(x, y - 1))
        quad([left, top, front], [right, top, front], [right, top, back], [left, top, back]);
      if (!opaque(x, y + 1))
        quad(
          [left, bottom, back],
          [right, bottom, back],
          [right, bottom, front],
          [left, bottom, front],
        );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function itemMesh(source: string | undefined, changed: () => void): THREE.Group {
  const root = new THREE.Group();
  root.userData.ready = new Promise<void>((resolve) => {
    if (!source) {
      resolve();
      return;
    }
    const image = new Image();
    image.onerror = () => resolve();
    image.onload = () => {
      const size = Math.min(image.width, image.height, 64);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx || !size) {
        resolve();
        return;
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        image,
        0,
        0,
        image.width,
        Math.min(image.width, image.height),
        0,
        0,
        size,
        size,
      );
      const geometry = extrudeItemSprite(ctx.getImageData(0, 0, size, size).data, size);
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15 }),
      );
      mesh.castShadow = mesh.receiveShadow = true;
      root.add(mesh);
      changed();
      resolve();
    };
    image.src = source;
  });
  return root;
}
