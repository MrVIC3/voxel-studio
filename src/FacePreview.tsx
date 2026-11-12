import { useEffect, useRef } from 'react';
import type { PointerEvent } from 'react';
import { Sun } from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { characterMesh, disposeObject } from './engine/assets';
import { setCharacterFace } from './engine/face-rig';
import {
  characterLightOffset,
  characterMeshTargets,
  setCharacterLook,
} from './engine/character-look';
import { RenderPipeline } from './engine/RenderPipeline';
import type { FacePose, FaceRigConfig } from './face';
import type { BoneName, SceneObject, Transform } from './model';
import { lookDefaults } from './character-look';
import type { CharacterLook, LookPart } from './character-look';
import type { HighlightPick } from './CharacterLookPanel';

export type FaceAngle = 'front' | 'three-quarter' | 'profile';
const images = new WeakMap<object, ImageData>();
function sampleTexture(hit: THREE.Intersection) {
  if (
    !(hit.object instanceof THREE.Mesh) ||
    !(hit.object.material instanceof THREE.MeshStandardMaterial)
  )
    return;
  const material = hit.object.material,
    map = material.map,
    uv = hit.uv;
  const color = material.color.clone();
  if (material.vertexColors && hit.face && hit.object.geometry.attributes.color)
    color.multiply(
      new THREE.Color().fromBufferAttribute(hit.object.geometry.attributes.color, hit.face.a),
    );
  if (map?.image && uv) {
    const image = map.image as CanvasImageSource & { width: number; height: number };
    try {
      let pixels = images.get(image);
      if (!pixels) {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(image, 0, 0);
        pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        images.set(image, pixels);
      }
      const coordinate = map.transformUv(uv.clone());
      const x = THREE.MathUtils.clamp(Math.floor(coordinate.x * pixels.width), 0, pixels.width - 1);
      const y = THREE.MathUtils.clamp(
        Math.floor(coordinate.y * pixels.height),
        0,
        pixels.height - 1,
      );
      const i = (y * pixels.width + x) * 4;
      if (pixels.data[i + 3] / 255 < material.alphaTest) return;
      color.multiply(
        new THREE.Color().setRGB(
          pixels.data[i] / 255,
          pixels.data[i + 1] / 255,
          pixels.data[i + 2] / 255,
          THREE.SRGBColorSpace,
        ),
      );
    } catch {
      return;
    }
  }
  return '#' + color.getHexString();
}
export function FacePreview({
  actor,
  skin,
  config,
  pose,
  angle,
  fullBody = false,
  textures,
  look = actor.characterLook,
  showLight = false,
  pick,
  onPick,
  onLight,
  bodyPose,
}: {
  actor: SceneObject;
  skin?: string;
  config: FaceRigConfig;
  pose: FacePose;
  angle: FaceAngle;
  fullBody?: boolean;
  textures?: Record<string, string>;
  look?: CharacterLook;
  showLight?: boolean;
  pick?: HighlightPick;
  onPick?: (part: LookPart, color?: string) => void;
  onLight?: (look: CharacterLook, commit: boolean) => void;
  bodyPose?: Record<BoneName, Transform>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLButtonElement>(null);
  const guide = useRef<SVGLineElement>(null);
  const session = useRef<{
    update: () => void;
    view: () => void;
    choose: (x: number, y: number) => void;
    aim: (x: number, y: number, look: CharacterLook) => Partial<CharacterLook>;
  } | null>(null);
  const state = useRef({ config, pose, angle, look, pick, onPick, bodyPose });
  state.current = { config, pose, angle, look, pick, onPick, bodyPose };
  const dragging = useRef<{
    look: CharacterLook;
    x: number;
    y: number;
    dx: number;
    dy: number;
    moved: boolean;
  } | null>(null);
  useEffect(() => {
    const element = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      element.textContent =
        'The face preview could not start. Your facial keys are still editable.';
      return () => {
        element.textContent = '';
      };
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor('#232323');
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.AgXToneMapping;
    element.append(renderer.domElement);
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(30, 1, 0.02, 20);
    const orbit = new OrbitControls(camera, renderer.domElement);
    const ray = new THREE.Raycaster(),
      pivot = new THREE.Vector3(0, fullBody ? 1 : 0.25, 0);
    const project = new THREE.Vector3(),
      offset = new THREE.Vector3(),
      plane = new THREE.Plane();
    const pointer = (x: number, y: number) => {
      const box = element.getBoundingClientRect();
      ray.setFromCamera(
        new THREE.Vector2(
          ((x - box.left) / box.width) * 2 - 1,
          1 - ((y - box.top) / box.height) * 2,
        ),
        camera,
      );
    };
    const guideRadius = (look: CharacterLook) =>
      look.type === 'point' ? Math.min(2.3, look.distance ?? lookDefaults.distance) : 1.45;
    const drawGuide = () => {
      const look = state.current.look,
        button = marker.current,
        line = guide.current;
      if (!look || !button || !line || !element.clientWidth || !element.clientHeight) return;
      const screen = (position: THREE.Vector3) => {
        position.project(camera);
        return [
          THREE.MathUtils.clamp(
            (position.x + 1) * 0.5 * element.clientWidth,
            20,
            element.clientWidth - 20,
          ),
          THREE.MathUtils.clamp(
            (1 - position.y) * 0.5 * element.clientHeight,
            20,
            element.clientHeight - 20,
          ),
        ];
      };
      const [x, y] = screen(
        characterLightOffset(look, project).multiplyScalar(guideRadius(look)).add(pivot),
      );
      const [cx, cy] = screen(project.copy(pivot));
      button.style.left = x + 'px';
      button.style.top = y + 'px';
      line.setAttribute('x1', String(cx));
      line.setAttribute('y1', String(cy));
      line.setAttribute('x2', String(x));
      line.setAttribute('y2', String(y));
    };
    orbit.enablePan = false;
    orbit.minDistance = 0.63;
    orbit.maxDistance = fullBody ? 11 : 5;
    const fill = new THREE.HemisphereLight('#ffffff', '#888888', 1.45);
    const key = new THREE.DirectionalLight('#fff7ef', 2.0);
    key.position.set(2, 3, 4);
    scene.add(fill, key);
    let dead = false;
    let outlinePreview: RenderPipeline | undefined;
    let head: THREE.Object3D | undefined,
      parent: THREE.Object3D | null = null;
    const rig = characterMesh(
      actor,
      () => {},
      skin,
      (material, leggings) =>
        textures?.[
          `minecraft:entity/equipment/${leggings ? 'humanoid_leggings' : 'humanoid'}/${material}`
        ] || textures?.[`minecraft:models/armor/${material}_layer_${leggings ? 2 : 1}`],
    );
    const draw = () => {
      if (dead) return;
      if (
        head &&
        state.current.look?.outline &&
        state.current.look.enabled !== false &&
        element.clientWidth &&
        element.clientHeight
      ) {
        if (!outlinePreview) {
          outlinePreview = new RenderPipeline(
            renderer,
            scene,
            camera,
            key,
            undefined,
            undefined,
            () => (head ? [fullBody ? rig : head] : []),
          );
          outlinePreview.configure({ ao: false, bloom: false }, 'balanced');
        }
        outlinePreview.render(camera, element.clientWidth, element.clientHeight);
      } else renderer.render(scene, camera);
      drawGuide();
    };
    const update = () => {
      if (dead || !head) return;
      if (state.current.bodyPose) {
        for (const [bone, transform] of Object.entries(state.current.bodyPose)) {
          const node = rig.getObjectByName(bone);
          if (!node) continue;
          node.position.fromArray(transform.position);
          if (node.userData.rest) node.position.add(node.userData.rest);
          node.rotation.set(...transform.rotation);
          node.scale.fromArray(transform.scale);
        }
        rig.userData.updateJoints?.();
      }
      setCharacterFace(rig, state.current.config, state.current.pose);
      orbit.enabled = !state.current.pick;
      setCharacterLook(fullBody ? rig : head, state.current.look, pivot.y);
      draw();
    };
    const view = () => {
      const yaw =
        state.current.angle === 'front'
          ? 0
          : state.current.angle === 'profile'
            ? Math.PI / 2
            : 0.57;
      const distance = (fullBody ? 4.55 : 1.6) / Math.min(camera.aspect, 1);
      camera.position.set(
        Math.sin(yaw) * distance,
        fullBody ? 1.29 : 0.32,
        Math.cos(yaw) * distance,
      );
      orbit.target.set(0, fullBody ? 1 : 0.25, 0);
      orbit.update();
      draw();
    };
    const choose = (x: number, y: number) => {
      if (!state.current.pick || !head) return;
      pointer(x, y);
      for (const hit of ray.intersectObject(fullBody ? rig : head, true)) {
        let node: THREE.Object3D | null = hit.object;
        while (node?.visible) node = node.parent;
        if (node) continue;
        const color = sampleTexture(hit);
        if (!color) continue;
        const targets = characterMeshTargets(hit.object);
        const target = targets[0] === 'skin' ? (targets[1] ?? 'skin') : targets[0];
        state.current.onPick?.(target, state.current.pick === 'color' ? color : undefined);
        break;
      }
    };
    const aim = (x: number, y: number, look: CharacterLook) => {
      pointer(x, y);
      const origin = characterLightOffset(look, project)
        .multiplyScalar(guideRadius(look))
        .add(pivot);
      plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(offset), origin);
      if (!ray.ray.intersectPlane(plane, offset)) return {};
      offset.sub(pivot).normalize();
      if (!offset.lengthSq()) return {};
      return {
        yaw: THREE.MathUtils.radToDeg(Math.atan2(offset.x, offset.z)),
        pitch: THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(Math.asin(offset.y)), -85, 85),
      };
    };
    session.current = { update, view, choose, aim };
    orbit.addEventListener('change', draw);
    const resize = new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = element;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      view();
    });
    resize.observe(element);
    const ready = Promise.resolve(rig.userData.ready);
    void ready.then(() => {
      if (dead) return;
      head = rig.getObjectByName('head');
      if (!head) return;
      if (fullBody) scene.add(rig);
      else {
        parent = head.parent;
        head.position.set(0, 0, 0);
        scene.add(head);
      }
      update();
    });
    view();
    return () => {
      dead = true;
      session.current = null;
      resize.disconnect();
      orbit.dispose();
      outlinePreview?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      void ready.then(() => {
        if (head) parent?.add(head);
        disposeObject(rig);
      });
    };
  }, [
    actor.id,
    actor.skin,
    actor.slim,
    actor.armor,
    actor.characterLayers,
    skin,
    fullBody,
    textures,
  ]);
  useEffect(() => {
    session.current?.update();
  }, [pose, config, look, showLight, pick, bodyPose]);
  useEffect(() => {
    session.current?.view();
  }, [angle]);
  const moveLight = (event: PointerEvent<HTMLButtonElement>, commit: boolean) => {
    const start = dragging.current;
    if (!start || !onLight) return;
    start.moved ||= Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 2;
    if (start.moved) {
      const change =
        event.shiftKey && start.look.type === 'point'
          ? {
              distance: THREE.MathUtils.clamp(
                (start.look.distance ?? lookDefaults.distance) *
                  Math.exp((start.y - event.clientY) * 0.012),
                0.35,
                12,
              ),
            }
          : session.current?.aim(event.clientX + start.dx, event.clientY + start.dy, start.look);
      onLight({ ...start.look, ...change }, commit);
    }
    if (commit) dragging.current = null;
  };
  return (
    <div
      className="face-preview"
      ref={host}
      aria-label="Live 3D character preview"
      data-picking={!!pick}
      onPointerUp={(event) => {
        if (event.target instanceof HTMLCanvasElement)
          session.current?.choose(event.clientX, event.clientY);
      }}
    >
      {showLight && look && look.enabled !== false && !pick && (
        <>
          <svg className="character-light-guide" aria-hidden="true">
            <line ref={guide} />
          </svg>
          <button
            ref={marker}
            type="button"
            className="character-light-gizmo"
            aria-label="Move character light"
            title="Drag to aim the light. Shift-drag a point light to change distance."
            disabled={actor.locked}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              const box = event.currentTarget.getBoundingClientRect();
              dragging.current = {
                look,
                x: event.clientX,
                y: event.clientY,
                dx: box.x + box.width / 2 - event.clientX,
                dy: box.y + box.height / 2 - event.clientY,
                moved: false,
              };
            }}
            onPointerMove={(event) => moveLight(event, false)}
            onPointerUp={(event) => moveLight(event, true)}
            onPointerCancel={() => {
              if (dragging.current) onLight?.(dragging.current.look, false);
              dragging.current = null;
            }}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
              event.preventDefault();
              event.stopPropagation();
              const yaw =
                look.yaw + (event.key === 'ArrowLeft' ? -5 : event.key === 'ArrowRight' ? 5 : 0);
              const pitch =
                look.pitch + (event.key === 'ArrowDown' ? -5 : event.key === 'ArrowUp' ? 5 : 0);
              onLight?.(
                {
                  ...look,
                  yaw: THREE.MathUtils.euclideanModulo(yaw + 180, 360) - 180,
                  pitch: THREE.MathUtils.clamp(pitch, -85, 85),
                },
                true,
              );
            }}
          >
            <Sun size={19} />
          </button>
        </>
      )}
    </div>
  );
}
