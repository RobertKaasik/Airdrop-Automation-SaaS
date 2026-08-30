const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('companion', {
  getState: () => ipcRenderer.invoke('companion:state'),
  pair: (payload) => ipcRenderer.invoke('companion:pair', payload),
  sync: () => ipcRenderer.invoke('companion:sync'),
  openReview: (query) => ipcRenderer.invoke('companion:open-review', query || {}),
  unpair: () => ipcRenderer.invoke('companion:unpair'),
  
  // Agent mode methods
  enableAgentMode: () => ipcRenderer.invoke('companion:enable-agent-mode'),
  disableAgentMode: () => ipcRenderer.invoke('companion:disable-agent-mode'),
  
  // Key management methods
  importPrivateKeys: (keys) => ipcRenderer.invoke('companion:import-private-keys', keys),
  importSeedPhrase: (phrase) => ipcRenderer.invoke('companion:import-seed-phrase', phrase),
  listWallets: () => ipcRenderer.invoke('companion:list-wallets'),
  removeWallet: (address) => ipcRenderer.invoke('companion:remove-wallet', address),
  clearAllKeys: () => ipcRenderer.invoke('companion:clear-all-keys')
});
