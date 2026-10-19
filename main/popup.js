// The popup window: frameless, always on top, shown at the cursor, hidden on Esc/blur.
import { app, BrowserWindow, net, protocol, screen } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { placeWindow } from './placement.js';

const darwin = process.platform === 'darwin';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Must run before app.whenReady().
export function registerKlippScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'klipp', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

function serveImages(persistence) {
  protocol.handle('klipp', async (request) => {
    const url = new URL(request.url);
    const id = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    if (!/^[\w-]+$/.test(id)) return new Response('', { status: 400 });
    const file = url.host === 'image' ? persistence.imageFile(id)
      : url.host === 'thumb' ? persistence.thumbFile(id) : null;
    if (!file) return new Response('', { status: 404 });
    try {
      return await net.fetch(pathToFileURL(file).href);
    } catch {
      return new Response('', { status: 404 });
    }
  });
}

export function createPopup({ settings, persistence, log = console.log }) {
  serveImages(persistence);

  const win = new BrowserWindow({
    width: 440,
    height: 520,
    minWidth: 320,
    minHeight: 240,
    frame: false,
    show: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    backgroundColor: darwin ? '#00000000' : undefined,
    ...(darwin ? { vibrancy: 'under-window', visualEffectState: 'active', roundedCorners: true } : {}),
    webPreferences: {
      preload: path.join(import.meta.dirname, '..', 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });
  if (darwin) {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setAlwaysOnTop(true, 'floating');
  }
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(import.meta.dirname, '..', 'renderer', 'index.html'));

  let blurHold = 0; // >0 while a native menu/dialog owns focus; blur then does not hide
  // Size in DIPs that the user last chose. Windows rescales a window that moves between
  // displays with different DPI, so we re-apply this on every show instead of trusting getBounds().
  let size = { width: 440, height: 520 };
  win.on('resized', () => { if (win.isVisible()) { const [width, height] = win.getSize(); size = { width, height }; } });

  const popup = {
    window: win,
    isVisible: () => win.isVisible(),

    show() {
      const cursor = screen.getCursorScreenPoint();
      const workArea = screen.getDisplayNearestPoint(cursor).workArea;
      const { x, y } = placeWindow(cursor, size, workArea);
      win.setBounds({ x, y, ...size });
      win.show();
      win.focus();
      const [w, h] = win.getSize();
      if (w !== size.width || h !== size.height) win.setBounds({ x, y, ...size });
      win.webContents.send('popup:shown');
    },

    async hide() {
      if (!win.isVisible()) return;
      win.hide();
      if (darwin) app.hide(); // hands focus back to the previously active app
      await sleep(50);
    },

    toggle() {
      if (win.isVisible()) popup.hide(); else popup.show();
    },

    // Run fn (e.g. Menu.popup) without the resulting blur hiding the window.
    async holdBlur(fn) {
      blurHold++;
      try { return await fn(); } finally { blurHold--; }
    },
  };

  win.on('blur', () => {
    if (settings.hideOnBlur && blurHold === 0 && win.isVisible()) popup.hide();
  });
  win.on('closed', () => log('popup: fönstret stängdes'));
  win.webContents.on('render-process-gone', (_e, d) => log('popup: renderer dog', d.reason));

  return popup;
}
