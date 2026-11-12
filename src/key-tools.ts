import { bones, clone } from './model';
import type { BoneName, Keyframe, Project, Selection } from './model';
import type { FaceKey } from './face';
import { defaultFaceRig } from './face';
import { lowerFrame } from './time-index';

export type KeyRef = { track: string; frame: number };
type TrackKey = Keyframe | FaceKey;
export type CopiedKey = KeyRef & { key: TrackKey };
export const faceTrackId = (actor: string) => `${actor}/face`;
export const keyTrackOwner = (track: string) => track.split('/')[0];
export const isFaceTrack = (track: string) => track.endsWith('/face');
export function selectionForKeyTrack(track: string): NonNullable<Selection> {
  const [id, bone] = track.split('/');
  return bone && bone !== 'face' ? { id, bone: bone as BoneName } : { id };
}
export function keysOnTrack(project: Project, track: string): readonly TrackKey[] {
  return (
    (isFaceTrack(track) ? project.faceTracks?.[keyTrackOwner(track)] : project.tracks[track]) ?? []
  );
}
const hasFrame = (keys: readonly TrackKey[], frame: number) =>
  keys[lowerFrame(keys, frame)]?.frame === frame;

function byTrack<T extends KeyRef>(selection: readonly T[]) {
  const grouped = new Map<string, Map<number, T>>();
  for (const key of selection) {
    let frames = grouped.get(key.track);
    if (!frames) {
      frames = new Map();
      grouped.set(key.track, frames);
    }
    frames.set(key.frame, key);
  }
  return grouped;
}

function applyTracks(project: Project, updates: Map<string, TrackKey[]>): Project {
  if (!updates.size) return project;
  const tracks = { ...project.tracks },
    faceTracks = { ...project.faceTracks };
  let hasFaces = !!project.faceTracks;
  for (const [track, keys] of updates) {
    if (isFaceTrack(track)) {
      hasFaces = true;
      const actor = keyTrackOwner(track);
      faceTracks[actor] = keys as FaceKey[];
    } else tracks[track] = keys as Keyframe[];
  }
  return { ...project, tracks, ...(hasFaces ? { faceTracks } : {}) };
}

export function copyKeys(project: Project, selection: readonly KeyRef[]): CopiedKey[] {
  const copied: CopiedKey[] = [];
  for (const [track, frames] of byTrack(selection)) {
    const keys = keysOnTrack(project, track);
    for (const frame of frames.keys()) {
      const key = keys[lowerFrame(keys, frame)];
      if (key?.frame === frame) copied.push({ track, frame, key: clone(key) });
    }
  }
  return copied;
}

export function deleteKeys(project: Project, selection: readonly KeyRef[]): Project {
  const locked = new Set(project.objects.filter((o) => o.locked).map((o) => o.id));
  const updates = new Map<string, TrackKey[]>();
  for (const [track, frames] of byTrack(selection)) {
    if (locked.has(keyTrackOwner(track))) continue;
    const old = keysOnTrack(project, track);
    const remaining = old.filter((k) => !frames.has(k.frame));
    if (remaining.length !== old.length) updates.set(track, remaining);
  }
  return applyTracks(project, updates);
}

export function moveKeys(project: Project, selection: readonly KeyRef[], delta: number): Project {
  const copied = copyKeys(project, selection);
  if (!copied.length || !Number.isFinite(delta)) return project;
  const locked = new Set(project.objects.filter((o) => o.locked).map((o) => o.id));
  if (copied.some((ref) => locked.has(keyTrackOwner(ref.track)))) return project;
  let first = Infinity,
    last = -Infinity;
  for (const ref of copied) {
    first = Math.min(first, ref.frame);
    last = Math.max(last, ref.frame);
  }
  const shift = Math.max(-first, Math.min(project.duration - last, Math.round(delta)));
  if (!shift) return project;
  const updates = new Map<string, TrackKey[]>();
  for (const [track, frames] of byTrack(copied)) {
    const old = keysOnTrack(project, track);
    for (const ref of frames.values()) {
      const at = ref.frame + shift;
      if (hasFrame(old, at) && !frames.has(at)) return project;
    }
    updates.set(
      track,
      [
        ...old.filter((k) => !frames.has(k.frame)),
        ...Array.from(frames.values(), (ref) => ({ ...ref.key, frame: ref.frame + shift })),
      ].sort((a, b) => a.frame - b.frame),
    );
  }
  return applyTracks(project, updates);
}

