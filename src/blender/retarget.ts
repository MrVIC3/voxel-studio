import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { bones, identity } from '../model';
import type { BoneName, Keyframe, MotionClip, Vec3 } from '../model';
import { faceChannels as facialControls, neutralFace } from '../face';
import type { FaceKey, FacePose } from '../face';
import type { GltfSource, MotionChannel } from './gltf';
import { sampleChannel } from './gltf';
import { continuousEuler } from '../rotation';

export type Target = 'root' | BoneName;
export type ImportedMotion = MotionClip & { sourceFps: number };
export type RigChoice = { name: string; body: number; mapping: Partial<Record<Target, number>> };
export type JointMapping = Partial<Record<Target, number | null>>;
export type RetargetOptions = {
  fps: number;
  rig?: number;
  scale?: number;
  turn?: 0 | 90 | 180 | 270;
  inPlace?: boolean;
  mapping?: JointMapping;
};

const aliases: Record<Target, string[]> = {
  root: ['voxelroot', 'root', 'motionroot', 'rootmotion', 'armature', 'rig'],
  body: ['body', 'hips', 'hip', 'pelvis', 'spine', 'torso', 'waist', 'chest'],
  head: ['head', 'skull'],
  leftArm: [
    'leftarm',
    'leftupperarm',
    'upperarml',
    'arml',
    'lupperarm',
    'larm',
    'upperarmleft',
    'leftshoulder',
  ],
  rightArm: [
    'rightarm',
    'rightupperarm',
    'upperarmr',
    'armr',
    'rupperarm',
    'rarm',
    'upperarmright',
    'rightshoulder',
  ],
  leftForearm: [
    'leftforearm',
    'leftlowerarm',
    'forearml',
    'lowerarml',
    'lforearm',
    'llowerarm',
    'forearmleft',
  ],
  rightForearm: [
    'rightforearm',
    'rightlowerarm',
    'forearmr',
    'lowerarmr',
    'rforearm',
    'rlowerarm',
    'forearmright',
  ],
  leftHand: ['lefthand', 'handl', 'lhand', 'handleft', 'leftwrist', 'wristl'],
  rightHand: ['righthand', 'handr', 'rhand', 'handright', 'rightwrist', 'wristr'],
  leftLeg: [
    'leftupleg',
    'leftthigh',
    'leftupperleg',
    'thighl',
    'uplegl',
    'upperlegl',
    'lthigh',
    'lupperleg',
    'leftleg',
    'legl',
    'lleg',
  ],
  rightLeg: [
    'rightupleg',
    'rightthigh',
    'rightupperleg',
    'thighr',
    'uplegr',
    'upperlegr',
    'rthigh',
    'rupperleg',
    'rightleg',
    'legr',
    'rleg',
  ],
  leftShin: [
    'leftshin',
    'leftcalf',
    'leftlowerleg',
    'shinl',
    'calfl',
    'lowerlegl',
    'lshin',
    'lcalf',
    'llowerleg',
    'leftleg',
    'legl',
    'lleg',
  ],
  rightShin: [
    'rightshin',
    'rightcalf',
    'rightlowerleg',
    'shinr',
    'calfr',
    'lowerlegr',
    'rshin',
    'rcalf',
    'rlowerleg',
    'rightleg',
    'legr',
    'rleg',
  ],
  leftFoot: ['leftfoot', 'footl', 'lfoot', 'footleft', 'leftankle', 'anklel'],
  rightFoot: ['rightfoot', 'footr', 'rfoot', 'footright', 'rightankle', 'ankler'],
};
const targetParent: Record<Target, Target | undefined> = {
  root: undefined,
  body: 'root',
  head: 'body',
  leftArm: 'body',
  rightArm: 'body',
  leftForearm: 'leftArm',
  rightForearm: 'rightArm',
  leftHand: 'leftForearm',
  rightHand: 'rightForearm',
  leftLeg: 'body',
  rightLeg: 'body',
  leftShin: 'leftLeg',
  rightShin: 'rightLeg',
  leftFoot: 'leftShin',
  rightFoot: 'rightShin',
};
const limbChildren: Partial<Record<Target, Target[]>> = {
  leftArm: ['leftForearm', 'leftHand'],
  rightArm: ['rightForearm', 'rightHand'],
  leftForearm: ['leftHand'],
  rightForearm: ['rightHand'],
  leftLeg: ['leftShin', 'leftFoot'],
  rightLeg: ['rightShin', 'rightFoot'],
  leftShin: ['leftFoot'],
  rightShin: ['rightFoot'],
};
const targetOrder: Target[] = [
  'root',
  'body',
  'head',
  'leftArm',
  'leftForearm',
  'leftHand',
  'rightArm',
  'rightForearm',
  'rightHand',
  'leftLeg',
  'leftShin',
  'leftFoot',
  'rightLeg',
  'rightShin',
  'rightFoot',
];
const up = new Vector3(0, 1, 0),
  down = new Vector3(0, -1, 0);

