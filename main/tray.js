// Menu-bar / system-tray icon and its menu.
import { Tray, Menu, nativeImage, Notification, app, shell } from 'electron';
import path from 'node:path';

const darwin = process.platform === 'darwin';

export function createTray({ onToggle, onClearHistory, capture, settings, activeHotkey, userData }) {
  const icon = nativeImage.createFromPath(path.join(import.meta.dirname, '..', 'assets', 'trayTemplate.png'));
  icon.setTemplateImage(true);
  const tray = new Tray(icon);

  const fallback = activeHotkey && activeHotkey !== settings.hotkey;
  const label = fallback ? activeHotkey.replace('CommandOrControl', 'Ctrl').replace('Control', 'Ctrl') : settings.hotkeyLabel;
  const tooltip = activeHotkey
    ? (fallback ? `Klipp (${label}) – ${settings.hotkeyLabel} var upptagen` : `Klipp (${label})`)
    : 'Klipp – inget kortkommando kunde registreras';
  tray.setToolTip(tooltip);
  if (fallback || !activeHotkey) {
    if (Notification.isSupported()) new Notification({ title: 'Klipp', body: tooltip }).show();
  }

  const loginItemAvailable = app.isPackaged;
  const rebuild = () => {
    const paused = capture.isPaused();
    if (darwin) tray.setTitle(paused ? '⏸' : '');
    const menu = Menu.buildFromTemplate([
      { label: `Öppna Klipp\t${label}`, click: () => onToggle() },
      { type: 'separator' },
      {
        label: 'Pausa insamling', type: 'checkbox', checked: paused,
        click: (item) => { if (item.checked) capture.pause(); else capture.resume(); rebuild(); },
      },
      {
        label: 'Starta vid inloggning', type: 'checkbox', enabled: loginItemAvailable,
        checked: loginItemAvailable && app.getLoginItemSettings().openAtLogin,
        click: (item) => { app.setLoginItemSettings({ openAtLogin: item.checked }); rebuild(); },
      },
      { type: 'separator' },
      { label: 'Rensa historik (behåller fästa)', click: () => onClearHistory() },
      { label: 'Öppna datamapp', click: () => shell.openPath(userData) },
      { type: 'separator' },
      { label: 'Avsluta Klipp', click: () => app.quit() },
    ]);
    tray.setContextMenu(menu);
  };
  rebuild();

  // Left click toggles the popup on Windows; on macOS the menu opens on any click,
  // so the popup is reached via the hotkey or the first menu item.
  if (!darwin) tray.on('click', () => onToggle());
  return tray;
}
