const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('companion', {
  getState: () => ipcRenderer.invoke('companion:state'),
  pair: (payload) => ipcRenderer.invoke('companion:pair', payload),
  sync: () => ipcRenderer.invoke('companion:sync'),
  openReview: () => ipcRenderer.invoke('companion:open-review'),
  unpair: () => ipcRenderer.invoke('companion:unpair'),
  
  // Agent mode methods
  enableAgentMode: () => ipcRenderer.invoke('companion:enable-agent-mode'),
  disableAgentMode: () => ipcRenderer.invoke('companion:disable-agent-mode'),
});
