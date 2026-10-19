// Pure settings module: defaults, merging of user overrides, hotkey candidates.
// Must not import 'electron'.

const FALLBACK_HOTKEY_NON_DARWIN = 'Control+Alt+V';

export function defaultSettings(platform = process.platform) {
  return {
    // Electron accelerators use US-layout virtual key codes. The physical Ö key on a
    // Swedish keyboard is kVK_ANSI_Semicolon on macOS and VK_OEM_3 (backtick) on Windows.
    hotkey: platform === 'darwin' ? 'Control+;' : 'Control+`',
    hotkeyLabel: 'Ctrl+Ö',
    maxClips: 500,
    pollMs: 300,
    pasteDelayMs: 120,
    hideOnBlur: true,
    previewChars: 500,
    thumbMaxPx: 200,
  };
}

const RANGES = {
  maxClips: [1, 100000],
  pollMs: [100, 5000],
  pasteDelayMs: [0, 2000],
  previewChars: [50, 5000],
  thumbMaxPx: [32, 1024],
};

export function mergeSettings(partial, platform = process.platform) {
  const defaults = defaultSettings(platform);
  const out = { ...defaults };
  if (!partial || typeof partial !== 'object') return out;
  for (const key of Object.keys(defaults)) {
    if (!(key in partial) || typeof partial[key] !== typeof defaults[key]) continue;
    const value = partial[key];
    if (typeof value === 'number') {
      const [min, max] = RANGES[key];
      if (!Number.isFinite(value) || value < min || value > max) continue;
    }
    out[key] = value;
  }
  return out;
}

export function hotkeyCandidates(settings, platform = process.platform) {
  const list = [settings.hotkey];
  if (platform !== 'darwin') list.push(FALLBACK_HOTKEY_NON_DARWIN);
  return [...new Set(list)];
}
