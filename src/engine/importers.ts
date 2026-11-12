import { Gunzip, Unzlib, unzipSync } from 'fflate';
import type { VoxelData } from '../model';
import { MAX_IMPORT_BLOCKS } from '../import-limits';
export type ImportOptions = {
  centerX: number;
  centerZ: number;
  radius: number;
  minY: number;
  maxY: number;
};
export type ImportResult = { voxels: VoxelData; warnings: string[]; origin: number[] };
const MAX_BYTES = 128 * 1024 * 1024;
const air = (s: string) => /(^|:)(air|cave_air|void_air|structure_void)(\[|$)/.test(s);
export function inflate(bytes: Uint8Array, kind: 'gzip' | 'zlib'): Uint8Array {
  let size = 0;
  const chunks: Uint8Array[] = [];
  const ondata = (chunk: Uint8Array) => {
    size += chunk.length;
    if (size > MAX_BYTES)
      throw Error('Decompressed import exceeds 128 MB. Select a smaller region.');
    chunks.push(chunk);
  };
  const decoder = kind === 'gzip' ? new Gunzip(ondata) : new Unzlib(ondata);
  for (let offset = 0; offset < bytes.length; offset += 16384)
    decoder.push(bytes.subarray(offset, offset + 16384), offset + 16384 >= bytes.length);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    output.set(c, offset);
    offset += c.length;
  }
  return output;
}
export function readNBT(input: Uint8Array): any {
  const bytes = input[0] === 31 && input[1] === 139 ? inflate(input, 'gzip') : input;
  if (bytes.length > MAX_BYTES) throw Error('NBT exceeds 128 MB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = new TextDecoder();
  let p = 0,
    tags = 0;
  const need = (n: number) => {
    if (n < 0 || p + n > bytes.length) throw Error('Truncated or corrupt NBT data.');
  };
  const u8 = () => {
    need(1);
    return view.getUint8(p++);
  };
  const i32 = () => {
    need(4);
    const n = view.getInt32(p);
    p += 4;
    return n;
  };
  const string = () => {
    need(2);
    const n = view.getUint16(p);
    p += 2;
    need(n);
    const s = text.decode(bytes.subarray(p, p + n));
    p += n;
    return s;
  };
  const count = (stride = 1) => {
    const n = i32();
    if (n < 0 || n > 16777216) throw Error('NBT array is too large.');
    need(n * stride);
    return n;
  };
  const payload = (type: number, depth: number): any => {
    if (depth > 64 || ++tags > 2000000) throw Error('NBT nesting or tag limit exceeded.');
    switch (type) {
      case 1:
        need(1);
        return view.getInt8(p++);
      case 2: {
        need(2);
        const v = view.getInt16(p);
        p += 2;
        return v;
      }
      case 3:
        return i32();
      case 4: {
        need(8);
        const v = view.getBigInt64(p);
        p += 8;
        return v;
      }
      case 5: {
        need(4);
        const v = view.getFloat32(p);
        p += 4;
        return v;
      }
      case 6: {
        need(8);
        const v = view.getFloat64(p);
        p += 8;
        return v;
      }
      case 7: {
        const n = count();
        const v = bytes.slice(p, p + n);
        p += n;
        return v;
      }
      case 8:
        return string();
      case 9: {
        const t = u8(),
          n = count();
        if (t === 0 && n) throw Error('Invalid NBT list.');
        const a = [];
        for (let i = 0; i < n; i++) a.push(payload(t, depth + 1));
        return a;
      }
      case 10: {
        const v: Record<string, any> = Object.create(null);
        let t;
        while ((t = u8()) !== 0) {
          const name = string();
          v[name] = payload(t, depth + 1);
        }
        return v;
      }
      case 11: {
        const n = count(4);
        const v = [];
        for (let i = 0; i < n; i++) v.push(i32());
        return v;
      }
      case 12: {
        const n = count(8);
        const v: bigint[] = [];
        for (let i = 0; i < n; i++) {
          v.push(view.getBigUint64(p));
          p += 8;
        }
        return v;
      }
      default:
        throw Error(`Unsupported NBT tag ${type}.`);
    }
  };
  const type = u8();
  if (type !== 10) throw Error('Expected a Java Edition NBT compound.');
  string();
  return payload(type, 0);
}
const legacy: Record<number, string> = {
  0: 'air',
  1: 'stone',
  2: 'grass_block',
  3: 'dirt',
  4: 'cobblestone',
  5: 'oak_planks',
  7: 'bedrock',
  8: 'water',
  9: 'water',
  10: 'lava',
  11: 'lava',
  12: 'sand',
  13: 'gravel',
  14: 'gold_ore',
  15: 'iron_ore',
  16: 'coal_ore',
  17: 'oak_log',
  18: 'oak_leaves',
  20: 'glass',
  24: 'sandstone',
  35: 'white_wool',
  41: 'gold_block',
  42: 'iron_block',
  43: 'stone',
  44: 'stone_slab',
  45: 'bricks',
  46: 'tnt',
  47: 'bookshelf',
  48: 'mossy_cobblestone',
  49: 'obsidian',
  50: 'torch',
  53: 'oak_stairs',
  54: 'chest',
  56: 'diamond_ore',
  57: 'diamond_block',
  58: 'crafting_table',
  60: 'farmland',
  61: 'furnace',
  64: 'oak_door',
  67: 'cobblestone_stairs',
  79: 'ice',
  80: 'snow_block',
  81: 'cactus',
  82: 'clay',
  85: 'oak_fence',
  87: 'netherrack',
  88: 'soul_sand',
  89: 'glowstone',
  95: 'glass',
  98: 'stone_bricks',
  103: 'melon',
  112: 'nether_bricks',
  121: 'end_stone',
  129: 'emerald_ore',
  133: 'emerald_block',
  152: 'redstone_block',
  155: 'quartz_block',
  159: 'terracotta',
  162: 'acacia_log',
  168: 'prismarine',
  169: 'sea_lantern',
  172: 'terracotta',
  173: 'coal_block',
  174: 'packed_ice',
  179: 'red_sandstone',
};
const legacyName = (n: number) => `minecraft:${legacy[n] || 'stone'}`;
function stateName(state: any): string {
  if (!state || typeof state.Name !== 'string') throw Error('Invalid named block state.');
  const properties = Object.entries(state.Properties || {}).sort(([a], [b]) => a.localeCompare(b));
  return (
    state.Name +
    (properties.length ? `[${properties.map(([key, value]) => `${key}=${value}`).join(',')}]` : '')
  );
}
function accumulator() {
  const palette: string[] = [],
    lookup = new Map<string, number>(),
    blocks: VoxelData['blocks'] = [];
  return {
    palette,
    blocks,
    add(x: number, y: number, z: number, name: string) {
      if (typeof name !== 'string' || name.length > 500) throw Error('Invalid block state name.');
      if (air(name)) return;
      if (blocks.length >= MAX_IMPORT_BLOCKS)
        throw Error(`Import exceeds ${MAX_IMPORT_BLOCKS.toLocaleString()} solid blocks. Split the build or reduce the selected area.`);
      if (![x, y, z].every(Number.isInteger)) throw Error('Invalid block coordinates.');
      let id = lookup.get(name);
      if (id === undefined) {
        if (palette.length >= 4096)
          throw Error('Build exceeds 4,096 distinct block states. Reduce the selected area.');
        id = palette.length;
        palette.push(name);
        lookup.set(name, id);
      }
      blocks.push([x, y, z, id]);
    },
  };
}
export function unpack(data: bigint[], index: number, bits: number, padded: boolean): number {
  const per = Math.floor(64 / bits),
    bit = padded ? (index % per) * bits : (index * bits) % 64,
    word = padded ? Math.floor(index / per) : Math.floor((index * bits) / 64);
  if (data[word] === undefined) throw Error('Truncated block state array.');
  let value = data[word] >> BigInt(bit);
  if (!padded && bit + bits > 64) {
    if (data[word + 1] === undefined) throw Error('Truncated packed block state.');
    value |= data[word + 1] << BigInt(64 - bit);
  }
  return Number(value & ((1n << BigInt(bits)) - 1n));
}
function finish(a: ReturnType<typeof accumulator>, warnings: string[]): ImportResult {
  if (!a.blocks.length)
    throw Error(
      'No solid blocks found inside these bounds. Check the chunk coordinates and height range.',
    );
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const [x, y, z] of a.blocks) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const cx = Math.floor((minX + maxX) / 2),
    cz = Math.floor((minZ + maxZ) / 2);
  for (const b of a.blocks) {
    b[0] -= cx;
    b[1] -= minY;
    b[2] -= cz;
  }
  warnings.push(
    'Block rendering uses your selected Minecraft resources. Mobs, biome data and block-entity contents are not imported.',
  );
  return { voxels: { palette: a.palette, blocks: a.blocks }, warnings, origin: [cx, minY, cz] };
}
export function importNBT(bytes: Uint8Array): ImportResult {
  let root = readNBT(bytes);
  root = root.Schematic || root;
  const a = accumulator(),
    warnings: string[] = [];
  if (root.Regions) {
    for (const r of Object.values(root.Regions) as any[]) {
      const [w, h, l] = [Math.abs(r.Size.x), Math.abs(r.Size.y), Math.abs(r.Size.z)];
      if (w * h * l > 16777216) throw Error('Litematic region is too large.');
      const palette = r.BlockStatePalette?.map(stateName);
      if (!palette?.length) throw Error('Missing Litematica palette.');
      const bits = Math.max(2, Math.ceil(Math.log2(palette.length)));
      for (let i = 0; i < w * h * l; i++) {
        const id = unpack(r.BlockStates, i, bits, false);
        if (!palette[id]) throw Error('Invalid palette index.');
        const x = i % w,
          y = Math.floor(i / (w * l)),
          z = Math.floor(i / w) % l;
        a.add(
          r.Position.x + (r.Size.x < 0 ? 1 - w : 0) + x,
          r.Position.y + (r.Size.y < 0 ? 1 - h : 0) + y,
          r.Position.z + (r.Size.z < 0 ? 1 - l : 0) + z,
          palette[id],
        );
      }
    }
  } else if ((root.palette || root.palettes?.[0]) && root.blocks) {
    const palette = (root.palette || root.palettes[0]).map(stateName);
    if (root.palettes?.length > 1)
      warnings.push('This randomized structure uses its first palette variant.');
    for (const b of root.blocks) {
      const name = palette[b.state];
      if (!name || !Array.isArray(b.pos) || b.pos.length !== 3)
        throw Error('Invalid structure block.');
      a.add(b.pos[0], b.pos[1], b.pos[2], name);
    }
  } else if (root.Width && root.Height && root.Length) {
    const w = root.Width & 65535,
      h = root.Height & 65535,
      l = root.Length & 65535,
      count = w * h * l;
    if (count > 16777216) throw Error('Schematic volume exceeds 16 million blocks.');
    const pal = root.Blocks?.Palette || root.Palette,
      data = root.Blocks?.Data || root.BlockData;
    if (pal && data) {
      const names: string[] = [];
      for (const [name, id] of Object.entries(pal)) {
        if (!Number.isInteger(id) || (id as number) < 0 || (id as number) > 1048576)
          throw Error('Invalid schematic palette index.');
        names[id as number] = name;
      }
      let offset = 0;
      for (let i = 0; i < count; i++) {
        let id = 0,
          shift = 0,
          b;
        do {
          if (offset >= data.length || shift > 28) throw Error('Invalid schematic VarInt.');
          b = data[offset++];
          id |= (b & 127) << shift;
          shift += 7;
        } while (b & 128);
        if (!names[id]) throw Error('Invalid schematic palette index.');
        a.add(i % w, Math.floor(i / (w * l)), Math.floor(i / w) % l, names[id]);
      }
    } else if (root.Blocks instanceof Uint8Array) {
      if (root.Blocks.length < count) throw Error('Truncated legacy schematic.');
      for (let i = 0; i < count; i++) {
        const extra = root.AddBlocks ? ((root.AddBlocks[i >> 1] >> ((i & 1) * 4)) & 15) << 8 : 0;
        a.add(
          i % w,
          Math.floor(i / (w * l)),
          Math.floor(i / w) % l,
          legacyName(root.Blocks[i] + extra),
        );
      }
      warnings.push(
        'Legacy numeric block IDs use representative modern materials; metadata variants are simplified.',
      );
    } else throw Error('Unrecognized schematic block layout.');
  } else
    throw Error(
      'Supported NBT: Sponge .schem v2/v3, MCEdit .schematic, vanilla structure .nbt, and .litematic.',
    );
  return finish(a, warnings);
}
function readRegion(
  bytes: Uint8Array,
  name: string,
  options: ImportOptions,
  a: ReturnType<typeof accumulator>,
  warnings: string[],
) {
  const match = /r\.(-?\d+)\.(-?\d+)\.mca$/i.exec(name);
  if (!match) throw Error('Region filename must be r.X.Z.mca.');
  if (bytes.length < 8192) throw Error('Truncated Anvil region header.');
  const rx = Number(match[1]),
    rz = Number(match[2]),
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let local = 0; local < 1024; local++) {
    const cx = rx * 32 + (local % 32),
      cz = rz * 32 + Math.floor(local / 32);
    if (
      Math.abs(cx - options.centerX) > options.radius ||
      Math.abs(cz - options.centerZ) > options.radius
    )
      continue;
    const loc = view.getUint32(local * 4),
      sector = loc >>> 8;
    if (!sector) continue;
    const pos = sector * 4096;
    if (pos + 5 > bytes.length) throw Error('Truncated Anvil chunk location.');
    const length = view.getUint32(pos),
      type = bytes[pos + 4];
    if (length < 1 || length > (loc & 255) * 4096 - 4 || pos + 4 + length > bytes.length)
      throw Error('Invalid Anvil chunk size.');
    if (type & 128) {
      warnings.push('External .mcc chunks were skipped.');
      continue;
    }
    if (![1, 2, 3].includes(type)) {
      warnings.push(`Chunk compression ${type} is unsupported (LZ4 regions need conversion).`);
      continue;
    }
    const compressed = bytes.subarray(pos + 5, pos + 4 + length),
      root = readNBT(
        type === 1
          ? inflate(compressed, 'gzip')
          : type === 2
            ? inflate(compressed, 'zlib')
            : compressed,
      ),
      chunk = root.Level || root;
    const sections = chunk.sections || chunk.Sections || [];
    for (const sec of sections) {
      const sy = sec.Y * 16;
      if (sy > options.maxY || sy + 15 < options.minY) continue;
      const states = sec.block_states || { palette: sec.Palette, data: sec.BlockStates };
      if (states.palette?.length) {
        const pal = states.palette.map(stateName),
          bits = Math.max(4, Math.ceil(Math.log2(pal.length))),
          padded = (root.DataVersion || 0) >= 2529;
        for (let i = 0; i < 4096; i++) {
          const y = sy + (i >> 8);
          if (y < options.minY || y > options.maxY) continue;
          const id = pal.length === 1 ? 0 : unpack(states.data || [], i, bits, padded);
          if (!pal[id]) throw Error('Invalid chunk palette index.');
          a.add(cx * 16 + (i & 15), y, cz * 16 + ((i >> 4) & 15), pal[id]);
        }
      } else if (sec.Blocks) {
        for (let i = 0; i < 4096; i++) {
          const y = sy + (i >> 8);
          if (y >= options.minY && y <= options.maxY)
            a.add(cx * 16 + (i & 15), y, cz * 16 + ((i >> 4) & 15), legacyName(sec.Blocks[i]));
        }
      }
    }
  }
}
export function readZip(
  bytes: Uint8Array,
  filter: (name: string) => boolean,
): Record<string, Uint8Array> {
  let total = 0;
  return unzipSync(bytes, {
    filter: (entry) => {
      if (!filter(entry.name)) return false;
      total += entry.originalSize;
      if (total > MAX_BYTES)
        throw Error('Selected ZIP contents exceed 128 MB. Import fewer region files.');
      return true;
    },
  });
}
export function importFile(bytes: Uint8Array, name: string, options: ImportOptions): ImportResult {
  if (bytes.length > MAX_BYTES)
    throw Error('Import file exceeds 128 MB. Extract a region file or a smaller schematic.');
  if (!/\.(mca|zip)$/i.test(name)) return importNBT(bytes);
  const a = accumulator(),
    warnings: string[] = [];
  if (/\.mca$/i.test(name)) readRegion(bytes, name, options, a, warnings);
  else {
    const files = readZip(bytes, (n) => {
      const m = /(?:^|\/)region\/r\.(-?\d+)\.(-?\d+)\.mca$/i.exec(n);
      return (
        !!m &&
        Math.abs(Number(m[1]) * 32 + 15.5 - options.centerX) <= 16 + options.radius &&
        Math.abs(Number(m[2]) * 32 + 15.5 - options.centerZ) <= 16 + options.radius &&
        !/DIM-?\d|dimensions\//.test(n)
      );
    });
    if (!Object.keys(files).length)
      throw Error(
        'No matching Overworld region files in this ZIP. Check chunk coordinates, or import an individual .mca file.',
      );
    for (const [path, data] of Object.entries(files)) readRegion(data, path, options, a, warnings);
  }
  return finish(a, [...new Set(warnings)]);
}
