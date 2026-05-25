const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Notifications
  notify: function(opts) {
    ipcRenderer.send('notify', opts);
  },

  // Update events from main process → renderer
  onUpdateAvailable: function(cb) {
    ipcRenderer.on('update-available', (event, version) => cb(version));
  },
  onUpdateProgress: function(cb) {
    ipcRenderer.on('update-progress', (event, percent) => cb(percent));
  },
  onUpdateDownloaded: function(cb) {
    ipcRenderer.on('update-downloaded', (event, version) => cb(version));
  },

  // Renderer → main: bot is safe, install now
  readyToInstall: function() {
    ipcRenderer.send('ready-to-install');
  },

  // Manual override: install immediately regardless of bot state
  installNow: function() {
    ipcRenderer.send('install-update-now');
  }
});
