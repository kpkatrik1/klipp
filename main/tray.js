// Menu-bar / system-tray icon. Menu is built in Task 10.
import { Tray, nativeImage } from 'electron';
import path from 'node:path';

export function createTray({ onToggle, hotkeyLabel }) {
  const icon = nativeImage.createFromPath(path.join(import.meta.dirname, '..', 'assets', 'trayTemplate.png'));
  icon.setTemplateImage(true);
  const tray = new Tray(icon);
  tray.setToolTip(`Klipp (${hotkeyLabel})`);
  tray.on('click', () => onToggle());
  return tray;
}
