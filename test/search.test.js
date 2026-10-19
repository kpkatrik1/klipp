import { test } from 'node:test';
import assert from 'node:assert/strict';
import { search } from '../main/search.js';

const clips = [
  { id: '1', kind: 'text', text: 'Hello World' },
  { id: '2', kind: 'text', text: 'order 1234 shipped', title: 'Leverans' },
  { id: '3', kind: 'image', text: '', title: 'Skärmdump' },
  { id: '4', kind: 'image', text: '' },
  { id: '5', kind: 'file', text: '/Users/p/Documents/faktura.pdf', files: ['/Users/p/Documents/faktura.pdf'] },
];

test('empty query returns all', () => {
  assert.equal(search(clips, ''), clips);
  assert.equal(search(clips, '   '), clips);
});

test('tokens are ANDed', () => {
  assert.deepEqual(search(clips, 'order shipped').map(c => c.id), ['2']);
  assert.deepEqual(search(clips, 'order hello').map(c => c.id), []);
});

test('matches title', () => {
  assert.deepEqual(search(clips, 'leverans').map(c => c.id), ['2']);
  assert.deepEqual(search(clips, 'skärm').map(c => c.id), ['3']);
});

test('case-insensitive and order preserved', () => {
  assert.deepEqual(search(clips, 'O').map(c => c.id), ['1', '2', '5']);
});

test('image clips without text only match title', () => {
  assert.deepEqual(search(clips, 'dump').map(c => c.id), ['3']);
  assert.equal(search(clips, 'zzz').length, 0);
});

test('file clips match on path', () => {
  assert.deepEqual(search(clips, 'faktura').map(c => c.id), ['5']);
});
