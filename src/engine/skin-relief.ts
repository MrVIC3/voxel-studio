import * as THREE from 'three';

export type SkinPixels = { data: Uint8ClampedArray; width: number; height: number };
export function readSkinPixels(image: CanvasImageSource, height: number): SkinPixels | undefined {
  if (!image || typeof document === 'undefined') return;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0, 64, height);
    return ctx.getImageData(0, 0, 64, height);
  } catch {
    return;
  }
}

/** Extrude selected texels from a rigged box; emit walls only at exposed edges. */
export function skinRelief(
  box: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>,
  pixels: SkinPixels,
  depth: number,
  mask: (r: number, g: number, b: number, face: number, row: number) => boolean = () => true,
) {
  if (depth <= 0) return;
  const source = box.geometry.attributes.position,
    uv = box.geometry.attributes.uv;
  const positions: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const a = new THREE.Vector3(),
    right = new THREE.Vector3(),
    down = new THREE.Vector3(),
    normal = new THREE.Vector3();
  const vertex = new THREE.Vector3(),
    color = new THREE.Color();
  const faces = new Set(Array.from(box.geometry.index!.array, (n) => Math.floor(n / 4)));
  for (const face of faces) {
    const id = face * 4;
    a.fromBufferAttribute(source, id);
    right.fromBufferAttribute(source, id + 1).sub(a);
    down.fromBufferAttribute(source, id + 2).sub(a);
    normal.crossVectors(down, right).normalize();
    const u = Math.round(uv.getX(id) * pixels.width),
      v = Math.round((1 - uv.getY(id)) * pixels.height);
    const w = Math.round((uv.getX(id + 1) - uv.getX(id)) * pixels.width);
    const h = Math.round((uv.getY(id) - uv.getY(id + 2)) * pixels.height);
    if (w < 1 || h < 1) continue;
    const selected = (x: number, y: number) => {
      if (x < 0 || x >= w || y < 0 || y >= h) return false;
      const i = ((v + y) * pixels.width + u + x) * 4,
        p = pixels.data;
      return p[i + 3] > 126 && mask(p[i], p[i + 1], p[i + 2], face, y);
    };
    const quad = (corners: number[][], shade: number) => {
      const offset = positions.length / 3;
      for (const [x, y, z] of corners) {
        vertex
          .copy(a)
          .addScaledVector(right, x / w)
          .addScaledVector(down, y / h)
          .addScaledVector(normal, z);
        positions.push(vertex.x, vertex.y, vertex.z);
        colors.push(color.r * shade, color.g * shade, color.b * shade);
      }
      indices.push(offset, offset + 2, offset + 1, offset + 1, offset + 2, offset + 3);
    };
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!selected(x, y)) continue;
        const i = ((v + y) * pixels.width + u + x) * 4,
          p = pixels.data;
        color.setRGB(p[i] / 255, p[i + 1] / 255, p[i + 2] / 255, THREE.SRGBColorSpace);
        quad(
          [
            [x, y, depth],
            [x + 1, y, depth],
            [x, y + 1, depth],
            [x + 1, y + 1, depth],
          ],
          1,
        );
        // Start the side walls just inside the source box so the relief sits flush.
        const inset = -0.001;
        if (!selected(x - 1, y))
          quad(
            [
              [x, y, inset],
              [x, y, depth],
              [x, y + 1, inset],
              [x, y + 1, depth],
            ],
            0.76,
          );
        if (!selected(x + 1, y))
          quad(
            [
              [x + 1, y, depth],
              [x + 1, y, inset],
              [x + 1, y + 1, depth],
              [x + 1, y + 1, inset],
            ],
            0.76,
          );
        if (!selected(x, y - 1))
          quad(
            [
              [x, y, inset],
              [x + 1, y, inset],
              [x, y, depth],
              [x + 1, y, depth],
            ],
            0.88,
          );
        if (!selected(x, y + 1))
          quad(
            [
              [x, y + 1, depth],
              [x + 1, y + 1, depth],
              [x, y + 1, inset],
              [x + 1, y + 1, inset],
            ],
            0.68,
          );
      }
  }
  if (!indices.length) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide }),
  );
  mesh.position.copy(box.position);
  mesh.scale.copy(box.scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
