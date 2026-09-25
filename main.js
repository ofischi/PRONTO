const { app, BrowserWindow, session, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

const isDev = !app.isPackaged;
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowDowngrade = false;

autoUpdater.on('update-available', async (info) => {
  const result = await dialog.showMessageBox({
    type: 'info',
    buttons: ['Güncellemeyi İndir', 'Daha Sonra'],
    defaultId: 0,
    cancelId: 1,
    title: 'PRONTO Güncellemesi',
    message: `Yeni PRONTO sürümü bulundu: ${info.version}`,
    detail: 'Güncelleme indirilecek ve PRONTO yeniden başlatıldığında kurulacaktır.'
  });
  if (result.response === 0) autoUpdater.downloadUpdate();
});

autoUpdater.on('update-downloaded', async () => {
  const result = await dialog.showMessageBox({
    type: 'info',
    buttons: ['Şimdi Yeniden Başlat', 'Sonra'],
    defaultId: 0,
    cancelId: 1,
    title: 'Güncelleme Hazır',
    message: 'PRONTO için yeni sürüm indirildi.',
    detail: 'Kurulumu tamamlamak için uygulamayı yeniden başlatabilirsiniz.'
  });
  if (result.response === 0) autoUpdater.quitAndInstall();
});

autoUpdater.on('error', (error) => {
  console.error('PRONTO auto-update error:', error);
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#0f1115',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false
    }
  });

  win.removeMenu();
  win.once('ready-to-show', () => win.show());
  win.loadURL('https://ofischi.github.io/PRONTO/');
}

app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders || {};
    headers['Content-Security-Policy'] = [
      "default-src 'self' https: data: blob:; " +
      "script-src 'self' 'unsafe-inline' https:; " +
      "style-src 'self' 'unsafe-inline' https:; " +
      "img-src 'self' data: blob: https:; " +
      "connect-src 'self' https: wss:; " +
      "font-src 'self' data: https:; " +
      "object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'self'"
    ];
    callback({ responseHeaders: headers });
  });

  createWindow();

  if (!isDev) {
    setTimeout(() => autoUpdater.checkForUpdates().catch(console.error), 3000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
