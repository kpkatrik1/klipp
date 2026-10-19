import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldCapture, classify, textHash, imageHash, fileHash, sampleBytes } from '../main/fingerprint.js';

test('shouldCapture rejects concealed', () => {
  assert.equal(shouldCapture({ formats: ['text/plain'], concealed: true }), false);
  assert.equal(shouldCapture({ formats: ['text/plain'], concealed: false }), true);
});

test('shouldCapture rejects empty formats', () => {
  assert.equal(shouldCapture({ formats: [], concealed: false }), false);
});

test('classify prefers text over image when both', () => {
  assert.equal(classify(['text/plain', 'text/html', 'image/png'], {}), 'text');
});

test('classify image', () => {
  assert.equal(classify(['image/png'], {}), 'image');
  assert.equal(classify(['image/jpeg', 'text/html'], {}), 'image');
});

test('classify file', () => {
  assert.equal(classify(['text/uri-list', 'text/plain'], { fileUrl: 'file:///Users/p/a.txt' }), 'file');
  assert.equal(classify(['text/uri-list'], { fileUrl: '' }), null);
});

test('classify null for unknown formats', () => {
  assert.equal(classify(['application/x-foo'], {}), null);
});

test('textHash null for whitespace', () => {
  assert.equal(textHash('   \n\t'), null);
  assert.equal(textHash(''), null);
  assert.match(textHash('a'), /^[0-9a-f]{40}$/);
  assert.notEqual(textHash('a'), textHash('b'));
});

test('imageHash null for empty', () => {
  assert.equal(imageHash(Buffer.alloc(0)), null);
});

test('imageHash differs for different lengths', () => {
  assert.notEqual(imageHash(Buffer.alloc(10, 1)), imageHash(Buffer.alloc(11, 1)));
});

test('imageHash stable for same bytes', () => {
  const a = Buffer.from([1, 2, 3, 4, 5]);
  assert.equal(imageHash(a), imageHash(Buffer.from(a)));
  assert.notEqual(imageHash(a), imageHash(Buffer.from([1, 2, 3, 4, 6])));
});

test('sampleBytes evenly spaced', () => {
  const buf = Buffer.from(Array.from({ length: 100 }, (_, i) => i));
  const s = sampleBytes(buf, 10);
  assert.equal(s.length, 10);
  assert.equal(s[0], 0);
  assert.equal(s[9], 99);
  assert.deepEqual([...sampleBytes(Buffer.from([7, 8]), 10)], [7, 8]);
});

test('fileHash is deterministic', () => {
  assert.equal(fileHash('/a/b'), fileHash('/a/b'));
  assert.notEqual(fileHash('/a/b'), textHash('/a/b'));
});
