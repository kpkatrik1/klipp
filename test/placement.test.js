import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeWindow } from '../main/placement.js';

const size = { width: 440, height: 520 };
const primary = { x: 0, y: 0, width: 1920, height: 1080 };

test('placeWindow offsets from cursor', () => {
  assert.deepEqual(placeWindow({ x: 100, y: 200 }, size, primary), { x: 108, y: 208 });
});

test('placeWindow clamps to the bottom-right of the work area', () => {
  assert.deepEqual(placeWindow({ x: 1919, y: 1079 }, size, primary), { x: 1480, y: 560 });
});

test('placeWindow at origin', () => {
  assert.deepEqual(placeWindow({ x: 0, y: 0 }, size, primary), { x: 8, y: 8 });
});

test('placeWindow stays on a second display to the right', () => {
  const second = { x: 1920, y: 0, width: 1280, height: 800 };
  const p = placeWindow({ x: 1925, y: 790 }, size, second);
  assert.ok(p.x >= 1920, `x=${p.x}`);
  assert.equal(p.y, 800 - 520);
});

test('placeWindow never goes above or left of the work area', () => {
  const second = { x: -1600, y: -200, width: 1600, height: 900 };
  assert.deepEqual(placeWindow({ x: -1600, y: -200 }, size, second), { x: -1592, y: -192 });
});
