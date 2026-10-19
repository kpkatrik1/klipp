// Klipp main process bootstrap.
import { app, globalShortcut } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { createStore } from './store.js';
import { createPersistence } from './persistence.js';
import { defaultSettings, mergeSettings, hotkeyCandidates } from './settings.js';
import { startCapture } from './capture.js';
import { createTray } from './tray.js';

const log = (...args) => console.log(new Date().toISOString(), ...args);

app.setName('Klipp');
app.setPath('userData', path.join(app.getPath('appData'), 'Klipp'));

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

  const capture = startCapture({ store, persistence, settings, log });

  const ctx = { app, store, persistence, settings, capture, log, userData };
  ctx.toggle = () => {}; // replaced by the popup in Task 8

  const candidates = hotkeyCandidates(settings);
  ctx.activeHotkey = registerHotkey(candidates, () => ctx.toggle());
  log('hotkey:', ctx.activeHotkey ?? 'INGEN (registrering misslyckades)', 'kandidater:', candidates.join(', '));

  ctx.tray = createTray({ onToggle: () => ctx.toggle(), hotkeyLabel: settings.hotkeyLabel });

  app.on('before-quit', () => persistence.flush());
  log('Klipp startad. Data i', userData);
});
