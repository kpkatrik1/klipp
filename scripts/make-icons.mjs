// Generates assets/trayTemplate.png and assets/trayTemplate@2x.png from main/png.js.
import fs from 'node:fs';
import path from 'node:path';
import { encodePng, drawTrayGlyph } from '../main/png.js';

const assets = path.join(import.meta.dirname, '..', 'assets');
fs.mkdirSync(assets, { recursive: true });
for (const [name, size] of [['trayTemplate.png', 16], ['trayTemplate@2x.png', 32]]) {
  const file = path.join(assets, name);
  fs.writeFileSync(file, encodePng(size, size, drawTrayGlyph(size)));
  console.log('skrev', file);
}
