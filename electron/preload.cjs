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
  openPath: (target) => ipcRenderer.invoke('shell:open-path', target),

  exportConfig: () => ipcRenderer.invoke('config:export'),
  importConfig: () => ipcRenderer.invoke('config:import'),

  monitorReady: () => ipcRenderer.invoke('monitor:ready'),
  monitorInput: (data) => ipcRenderer.invoke('monitor:input', data),
  monitorResize: (cols, rows) =>
    ipcRenderer.invoke('monitor:resize', cols, rows),
  monitorStatus: () => ipcRenderer.invoke('monitor:status'),

  runCommand: (command) => ipcRenderer.invoke('command:run', command),
  addCommand: (data) => ipcRenderer.invoke('command:add', data),
  updateCommand: (id, patch) =>
    ipcRenderer.invoke('command:update', id, patch),
  deleteCommand: (id) => ipcRenderer.invoke('command:delete', id),
  stopCommand: () => ipcRenderer.invoke('command:stop'),
  clearCommand: () => ipcRenderer.invoke('command:clear'),
  commandStatus: () => ipcRenderer.invoke('command:status'),

  onMonitorData: (callback) =>
    ipcRenderer.on('monitor:data', (_event, payload) => callback(payload)),
  onMonitorExit: (callback) =>
    ipcRenderer.on('monitor:exit', (_event, payload) => callback(payload)),

  onCommandData: (callback) =>
    ipcRenderer.on('command:data', (_event, payload) => callback(payload)),
  onCommandStart: (callback) =>
    ipcRenderer.on('command:start', (_event, payload) => callback(payload)),
  onCommandExit: (callback) =>
    ipcRenderer.on('command:exit', (_event, payload) => callback(payload)),
  onCommandError: (callback) =>
    ipcRenderer.on('command:error', (_event, payload) => callback(payload)),

  onLog: (callback) =>
    ipcRenderer.on('service:log', (_event, payload) => callback(payload)),
  onStatus: (callback) =>
    ipcRenderer.on('service:status', (_event, payload) => callback(payload)),
});
