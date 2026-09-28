// PRONTO Teklif — sayfaya yalnızca birkaç güvenli işlev açılır.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('prontoDesktop', {
  savePdf: o => ipcRenderer.invoke('pdf:save', o),
  copyFile: p => ipcRenderer.invoke('file:copy', p),       // PDF'i dosya olarak panoya koyar (Ctrl+V ile yapıştırılır)
  openWhatsApp: phone => ipcRenderer.invoke('wa:open', phone),
  openExternal: u => ipcRenderer.invoke('open:external', u)
});