export type PasteOptions = { target?: string; character?: boolean; replace?: boolean };
type PasteResult = { project: Project; keys: KeyRef[]; replaced: number; error?: string };

export function pasteKeyBatch(
  project: Project,
  copied: readonly CopiedKey[],
  frame: number,
  options: PasteOptions = {},
): PasteResult {
  const fail = (error?: string): PasteResult => ({ project, keys: [], replaced: 0, error });
  if (!copied.length || !Number.isFinite(frame)) return fail();
  const start = copied.reduce((min, key) => Math.min(min, key.frame), Infinity);
  const tracks = new Set(copied.map((key) => key.track));
  const owners = new Set([...tracks].map(keyTrackOwner));
  const objects = new Map(project.objects.map((object) => [object.id, object]));
  const target = options.target;
  const retarget = tracks.size > 1 || options.character;
  if (
    target &&
    retarget &&
    (owners.size !== 1 || target.includes('/') || objects.get(target)?.type !== 'character')
  )
    return fail(
      'To retarget several channels, copy one character and choose another character row.',
    );
  const entries = target
    ? copied.map((ref) => ({
        ...ref,
        track: retarget ? target + ref.track.slice(keyTrackOwner(ref.track).length) : target,
      }))
    : copied;
  const updates = new Map<string, TrackKey[]>(),
    keys: KeyRef[] = [],
    newFaces = new Set<string>();
  let duration = project.duration,
    replaced = 0;
  for (const [track, frames] of byTrack(entries)) {
    const object = objects.get(keyTrackOwner(track)),
      suffix = track.split('/')[1];
    if (!object)
      return fail(
        'A source track no longer exists. Choose a destination track and use Paste to Track.',
      );
    if (object.locked) return fail(`Unlock ${object.name} to paste its keys.`);
    if (
      suffix &&
      (object.type !== 'character' || (suffix !== 'face' && !bones.includes(suffix as BoneName)))
    )
      return fail('The destination does not have that channel.');
    const merged = new Map(keysOnTrack(project, track).map((k) => [k.frame, k]));
    if (suffix === 'face' && !merged.size && !object.face?.enabled) newFaces.add(object.id);
    for (const ref of frames.values()) {
      if (isFaceTrack(track) !== 'pose' in ref.key)
        return fail('Facial keys must be pasted to a Face track.');
      const at = Math.round(frame) + ref.frame - start;
      if (at < 0 || at > 36000) return fail('The pasted keys would fall outside frames 0–36000.');
      if (merged.has(at)) {
        if (!options.replace)
          return fail(
            'A destination already has a key. Use Paste and Replace or choose an empty frame.',
          );
        replaced++;
      }
      duration = Math.max(duration, at);
      merged.set(at, { ...clone(ref.key), frame: at });
      keys.push({ track, frame: at });
    }
    updates.set(
      track,
      [...merged.values()].sort((a, b) => a.frame - b.frame),
    );
  }
  const next = applyTracks(project, updates);
  const actors = newFaces.size
    ? next.objects.map((object) =>
        newFaces.has(object.id)
          ? { ...object, face: { ...(object.face ?? defaultFaceRig), enabled: true } }
          : object,
      )
    : next.objects;
  return { project: { ...next, objects: actors, duration }, keys, replaced };
}

export function pasteKeys(project: Project, copied: CopiedKey[], frame: number): Project {
  return pasteKeyBatch(project, copied, frame).project;
}
