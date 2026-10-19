// Clipboard polling loop (Electron glue). Cheap type queries every tick; data reads only
// when needed; image decode only when the raw-bytes hash is new.
import { clipboard } from 'electron';
import { randomUUID } from 'node:crypto';
import { shouldCapture, classify, textHash, imageHash, fileHash } from './fingerprint.js';

const darwin = process.platform === 'darwin';

function readMacImageBytes() {
  const tiff = clipboard.readBuffer('public.tiff');
  if (tiff.length > 0) return tiff;
  return clipboard.readBuffer('public.png');
}

function readFileUrl(formats) {
  if (!darwin || !formats.includes('text/uri-list')) return '';
  try {
    return clipboard.readBuffer('public.file-url').toString('utf8').trim();
  } catch {
    return '';
  }
}

export function startCapture({ store, persistence, settings, log = console.log }) {
  let lastHash = null;
  let paused = false;
  let timer = null;

  function snapshot() {
    const formats = clipboard.availableFormats();
    const concealed = darwin && (
      clipboard.has('org.nspasteboard.ConcealedType') ||
      clipboard.has('org.nspasteboard.TransientType'));
    if (!shouldCapture({ formats, concealed })) return null;

    const fileUrl = readFileUrl(formats);
    const kind = classify(formats, { fileUrl });
    if (!kind) return null;

    if (kind === 'text') {
      const text = clipboard.readText();
      const hash = textHash(text);
      return hash ? { kind, hash, text, formats } : null;
    }
    if (kind === 'image') {
      const bytes = darwin ? readMacImageBytes() : clipboard.readImage().toBitmap();
      const hash = imageHash(bytes);
      return hash ? { kind, hash, formats } : null;
    }
    const filePath = decodeURIComponent(new URL(fileUrl).pathname);
    return { kind, hash: fileHash(filePath), filePath, formats };
  }

  function materialize(snap) {
    const input = { kind: snap.kind, hash: snap.hash, text: snap.text ?? '' };
    if (snap.kind === 'text') {
      if (snap.formats.includes('text/html')) input.html = clipboard.readHTML();
      if (snap.formats.includes('text/rtf')) input.rtf = clipboard.readRTF();
    } else if (snap.kind === 'image') {
      const img = clipboard.readImage();
      if (img.isEmpty()) return null;
      const { width, height } = img.getSize();
      const max = settings.thumbMaxPx;
      const thumb = img.resize(width >= height ? { width: Math.min(max, width) } : { height: Math.min(max, height) });
      const id = randomUUID();
      const paths = persistence.saveImage(id, img.toPNG(), thumb.toPNG());
      Object.assign(input, { id, width, height }, paths);
    } else {
      input.text = snap.filePath;
      input.files = [snap.filePath];
    }
    return input;
  }

  function tick() {
    if (paused) return;
    try {
      const snap = snapshot();
      if (!snap || snap.hash === lastHash) return;
      lastHash = snap.hash;
      const input = materialize(snap);
      if (!input) return;
      const { existed } = store.add(input);
      if (existed && input.kind === 'image') persistence.deleteImages(input);
      for (const removed of store.trim(settings.maxClips)) persistence.deleteImages(removed);
    } catch (err) {
      log('capture: fel vid avläsning av urklipp', err);
    }
  }

  timer = setInterval(tick, settings.pollMs);
  tick();

  return {
    stop() { if (timer) clearInterval(timer); timer = null; },
    pause() { paused = true; },
    resume() { paused = false; lastHash = null; },
    isPaused() { return paused; },
    // Called after Klipp itself writes to the clipboard so the poller treats it as seen.
    markSeen(hash) { lastHash = hash; },
  };
}
