import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPersistence } from '../main/persistence.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'klipp-'));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

test('load empty when missing', () => {
  const p = createPersistence(tmp());
  assert.deepEqual(p.load(), { version: 1, clips: [], groups: [] });
});

test('load renames corrupt file', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'klipp.json'), '{not json');
  const p = createPersistence(dir);
  assert.deepEqual(p.load(), { version: 1, clips: [], groups: [] });
  const names = fs.readdirSync(dir);
  assert.equal(names.some(n => /^klipp\.json\.corrupt-\d+$/.test(n)), true, names.join(','));
  assert.equal(fs.existsSync(path.join(dir, 'klipp.json')), false);
});

test('scheduleSave debounces and flush writes', async () => {
  const dir = tmp();
  const p = createPersistence(dir, { debounceMs: 10 });
  const state = { version: 1, clips: [{ id: 'a', hash: 'h', kind: 'text', text: 'x' }], groups: [] };
  p.scheduleSave(state);
  p.scheduleSave({ ...state, groups: [{ id: 'g', name: 'G', order: 0 }] });
  assert.equal(fs.existsSync(path.join(dir, 'klipp.json')), false, 'not written synchronously');
  await sleep(40);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'klipp.json'), 'utf8'));
  assert.equal(saved.groups.length, 1, 'last scheduled state wins');
  p.scheduleSave({ ...state, groups: [] });
  p.flush();
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'klipp.json'), 'utf8')).groups.length, 0);
  assert.equal(fs.existsSync(path.join(dir, 'klipp.json.tmp')), false);
  assert.deepEqual(createPersistence(dir).load().clips[0].id, 'a');
});

test('saveImage writes both files and returns relative paths', () => {
  const dir = tmp();
  const p = createPersistence(dir);
  const r = p.saveImage('abc', Buffer.from('PNG1'), Buffer.from('PNG2'));
  assert.deepEqual(r, { imagePath: 'images/abc.png', thumbPath: 'thumbs/abc.png' });
  assert.equal(fs.readFileSync(p.imageFile('abc'), 'utf8'), 'PNG1');
  assert.equal(fs.readFileSync(p.thumbFile('abc'), 'utf8'), 'PNG2');
  assert.equal(p.imageFile('abc'), path.join(dir, 'images', 'abc.png'));
});

test('deleteImages removes files and ignores missing', () => {
  const dir = tmp();
  const p = createPersistence(dir);
  p.saveImage('abc', Buffer.from('1'), Buffer.from('2'));
  p.deleteImages({ id: 'abc', kind: 'image', imagePath: 'images/abc.png', thumbPath: 'thumbs/abc.png' });
  assert.equal(fs.existsSync(p.imageFile('abc')), false);
  assert.equal(fs.existsSync(p.thumbFile('abc')), false);
  assert.doesNotThrow(() => p.deleteImages({ id: 'abc', kind: 'image', imagePath: 'images/abc.png', thumbPath: 'thumbs/abc.png' }));
  assert.doesNotThrow(() => p.deleteImages({ id: 'zzz', kind: 'text' }));
});
