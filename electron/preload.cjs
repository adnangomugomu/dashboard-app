'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getData: () => ipcRenderer.invoke('data:get'),
  getVersion: () => ipcRenderer.invoke('app:version'),

  addProject: (name) => ipcRenderer.invoke('project:add', name),
  updateProject: (id, patch) => ipcRenderer.invoke('project:update', id, patch),
  deleteProject: (id) => ipcRenderer.invoke('project:delete', id),

  addService: (projectId, data) => ipcRenderer.invoke('service:add', projectId, data),
  updateService: (id, patch) => ipcRenderer.invoke('service:update', id, patch),
  deleteService: (id) => ipcRenderer.invoke('service:delete', id),

  runService: (id) => ipcRenderer.invoke('service:run', id),
  stopService: (id) => ipcRenderer.invoke('service:stop', id),
  restartService: (id) => ipcRenderer.invoke('service:restart', id),
  getLogs: (id) => ipcRenderer.invoke('service:logs', id),
  clearLogs: (id) => ipcRenderer.invoke('service:logs:clear', id),

  pickFolder: () => ipcRenderer.invoke('dialog:pick-folder'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),

  exportConfig: () => ipcRenderer.invoke('config:export'),
  importConfig: () => ipcRenderer.invoke('config:import'),

  onLog: (callback) =>
    ipcRenderer.on('service:log', (_event, payload) => callback(payload)),
  onStatus: (callback) =>
    ipcRenderer.on('service:status', (_event, payload) => callback(payload)),
});
