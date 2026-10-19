// JSON state file + image files on disk. Pure Node (fs only).
import fs from 'node:fs';
import path from 'node:path';
import { emptyState } from './store.js';

export function createPersistence(dir, { debounceMs = 500 } = {}) {
  const stateFile = path.join(dir, 'klipp.json');
  const tmpFile = stateFile + '.tmp';
  const imagesDir = path.join(dir, 'images');
  const thumbsDir = path.join(dir, 'thumbs');
  let pending = null;
  let timer = null;

  const writeNow = () => {
    if (pending == null) return;
    const data = JSON.stringify(pending);
    pending = null;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmpFile, data);
    fs.renameSync(tmpFile, stateFile);
  };

  return {
    load() {
      let raw;
      try {
        raw = fs.readFileSync(stateFile, 'utf8');
      } catch (err) {
        if (err.code === 'ENOENT') return emptyState();
        throw err;
      }
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
        return { ...emptyState(), ...parsed };
      } catch {
        fs.renameSync(stateFile, `${stateFile}.corrupt-${Date.now()}`);
        return emptyState();
      }
    },

    scheduleSave(state) {
      pending = state;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; writeNow(); }, debounceMs);
    },

    flush() {
      if (timer) { clearTimeout(timer); timer = null; }
      writeNow();
    },

    saveImage(id, png, thumbPng) {
      fs.mkdirSync(imagesDir, { recursive: true });
      fs.mkdirSync(thumbsDir, { recursive: true });
      fs.writeFileSync(path.join(imagesDir, `${id}.png`), png);
      fs.writeFileSync(path.join(thumbsDir, `${id}.png`), thumbPng);
      return { imagePath: `images/${id}.png`, thumbPath: `thumbs/${id}.png` };
    },

    deleteImages(clip) {
      if (clip.kind !== 'image') return;
      for (const rel of [clip.imagePath, clip.thumbPath]) {
        if (!rel) continue;
        try { fs.unlinkSync(path.join(dir, rel)); } catch { /* already gone */ }
      }
    },

    imageFile(id) { return path.join(imagesDir, `${id}.png`); },
    thumbFile(id) { return path.join(thumbsDir, `${id}.png`); },
  };
}
