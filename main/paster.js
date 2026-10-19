// Writes a clip (or several) to the clipboard and simulates Cmd+V / Ctrl+V in the
// previously active app. Electron glue; macOS and Windows (dev) only.
import { clipboard, nativeImage, systemPreferences, Notification } from 'electron';
import { execFile } from 'node:child_process';
import { filenamesPlist } from './plist.js';

const darwin = process.platform === 'darwin';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let warnedAccessibility = false;

export function writePayload(clips, plain, persistence) {
  if (clips.length === 1 && clips[0].kind === 'image') {
    clipboard.writeImage(nativeImage.createFromPath(persistence.imageFile(clips[0].id)));
    return;
  }
  if (clips.length === 1 && clips[0].kind === 'file' && darwin && clips[0].files?.length) {
    clipboard.writeBuffer('NSFilenamesPboardType', Buffer.from(filenamesPlist(clips[0].files)));
    return;
  }
  const textClips = clips.filter(c => c.kind !== 'image');
  const text = textClips.map(c => c.text).join('\n');
  const first = textClips[0];
  if (plain || textClips.length !== 1 || !first?.html) {
    clipboard.writeText(text);
  } else {
    const payload = { text, html: first.html };
    if (first.rtf) payload.rtf = first.rtf;
    clipboard.write(payload);
  }
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, ...opts }, (err, stdout, stderr) => resolve({ err, stdout, stderr }));
  });
}

export async function simulatePaste(log = console.log) {
  if (darwin) {
    if (!systemPreferences.isTrustedAccessibilityClient(true)) {
      if (!warnedAccessibility && Notification.isSupported()) {
        warnedAccessibility = true;
        new Notification({
          title: 'Klipp',
          body: 'Tillåt Klipp under Hjälpmedel för att klistra in automatiskt. Klippet ligger på urklipp, tryck Cmd+V.',
        }).show();
      }
      return;
    }
    const { err, stderr } = await run('osascript', ['-e', 'tell application "System Events" to keystroke "v" using command down']);
    if (err) log('paste: osascript misslyckades', stderr || err.message);
    return;
  }
  if (process.platform === 'win32') {
    const { err, stderr } = await run('powershell', ['-NoProfile', '-Command', "(New-Object -ComObject WScript.Shell).SendKeys('^v')"]);
    if (err) log('paste: SendKeys misslyckades', stderr || err.message);
  }
}

export async function pasteClips({ clips, plain, store, persistence, settings, capture, hidePopup, log = console.log }) {
  if (!clips.length) return;
  writePayload(clips, plain, persistence);
  if (clips.length === 1 && capture) capture.markSeen(clips[0].hash);
  for (const c of clips) store.touch(c.id);
  await hidePopup();
  await sleep(settings.pasteDelayMs);
  await simulatePaste(log);
}
