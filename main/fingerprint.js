// Pure helpers that decide whether and how a clipboard snapshot becomes a clip.
import { createHash } from 'node:crypto';

const FULL_HASH_MAX = 4 * 1024 * 1024; // above this, hash length + evenly spaced samples
const SAMPLES = 65536;

const sha1 = (parts) => {
  const h = createHash('sha1');
  for (const p of parts) h.update(p);
  return h.digest('hex');
};

export function shouldCapture({ formats, concealed }) {
  if (concealed) return false;
  return Array.isArray(formats) && formats.length > 0;
}

export function classify(formats, { fileUrl } = {}) {
  if (fileUrl) return 'file';
  const hasText = formats.includes('text/plain');
  const hasImage = formats.some(f => f.startsWith('image/'));
  if (hasImage && !hasText) return 'image';
  if (hasText) return 'text';
  return null;
}

export function sampleBytes(buf, n) {
  if (buf.length <= n) return Buffer.from(buf);
  const out = Buffer.alloc(n);
  const step = (buf.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) out[i] = buf[Math.round(i * step)];
  return out;
}

function isBlank(bytes) {
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b !== 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d && b !== 0x0b && b !== 0x0c) return false;
  }
  return true;
}

function contentHash(prefix, bytes) {
  if (bytes.length <= FULL_HASH_MAX) return sha1([prefix, bytes]);
  return sha1([`${prefix}${bytes.length}:`, sampleBytes(bytes, SAMPLES)]);
}

// Accepts a string or its UTF-8 bytes; both give the same hash. Whitespace-only -> null.
export function textHash(text) {
  let bytes;
  if (typeof text === 'string') {
    if (text.trim() === '') return null;
    bytes = Buffer.from(text, 'utf8');
  } else if (Buffer.isBuffer(text)) {
    bytes = text;
    if (bytes.length === 0 || isBlank(bytes)) return null;
  } else {
    return null;
  }
  return contentHash('text:', bytes);
}

export function imageHash(bytes) {
  if (!bytes || bytes.length === 0) return null;
  return sha1([`image:${bytes.length}:`, sampleBytes(bytes, SAMPLES)]);
}

export function fileHash(path) {
  return sha1(['file:', path]);
}
