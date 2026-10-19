// Minimal PNG encoder (8-bit RGBA, filter 0) and the tray glyph. No dependencies.
import { deflateSync } from 'node:zlib';

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

export function encodePng(width, height, rgba) {
  if (rgba.length !== width * height * 4) throw new Error('rgba length mismatch');
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// A clipboard outline: a board with a small clip at the top. Black with alpha only,
// which is what macOS template images need. Scales by integer factor from a 16px design.
export function drawTrayGlyph(size) {
  const px = new Uint8Array(size * size * 4);
  const s = size / 16;
  const put = (x, y, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = 0; px[i + 1] = 0; px[i + 2] = 0; px[i + 3] = a;
  };
  const rect = (x0, y0, x1, y1) => {
    for (let y = Math.round(y0 * s); y < Math.round(y1 * s); y++)
      for (let x = Math.round(x0 * s); x < Math.round(x1 * s); x++) put(x, y);
  };
  const t = 1; // line thickness in 16px units
  // board: x 2..14, y 3..15, hollow
  rect(2, 3, 14, 3 + t);           // top edge
  rect(2, 15 - t, 14, 15);         // bottom edge
  rect(2, 3, 2 + t, 15);           // left edge
  rect(14 - t, 3, 14, 15);         // right edge
  // clip on top: x 6..10, y 1..4
  rect(6, 1, 10, 1 + t);
  rect(6, 1, 6 + t, 4 + t);
  rect(10 - t, 1, 10, 4 + t);
  // two "text lines" inside
  rect(5, 7, 11, 7 + t);
  rect(5, 10, 11, 10 + t);
  // soften the four outer corners
  for (const [x, y] of [[2, 3], [13, 3], [2, 14], [13, 14]]) {
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) put(Math.round(x * s) + dx, Math.round(y * s) + dy, 0);
  }
  return px;
}
