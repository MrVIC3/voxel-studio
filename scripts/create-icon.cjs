const fs = require('node:fs');
const zlib = require('node:zlib');
const size = 256,
  scale = 3,
  s = size * scale,
  pixels = Buffer.alloc(s * s * 4);
const set = (x, y, c) => {
  const i = (y * s + x) * 4;
  pixels[i] = c[0];
  pixels[i + 1] = c[1];
  pixels[i + 2] = c[2];
  pixels[i + 3] = 255;
};
for (let y = 0; y < s; y++)
  for (let x = 0; x < s; x++) {
    const dx = Math.max(0, 42 * scale - x, x - (size - 42) * scale),
      dy = Math.max(0, 42 * scale - y, y - (size - 42) * scale);
    if (dx * dx + dy * dy <= (42 * scale) ** 2) set(x, y, [224, 224, 224]);
  }
const lines = [
  [
    [128, 49],
    [197, 89],
  ],
  [
    [197, 89],
    [197, 168],
  ],
  [
    [197, 168],
    [128, 208],
  ],
  [
    [128, 208],
    [59, 168],
  ],
  [
    [59, 168],
    [59, 89],
  ],
  [
    [59, 89],
    [128, 49],
  ],
  [
    [59, 89],
    [128, 129],
  ],
  [
    [197, 89],
    [128, 129],
  ],
  [
    [128, 129],
    [128, 208],
  ],
];
for (const [from, to] of lines) {
  const [ax, ay] = from.map((v) => v * scale),
    [bx, by] = to.map((v) => v * scale),
    dx = bx - ax,
    dy = by - ay;
  for (
    let y = Math.max(0, Math.floor(Math.min(ay, by) - 6 * scale));
    y < Math.min(s, Math.ceil(Math.max(ay, by) + 6 * scale));
    y++
  )
    for (
      let x = Math.max(0, Math.floor(Math.min(ax, bx) - 6 * scale));
      x < Math.min(s, Math.ceil(Math.max(ax, bx) + 6 * scale));
      x++
    ) {
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
      if ((x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2 <= (5 * scale) ** 2)
        set(x, y, [35, 35, 35]);
    }
}
const raw = Buffer.alloc((size * 4 + 1) * size);
for (let y = 0; y < size; y++)
  for (let x = 0; x < size; x++)
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let sy = 0; sy < scale; sy++)
        for (let sx = 0; sx < scale; sx++)
          sum += pixels[((y * scale + sy) * s + (x * scale + sx)) * 4 + c];
      raw[y * (size * 4 + 1) + 1 + x * 4 + c] = Math.round(sum / (scale * scale));
    }
const crc32 = (b) => {
  let c = 0xffffffff;
  for (const v of b) {
    c ^= v;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (name, data) => {
  const b = Buffer.alloc(data.length + 12);
  b.writeUInt32BE(data.length, 0);
  b.write(name, 4);
  data.copy(b, 8);
  b.writeUInt32BE(crc32(b.subarray(4, -4)), b.length - 4);
  return b;
};
const header = Buffer.alloc(13);
header.writeUInt32BE(size, 0);
header.writeUInt32BE(size, 4);
header[8] = 8;
header[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', header),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);
fs.writeFileSync('public/app.png', png);
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(1, 4);
ico.writeUInt16LE(1, 10);
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14);
ico.writeUInt32LE(22, 18);
fs.writeFileSync('public/app.ico', Buffer.concat([ico, png]));
