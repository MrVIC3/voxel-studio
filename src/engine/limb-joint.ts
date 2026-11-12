import * as THREE from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';

export const jointTrimPixels = 1;
export const jointPivot = 6 / 16;
export const socketCapPixels = 0.125;

export function skinSideRects(u: number, v: number, w: number, h: number, d: number) {
  return [
    [u + d + w, v + d, d, h],
    [u, v + d, d, h],
    [u + d, v + d, w, h],
    [u + 2 * d + w, v + d, w, h],
  ];
}

/** Build a textured bend between the two cut ends of a limb. */
export function limbJoint(
  lower: THREE.Object3D,
  dimensions: [number, number, number],
  uvOrigin: [number, number],
  texture: THREE.Texture,
  textureHeight: number,
  overlay: boolean,
  inflate: number,
  mirrored: boolean,
  socket?: THREE.Vector3,
) {
  const [w, h, d] = dimensions,
    [u, v] = uvOrigin;
  const width = (w / 16 + inflate) / 2,
    depth = (d / 16 + inflate) / 2;
  const trim = jointTrimPixels / 16;
  const corners = [
    [-width, -depth],
    [width, -depth],
    [width, depth],
    [-width, depth],
  ];
  const edges = [
    [2, 1],
    [0, 3],
    [3, 2],
    [1, 0],
  ];
  const geometry = new THREE.BufferGeometry();
  // Twelve points can generate at most twenty exterior triangles.
  const ringVertices = 24,
    capacity = ringVertices + 60;
  const positions = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(
    THREE.DynamicDrawUsage,
  );
  const uv = new THREE.BufferAttribute(new Float32Array(capacity * 2), 2).setUsage(
    THREE.DynamicDrawUsage,
  );
  const normals = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(
    THREE.DynamicDrawUsage,
  );
  const rects = skinSideRects(u, v, w, h, d);
  const rows = socket
    ? [socketCapPixels, (socketCapPixels + jointTrimPixels) / 2, jointTrimPixels]
    : [6 - jointTrimPixels, 6, 6 + jointTrimPixels];
  geometry.setAttribute('position', positions);
  geometry.setAttribute('normal', normals);
  geometry.setAttribute('uv', uv);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 1,
      side: THREE.DoubleSide,
      alphaTest: overlay ? 0.1 : 0,
    }),
  );
  mesh.name = lower.name + (socket ? ' Socket Surface' : ' Joint Surface');
  mesh.userData.bone = lower.name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const previous = new THREE.Matrix4().multiplyScalar(0);
  const halfTurn = new THREE.Quaternion(),
    halfScale = new THREE.Vector3();
  const inverse = new THREE.Quaternion(),
    localNormal = new THREE.Vector3();
  const ring = Array.from({ length: 12 }, () => new THREE.Vector3());
  const hull = new ConvexHull();
  const center = new THREE.Vector3(),
    point = new THREE.Vector3();
  const anchor = socket ?? new THREE.Vector3(0, -jointPivot, 0);
  const upperY = socket ? -socketCapPixels / 16 : trim;
  const lowerY = -trim;
  const update = () => {
    lower.updateMatrix();
    if (previous.equals(lower.matrix)) return;
    previous.copy(lower.matrix);
    halfTurn.identity().slerp(lower.quaternion, 0.5);
    halfScale.setScalar(1).lerp(lower.scale, 0.5);
    center.copy(anchor).lerp(lower.position, 0.5);
    if (socket) {
      point.set(0, lowerY, 0).multiply(lower.scale).applyQuaternion(lower.quaternion);
      center.addScaledVector(point, 0.5);
      center.y += upperY * 0.5;
    }
    corners.forEach(([x, z], corner) => {
      const px = mirrored ? -x : x;
      ring[corner].set(px + anchor.x, anchor.y + upperY, z + anchor.z);
      ring[4 + corner].set(px, 0, z).multiply(halfScale).applyQuaternion(halfTurn).add(center);
      ring[8 + corner].set(px, lowerY, z).applyMatrix4(lower.matrix);
    });
    edges.forEach((edge, face) =>
      edge.forEach((corner, index) => {
        for (let row = 0; row < 3; row++) {
          const v = ring[row * 4 + corner];
          positions.setXYZ(face * 6 + row * 2 + index, v.x, v.y, v.z);
        }
      }),
    );
    // The original fixed quads folded inward under extreme rotations. Use only the
    // exterior facets so inner triangles cannot cross a sleeve or armor surface.
    inverse.copy(halfTurn).invert();
    let index = ringVertices;
    for (const face of hull.setFromPoints(ring).faces) {
      const vertices = [
        face.edge.head().point,
        face.edge.next.head().point,
        face.edge.prev.head().point,
      ];
      const ids = vertices.map((v) => ring.indexOf(v));
      if (ids.every((i) => i < 4) || ids.every((i) => i >= 8)) continue;
      localNormal.copy(face.normal).applyQuaternion(inverse);
      if (mirrored) localNormal.x *= -1;
      const side =
        Math.abs(localNormal.x) > Math.abs(localNormal.z)
          ? localNormal.x >= 0
            ? 0
            : 1
          : localNormal.z >= 0
            ? 2
            : 3;
      const [x, y, faceWidth] = rects[side];
      vertices.forEach((vertex, i) => {
        const [cx, cz] = corners[ids[i] % 4];
        const right = [cz < 0, cz > 0, cx > 0, cx < 0][side];
        positions.setXYZ(index, vertex.x, vertex.y, vertex.z);
        normals.setXYZ(index, face.normal.x, face.normal.y, face.normal.z);
        uv.setXY(
          index,
          (x + (right ? faceWidth : 0)) / 64,
          1 - (y + rows[Math.floor(ids[i] / 4)]) / textureHeight,
        );
        index++;
      });
    }
    geometry.setDrawRange(ringVertices, index - ringVertices);
    positions.needsUpdate = true;
    normals.needsUpdate = true;
    uv.needsUpdate = true;
    (geometry.boundingBox ??= new THREE.Box3()).setFromPoints(ring);
    (geometry.boundingSphere ??= new THREE.Sphere()).setFromPoints(ring);
  };
  update();
  return { mesh, update };
}
