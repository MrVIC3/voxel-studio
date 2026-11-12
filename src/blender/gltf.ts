import { Matrix4, Quaternion, Vector3 } from 'three';

const MAX_BYTES = 128 * 1024 * 1024;
const MAX_JSON_BYTES = 16 * 1024 * 1024;
const GLB_MAGIC = 0x46546c67;
const GLB_JSON = 0x4e4f534a;
const GLB_BIN = 0x004e4942;

type Accessor = {
  componentType: number;
  type: 'SCALAR' | 'VEC3' | 'VEC4';
  count: number;
  bufferView?: number;
  byteOffset?: number;
  sparse?: {
    count: number;
    indices: { bufferView: number; byteOffset?: number; componentType: number };
    values: { bufferView: number; byteOffset?: number };
  };
};
export type GltfNode = {
  name?: string;
  children?: number[];
  mesh?: number;
  skin?: number;
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
};
type Path = 'translation' | 'rotation' | 'scale' | 'weights';
export type GltfAnimation = {
  name?: string;
  samplers: { input: number; output: number; interpolation?: 'LINEAR' | 'STEP' | 'CUBICSPLINE' }[];
  channels: { sampler: number; target: { node?: number; path: Path } }[];
};
export type GltfDocument = {
  asset?: { version: string };
  nodes: GltfNode[];
  animations: GltfAnimation[];
  accessors: Accessor[];
  buffers?: { uri?: string; byteLength: number }[];
  bufferViews?: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
  meshes?: { extras?: { targetNames?: string[] }; weights?: number[] }[];
  skins?: { skeleton?: number; joints?: number[] }[];
};

export type LocalPose = { p: Vector3; q: Quaternion; s: Vector3 };
export type MotionChannel = {
  node: number;
  path: Path;
  times: Float32Array;
  interpolation: 'LINEAR' | 'STEP' | 'CUBICSPLINE';
  values: Float32Array;
  components: number;
};
export type GltfSource = {
  document: GltfDocument;
  rest: LocalPose[];
  parents: number[];
  order: number[];
  readChannels: (index: number) => MotionChannel[];
};

const int = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function requireRange(offset: number, size: number, length: number, label: string) {
  if (!int(offset) || !int(size) || offset + size > length) throw Error(`Invalid ${label} bounds.`);
}
function jsonDocument(bytes: Uint8Array): GltfDocument {
  if (bytes.length > MAX_JSON_BYTES) throw Error('glTF animation JSON exceeds 16 MB.');
  let json: GltfDocument;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes).replace(/\u0000+$/, ''));
  } catch {
    throw Error('Invalid glTF JSON.');
  }
  if (!json || json.asset?.version !== '2.0') throw Error('Expected a glTF 2.0 animation export.');
  if (!Array.isArray(json.nodes) || json.nodes.length > 10000)
    throw Error('The file has no usable rig or exceeds the 10,000-node limit.');
  if (!Array.isArray(json.animations) || !json.animations.length)
    throw Error('No animation actions found. Enable Animation when exporting in Blender.');
  if (json.animations.length > 512 || !Array.isArray(json.accessors))
    throw Error('The animation table is invalid or exceeds 512 actions.');
  return json;
}

