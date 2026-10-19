import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, toView } from '../main/store.js';

function clock() {
  let t = 1000;
  return () => (t += 1000);
}
let n = 0;
const ids = () => `id${++n}`;

function textInput(text, extra = {}) {
  return { kind: 'text', text, hash: 'h:' + text, ...extra };
}

test('add dedupes by hash and moves to top', () => {
  const s = createStore(undefined, { now: clock(), id: ids });
  const a = s.add(textInput('a'));
  const b = s.add(textInput('b'));
  assert.equal(a.existed, false);
  assert.equal(b.existed, false);
  assert.deepEqual(s.list('history').map(c => c.text), ['b', 'a']);
  const again = s.add(textInput('a'));
  assert.equal(again.existed, true);
  assert.equal(again.clip.id, a.clip.id);
  assert.equal(s.list('history').length, 2);
  assert.deepEqual(s.list('history').map(c => c.text), ['a', 'b']);
  assert.equal(again.clip.useCount, 1);
});

test('add honours a caller-supplied id', () => {
  const s = createStore(undefined, { now: clock(), id: ids });
  const { clip } = s.add({ ...textInput('x'), id: 'given' });
  assert.equal(clip.id, 'given');
});

test('add merges html onto existing plain clip', () => {
  const s = createStore(undefined, { now: clock(), id: ids });
  s.add(textInput('a'));
  const { clip } = s.add(textInput('a', { html: '<b>a</b>' }));
  assert.equal(clip.html, '<b>a</b>');
  s.add(textInput('a', { html: '<i>other</i>' }));
  assert.equal(s.get(clip.id).html, '<b>a</b>', 'existing html is kept');
});

test('list views filter correctly', () => {
  const s = createStore(undefined, { now: clock(), id: ids });
  const a = s.add(textInput('a')).clip;
  const b = s.add(textInput('b')).clip;
  s.add(textInput('c'));
  const g = s.addGroup('Mallar');
  s.togglePin(a.id);
  s.moveToGroup(b.id, g.id);
  assert.deepEqual(s.list('history').map(c => c.text), ['c', 'b', 'a']);
  assert.deepEqual(s.list('pinned').map(c => c.text).sort(), ['a', 'b']);
  assert.deepEqual(s.list(g.id).map(c => c.text), ['b']);
});

test('togglePin clears group on unpin', () => {
  const s = createStore(undefined, { now: clock(), id: ids });
  const a = s.add(textInput('a')).clip;
  const g = s.addGroup('G');
  s.moveToGroup(a.id, g.id);
  assert.equal(s.get(a.id).pinned, true);
  const un = s.togglePin(a.id);
  assert.equal(un.pinned, false);
  assert.equal(un.groupId, null);
});

test('moveToGroup pins', () => {
  const s = createStore(undefined, { now: clock(), id: ids });
  const a = s.add(textInput('a')).clip;
  const g = s.addGroup('G');
  const moved = s.moveToGroup(a.id, g.id);
  assert.equal(moved.pinned, true);
  assert.equal(moved.groupId, g.id);
  const none = s.moveToGroup(a.id, null);
  assert.equal(none.pinned, true);
  assert.equal(none.groupId, null);
});

test('removeGroup keeps clips pinned', () => {
  const s = createStore(undefined, { now: clock(), id: ids });
  const a = s.add(textInput('a')).clip;
  const g = s.addGroup('G');
  s.moveToGroup(a.id, g.id);
  s.renameGroup(g.id, 'H');
  assert.equal(s.toJSON().groups[0].name, 'H');
  s.removeGroup(g.id);
  assert.equal(s.toJSON().groups.length, 0);
  assert.equal(s.get(a.id).pinned, true);
  assert.equal(s.get(a.id).groupId, null);
});

test('trim keeps pinned and newest N', () => {
  const s = createStore(undefined, { now: clock(), id: ids });
  const first = s.add(textInput('1')).clip;
  s.togglePin(first.id);
  for (let i = 2; i <= 6; i++) s.add(textInput(String(i)));
  const removed = s.trim(3);
  assert.deepEqual(removed.map(c => c.text), ['2', '3']);
  assert.deepEqual(s.list('history').map(c => c.text), ['6', '5', '4', '1']);
});

test('clearHistory returns removed unpinned', () => {
  const s = createStore(undefined, { now: clock(), id: ids });
  const a = s.add(textInput('a')).clip;
  s.togglePin(a.id);
  s.add(textInput('b'));
  const removed = s.clearHistory();
  assert.deepEqual(removed.map(c => c.text), ['b']);
  assert.deepEqual(s.list('history').map(c => c.text), ['a']);
});

test('update changes title, text and hash; remove deletes', () => {
  const s = createStore(undefined, { now: clock(), id: ids });
  const a = s.add(textInput('a')).clip;
  const u = s.update(a.id, { title: 'T', text: 'new', hash: 'h:new' });
  assert.equal(u.title, 'T');
  assert.equal(u.text, 'new');
  assert.equal(u.hash, 'h:new');
  assert.equal(s.add(textInput('new')).existed, true);
  assert.equal(s.remove(a.id).id, a.id);
  assert.equal(s.get(a.id), undefined);
});

test('toView truncates preview', () => {
  const big = '  ' + 'x'.repeat(10000) + '  ';
  const clip = { id: '1', kind: 'text', text: big, pinned: false, groupId: null, lastUsedAt: 5, hash: 'h', html: '<p>' };
  const v = toView(clip, 500);
  assert.equal(v.preview.length, 500);
  assert.equal(v.preview[0], 'x');
  assert.equal(v.hasRich, true);
  assert.equal(v.id, '1');
});

test('onChange fires once per mutation', () => {
  const s = createStore(undefined, { now: clock(), id: ids });
  let count = 0;
  const off = s.onChange(() => count++);
  const a = s.add(textInput('a')).clip;
  s.togglePin(a.id);
  s.touch(a.id);
  assert.equal(count, 3);
  off();
  s.remove(a.id);
  assert.equal(count, 3);
});

test('toJSON round-trips through createStore', () => {
  const s = createStore(undefined, { now: clock(), id: ids });
  s.add(textInput('a'));
  const g = s.addGroup('G');
  const s2 = createStore(s.toJSON());
  assert.equal(s2.list('history').length, 1);
  assert.equal(s2.toJSON().groups[0].id, g.id);
  assert.equal(s2.toJSON().version, 1);
});
