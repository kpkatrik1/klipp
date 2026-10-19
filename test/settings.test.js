import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, mergeSettings, hotkeyCandidates } from '../main/settings.js';

test('defaults have exact values per platform', () => {
  const mac = defaultSettings('darwin');
  assert.equal(mac.hotkey, 'Control+;');
  const win = defaultSettings('win32');
  assert.equal(win.hotkey, 'Control+`');
  for (const s of [mac, win]) {
    assert.equal(s.hotkeyLabel, 'Ctrl+Ö');
    assert.equal(s.maxClips, 500);
    assert.equal(s.pollMs, 300);
    assert.equal(s.pasteDelayMs, 120);
    assert.equal(s.hideOnBlur, true);
    assert.equal(s.previewChars, 500);
    assert.equal(s.thumbMaxPx, 200);
  }
});

test('mergeSettings drops unknown keys and fixes types', () => {
  const s = mergeSettings({ maxClips: 'x', foo: 1, pollMs: 1000 }, 'darwin');
  assert.equal(s.maxClips, 500);
  assert.equal(s.pollMs, 1000);
  assert.equal('foo' in s, false);
  assert.equal(s.hotkey, 'Control+;');
});

test('mergeSettings accepts undefined', () => {
  assert.deepEqual(mergeSettings(undefined, 'win32'), defaultSettings('win32'));
});

test('hotkeyCandidates darwin has one entry', () => {
  assert.deepEqual(hotkeyCandidates(defaultSettings('darwin'), 'darwin'), ['Control+;']);
});

test('hotkeyCandidates win32 adds fallback and dedupes', () => {
  assert.deepEqual(hotkeyCandidates(defaultSettings('win32'), 'win32'), ['Control+`', 'Control+Alt+V']);
  assert.deepEqual(hotkeyCandidates({ hotkey: 'Control+Alt+V' }, 'win32'), ['Control+Alt+V']);
});

test('mergeSettings clamps numbers to sane ranges', () => {
  const s = mergeSettings({ pollMs: 0, maxClips: 0, pasteDelayMs: -5, previewChars: 1, thumbMaxPx: 100000 }, 'darwin');
  assert.equal(s.pollMs, 300);
  assert.equal(s.maxClips, 500);
  assert.equal(s.pasteDelayMs, 120);
  assert.equal(s.previewChars, 500);
  assert.equal(s.thumbMaxPx, 200);
  assert.equal(mergeSettings({ pollMs: 1000, maxClips: 20 }, 'darwin').maxClips, 20);
});