function compactName(name: string | undefined) {
  return (typeof name === 'string' ? name : '')
    .split(/[|:]/)
    .at(-1)!
    .toLowerCase()
    .replace(/^(?:(?:mixamorig\d*|bip\d*|ccbase|def|org|mch|bone|jnt)[_. -]*)+/, '')
    .replace(/\.\d{3}$/, '')
    .replace(/[^a-z0-9]/g, '');
}
function ancestor(parents: number[], parent: number, child: number) {
  for (let i = child; i !== -1; i = parents[i]) if (i === parent) return true;
  return false;
}
export function listMotionRigs(source: GltfSource): RigChoice[] {
  const names = source.document.nodes.map((node) => compactName(node.name));
  const bodyCandidates = names
    .flatMap((name, node) => (aliases.body.includes(name) ? [node] : []))
    .sort((a, b) => aliases.body.indexOf(names[a]) - aliases.body.indexOf(names[b]))
    .slice(0, 64);
  const jointSet = new Set(source.document.skins?.flatMap((skin) => skin.joints || []) || []);
  const sourceBones = jointSet.size ? source.order.filter((i) => jointSet.has(i)) : source.order;
  const make = (body: number): RigChoice => {
    const mapping: RigChoice['mapping'] = {},
      used = new Set<number>();
    if (body >= 0) {
      mapping.body = body;
      used.add(body);
    }
    let root: number | undefined;
    if (body >= 0)
      for (let i = source.parents[body]; i >= 0; i = source.parents[i]) {
        const score = aliases.root.indexOf(names[i]);
        if (score >= 0 && (root === undefined || score < aliases.root.indexOf(names[root])))
          root = i;
      }
    if (root !== undefined) {
      mapping.root = root;
      used.add(root);
    }
    for (const target of targetOrder) {
      if (mapping[target] !== undefined || (target === 'root' && body !== -1)) continue;
      let match: number | undefined,
        best = Infinity;
      const parent = targetParent[target] ? mapping[targetParent[target]!] : undefined;
      for (const i of target === 'root' ? source.order : sourceBones) {
        const score = aliases[target].indexOf(names[i]);
        if (score < 0 || score >= best) continue;
        if (used.has(i) || (body >= 0 && !ancestor(source.parents, body, i))) continue;
        if (parent !== undefined && !ancestor(source.parents, parent, i)) continue;
        best = score;
        match = i;
      }
      if (match !== undefined) {
        mapping[target] = match;
        used.add(match);
      }
    }
    const label =
      root !== undefined ? source.document.nodes[root].name : source.document.nodes[body]?.name;
    return { name: label || 'Auto-mapped rig', body, mapping };
  };
  const choices = (bodyCandidates.length ? bodyCandidates : [-1])
    .map(make)
    .sort(
      (a, b) =>
        Object.keys(b.mapping).length - Object.keys(a.mapping).length ||
        aliases.body.indexOf(names[a.body]) - aliases.body.indexOf(names[b.body]),
    );
  // A pelvis and a lower spine within one skeleton are not separate rigs.
  const rigs: RigChoice[] = [];
  for (const candidate of choices) {
    if (
      rigs.some(
        (rig) =>
          rig.body >= 0 &&
          candidate.body >= 0 &&
          (ancestor(source.parents, rig.body, candidate.body) ||
            ancestor(source.parents, candidate.body, rig.body)),
      )
    )
      continue;
    rigs.push(candidate);
  }
  return rigs.slice(0, 32);
}

