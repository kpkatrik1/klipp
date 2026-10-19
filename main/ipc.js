// IPC between the renderer and the main-process store. Context menus live here too
// (native menus, actions routed through the same handlers).
import { ipcMain, Menu } from 'electron';
import { search } from './search.js';
import { toView } from './store.js';
import { textHash } from './fingerprint.js';

export function registerIpc({ store, persistence, settings, popup, paste, log = console.log }) {
  const send = (channel, ...args) => {
    const wc = popup.window.webContents;
    if (!wc.isDestroyed()) wc.send(channel, ...args);
  };

  let changedTimer = null;
  store.onChange(() => {
    if (changedTimer) return;
    changedTimer = setTimeout(() => { changedTimer = null; send('store:changed'); }, 100);
  });

  const clipsOf = (ids) => ids.map(id => store.get(id)).filter(Boolean);
  const removeClip = (id) => {
    const clip = store.remove(id);
    if (clip) persistence.deleteImages(clip);
  };

  ipcMain.handle('clips:list', (_e, view, query) =>
    search(store.list(view), query).map(c => toView(c, settings.previewChars)));
  ipcMain.handle('groups:list', () => store.toJSON().groups.sort((a, b) => a.order - b.order));
  ipcMain.handle('clips:paste', (_e, ids, plain) => paste(ids, Boolean(plain)));
  ipcMain.handle('popup:hide', () => popup.hide());

  ipcMain.handle('clips:togglePin', (_e, id) => toView(store.togglePin(id), settings.previewChars));
  ipcMain.handle('clips:remove', (_e, ids) => { for (const id of [].concat(ids)) removeClip(id); });
  ipcMain.handle('clips:update', (_e, id, patch) => {
    const p = {};
    if ('title' in patch) p.title = String(patch.title ?? '').trim();
    if (typeof patch.text === 'string') {
      const hash = textHash(patch.text);
      if (!hash) throw new Error('Texten kan inte vara tom');
      p.text = patch.text;
      p.hash = hash;
    }
    return toView(store.update(id, p), settings.previewChars);
  });
  ipcMain.handle('clips:moveToGroup', (_e, id, groupId) => toView(store.moveToGroup(id, groupId), settings.previewChars));
  ipcMain.handle('clips:getFullText', (_e, id) => store.get(id)?.text ?? '');

  ipcMain.handle('groups:add', (_e, name) => {
    const n = String(name ?? '').trim();
    if (!n) return null;
    return store.addGroup(n);
  });
  ipcMain.handle('groups:rename', (_e, id, name) => {
    const n = String(name ?? '').trim();
    if (!n) return null;
    return store.renameGroup(id, n);
  });
  ipcMain.handle('groups:remove', (_e, id) => store.removeGroup(id));

  ipcMain.handle('clips:contextMenu', (_e, ids) => {
    const clips = clipsOf([].concat(ids));
    if (clips.length === 0) return;
    const primary = clips[0];
    const groups = store.toJSON().groups.sort((a, b) => a.order - b.order);
    const single = clips.length === 1;
    const allIds = clips.map(c => c.id);
    const template = [
      { label: 'Klistra in', click: () => paste(allIds, false) },
      { label: 'Klistra in som ren text', click: () => paste(allIds, true) },
      { type: 'separator' },
      {
        label: clips.every(c => c.pinned) ? 'Lossa' : 'Fäst',
        click: () => {
          const pin = !clips.every(c => c.pinned);
          for (const c of clips) if (c.pinned !== pin) store.togglePin(c.id);
        },
      },
      {
        label: 'Flytta till grupp',
        submenu: [
          { label: 'Ingen grupp', type: 'radio', checked: single && primary.groupId == null,
            click: () => { for (const c of clips) store.moveToGroup(c.id, null); } },
          ...groups.map(g => ({
            label: g.name, type: 'radio', checked: single && primary.groupId === g.id,
            click: () => { for (const c of clips) store.moveToGroup(c.id, g.id); },
          })),
          { type: 'separator' },
          { label: 'Ny grupp…', click: () => send('ui:command', 'newGroup', allIds) },
        ],
      },
      { label: 'Byt namn…', enabled: single, click: () => send('ui:command', 'rename', primary.id) },
      { label: 'Redigera text…', enabled: single && primary.kind !== 'image', click: () => send('ui:command', 'edit', primary.id) },
      { type: 'separator' },
      { label: 'Ta bort', click: () => { for (const id of allIds) removeClip(id); } },
    ];
    return popup.holdBlur(() => new Promise(resolve => {
      Menu.buildFromTemplate(template).popup({ window: popup.window, callback: resolve });
    }));
  });

  ipcMain.handle('groups:contextMenu', (_e, groupId) => {
    const template = [
      { label: 'Byt namn…', click: () => send('ui:command', 'renameGroup', groupId) },
      { label: 'Ta bort grupp', click: () => store.removeGroup(groupId) },
    ];
    return popup.holdBlur(() => new Promise(resolve => {
      Menu.buildFromTemplate(template).popup({ window: popup.window, callback: resolve });
    }));
  });

  log('ipc: registrerad');
}
