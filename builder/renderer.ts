import * as THREE from 'three';
import { MinecraftLibrary, decodeMinecraftAssets } from '../src/engine/minecraft';
import { minecraftMesh } from '../src/engine/minecraft-mesh';
import { disposeObject } from '../src/engine/assets';
import type { VoxelData, Vec3 } from '../src/model';

type Request = VoxelData & {
  bounds: { min: Vec3; max: Vec3 };
  views: string[];
  size: [number, number];
  night: boolean;
  camera?: { position: Vec3; target: Vec3; fov?: number };
  meshKey: string;
  reuse?: boolean;
  lighting?: { sun?: Vec3; intensity?: number; ambient?: number };
};
const status = document.querySelector('#status')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setPixelRatio(1);
document.body.appendChild(renderer.domElement);
const ready = (async () => {
  const response = await fetch('/minecraft.jar');
  if (!response.ok)
    throw Error('Install Java 1.21.11 or set VOXEL_BUILD_ASSETS to its vanilla client JAR');
  const assets = decodeMinecraftAssets(
    new Uint8Array(await response.arrayBuffer()),
    '1.21.11',
    'Installed Minecraft JAR',
  );
  status.textContent = 'Voxel Build · Ready for Codex';
  return assets;
})();
ready.catch((e) => {
  status.textContent = e.message;
});
// One bounded resident scene: new camera/light requests reuse exactly the same geometry.
let cached: { key: string; mesh: THREE.Object3D; library: MinecraftLibrary } | undefined;
async function render(request: Request) {
  const started = performance.now();
  const assets = await ready;
  const [width, height] = request.size;
  if (![width, height].every((n) => Number.isInteger(n) && n >= 256 && n <= 2048))
    throw Error('Render dimensions must be 256..2048');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(request.night ? '#152333' : '#aac7d7');
  const light=request.lighting;
  if(light&&([...(light.sun||[0,1,0]),light.intensity??3,light.ambient??2.2].some(v=>!Number.isFinite(v))||Math.hypot(...(light.sun||[0,1,0]))===0||(light.intensity??3)<0||(light.intensity??3)>10||(light.ambient??2.2)<0||(light.ambient??2.2)>10))throw Error('Invalid preview lighting');
  const ambient = new THREE.HemisphereLight('#e2efff', '#81705c', light?.ambient ?? (request.night ? 0.55 : 2.2));
  const sun = new THREE.DirectionalLight(
    request.night ? '#a8c8ff' : '#fff0d6',
    light?.intensity ?? (request.night ? 0.8 : 3.0),
  );
  sun.position.fromArray(light?.sun || [-60,100,40]);
  scene.add(ambient, sun);
  // Integer Minecraft coordinates denote cell corners; the reused mesh uses cell centers.
  const origin = request.bounds.min;
  const meshStarted = performance.now(), meshCacheHit = request.reuse !== false && cached?.key === request.meshKey;
  if (!meshCacheHit) {
    if (cached) { disposeObject(cached.mesh); cached = undefined; }
    const library = new MinecraftLibrary(assets);
    const data = {
      palette: request.palette,
      blocks: request.blocks.map(([x, y, z, i]) =>
        [x - origin[0], y - origin[1], z - origin[2], i] as [number, number, number, number]),
    };
    const mesh = minecraftMesh(data, library);
    try { await mesh.userData.ready; }
    catch (e) { disposeObject(mesh); throw e; }
    cached = { key: request.meshKey, mesh, library };
  }
  const { mesh, library } = cached!;
  const meshMs = performance.now() - meshStarted;
  scene.add(mesh);
  const size = new THREE.Vector3(...(request.bounds.max.map((n, i) => n - origin[i] + 1) as Vec3));
  const target = size.clone().subScalar(1).multiplyScalar(0.5),
    distance = size.length() * 1.45;
  renderer.setSize(width, height);
  const images = [];
  const columns = Math.min(2, request.views.length), rows = Math.ceil(request.views.length / columns);
  const sheet = document.createElement('canvas');
  const tileWidth = Math.min(800, width), tileHeight = Math.round(height * tileWidth / width);
  sheet.width = columns * tileWidth;
  sheet.height = rows * (tileHeight + 28);
  const ctx = sheet.getContext('2d')!;
  ctx.fillStyle = '#14202b'; ctx.fillRect(0, 0, sheet.width, sheet.height);
  try {
    for (const view of request.views) {
      let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
      if (view === 'perspective' || view === 'interior') {
        const c = new THREE.PerspectiveCamera(
          request.camera?.fov || 45,
          width / height,
          0.05,
          Math.max(2000, distance * 5),
        );
        if (request.camera) {
          if (![...request.camera.position, ...request.camera.target].every(Number.isFinite))
            throw Error('Invalid camera coordinates');
          c.position.fromArray(request.camera.position.map((v, i) => v - origin[i] - 0.5) as Vec3);
          c.lookAt(
            new THREE.Vector3(
              ...(request.camera.target.map((v, i) => v - origin[i] - 0.5) as Vec3),
            ),
          );
        } else {
          c.position
            .copy(target)
            .add(new THREE.Vector3(1, 0.7, -1).normalize().multiplyScalar(distance));
          c.lookAt(target);
        }
        camera = c;
      } else {
        const axis = view === 'top' ? 'y' : view === 'left' || view === 'right' ? 'x' : 'z';
        const horizontal = axis === 'x' ? size.z : size.x,
          vertical = axis === 'y' ? size.z : size.y;
        const half = Math.max(vertical / 2, horizontal / 2 / (width / height)) * 1.12;
        const c = new THREE.OrthographicCamera(
          (-half * width) / height,
          (half * width) / height,
          half,
          -half,
          0.05,
          distance * 5 + 2000,
        );
        const offsets: Record<string, Vec3> = {
          front: [0, 0, -distance],
          back: [0, 0, distance],
          left: [-distance, 0, 0],
          right: [distance, 0, 0],
          top: [0, distance, 0],
        };
        c.position.copy(target).add(new THREE.Vector3(...offsets[view]));
        if (view === 'top') c.up.set(0, 0, -1);
        c.lookAt(target);
        camera = c;
      }
      renderer.render(scene, camera);
      images.push({ view, png: renderer.domElement.toDataURL('image/png').split(',')[1] });
      const index = images.length - 1, x = (index % columns) * tileWidth, y = Math.floor(index / columns) * (tileHeight + 28);
      ctx.fillStyle = '#edf3fa'; ctx.font = '18px sans-serif'; ctx.fillText(view, x + 10, y + 21);
      ctx.drawImage(renderer.domElement, x, y + 28, tileWidth, tileHeight);
    }
    return { images, contactSheet: sheet.toDataURL('image/png').split(',')[1], missing: [...library.missing].sort(), assets: assets.version,
      metrics: { meshCacheHit, meshMs: Math.round(meshMs), totalMs: Math.round(performance.now() - started), blocks: request.blocks.length } };
  } finally {
    scene.clear();
    renderer.renderLists.dispose();
  }
}
(window as unknown as { buildEngine: unknown }).buildEngine = { render };