function bindingOfFace(
  name: string,
): { key: keyof FacePose; sign: number; explicit?: boolean } | undefined {
  const n = compactName(name);
  const direct: Record<string, keyof FacePose> = {
    lookx: 'lookX',
    looky: 'lookY',
    blink: 'blink',
    brow: 'brow',
    smile: 'smile',
    jaw: 'jaw',
  };
  const key = direct[n.replace(/^voxel/, '')];
  if (key) return { key, sign: 1, explicit: true };
  if (/^(?:eye)?blink(?:left|right|l|r)?$/.test(n)) return { key: 'blink', sign: 1 };
  if (/^(?:mouthopen|jawopen)$/.test(n)) return { key: 'jaw', sign: 1 };
  if (/^(?:mouth)?smile(?:left|right|l|r)?$/.test(n)) return { key: 'smile', sign: 1 };
  if (/^(?:mouth)?frown(?:left|right|l|r)?$/.test(n)) return { key: 'smile', sign: -1 };
  if (/^(?:brow(?:innerup|outerup|raise))(?:left|right|l|r)?$/.test(n))
    return { key: 'brow', sign: 1 };
  if (/^browdown(?:left|right|l|r)?$/.test(n)) return { key: 'brow', sign: -1 };
  if (/^eyelook(?:up|down)(?:left|right|l|r)?$/.test(n))
    return { key: 'lookY', sign: n.includes('up') ? 1 : -1 };
  if (/^eyelook(?:in|out)(?:left|right)$/.test(n))
    return { key: 'lookX', sign: n.includes('inleft') || n.includes('outright') ? -1 : 1 };
  return undefined;
}
const motionName = (name: string | undefined, i: number) =>
  (typeof name === 'string' ? name.trim() : '').slice(0, 100) || `Blender Action ${i + 1}`;
export function motionActionNames(source: GltfSource) {
  return source.document.animations.map((action, index) => ({
    index,
    name: motionName(action?.name, index),
  }));
}

function channelsByNode(channels: MotionChannel[]) {
  const byNode = new Map<number, MotionChannel[]>();
  for (const channel of channels) {
    const list = byNode.get(channel.node) || [];
    list.push(channel);
    byNode.set(channel.node, list);
  }
  return byNode;
}

