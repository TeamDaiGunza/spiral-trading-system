const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  notify: function(opts) {
    ipcRenderer.send('notify', opts);
  }
});
