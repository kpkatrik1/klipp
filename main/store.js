// Pure in-memory clip store. No Electron imports.
import { randomUUID } from 'node:crypto';

export const STATE_VERSION = 1;

export function emptyState() {
  return { version: STATE_VERSION, clips: [], groups: [] };
}

export function createStore(initial, opts = {}) {
  const now = opts.now ?? (() => Date.now());
  const newId = opts.id ?? (() => randomUUID());
  const state = normalize(initial);
  const listeners = new Set();

  const emit = () => { for (const cb of listeners) cb(); };
  const byId = (id) => state.clips.find(c => c.id === id);
  const must = (id) => {
    const c = byId(id);
    if (!c) throw new Error(`Okänt klipp: ${id}`);
    return c;
  };

  const store = {
    add(input) {
      const existing = state.clips.find(c => c.hash === input.hash);
      if (existing) {
        existing.lastUsedAt = now();
        existing.useCount += 1;
        if (existing.html == null && input.html != null) existing.html = input.html;
        if (existing.rtf == null && input.rtf != null) existing.rtf = input.rtf;
        emit();
        return { clip: existing, existed: true };
      }
      const t = now();
      const clip = {
        id: input.id ?? newId(),
        kind: input.kind,
        text: input.text ?? '',
        pinned: false,
        groupId: null,
        createdAt: t,
        lastUsedAt: t,
        useCount: 0,
        hash: input.hash,
      };
      for (const k of ['html', 'rtf', 'imagePath', 'thumbPath', 'width', 'height', 'files', 'title']) {
        if (input[k] != null) clip[k] = input[k];
      }
      state.clips.push(clip);
      emit();
      return { clip, existed: false };
    },

    list(view = 'history') {
      let clips = state.clips;
      if (view === 'pinned') clips = clips.filter(c => c.pinned);
      else if (view !== 'history') clips = clips.filter(c => c.pinned && c.groupId === view);
      return [...clips].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
    },

    get(id) { return byId(id); },

    update(id, patch) {
      const c = must(id);
      if ('title' in patch) {
        if (patch.title) c.title = patch.title; else delete c.title;
      }
      if (typeof patch.text === 'string') c.text = patch.text;
      if (typeof patch.hash === 'string') c.hash = patch.hash;
      emit();
      return c;
    },

    remove(id) {
      const i = state.clips.findIndex(c => c.id === id);
      if (i < 0) return undefined;
      const [c] = state.clips.splice(i, 1);
      emit();
      return c;
    },

    touch(id) {
      const c = must(id);
      c.lastUsedAt = now();
      c.useCount += 1;
      emit();
    },

    togglePin(id) {
      const c = must(id);
      c.pinned = !c.pinned;
      if (!c.pinned) c.groupId = null;
      emit();
      return c;
    },

    moveToGroup(id, groupId) {
      const c = must(id);
      c.pinned = true;
      c.groupId = groupId ?? null;
      emit();
      return c;
    },

    addGroup(name) {
      const order = state.groups.reduce((m, g) => Math.max(m, g.order), -1) + 1;
      const group = { id: newId(), name, order };
      state.groups.push(group);
      emit();
      return group;
    },

    renameGroup(id, name) {
      const g = state.groups.find(x => x.id === id);
      if (!g) throw new Error(`Okänd grupp: ${id}`);
      g.name = name;
      emit();
      return g;
    },

    removeGroup(id) {
      state.groups = state.groups.filter(g => g.id !== id);
      for (const c of state.clips) if (c.groupId === id) c.groupId = null;
      emit();
    },

    trim(maxClips) {
      const unpinned = state.clips.filter(c => !c.pinned).sort((a, b) => b.lastUsedAt - a.lastUsedAt);
      const removed = unpinned.slice(maxClips).reverse(); // oldest first
      if (removed.length === 0) return [];
      const gone = new Set(removed.map(c => c.id));
      state.clips = state.clips.filter(c => !gone.has(c.id));
      emit();
      return removed;
    },

    clearHistory() {
      const removed = state.clips.filter(c => !c.pinned);
      if (removed.length === 0) return [];
      state.clips = state.clips.filter(c => c.pinned);
      emit();
      return removed;
    },

    toJSON() {
      return {
        version: STATE_VERSION,
        clips: state.clips.map(c => ({ ...c })),
        groups: state.groups.map(g => ({ ...g })),
      };
    },

    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  return store;
}

function normalize(initial) {
  const s = emptyState();
  if (!initial || typeof initial !== 'object') return s;
  if (Array.isArray(initial.clips)) {
    s.clips = initial.clips
      .filter(c => c && typeof c.id === 'string' && typeof c.hash === 'string')
      .map(c => ({
        pinned: false, groupId: null, useCount: 0, text: '',
        createdAt: c.lastUsedAt ?? 0, lastUsedAt: c.createdAt ?? 0,
        ...c,
      }));
  }
  if (Array.isArray(initial.groups)) {
    s.groups = initial.groups.filter(g => g && typeof g.id === 'string' && typeof g.name === 'string')
      .map((g, i) => ({ order: i, ...g }));
  }
  return s;
}

export function toView(clip, previewChars) {
  const text = clip.text ?? '';
  const trimmed = text.trim();
  return {
    id: clip.id,
    kind: clip.kind,
    preview: trimmed.length > previewChars ? trimmed.slice(0, previewChars) : trimmed,
    title: clip.title,
    pinned: clip.pinned,
    groupId: clip.groupId,
    lastUsedAt: clip.lastUsedAt,
    width: clip.width,
    height: clip.height,
    hasRich: clip.html != null || clip.rtf != null,
    files: clip.files,
  };
}
