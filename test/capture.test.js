import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startCapture } from '../main/capture.js';
import { createStore } from '../main/store.js';

// A fake of the slice of Electron's clipboard module that capture.js uses.
function fakeClipboard() {
  const cb = {
    formats: [], text: '', html: '', buffers: {}, image: null, hasTypes: new Set(),
    calls: { readImage: 0, readText: 0 },
    availableFormats: () => cb.formats,
    has: (t) => cb.hasTypes.has(t),
    readText: () => { cb.calls.readText++; return cb.text; },
    readHTML: () => cb.html,
    readRTF: () => '',
    readBuffer: (name) => cb.buffers[name] ?? Buffer.alloc(0),
    readImage: () => { cb.calls.readImage++; return cb.image; },
    setText(text, html) {
      cb.formats = html ? ['text/plain', 'text/html'] : ['text/plain'];
      cb.text = text; cb.html = html ?? '';
      cb.buffers = { 'public.utf8-plain-text': Buffer.from(text, 'utf8') };
    },
    setImage(bytes, { png = true } = {}) {
      cb.formats = ['image/png'];
      cb.buffers = png ? { 'public.png': bytes, 'public.tiff': Buffer.concat([Buffer.from('TIFF'), bytes]) } : { 'public.tiff': Buffer.concat([Buffer.from('TIFF'), bytes]) };
      cb.hasTypes = new Set(png ? ['public.png', 'public.tiff'] : ['public.tiff']);
      cb.image = {
        isEmpty: () => false,
        getSize: () => ({ width: 4, height: 2 }),
        resize: () => ({ toPNG: () => Buffer.from('thumb') }),
        toPNG: () => Buffer.from('png'),
        toBitmap: () => bytes,
      };
    },
  };
  return cb;
}

const fakePersistence = () => {
  const saved = [], deleted = [];
  return {
    saved, deleted,
    saveImage: (id) => { saved.push(id); return { imagePath: `images/${id}.png`, thumbPath: `thumbs/${id}.png` }; },
    deleteImages: (c) => deleted.push(c.id),
  };
};

const settings = { pollMs: 0, maxClips: 500, thumbMaxPx: 200 };

function setup(platform = 'darwin') {
  const clipboard = fakeClipboard();
  const store = createStore();
  const persistence = fakePersistence();
  const capture = startCapture({ store, persistence, settings, clipboard, platform, log: () => {} });
  return { clipboard, store, persistence, capture };
}

test('captures text with html once and not again while unchanged', () => {
  const { clipboard, store, capture } = setup();
  clipboard.setText('hej', '<b>hej</b>');
  capture.tick(); capture.tick(); capture.tick();
  const clips = store.list('history');
  assert.equal(clips.length, 1);
  assert.equal(clips[0].text, 'hej');
  assert.equal(clips[0].html, '<b>hej</b>');
  assert.equal(clipboard.calls.readText, 1, 'full text read only when the hash is new');
});

test('resume does not record what was copied while paused', () => {
  const { clipboard, store, capture } = setup();
  clipboard.setText('before');
  capture.tick();
  capture.pause();
  clipboard.setText('secret password');
  capture.tick();
  capture.resume();
  capture.tick();
  assert.deepEqual(store.list('history').map(c => c.text), ['before']);
  clipboard.setText('after');
  capture.tick();
  assert.deepEqual(store.list('history').map(c => c.text), ['after', 'before']);
});

test('markSeen(currentHash()) after our own write prevents a duplicate', () => {
  const { clipboard, store, capture } = setup();
  clipboard.setImage(Buffer.from('original-bytes-from-source-app'));
  capture.tick();
  assert.equal(store.list('history').length, 1);
  // Klipp pastes the image: Chromium re-encodes, so different bytes land on the clipboard.
  clipboard.setImage(Buffer.from('re-encoded-by-chromium'));
  capture.markSeen(capture.currentHash());
  capture.tick(); capture.tick();
  assert.equal(store.list('history').length, 1, 'no duplicate image clip');
});

test('image is decoded only when the raw-bytes hash is new', () => {
  const { clipboard, capture } = setup();
  clipboard.setImage(Buffer.from('bytes'));
  for (let i = 0; i < 5; i++) capture.tick();
  assert.equal(clipboard.calls.readImage, 1);
});

test('prefers public.png over public.tiff when both exist', () => {
  const { clipboard, capture } = setup();
  clipboard.setImage(Buffer.from('p'));
  const withPng = capture.currentHash();
  clipboard.setImage(Buffer.from('p'), { png: false });
  const tiffOnly = capture.currentHash();
  assert.notEqual(withPng, tiffOnly, 'png bytes and tiff bytes hash differently');
  clipboard.setImage(Buffer.from('p'));
  assert.equal(capture.currentHash(), withPng);
});

test('concealed clipboard content is never captured', () => {
  const { clipboard, store, capture } = setup();
  clipboard.setText('hunter2');
  clipboard.hasTypes = new Set(['org.nspasteboard.ConcealedType']);
  capture.tick();
  assert.equal(store.list('history').length, 0);
});

test('duplicate image files are deleted when the clip already exists', () => {
  const { clipboard, store, persistence, capture } = setup();
  clipboard.setImage(Buffer.from('same'));
  capture.tick();
  clipboard.setText('x');
  capture.tick();
  clipboard.setImage(Buffer.from('same'));
  capture.tick();
  assert.equal(store.list('history').filter(c => c.kind === 'image').length, 1);
  assert.equal(persistence.saved.length, 2);
  assert.equal(persistence.deleted.length, 1);
});
