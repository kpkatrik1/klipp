// Sandboxed preload: exposes a small, typed API to the renderer.
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);
const on = (channel) => (cb) => { ipcRenderer.on(channel, (_event, ...args) => cb(...args)); };

contextBridge.exposeInMainWorld('klipp', {
  platform: process.platform,
  list: invoke('clips:list'),
  groups: invoke('groups:list'),
  paste: invoke('clips:paste'),
  hide: invoke('popup:hide'),
  togglePin: invoke('clips:togglePin'),
  remove: invoke('clips:remove'),
  update: invoke('clips:update'),
  moveToGroup: invoke('clips:moveToGroup'),
  getFullText: invoke('clips:getFullText'),
  showContextMenu: invoke('clips:contextMenu'),
  addGroup: invoke('groups:add'),
  renameGroup: invoke('groups:rename'),
  removeGroup: invoke('groups:remove'),
  showGroupMenu: invoke('groups:contextMenu'),
  onShown: on('popup:shown'),
  onChanged: on('store:changed'),
  onCommand: on('ui:command'),
});
