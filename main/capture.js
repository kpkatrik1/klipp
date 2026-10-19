// Clipboard polling loop. Cheap type queries every tick; data reads only when needed;
// image decode only when the raw-bytes hash is new. The clipboard object is injected
// (Electron's `clipboard` in production, a fake in tests), so this module stays pure.
import { randomUUID } from 'node:crypto';
import { shouldCapture, classify, textHash, imageHash, fileHash } from './fingerprint.js';

export function startCapture({ store, persistence, settings, clipboard, platform = process.platform, log = console.log }) {
  const darwin = platform === 'darwin';
  let lastHash = null;
  let paused = false;
  let timer = null;

  function readImageBytes() {
    if (!darwin) return clipboard.readImage().toBitmap(); // dev only (Windows)
    if (clipboard.has('public.png')) {
      const png = clipboard.readBuffer('public.png');
      if (png.length > 0) return png;
    }
    return clipboard.readBuffer('public.tiff');
  }

  function readTextBytes() {
    if (!darwin) return clipboard.readText();
    const bytes = clipboard.readBuffer('public.utf8-plain-text');
    return bytes.length > 0 ? bytes : clipboard.readText();
  }

  function readFileUrl(formats) {
    if (!darwin || !formats.includes('text/uri-list')) return '';
    try {
      return clipboard.readBuffer('public.file-url').toString('utf8').trim();
    } catch {
      return '';
    }
  }

  // Cheap identity of what is on the clipboard right now, without decoding anything.
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
      const hash = textHash(readTextBytes());
      return hash ? { kind, hash, formats } : null;
    }
    if (kind === 'image') {
      const hash = imageHash(readImageBytes());
      return hash ? { kind, hash, formats } : null;
    }
    let filePath;
    try {
      filePath = decodeURIComponent(new URL(fileUrl).pathname);
    } catch {
      return { kind: null, hash: 'badfile:' + fileUrl, formats };
    }
    return { kind, hash: fileHash(filePath), filePath, formats };
  }

  // Full read, done once per new hash.
  function materialize(snap) {
    const input = { kind: snap.kind, hash: snap.hash, text: '' };
    if (snap.kind === 'text') {
      input.text = clipboard.readText();
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
      if (!snap.kind) return; // unparsable file url: remembered so it is not retried every tick
      const input = materialize(snap);
      if (!input) return;
      const { existed } = store.add(input);
      if (existed && input.kind === 'image') persistence.deleteImages(input);
      for (const removed of store.trim(settings.maxClips)) persistence.deleteImages(removed);
    } catch (err) {
      log('capture: fel vid avläsning av urklipp', err);
    }
  }

  if (settings.pollMs > 0) {
    timer = setInterval(tick, settings.pollMs);
    tick();
  }

  return {
    tick,
    stop() { if (timer) clearInterval(timer); timer = null; },
    pause() { paused = true; },
    // Whatever sits on the clipboard at resume time was put there while paused: skip it.
    resume() {
      let snap = null;
      try { snap = snapshot(); } catch { /* ignore */ }
      lastHash = snap?.hash ?? null;
      paused = false;
    },
    isPaused() { return paused; },
    // Hash of the current clipboard content, computed the same way the poller does.
    currentHash() {
      try { return snapshot()?.hash ?? null; } catch { return null; }
    },
    // Called after Klipp itself writes to the clipboard so the poller treats it as seen.
    markSeen(hash) { if (hash) lastHash = hash; },
  };
}