function matrixTree(
  source: GltfSource,
  needed: number[],
  byNode?: Map<number, MotionChannel[]>,
  time?: number,
) {
  const matrices = new Map<number, Matrix4>();
  const positions = new Map<number, Vector3>();
  const rotations = new Map<number, Quaternion>();
  const scales = new Map<number, Vector3>();
  const scratch: number[] = [];
  for (const i of needed) {
    const base = source.rest[i],
      p = base.p.clone(),
      q = base.q.clone(),
      s = base.s.clone();
    if (time !== undefined)
      for (const channel of byNode?.get(i) || []) {
        sampleChannel(channel, time, scratch);
        if (channel.path === 'translation') p.fromArray(scratch);
        if (channel.path === 'rotation') q.fromArray(scratch).normalize();
        if (channel.path === 'scale') s.fromArray(scratch);
      }
    const matrix = new Matrix4().compose(p, q, s);
    const parent = matrices.get(source.parents[i]);
    if (parent) matrix.premultiply(parent);
    matrix.decompose(p, q, s);
    q.normalize();
    matrices.set(i, matrix);
    positions.set(i, p);
    rotations.set(i, q);
    scales.set(i, s);
  }
  return { positions, rotations, scales };
}
function rounded(n: number) {
  if (!Number.isFinite(n) || Math.abs(n) > 1e6)
    throw Error('Retargeted animation exceeds the transform range.');
  return Math.round(n * 1e6) / 1e6 || 0;
}
const valuesOf = (key: Keyframe) => [...key.position, ...key.rotation, ...key.scale];
function simplify(keys: Keyframe[]): Keyframe[] {
  if (keys.length <= 2) return keys;
  const out = [keys[0]];
  for (let i = 1; i < keys.length - 1; i++) {
    const a = out.at(-1)!,
      b = keys[i],
      c = keys[i + 1],
      av = valuesOf(a),
      bv = valuesOf(b),
      cv = valuesOf(c);
    const t = (b.frame - a.frame) / (c.frame - a.frame);
    if (
      bv.some(
        (value, j) =>
          Math.abs(value - (a.interpolation === 'step' ? av[j] : av[j] + (cv[j] - av[j]) * t)) >
          2e-6,
      )
    )
      out.push(b);
  }
  out.push(keys.at(-1)!);
  return out;
}
function simplifyFace(keys: FaceKey[]): FaceKey[] {
  if (keys.length <= 2) return keys;
  const out = [keys[0]];
  for (let i = 1; i < keys.length - 1; i++) {
    const a = out.at(-1)!,
      b = keys[i],
      c = keys[i + 1],
      t = (b.frame - a.frame) / (c.frame - a.frame);
    if (
      facialControls.some(
        (key) =>
          Math.abs(
            b.pose[key] -
              (a.interpolation === 'step'
                ? a.pose[key]
                : a.pose[key] + (c.pose[key] - a.pose[key]) * t),
          ) > 2e-6,
      )
    )
      out.push(b);
  }
  out.push(keys.at(-1)!);
  return out;
}

