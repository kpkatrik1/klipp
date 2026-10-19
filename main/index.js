// Klipp main process bootstrap.
import { app, clipboard, globalShortcut, Menu } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { createStore } from './store.js';
import { createPersistence } from './persistence.js';
import { defaultSettings, mergeSettings, hotkeyCandidates } from './settings.js';
import { startCapture } from './capture.js';
import { pasteClips } from './paster.js';
import { createTray } from './tray.js';
import { registerKlippScheme, createPopup } from './popup.js';
import { registerIpc } from './ipc.js';

const log = (...args) => console.log(new Date().toISOString(), ...args);

app.setName('Klipp');
app.setPath('userData', process.env.KLIPP_SMOKE
  ? path.join(process.env.KLIPP_SMOKE, 'userData') // smoke runs never touch real data
  : path.join(app.getPath('appData'), 'Klipp'));
registerKlippScheme();

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function loadSettings(userData) {
  const file = path.join(userData, 'settings.json');
  let partial;
  try {
    partial = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      fs.mkdirSync(userData, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(defaultSettings(), null, 2) + '\n');
    } else {
      log('settings: kunde inte läsa settings.json, använder standard', err.message);
    }
  }
  return mergeSettings(partial);
}

function registerHotkey(candidates, handler) {
  for (const accelerator of candidates) {
    try {
      if (globalShortcut.register(accelerator, handler)) return accelerator;
    } catch (err) {
      log('hotkey: ogiltig accelerator', accelerator, err.message);
    }
  }
  return null;
}

app.on('window-all-closed', () => { /* keep running in the tray */ });

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide();

  const userData = app.getPath('userData');
  const settings = loadSettings(userData);
  const persistence = createPersistence(userData);
  const store = createStore(persistence.load());
  store.onChange(() => persistence.scheduleSave(store.toJSON()));

  // Minimal application menu: Edit roles keep Cmd+C/V/A working in the search field on macOS,
  // and there is no File > Close Window to destroy the popup.
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Klipp', submenu: [{ role: 'hide' }, { role: 'quit' }] },
    { label: 'Redigera', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
  ]));

  const capture = startCapture({ store, persistence, settings, clipboard, log });
  const popup = createPopup({ settings, persistence, log });

  const paste = (ids, plain) => pasteClips({
    clips: ids.map(id => store.get(id)).filter(Boolean),
    plain, store, persistence, settings, capture, log,
    hidePopup: () => popup.hide(),
  });
  registerIpc({ store, persistence, settings, popup, paste, log });

  const candidates = hotkeyCandidates(settings);
  const activeHotkey = registerHotkey(candidates, () => popup.toggle());
  log('hotkey:', activeHotkey ?? 'INGEN (registrering misslyckades)', 'kandidater:', candidates.join(', '));

  createTray({
    onToggle: () => popup.toggle(),
    onClearHistory: () => { for (const c of store.clearHistory()) persistence.deleteImages(c); },
    capture, settings, activeHotkey, userData,
  });

  app.on('second-instance', () => popup.show());
  app.on('before-quit', () => persistence.flush());
  app.on('will-quit', () => globalShortcut.unregisterAll());
  log('Klipp startad. Data i', userData);

  if (process.env.KLIPP_SMOKE) {
    import('./smoke.js')
      .then(({ runSmoke }) => runSmoke({ app, popup, store, persistence, dir: process.env.KLIPP_SMOKE, log }))
      .catch((err) => { log('smoke: kunde inte starta', err); app.exit(1); });
  }
});
