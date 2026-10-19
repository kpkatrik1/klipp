import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { encodePng, drawTrayGlyph, crc32 } from '../main/png.js';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('encodePng starts with PNG signature and IHDR', () => {
  const png = encodePng(2, 1, new Uint8Array([255, 0, 0, 255, 0, 0, 255, 128]));
  assert.deepEqual(png.subarray(0, 8), SIG);
  assert.equal(png.subarray(12, 16).toString('ascii'), 'IHDR');
});

test('IHDR has width/height and valid CRC', () => {
  const png = encodePng(3, 5, new Uint8Array(3 * 5 * 4));
  assert.equal(png.readUInt32BE(16), 3);
  assert.equal(png.readUInt32BE(20), 5);
  assert.equal(png[24], 8, 'bit depth');
  assert.equal(png[25], 6, 'colour type RGBA');
  const crc = png.readUInt32BE(29);
  assert.equal(crc, crc32(png.subarray(12, 29)));
});

test('IEND chunk present and IDAT inflates to filtered rows', () => {
  const png = encodePng(2, 2, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]));
  assert.equal(png.subarray(png.length - 8, png.length - 4).toString('ascii'), 'IEND');
  const idatLen = png.readUInt32BE(33);
  assert.equal(png.subarray(37, 41).toString('ascii'), 'IDAT');
  const raw = inflateSync(png.subarray(41, 41 + idatLen));
  assert.deepEqual([...raw], [0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 9, 10, 11, 12, 13, 14, 15, 16]);
});

test('crc32 matches known value', () => {
  assert.equal(crc32(Buffer.from('IEND')), 0xae426082);
});

test('drawTrayGlyph(16) has opaque pixels on the border and transparent center', () => {
  const px = drawTrayGlyph(16);
  assert.equal(px.length, 16 * 16 * 4);
  const alpha = (x, y) => px[(y * 16 + x) * 4 + 3];
  assert.equal(alpha(8, 8), 0, 'center transparent');
  assert.ok(alpha(2, 8) > 0, 'left border opaque');
  assert.ok(alpha(13, 8) > 0, 'right border opaque');
  assert.ok(alpha(8, 14) > 0, 'bottom border opaque');
  assert.equal(alpha(0, 0), 0, 'corner outside glyph transparent');
  assert.equal(px[(8 * 16 + 2) * 4], 0, 'glyph is black');
});
