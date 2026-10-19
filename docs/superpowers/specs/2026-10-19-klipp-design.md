# Klipp – design (2026-10-19)

## Design

### Intent
Patrik is moving from Windows to Mac and relies on Ditto daily. He wants the same muscle memory on the Mac: hotkey, type to search, arrow down, Enter, and the clip lands in the app he came from. He chose "nearly everything" from Ditto's feature set and wants to avoid installing Xcode.

### Goals
- Silent capture of everything copied: plain text, rich text (HTML/RTF), images, single Finder file copies.
- **Ctrl+Ö** (what Patrik physically presses in Ditto on his Swedish keyboard) toggles a popup at the mouse cursor. Type to search, Up/Down, Enter pastes into the previously active app, Esc closes.
- Shift+Enter pastes as plain text. Ctrl/Cmd+1..9 pastes the n-th visible clip.
- Pin clips so they never expire; organise pinned clips in named groups; give a clip a title; edit a clip's text.
- Multi-select (Shift/Cmd-click) and paste all selected text clips joined with newlines.
- History capped at 500 unpinned clips (setting), oldest trimmed automatically. Pinned never trimmed.
- Pasting a clip moves it to the top of history (Ditto default).
- Runs at login (toggle in tray menu). Pause capture from tray.
- Everything local. No network, no telemetry.

### Non-goals
Network sync, encryption, cloud backup, settings UI (settings are a JSON file), multi-file Finder copies, Windows as a shipping target (Windows is only the dev/test environment).

### Anti-goals (failure even if it "works")
- Missing or doubling clips while typing fast / copying repeatedly.
- Popup that steals focus permanently so the paste lands nowhere.
- A huge clip (multi-MB text, large screenshot) that makes the popup lag or burns CPU while it sits on the clipboard.
- Capturing password-manager "concealed" clipboard writes.
- A corrupt data file that makes the app refuse to start.

### Decisions already made (as decided)
- **Electron, not Swift** (user: no Xcode). Cost accepted: ~200 MB on disk, ~100 MB RAM, three macOS permissions (Hjälpmedel, Automation → System Events, Klistra in från andra appar).
- **Hotkey = physical Ö key with Control.** Electron accelerators are US-layout virtual key codes, so the string differs per platform: macOS `Control+;` (kVK_ANSI_Semicolon = Ö on Swedish ISO keyboard), Windows `` Control+` `` (VK_OEM_3 = Ö on Swedish layout). Shown to the user everywhere as `Ctrl+Ö`. No fallback hotkey on macOS (registration cannot detect conflicts there, and Cmd+Shift+V would hijack "Paste and Match Style"); Windows dev fallback `Control+Alt+V` because Ditto itself holds Ctrl+Ö on the dev machine.
- **Focus model: normal (non-panel) always-on-top window + `app.hide()`.** Show = `win.show(); win.focus()` (activates Klipp); hide = `win.hide(); app.hide()` which hands focus back to the previously active app. No `type: 'panel'`.
- **Ad-hoc code signing** (`codesign -s -`) by default so the app runs on Apple Silicon; if a Keychain code-signing identity named `Klipp Dev` exists the build uses it instead, so TCC grants survive rebuilds. Built locally → no quarantine → no Gatekeeper dialog.
- **Clipboard change detection by polling** every 300 ms (Electron exposes no change event / changeCount). Type queries (`availableFormats`, `has`) are free; data reads are gated by format so they happen only when needed. Image identity = hash of the raw encoded bytes (`public.tiff`), never a decode per tick.
- **macOS pasteboard privacy:** polling reads will trigger "Klipp vill klistra in från …" alerts until the user sets Klipp to *Tillåt* under Integritet och säkerhet → Klistra in från andra appar. This is a documented first-run step; there is no app-side workaround with polling.
- **Concealed/transient detection** via `clipboard.has('org.nspasteboard.ConcealedType')` / `'org.nspasteboard.TransientType'` (raw UTIs never appear in `availableFormats()`).
- **Dedupe by content hash**: re-copying or pasting an existing clip moves it to the top instead of duplicating. Text hash uses plain text only, so a plain-text paste of a rich clip does not create a second clip.
- **Multi-paste = one joined paste** (texts joined with `\n`), not sequential key simulation.
- **File clip paste** writes only `NSFilenamesPboardType` (XML plist with the path) so Finder can paste the file; text editors receive nothing from a file clip. Verified in Task 13; if Finder rejects it, fall back to writing the path as text.
- **Paste simulation**: macOS `osascript -e 'tell application "System Events" to keystroke "v" using command down'` after hide; Windows dev fallback `WScript.Shell.SendKeys('^v')`.
- **Storage**: `userData/klipp.json` (state), `userData/images/<id>.png` (full), `userData/thumbs/<id>.png` (≤ 200 px), `userData/settings.json`.
- **Keyboard inside the popup** (search field always has focus): Cmd/Ctrl+Backspace deletes selected unpinned clips (plain Backspace edits the query); Cmd/Ctrl+[ and Cmd/Ctrl+] (also Ctrl+Tab / Ctrl+Shift+Tab) switch tabs.
- **UI copy in Swedish.** App name "Klipp", bundle id `se.patrik.klipp`.

### Left to the builder
Exact CSS, list row layout details, icon glyph design, context-menu ordering.

---