export function bakeMotionAction(
  source: GltfSource,
  index: number,
  options: RetargetOptions,
): ImportedMotion {
  const fps = options.fps;
  if (!Number.isInteger(fps) || fps < 1 || fps > 120) throw Error('Invalid project frame rate.');
  if (
    options.scale !== undefined &&
    (!Number.isFinite(options.scale) || options.scale < 0.01 || options.scale > 100)
  )
    throw Error('Translation scale must be 0.01–100.');
  const choices = listMotionRigs(source),
    rig = choices[options.rig || 0];
  if (!rig) throw Error('Select an available source rig.');
  const mapping = { ...rig.mapping };
  for (const target of targetOrder) {
    const replacement = options.mapping?.[target];
    if (replacement === null) delete mapping[target];
    else if (replacement !== undefined) {
      if (!Number.isInteger(replacement) || replacement < 0 || replacement >= source.rest.length)
        throw Error('Invalid source joint mapping.');
      mapping[target] = replacement;
    }
  }
  const mapped = targetOrder.filter(
    (target) => mapping[target] !== undefined && (target === 'root' || bones.includes(target)),
  );
  if (new Set(mapped.map((target) => mapping[target])).size !== mapped.length)
    throw Error('A source node is assigned to more than one control. Unmap the duplicate joint.');
  const neededSet = new Set<number>();
  for (const target of mapped)
    for (let i = mapping[target]!; i >= 0; i = source.parents[i]) neededSet.add(i);
  const channels = source.readChannels(index);
  const bodyChannels = channels.filter(
    (channel) => channel.path !== 'weights' && neededSet.has(channel.node),
  );
  const bodyByNode = channelsByNode(bodyChannels);
  const faceChannels = channels.flatMap((channel) => {
    if (channel.path !== 'weights') return [];
    if (choices.length > 1 && rig.body >= 0) {
      const mesh = source.document.nodes[channel.node];
      const joints =
        mesh.skin === undefined ? undefined : source.document.skins?.[mesh.skin]?.joints;
      const scope = mapping.root ?? rig.body;
      if (!ancestor(source.parents, scope, channel.node) && !joints?.includes(rig.body)) return [];
    }
    const meshIndex = source.document.nodes[channel.node].mesh;
    const names =
      meshIndex === undefined
        ? undefined
        : source.document.meshes?.[meshIndex]?.extras?.targetNames;
    if (!Array.isArray(names)) return [];
    const bindings = names
      .slice(0, channel.components)
      .map((name) => (typeof name === 'string' ? bindingOfFace(name) : undefined));
    return bindings.some(Boolean) ? [{ channel, bindings }] : [];
  });
  const faceScope = mapping.head ?? mapping.body ?? mapping.root;
  const faceBones = channels.flatMap((channel) => {
    if (
      channel.path !== 'rotation' ||
      faceScope === undefined ||
      !ancestor(source.parents, faceScope, channel.node)
    )
      return [];
    const name = compactName(source.document.nodes[channel.node].name);
    const isEye = /^(?:(?:eye|pupil)(?:left|right|l|r)|(?:left|right|l|r)(?:eye|pupil))$/.test(
      name,
    );
    const isJaw = /^(?:jaw|lowerjaw|mandible)$/.test(name);
    if (!isEye && !isJaw) return [];
    for (let i = channel.node; i >= 0; i = source.parents[i]) neededSet.add(i);
    return [{ channel, isEye }];
  });
  const needed = source.order.filter((i) => neededSet.has(i));
  const supported = [
    ...bodyChannels,
    ...[...faceChannels, ...faceBones].map(({ channel }) => channel),
  ];
  if (!supported.length)
    throw Error(
      'This action has no matching humanoid joints, facial joints or named face shapes. Check the source rig names.',
    );
  let first = Infinity,
    last = 0;
  for (const { times } of supported) {
    first = Math.min(first, times[0]);
    last = Math.max(last, times[times.length - 1]);
  }
  const duration = Math.max(1, Math.round((last - first) * fps));
  if (
    duration > 36000 ||
    duration * Math.max(1, needed.length) > 1_500_000 ||
    (duration + 1) * Math.max(1, mapped.length) > 150_000
  )
    throw Error(
      'This action is too long to bake at the project frame rate. Trim it in Blender or lower project FPS.',
    );

  const rest = matrixTree(source, needed);
  const pos = (target: Target) =>
    mapping[target] === undefined ? undefined : rest.positions.get(mapping[target]!);
  const left = pos('leftLeg') || pos('leftArm'),
    right = pos('rightLeg') || pos('rightArm');
  const sideways = left && right ? left.clone().sub(right) : undefined;
  const yaw =
    (sideways && sideways.lengthSq() > 1e-8 ? Math.atan2(sideways.z, sideways.x) : 0) +
    ((options.turn || 0) * Math.PI) / 180;
  const align = new Quaternion().setFromAxisAngle(up, yaw),
    unalign = align.clone().invert();
  const lengths: number[] = [];
  for (const side of ['left', 'right'] as const) {
    const hip = pos(`${side}Leg`),
      shin = pos(`${side}Shin`),
      foot = pos(`${side}Foot`);
    if (hip && shin && foot) lengths.push(hip.distanceTo(shin) + shin.distanceTo(foot));
  }
  const pelvis = pos('body'),
    head = pos('head');
  const length = lengths.length
    ? lengths.reduce((a, b) => a + b) / lengths.length
    : pelvis && head
      ? pelvis.distanceTo(head)
      : 0.75;
  const multiplier = (length > 0.0001 ? 0.75 / length : 1) * (options.scale ?? 1);
  const restAims = new Map<Target, Quaternion>();
  for (const target of mapped) {
    const p = pos(target)!,
      next = limbChildren[target]?.map(pos).find(Boolean);
    let basis = new Quaternion();
    if (next && p.distanceToSquared(next) > 1e-10)
      basis = new Quaternion().setFromUnitVectors(
        down,
        next.clone().sub(p).applyQuaternion(align).normalize(),
      );
    else if (
      [
        'leftForearm',
        'rightForearm',
        'leftHand',
        'rightHand',
        'leftShin',
        'rightShin',
        'leftFoot',
        'rightFoot',
      ].includes(target)
    )
      basis = restAims.get(targetParent[target]!)?.clone() || basis;
    restAims.set(target, basis);
  }

  const clip: ImportedMotion = {
    id: crypto.randomUUID(),
    name: motionName(source.document.animations[index].name, index),
    duration,
    sourceFps: fps,
    tracks: {},
  };
  const stepBody =
    bodyChannels.length > 0 && bodyChannels.every((channel) => channel.interpolation === 'STEP');
  const stepFace = [...faceChannels, ...faceBones].every(
    ({ channel }) => channel.interpolation === 'STEP',
  );
  const faceKeys: FaceKey[] = [];
  const sample: number[] = [],
    baseWorld = bodyChannels.length ? matrixTree(source, needed, bodyByNode, first) : rest;
  const facialRotation = new Quaternion(),
    faceAngles = new Euler(0, 0, 0, 'YXZ');
  const faceBoneBases = faceBones.map(({ channel }) => {
    const basis = align
      .clone()
      .multiply(rest.rotations.get(source.parents[channel.node]) || new Quaternion());
    return {
      basis,
      inverse: basis.clone().invert(),
      bindInverse: source.rest[channel.node].q.clone().invert(),
    };
  });
  const hasRoot = mapped.includes('root'),
    sourceRoot = mapping.root;
  const baseRootP = sourceRoot !== undefined ? baseWorld.positions.get(sourceRoot) : undefined;
  const baseRootQ = sourceRoot !== undefined ? baseWorld.rotations.get(sourceRoot) : undefined;
  const baseRootS = sourceRoot !== undefined ? baseWorld.scales.get(sourceRoot) : undefined;
  const canonicalRest =
    sourceRoot !== undefined && source.document.nodes[sourceRoot].name === 'VoxelRoot';
  for (let frame = 0; frame <= duration; frame++) {
    const time = first + ((last - first) * frame) / duration;
    if (bodyChannels.length) {
      const world = matrixTree(source, needed, bodyByNode, time);
      const worldAims = new Map<Target, Quaternion>();
      for (const target of mapped) {
        const i = mapping[target]!,
          p = world.positions.get(i)!,
          q = world.rotations.get(i)!,
          s = world.scales.get(i)!;
        const restP = rest.positions.get(i)!,
          restQ = rest.rotations.get(i)!,
          restS = rest.scales.get(i)!;
        const key: Keyframe = { ...identity(), frame, interpolation: stepBody ? 'step' : 'linear' };
        let parent = targetParent[target];
        while (parent && mapping[parent] === undefined) parent = targetParent[parent];
        const parentNode = parent ? mapping[parent] : undefined;
        const worldQ = align
          .clone()
          .multiply(q)
          .multiply(restQ.clone().invert())
          .multiply(unalign)
          .multiply(restAims.get(target)!);
        worldAims.set(target, worldQ);
        const parentQ = parent ? worldAims.get(parent) : undefined;
        const rotation =
          target === 'root' && baseRootQ
            ? align.clone().multiply(q).multiply(baseRootQ.clone().invert()).multiply(unalign)
            : parentQ
              ? parentQ.clone().invert().multiply(worldQ)
              : worldQ;
        key.rotation = continuousEuler(rotation, clip.tracks[target]?.at(-1)?.rotation).map(
          rounded,
        ) as Vec3;
        let delta = p
          .clone()
          .sub(target === 'root' && baseRootP ? baseRootP : restP)
          .applyQuaternion(align);
        if (parentNode !== undefined) {
          const currentParent = world.rotations.get(parentNode)!,
            neutralParent = rest.rotations.get(parentNode)!;
          const local = p
            .clone()
            .sub(world.positions.get(parentNode)!)
            .applyQuaternion(currentParent.clone().invert());
          const localRest = restP
            .clone()
            .sub(rest.positions.get(parentNode)!)
            .applyQuaternion(neutralParent.clone().invert());
          delta = local.sub(localRest).applyQuaternion(neutralParent).applyQuaternion(align);
          // Canonical rigs keep authored joint translations. On foreign rigs, use rest-relative
          // rotations for limb placement so source spine dimensions cannot pull arms off the body.
          if (!canonicalRest && target !== 'body') delta.set(0, 0, 0);
          if (parent) delta.applyQuaternion(restAims.get(parent)!.clone().invert());
        }
        if (
          options.inPlace &&
          (target === 'root' || (target === 'body' && (!hasRoot || !canonicalRest)))
        ) {
          delta.x = 0;
          delta.z = 0;
        }
        key.position = delta.multiplyScalar(multiplier).toArray().map(rounded) as Vec3;
        const baseline = target === 'root' && baseRootS ? baseRootS : restS;
        const parentScale =
          parentNode === undefined
            ? new Vector3(1, 1, 1)
            : world.scales.get(parentNode)!.clone().divide(rest.scales.get(parentNode)!);
        key.scale = s
          .clone()
          .divide(baseline)
          .divide(parentScale)
          .toArray()
          .map((v) => Math.max(0.001, Math.min(1000, rounded(Math.abs(v))))) as Vec3;
        (clip.tracks[target] ??= []).push(key);
      }
    }
    if (faceChannels.length || faceBones.length) {
      const pose = { ...neutralFace },
        counts = { ...neutralFace },
        explicitly = new Set<keyof FacePose>();
      for (const { channel, bindings } of faceChannels) {
        sampleChannel(channel, time, sample);
        for (let i = 0; i < bindings.length; i++) {
          const binding = bindings[i];
          if (!binding) continue;
          const { key, sign, explicit } = binding;
          if (explicit) {
            pose[key] = sample[i] * sign;
            counts[key] = 1;
            explicitly.add(key);
          } else if (!explicitly.has(key)) {
            pose[key] += sample[i] * sign;
            counts[key]++;
          }
        }
      }
      let lookX = 0,
        lookY = 0,
        jaw = 0,
        eyes = 0;
      for (let i = 0; i < faceBones.length; i++) {
        const { channel, isEye } = faceBones[i];
        const { basis, inverse, bindInverse } = faceBoneBases[i];
        sampleChannel(channel, time, sample);
        facialRotation
          .fromArray(sample)
          .normalize()
          .multiply(bindInverse)
          .premultiply(basis)
          .multiply(inverse);
        faceAngles.setFromQuaternion(facialRotation);
        if (isEye) {
          lookX += faceAngles.y;
          lookY -= faceAngles.x;
          eyes++;
        } else jaw = Math.max(jaw, faceAngles.x);
      }
      const eyeRange = (Math.PI / 6) * Math.max(1, eyes);
      if (!counts.lookX) pose.lookX = lookX / eyeRange;
      if (!counts.lookY) pose.lookY = lookY / eyeRange;
      if (!counts.jaw) pose.jaw = jaw / (Math.PI / 6);
      for (const key of Object.keys(pose) as (keyof FacePose)[]) {
        // Positive and negative corrective shapes add; equivalent L/R shapes average.
        const average =
          (key === 'lookX' || key === 'lookY' || key === 'smile' || key === 'brow') &&
          !explicitly.has(key)
            ? Math.max(1, counts[key] / 2)
            : Math.max(1, counts[key]);
        pose[key] = rounded(
          Math.max(key === 'blink' || key === 'jaw' ? 0 : -1, Math.min(1, pose[key] / average)),
        );
      }
      faceKeys.push({ frame, interpolation: stepFace ? 'step' : 'linear', pose });
    }
  }
  for (const target of mapped)
    if (clip.tracks[target]) clip.tracks[target] = simplify(clip.tracks[target]!);
  if (faceKeys.length) clip.faceKeys = simplifyFace(faceKeys);
  return clip;
}
