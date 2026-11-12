import { gzipSync, zipSync, zlibSync } from 'fflate';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
type Tag = { type: number; value: any };
export const byte = (v: number): Tag => ({ type: 1, value: v });
export const short = (v: number): Tag => ({ type: 2, value: v });
export const int = (v: number): Tag => ({ type: 3, value: v });
export const str = (v: string): Tag => ({ type: 8, value: v });
export const bytes = (v: number[]): Tag => ({ type: 7, value: Uint8Array.from(v) });
export const longs = (v: bigint[]): Tag => ({ type: 12, value: v });
export const compound = (v: Record<string, Tag>): Tag => ({ type: 10, value: v });
export const list = (type: number, v: any[]): Tag => ({ type: 9, value: { type, items: v } });
const b16 = (n: number) => {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
};
const b32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeInt32BE(n);
  return b;
};
const string = (s: string) => Buffer.concat([b16(Buffer.byteLength(s)), Buffer.from(s)]);
function payload(t: Tag): Buffer {
  if (t.type === 1) return Buffer.from([t.value & 255]);
  if (t.type === 2) return b16(t.value & 65535);
  if (t.type === 3) return b32(t.value);
  if (t.type === 7) return Buffer.concat([b32(t.value.length), t.value]);
  if (t.type === 8) return string(t.value);
  if (t.type === 9)
    return Buffer.concat([
      Buffer.from([t.value.type]),
      b32(t.value.items.length),
      ...t.value.items.map((v: any) => payload({ type: t.value.type, value: v })),
    ]);
  if (t.type === 10)
    return Buffer.concat([
      ...Object.entries(t.value as Record<string, Tag>).map(([k, v]) =>
        Buffer.concat([Buffer.from([v.type]), string(k), payload(v)]),
      ),
      Buffer.from([0]),
    ]);
  if (t.type === 12)
    return Buffer.concat([
      b32(t.value.length),
      ...t.value.map((n: bigint) => {
        const b = Buffer.alloc(8);
        b.writeBigUInt64BE(n);
        return b;
      }),
    ]);
  throw Error('Fixture type unsupported');
}
export const encode = (value: Record<string, Tag>) =>
  Buffer.concat([Buffer.from([10]), string(''), payload(compound(value))]);
export const schematic2 = () =>
  gzipSync(
    encode({
      Version: int(2),
      Width: short(2),
      Height: short(1),
      Length: short(2),
      Palette: compound({
        'minecraft:air': int(0),
        'minecraft:stone': int(1),
        'minecraft:oak_planks': int(2),
      }),
      BlockData: bytes([1, 0, 2, 1]),
    }),
  );
export const schematic3 = () =>
  gzipSync(
    encode({
      Schematic: compound({
        Version: int(3),
        Width: short(2),
        Height: short(1),
        Length: short(1),
        Blocks: compound({
          Palette: compound({ 'minecraft:air': int(0), 'minecraft:stone_slab[type=top]': int(1) }),
          Data: bytes([1, 0]),
        }),
      }),
    }),
  );
export const structure = () =>
  gzipSync(
    encode({
      size: list(3, [2, 2, 2]),
      palette: list(10, [{ Name: str('minecraft:air') }, { Name: str('minecraft:gold_block') }]),
      blocks: list(10, [
        { pos: list(3, [0, 0, 0]), state: int(1) },
        { pos: list(3, [1, 1, 1]), state: int(1) },
      ]),
    }),
  );
export const legacySchematic = () =>
  gzipSync(
    encode({
      Width: short(2),
      Height: short(1),
      Length: short(1),
      Blocks: bytes([1, 2]),
      Data: bytes([0, 0]),
    }),
  );
export const stressSchematic = () =>
  gzipSync(
    encode({
      Version: int(2),
      Width: short(48),
      Height: short(48),
      Length: short(48),
      Palette: compound({ 'minecraft:stone': int(0) }),
      BlockData: bytes(new Array(48 ** 3).fill(0)),
    }),
  );
export const litematic = () =>
  gzipSync(
    encode({
      Regions: compound({
        Test: compound({
          Position: compound({ x: int(5), y: int(1), z: int(-2) }),
          Size: compound({ x: int(-2), y: int(1), z: int(1) }),
          BlockStatePalette: list(10, [
            { Name: str('minecraft:air') },
            { Name: str('minecraft:bricks') },
          ]),
          BlockStates: longs([5n]),
        }),
      }),
    }),
  );
export function region() {
  const section = {
    Y: byte(0),
    block_states: compound({ palette: list(10, [{ Name: str('minecraft:stone') }]) }),
  };
  const chunk = encode({
    DataVersion: int(3465),
    xPos: int(0),
    zPos: int(0),
    sections: list(10, [section]),
  });
  const compressed = zlibSync(chunk),
    sectors = Math.ceil((compressed.length + 5) / 4096),
    data = Buffer.alloc(8192 + sectors * 4096);
  data.writeUInt32BE((2 << 8) | sectors, 0);
  data.writeUInt32BE(compressed.length + 1, 8192);
  data[8196] = 2;
  data.set(compressed, 8197);
  return data;
}
export function writeFixtures(directory: string) {
  mkdirSync(directory, { recursive: true });
  for (const [name, value] of Object.entries({
    'tiny.schem': schematic2(),
    'sponge-v3.schem': schematic3(),
    'structure.nbt': structure(),
    'legacy.schematic': legacySchematic(),
    'tiny.litematic': litematic(),
    'stress.schem': stressSchematic(),
    'r.0.0.mca': region(),
    'world.zip': zipSync({ 'Example/region/r.0.0.mca': region() }),
  }))
    writeFileSync(resolve(directory, name), value);
}
