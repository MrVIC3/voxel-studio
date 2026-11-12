import type { Project } from './model';
import { upperFrame } from './time-index';
export function shotAtFrame(project: Project, frame: number) {
  const shots = project.shots || [];
  return shots[upperFrame(shots, frame) - 1];
}
export function cameraAtFrame(project: Project, frame: number): string | undefined {
  const camera = shotAtFrame(project, frame)?.cameraId || project.activeCameraId;
  return camera || project.objects.find((o) => o.type === 'camera' && o.visible)?.id;
}
