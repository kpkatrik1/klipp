import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filenamesPlist } from '../main/plist.js';

test('filenamesPlist escapes & and <', () => {
  const xml = filenamesPlist(['/Users/p/a & b <c>.txt']);
  assert.match(xml, /<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<plist version="1.0">\s*<array>\s*<string>\/Users\/p\/a &amp; b &lt;c&gt;.txt<\/string>\s*<\/array>\s*<\/plist>/);
  assert.doesNotMatch(xml, /& b/);
});

test('filenamesPlist handles several paths in order', () => {
  const xml = filenamesPlist(['/x', '/y']);
  assert.ok(xml.indexOf('<string>/x</string>') < xml.indexOf('<string>/y</string>'));
});
