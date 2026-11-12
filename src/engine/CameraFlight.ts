import { Euler, Vector3 } from 'three';
import type { PerspectiveCamera } from 'three';

/** Local viewport navigation; listeners exist only while flying. No pointer lock. */
export class CameraFlight {
  private keys = new Set<string>();
  private pointer = -1;
  private orientation = new Euler(0, 0, 0, 'YXZ');
  private previous = 0;
  private speed = 5;
  private active = false;
  private listeners?: AbortController;
  private direction = new Vector3();
  constructor(
    private element: HTMLCanvasElement,
    private camera: PerspectiveCamera,
    private invalidate: () => void,
  ) {}
  private key = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement,
      key = event.key.toLowerCase();
    if (event.type === 'keyup') {
      this.keys.delete(key);
      return;
    }
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      target?.closest('input, textarea, select, [contenteditable], [role=dialog]')
    )
      return;
    if (!['w', 'a', 's', 'd', 'q', 'e', 'shift'].includes(key)) return;
    this.keys.add(key);
    event.preventDefault();
    event.stopPropagation();
  };
  private down = (event: PointerEvent) => {
    if (event.button !== 2) return;
    this.pointer = event.pointerId;
    this.element.setPointerCapture(this.pointer);
    event.preventDefault();
  };
  private up = (event: PointerEvent) => {
    if (event.pointerId === this.pointer) this.pointer = -1;
  };
  private move = (event: PointerEvent) => {
    if (this.pointer !== event.pointerId) return;
    this.orientation.setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.orientation.y -= event.movementX * 0.004;
    this.orientation.x = Math.max(
      -1.55,
      Math.min(1.55, this.orientation.x - event.movementY * 0.004),
    );
    this.camera.quaternion.setFromEuler(this.orientation);
    this.invalidate();
  };
  private wheel = (event: WheelEvent) => {
    event.preventDefault();
    this.speed = Math.max(0.5, Math.min(60, this.speed * Math.exp(-event.deltaY * 0.002)));
  };
  private clear = () => {
    this.keys.clear();
    this.pointer = -1;
  };
  private context = (event: Event) => event.preventDefault();
  setActive(active: boolean) {
    if (active === this.active) return;
    this.active = active;
    this.listeners?.abort();
    this.listeners = undefined;
    if (this.pointer >= 0 && this.element.hasPointerCapture(this.pointer))
      this.element.releasePointerCapture(this.pointer);
    this.clear();
    this.previous = 0;
    if (!active) return;
    this.listeners = new AbortController();
    const { signal } = this.listeners;
    window.addEventListener('keydown', this.key, { capture: true, signal });
    window.addEventListener('keyup', this.key, { capture: true, signal });
    window.addEventListener('blur', this.clear, { signal });
    this.element.addEventListener('pointerdown', this.down, { signal });
    this.element.addEventListener('pointerup', this.up, { signal });
    this.element.addEventListener('pointercancel', this.up, { signal });
    this.element.addEventListener('lostpointercapture', this.up, { signal });
    this.element.addEventListener('pointermove', this.move, { signal });
    this.element.addEventListener('contextmenu', this.context, { signal });
    this.element.addEventListener('wheel', this.wheel, { passive: false, signal });
  }
  update(now: number) {
    if (!this.active) return;
    const dt = this.previous ? Math.min(0.05, (now - this.previous) / 1000) : 0;
    this.previous = now;
    const k = (key: string) => Number(this.keys.has(key)),
      x = k('d') - k('a'),
      y = k('e') - k('q'),
      z = k('s') - k('w');
    if (!x && !y && !z) return;
    this.direction.set(x, 0, z).applyQuaternion(this.camera.quaternion);
    this.direction.y += y;
    this.camera.position.addScaledVector(
      this.direction.normalize(),
      dt * this.speed * (this.keys.has('shift') ? 3 : 1),
    );
    this.invalidate();
  }
  dispose() {
    this.setActive(false);
  }
}
