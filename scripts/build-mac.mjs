// Bygger Klipp.app för macOS utan Xcode: @electron/packager + codesign.
// Användning:  node scripts/build-mac.mjs            -> dist/Klipp-darwin-<arch>/Klipp.app
//              node scripts/build-mac.mjs --install  -> + kopierar till /Applications och startar
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const install = process.argv.includes('--install');

if (process.platform !== 'darwin') {
  console.error('Bygg-skriptet körs bara på macOS. På Windows: npm start för att utveckla.');
  process.exit(1);
}

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts });
const tryRun = (cmd, args) => spawnSync(cmd, args, { stdio: 'pipe', encoding: 'utf8' });

// 1. Ikon: rendera assets/icon.svg till .icns om den saknas (qlmanage + sips + iconutil).
function ensureIcon() {
  const icns = path.join(root, 'assets', 'icon.icns');
  if (fs.existsSync(icns)) return icns;
  const svg = path.join(root, 'assets', 'icon.svg');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'klipp-icon-'));
  const iconset = path.join(tmp, 'icon.iconset');
  try {
    fs.mkdirSync(iconset);
    const ql = tryRun('qlmanage', ['-t', '-s', '1024', '-o', tmp, svg]);
    const rendered = path.join(tmp, 'icon.svg.png');
    if (ql.status !== 0 || !fs.existsSync(rendered)) throw new Error('qlmanage kunde inte rendera SVG');
    for (const size of [16, 32, 128, 256, 512]) {
      run('sips', ['-z', String(size), String(size), rendered, '--out', path.join(iconset, `icon_${size}x${size}.png`)], { stdio: 'ignore' });
      run('sips', ['-z', String(size * 2), String(size * 2), rendered, '--out', path.join(iconset, `icon_${size}x${size}@2x.png`)], { stdio: 'ignore' });
    }
    run('iconutil', ['-c', 'icns', iconset, '-o', icns]);
    console.log('Ikon skapad:', icns);
    return icns;
  } catch (err) {
    console.warn('Bygger utan egen ikon:', err.message);
    return undefined;
  }
}

// 2. Paketera.
async function build() {
  const { packager } = await import('@electron/packager');
  const icon = ensureIcon();
  const [appPath] = await packager({
    dir: root,
    out: path.join(root, 'dist'),
    name: 'Klipp',
    appBundleId: 'se.patrik.klipp',
    platform: 'darwin',
    arch: process.arch,
    icon,
    overwrite: true,
    prune: true,
    ignore: [/^\/dist/, /^\/test/, /^\/scripts/, /^\/docs/, /^\/\.superpowers/, /^\/\.git/, /\.md$/],
    extendInfo: {
      LSUIElement: true,
      NSAppleEventsUsageDescription: 'Klipp behöver skicka Cmd+V till det aktiva programmet för att klistra in.',
    },
  });
  const app = path.join(appPath, 'Klipp.app');
  console.log('Byggd:', app);
  return app;
}

// 3. Signera: "Klipp Dev" om certifikatet finns i nyckelringen, annars ad hoc.
function sign(app) {
  const ids = tryRun('security', ['find-identity', '-v', '-p', 'codesigning']).stdout ?? '';
  const identity = ids.includes('"Klipp Dev"') ? 'Klipp Dev' : '-';
  run('codesign', ['--force', '--deep', '--sign', identity, app]);
  if (identity === '-') {
    console.log('Signerad ad hoc. Obs: behörigheter (Hjälpmedel m.m.) måste ges om efter varje ombyggnad.');
    console.log('Skapa ett certifikat "Klipp Dev" i Nyckelhanteraren (se README) för att slippa det.');
  } else {
    console.log('Signerad med certifikatet "Klipp Dev".');
  }
}

// 4. Installera.
function installApp(app) {
  spawnSync('pkill', ['-x', 'Klipp']);
  const target = '/Applications/Klipp.app';
  fs.rmSync(target, { recursive: true, force: true });
  run('cp', ['-R', app, '/Applications/']);
  run('open', [target]);
  console.log('Installerad och startad:', target);
}

const app = await build();
sign(app);
if (install) installApp(app);

console.log(`
Nästa steg (Systeminställningar → Integritet och säkerhet):
  1. Hjälpmedel → slå på Klipp            (krävs för att klistra in automatiskt)
  2. Automation → Klipp → System Events   (dyker upp vid första inklistringen)
  3. Klistra in från andra appar → Klipp → Tillåt   (annars frågar macOS om lov hela tiden)
Öppna Klipp med Ctrl+Ö.`);
