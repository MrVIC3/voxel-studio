import { getTransform, identity } from './model';
import type { Keyframe, Project, SceneObject, Vec3 } from './model';
import { MAX_IMPORT_BLOCKS, MAX_PROJECT_BLOCKS } from './import-limits';

export function stageFor(project: Project, actor: SceneObject) {
  return project.objects.find(
    (object) => object.id === actor.parentId && object.placement === true,
  );
}

export function createStage(
  project: Project,
  actor: SceneObject,
  frame: number,
  id: string,
): Project {
  if (
    actor.type !== 'character' ||
    actor.locked ||
    stageFor(project, actor) ||
    project.objects.length >= 500
  )
    return project;
  const origin = getTransform(project, { id: actor.id }, frame).position;
  const stage: SceneObject = {
    id,
    name: `${actor.name.slice(0, 70)} · Movement`,
    type: 'group',
    visible: true,
    placement: true,
    parentId: actor.parentId,
    parentBone: actor.parentBone,
    transform: { ...identity(), position: [...origin] },
  };
  const rebase = <T extends { position: Vec3 }>(value: T): T => ({
    ...value,
    position: value.position.map((n, i) => n - origin[i]) as Vec3,
  });
  return {
    ...project,
    objects: [
      ...project.objects.map((object) =>
        object.id === actor.id
          ? { ...object, parentId: id, parentBone: undefined, transform: rebase(object.transform) }
          : object,
      ),
      stage,
    ],
    tracks: project.tracks[actor.id]
      ? {
          ...project.tracks,
          [actor.id]: project.tracks[actor.id].map(rebase),
        }
      : project.tracks,
  };
}

export function routeKeys(
  points: Vec3[],
  start: number,
  length: number,
  base: Keyframe,
  facing?: number,
) {
  const distances = [0];
  for (let i = 1; i < points.length; i++)
    distances.push(distances[i - 1] + Math.hypot(...points[i].map((n, j) => n - points[i - 1][j])));
  const total = distances.at(-1) || 0;
  if (points.length < 2 || total < 0.01 || length < points.length - 1) return [];
  let previous = start - 1,
    yaw = base.rotation[1];
  return points.map((position, index): Keyframe => {
    const frame = Math.min(
      start + length - (points.length - 1 - index),
      Math.max(previous + 1, start + Math.round((length * distances[index]) / total)),
    );
    previous = frame;
    const a = points[Math.min(index, points.length - 2)],
      b = points[Math.min(index + 1, points.length - 1)];
    if (facing !== undefined && Math.hypot(b[0] - a[0], b[2] - a[2]) > 0.001) {
      const desired = Math.atan2(b[0] - a[0], b[2] - a[2]) - facing;
      yaw += Math.atan2(Math.sin(desired - yaw), Math.cos(desired - yaw));
    }
    return {
      ...base,
      position,
      rotation: [base.rotation[0], yaw, base.rotation[2]],
      frame,
      interpolation: 'linear',
    };
  });
}

export function editVoxel(
  project: Project,
  id: string,
  cell: Vec3,
  block?: string,
  mode?: 'place' | 'replace' | 'remove',
): Project {
  const build = project.objects.find((object) => object.id === id);
  if (
    build?.type !== 'build' ||
    build.locked ||
    !build.voxels ||
    cell.some((n) => !Number.isInteger(n) || Math.abs(n) > 1e6)
  )
    return project;
  const { palette, blocks } = build.voxels;
  const index = blocks.findIndex(([x, y, z]) => x === cell[0] && y === cell[1] && z === cell[2]);
  if ((mode === 'place' && index >= 0) || (mode === 'replace' && index < 0)) return project;
  let nextPalette = palette;
  let nextBlocks;
  if (!block) {
    if (index < 0) return project;
    nextBlocks = blocks.filter((_, i) => i !== index);
  } else {
    let material = palette.indexOf(block);
    if (index >= 0 && blocks[index][3] === material) return project;
    if (
      index < 0 &&
      (blocks.length >= MAX_IMPORT_BLOCKS ||
        project.objects.reduce((n, object) => n + (object.voxels?.blocks.length || 0), 0) >=
          MAX_PROJECT_BLOCKS)
    )
      return project;
    if (material < 0) {
      if (palette.length >= 4096) return project;
      material = palette.length;
      nextPalette = [...palette, block];
    }
    nextBlocks = blocks.slice();
    nextBlocks[index < 0 ? blocks.length : index] = [...cell, material];
  }
  return {
    ...project,
    objects: project.objects.map((object) =>
      object.id === id
        ? { ...object, voxels: { palette: nextPalette, blocks: nextBlocks } }
        : object,
    ),
  };
}
