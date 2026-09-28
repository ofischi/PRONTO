// PRONTO — Windows masaüstü kabuğu.
// Program GitHub Pages'teki index.html'i açar: siteyi güncelleyince 10 bilgisayar da
// yeniden kurulum olmadan yeni sürümü alır. Kabuk değişirse otomatik güncelleme devreye girer.
const { app, BrowserWindow, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');

const URL_APP = 'https://ofischi.github.io/PRONTO/';
if (!app.requestSingleInstanceLock()) app.quit();

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1100, minHeight: 700, show: false,
    title: 'PRONTO', backgroundColor: '#F2F1EE',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: !app.isPackaged }
  });
  win.removeMenu();
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  // Dış bağlantılar tarayıcıda açılsın, program başka siteye gitmesin
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(URL_APP)) e.preventDefault(); });
  // İnternet yoksa boş ekran yerine açıklama göster
  win.webContents.on('did-fail-load', (_e, code, _d, url) => {
    if (code === -3 || !String(url).startsWith(URL_APP)) return;
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
      '<body style="font:16px Segoe UI,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#F2F1EE;color:#1C1C1E">' +
      '<div style="text-align:center"><h2>İnternet bağlantısı yok</h2><p>Bağlantı gelince yeniden deneyin.</p>' +
      '<button onclick="location.href=\'' + URL_APP + '\'" style="padding:10px 20px;border:0;border-radius:10px;background:#E6B22A;font-weight:700;cursor:pointer">Tekrar Dene</button></div></body>'));
  });
  win.loadURL(URL_APP);
}

autoUpdater.autoDownload = false;
autoUpdater.on('update-available', async info => {
  const r = await dialog.showMessageBox({ type: 'info', buttons: ['İndir', 'Daha Sonra'], title: 'PRONTO Güncellemesi', message: `Yeni sürüm bulundu: ${info.version}` });
  if (r.response === 0) autoUpdater.downloadUpdate();
});
autoUpdater.on('update-downloaded', async () => {
  const r = await dialog.showMessageBox({ type: 'info', buttons: ['Şimdi Yeniden Başlat', 'Sonra'], title: 'Güncelleme Hazır', message: 'Yeni sürüm indirildi.' });
  if (r.response === 0) autoUpdater.quitAndInstall();
});
autoUpdater.on('error', e => console.error('Güncelleme hatası:', e));

app.whenReady().then(() => {
  createWindow();
  if (app.isPackaged) setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
