import type { Project, SceneObject } from './model';
import { uid } from './model';
import { MAX_PROJECT_BLOCKS } from './import-limits';
export function descendants(objects: SceneObject[], id: string): Set<string> {
  const result = new Set<string>([id]);
  for (let pass = 0; pass < objects.length; pass++) {
    let changed = false;
    for (const object of objects)
      if (object.parentId && result.has(object.parentId) && !result.has(object.id)) {
        result.add(object.id);
        changed = true;
      }
    if (!changed) break;
  }
  return result;
}
export function hierarchyRows(objects: SceneObject[]): { object: SceneObject; depth: number }[] {
  const rows: { object: SceneObject; depth: number }[] = [],
    visited = new Set<string>();
  const visit = (parentId: string | undefined, depth: number) => {
    for (const object of objects)
      if (object.parentId === parentId && !visited.has(object.id)) {
        visited.add(object.id);
        rows.push({ object, depth });
        visit(object.id, depth + 1);
      }
  };
  visit(undefined, 0);
  for (const object of objects) if (!visited.has(object.id)) rows.push({ object, depth: 0 });
  return rows;
}
export function removeObjects(project: Project, ids: Set<string>): Project {
  const removed = new Set(ids);
  for (const id of ids) for (const child of descendants(project.objects, id)) removed.add(child);
  return {
    ...project,
    objects: project.objects
      .filter((o) => !removed.has(o.id))
      .map((o) => ({
        ...o,
        ik: o.ik
          ? Object.fromEntries(Object.entries(o.ik).filter(([, c]) => !removed.has(c.targetId)))
          : undefined,
        ...(o.cameraTarget && removed.has(o.cameraTarget)
          ? { cameraTarget: undefined, targetBone: undefined }
          : {}),
      })),
    shots: project.shots?.filter((s) => !removed.has(s.cameraId)),
    activeCameraId:
      project.activeCameraId && removed.has(project.activeCameraId)
        ? undefined
        : project.activeCameraId,
    tracks: Object.fromEntries(
      Object.entries(project.tracks).filter(([track]) => !removed.has(track.split('/')[0])),
    ),
    faceTracks:
      project.faceTracks &&
      Object.fromEntries(Object.entries(project.faceTracks).filter(([id]) => !removed.has(id))),
  };
}

export function copyObjects(project: Project, root: string) {
  const ids = descendants(project.objects, root);
  return {
    root,
    objects: project.objects.filter((object) => ids.has(object.id)),
    tracks: Object.entries(project.tracks).filter(([key]) => ids.has(key.split('/')[0])),
    faces: Object.entries(project.faceTracks ?? {}).filter(([id]) => ids.has(id)),
  };
}

export function pasteObjects(
  project: Project,
  clipboard: ReturnType<typeof copyObjects>,
  cut = false,
) {
  if (!clipboard.objects.length || project.objects.length + clipboard.objects.length > 500)
    throw Error('The selection would exceed the 500-object limit.');
  const blocks = [...project.objects, ...clipboard.objects].reduce(
    (n, o) => n + (o.voxels?.blocks.length ?? 0),
    0,
  );
  if (blocks > MAX_PROJECT_BLOCKS)
    throw Error(
      `The selection would exceed ${MAX_PROJECT_BLOCKS.toLocaleString()} imported blocks.`,
    );

  const ids = new Map(clipboard.objects.map((object) => [object.id, uid()]));
  const existing = new Set(project.objects.map((object) => object.id));
  const resolve = (id?: string) =>
    id ? (ids.get(id) ?? (existing.has(id) ? id : undefined)) : undefined;
  const offset = <T extends SceneObject['transform']>(transform: T): T => ({
    ...transform,
    position: [transform.position[0] + 1, transform.position[1], transform.position[2]],
  });
  const objects = clipboard.objects.map((object): SceneObject => {
    const parentId = resolve(object.parentId),
      cameraTarget = resolve(object.cameraTarget);
    const duplicate = object.id === clipboard.root && !cut;
    return {
      ...object,
      id: ids.get(object.id)!,
      parentId,
      cameraTarget,
      name: duplicate ? `${object.name.slice(0, 195)} copy` : object.name,
      transform: duplicate ? offset(object.transform) : object.transform,
      parentBone: parentId ? object.parentBone : undefined,
      equipmentSlot: parentId ? object.equipmentSlot : undefined,
      targetBone: cameraTarget ? object.targetBone : undefined,
      ik:
        object.ik &&
        Object.fromEntries(
          Object.entries(object.ik).flatMap(([limb, constraint]) => {
            const targetId = resolve(constraint.targetId);
            return targetId ? [[limb, { ...constraint, targetId }]] : [];
          }),
        ),
    };
  });
  const tracks = { ...project.tracks },
    faceTracks = { ...project.faceTracks };
  let duration = project.duration;
  for (const [key, keys] of clipboard.tracks) {
    const [id, bone] = key.split('/');
    tracks[bone ? `${ids.get(id)}/${bone}` : ids.get(id)!] =
      key === clipboard.root && !cut ? keys.map(offset) : keys;
    duration = Math.max(duration, keys.at(-1)?.frame ?? 0);
  }
  for (const [id, keys] of clipboard.faces) {
    faceTracks[ids.get(id)!] = keys;
    duration = Math.max(duration, keys.at(-1)?.frame ?? 0);
  }
  return {
    project: {
      ...project,
      duration,
      objects: [...project.objects, ...objects],
      tracks,
      faceTracks,
    },
    id: ids.get(clipboard.root)!,
  };
}
