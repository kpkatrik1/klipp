// Pure helpers that decide whether and how a clipboard snapshot becomes a clip.
import { createHash } from 'node:crypto';

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

export function textHash(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  return sha1(['text:', text]);
}

export function sampleBytes(buf, n) {
  if (buf.length <= n) return Buffer.from(buf);
  const out = Buffer.alloc(n);
  const step = (buf.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) out[i] = buf[Math.round(i * step)];
  return out;
}

export function imageHash(bytes) {
  if (!bytes || bytes.length === 0) return null;
  return sha1([`image:${bytes.length}:`, sampleBytes(bytes, 65536)]);
}

export function fileHash(path) {
  return sha1(['file:', path]);
}