function parseContainer(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_BYTES)
    throw Error('Animation files must be under 128 MB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 4 || view.getUint32(0, true) !== GLB_MAGIC)
    return { document: jsonDocument(bytes), bin: undefined };
  requireRange(0, 12, bytes.length, 'GLB header');
  if (view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length)
    throw Error('Invalid GLB 2.0 file length or version.');
  let document: GltfDocument | undefined, bin: Uint8Array | undefined;
  for (let offset = 12; offset < bytes.length;) {
    requireRange(offset, 8, bytes.length, 'GLB chunk header');
    const size = view.getUint32(offset, true),
      type = view.getUint32(offset + 4, true);
    offset += 8;
    requireRange(offset, size, bytes.length, 'GLB chunk');
    if (type === GLB_JSON) document = jsonDocument(bytes.subarray(offset, offset + size));
    if (type === GLB_BIN) bin = bytes.subarray(offset, offset + size);
    offset += size;
  }
  if (!document) throw Error('GLB has no JSON chunk.');
  return { document, bin };
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
function poseOf(node: GltfNode): LocalPose {
  if (!node || typeof node !== 'object') throw Error('Invalid glTF rig node.');
  const p = new Vector3(),
    q = new Quaternion(),
    s = new Vector3(1, 1, 1);
  if (node.matrix) {
    if (node.matrix.length !== 16 || !node.matrix.every(finite))
      throw Error('Invalid rig rest matrix.');
    new Matrix4().fromArray(node.matrix).decompose(p, q, s);
  } else {
    if (node.translation) {
      if (node.translation.length !== 3 || !node.translation.every(finite))
        throw Error('Invalid rig rest translation.');
      p.fromArray(node.translation);
    }
    if (node.rotation) {
      if (node.rotation.length !== 4 || !node.rotation.every(finite))
        throw Error('Invalid rig rest rotation.');
      q.fromArray(node.rotation).normalize();
    }
    if (node.scale) {
      if (node.scale.length !== 3 || !node.scale.every(finite))
        throw Error('Invalid rig rest scale.');
      s.fromArray(node.scale);
    }
  }
  if (![p.x, p.y, p.z, q.x, q.y, q.z, q.w, s.x, s.y, s.z].every(finite))
    throw Error('A rig transform cannot be decomposed.');
  return { p, q, s };
}

export function parseGltfMotion(
  bytes: Uint8Array,
  external = new Map<string, Uint8Array>(),
): GltfSource {
  const { document, bin } = parseContainer(bytes);
  const parents = Array<number>(document.nodes.length).fill(-1),
    order: number[] = [];
  const rest = document.nodes.map(poseOf);
  for (let i = 0; i < document.nodes.length; i++)
    for (const child of document.nodes[i].children || []) {
      if (!int(child) || child >= parents.length || child === i || parents[child] !== -1)
        throw Error('The rig contains an invalid parent relationship.');
      parents[child] = i;
    }
  const queue = parents.flatMap((parent, i) => (parent === -1 ? [i] : []));
  for (let i = 0; i < queue.length; i++) {
    order.push(queue[i]);
    for (const child of document.nodes[queue[i]].children || []) queue.push(child);
  }
  if (order.length !== parents.length) throw Error('The rig hierarchy has a cycle.');

  const cached = new Map<number, Uint8Array>();
  let decodedBytes = 0;
  const buffer = (index: number) => {
    const found = cached.get(index);
    if (found) return found;
    const spec = document.buffers?.[index];
    if (!spec || !int(spec.byteLength) || spec.byteLength > MAX_BYTES)
      throw Error('Invalid animation buffer size.');
    let data: Uint8Array | undefined;
    if (!spec.uri) data = index === 0 ? bin : undefined;
    else if (spec.uri.startsWith('data:')) {
      const split = spec.uri.indexOf(',');
      if (split < 0 || !spec.uri.slice(0, split).endsWith(';base64'))
        throw Error('Use base64-embedded or local glTF buffers.');
      const encoded = spec.uri.slice(split + 1);
      if (encoded.length > Math.ceil((MAX_BYTES * 4) / 3) + 4)
        throw Error('Embedded buffer exceeds 128 MB.');
      try {
        data = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
      } catch {
        throw Error('Invalid base64 glTF buffer.');
      }
    } else {
      const uri = decodeURIComponent(spec.uri);
      if (/^(?:[a-z][a-z\d+.-]*:|[\\/])/i.test(uri) || uri.split(/[\\/]/).includes('..'))
        throw Error('Only local companion glTF buffers are accepted.');
      data = external.get(uri) || external.get(uri.split(/[\\/]/).pop()!);
      if (!data) throw Error(`Select the companion "${uri}" along with this glTF file.`);
    }
    if (!data || data.length < spec.byteLength || data.length > MAX_BYTES)
      throw Error('A binary animation buffer is missing or truncated.');
    decodedBytes += spec.byteLength;
    if (decodedBytes > MAX_BYTES) throw Error('Animation buffers exceed 128 MB in total.');
    data = data.subarray(0, spec.byteLength);
    cached.set(index, data);
    return data;
  };

  const viewOf = (index: number) => {
    const spec = document.bufferViews?.[index];
    if (!spec || !int(spec.buffer)) throw Error('Invalid animation buffer view.');
    const data = buffer(spec.buffer),
      offset = spec.byteOffset ?? 0;
    requireRange(offset, spec.byteLength, data.length, 'buffer view');
    return {
      view: new DataView(data.buffer, data.byteOffset + offset, spec.byteLength),
      stride: spec.byteStride,
    };
  };
  const accessorCache = new Map<number, Float32Array>();
  let decodedScalars = 0;
  function floats(index: number) {
    if (accessorCache.has(index)) return accessorCache.get(index)!;
    const spec = document.accessors[index];
    const n =
      spec?.type === 'SCALAR' ? 1 : spec?.type === 'VEC3' ? 3 : spec?.type === 'VEC4' ? 4 : 0;
    if (!spec || spec.componentType !== 5126 || !n || !int(spec.count) || spec.count < 1)
      throw Error('Animation accessor must contain Float32 scalar, vector, or quaternion samples.');
    decodedScalars += spec.count * n;
    if (decodedScalars > 8_000_000) throw Error('The file exceeds the animation sample limit.');
    const result = new Float32Array(spec.count * n);
    if (spec.bufferView !== undefined) {
      const { view, stride = n * 4 } = viewOf(spec.bufferView);
      const offset = spec.byteOffset ?? 0;
      if (!int(stride) || stride < n * 4) throw Error('Invalid animation byte stride.');
      requireRange(
        offset,
        (spec.count - 1) * stride + n * 4,
        view.byteLength,
        'animation accessor',
      );
      for (let i = 0; i < spec.count; i++)
        for (let j = 0; j < n; j++)
          result[i * n + j] = view.getFloat32(offset + i * stride + j * 4, true);
    }
    if (spec.sparse) {
      const { count, indices, values } = spec.sparse;
      const size =
        indices.componentType === 5121
          ? 1
          : indices.componentType === 5123
            ? 2
            : indices.componentType === 5125
              ? 4
              : 0;
      if (!int(count) || count > spec.count || !size) throw Error('Invalid sparse animation data.');
      const indexView = viewOf(indices.bufferView).view,
        valueView = viewOf(values.bufferView).view;
      const io = indices.byteOffset ?? 0,
        vo = values.byteOffset ?? 0;
      requireRange(io, count * size, indexView.byteLength, 'sparse indices');
      requireRange(vo, count * n * 4, valueView.byteLength, 'sparse values');
      let previous = -1;
      for (let i = 0; i < count; i++) {
        const pointer = io + i * size;
        const target =
          size === 1
            ? indexView.getUint8(pointer)
            : size === 2
              ? indexView.getUint16(pointer, true)
              : indexView.getUint32(pointer, true);
        if (target >= spec.count || target <= previous) throw Error('Invalid sparse sample index.');
        previous = target;
        for (let j = 0; j < n; j++)
          result[target * n + j] = valueView.getFloat32(vo + (i * n + j) * 4, true);
      }
    }
    if (!result.every(finite)) throw Error('An animation contains non-finite values.');
    accessorCache.set(index, result);
    return result;
  }
  const channelsCache = new Map<number, MotionChannel[]>();
  function readChannels(index: number) {
    if (channelsCache.has(index)) return channelsCache.get(index)!;
    const action = document.animations[index];
    if (
      !action ||
      !Array.isArray(action.channels) ||
      !Array.isArray(action.samplers) ||
      action.channels.length > 30000
    )
      throw Error('Invalid action channels.');
    const channels: MotionChannel[] = [];
    for (const channel of action.channels) {
      const node = channel.target?.node,
        path = channel.target?.path;
      if (node === undefined || !['translation', 'rotation', 'scale', 'weights'].includes(path))
        continue;
      if (!int(node) || node >= rest.length)
        throw Error('An animation references a missing rig node.');
      const sampler = action.samplers[channel.sampler];
      if (!sampler || document.accessors[sampler.input]?.type !== 'SCALAR')
        throw Error('Invalid animation sampler.');
      const times = floats(sampler.input),
        values = floats(sampler.output);
      if (times[0] < 0 || times.some((time, i) => i > 0 && time <= times[i - 1]))
        throw Error('Animation times must be increasing and nonnegative.');
      const interpolation = sampler.interpolation || 'LINEAR';
      if (!['LINEAR', 'STEP', 'CUBICSPLINE'].includes(interpolation))
        throw Error('Unsupported animation interpolation.');
      const components = values.length / times.length / (interpolation === 'CUBICSPLINE' ? 3 : 1);
      const expected = path === 'rotation' ? 4 : path === 'weights' ? components : 3;
      if (!int(components) || components < 1 || components !== expected || components > 1024)
        throw Error('Animation sample count does not match its channel.');
      channels.push({ node, path, times, values, interpolation, components });
    }
    channelsCache.set(index, channels);
    return channels;
  }
  return { document, rest, parents, order, readChannels };
}

const qa = new Quaternion(),
  qb = new Quaternion();
/** glTF's cubic tangents are derivatives in seconds, not Bézier control positions. */
export function sampleChannel(channel: MotionChannel, time: number, output: number[]) {
  const { times, values, components: n, interpolation } = channel;
  const cubic = interpolation === 'CUBICSPLINE',
    stride = n * (cubic ? 3 : 1);
  let low = 0,
    high = times.length - 1;
  if (time <= times[0]) high = 0;
  else if (time >= times[high]) low = high;
  else
    while (high - low > 1) {
      const mid = (low + high) >>> 1;
      if (times[mid] <= time + 1e-7) low = mid;
      else high = mid;
    }
  const a = low * stride + (cubic ? n : 0),
    b = high * stride + (cubic ? n : 0);
  if (low === high || interpolation === 'STEP') {
    for (let i = 0; i < n; i++) output[i] = values[a + i];
    return;
  }
  const span = times[high] - times[low],
    t = Math.max(0, Math.min(1, (time - times[low]) / span));
  if (!cubic && channel.path === 'rotation') {
    qa.fromArray(values, a).normalize().slerp(qb.fromArray(values, b).normalize(), t);
    qa.toArray(output);
  } else if (cubic) {
    const t2 = t * t,
      t3 = t2 * t;
    for (let i = 0; i < n; i++)
      output[i] =
        (2 * t3 - 3 * t2 + 1) * values[a + i] +
        (t3 - 2 * t2 + t) * span * values[a + n + i] +
        (-2 * t3 + 3 * t2) * values[b + i] +
        (t3 - t2) * span * values[b - n + i];
    if (channel.path === 'rotation') qa.fromArray(output).normalize().toArray(output);
  } else {
    for (let i = 0; i < n; i++) output[i] = values[a + i] + (values[b + i] - values[a + i]) * t;
  }
}
