// PRONTO — Windows masaüstü kabuğu.
// Program GitHub Pages'teki index.html'i açar: siteyi güncelleyince 10 bilgisayar da
// yeniden kurulum olmadan yeni sürümü alır. Kabuk değişirse otomatik güncelleme devreye girer.
const { app, BrowserWindow, dialog, shell, ipcMain } = require('electron');
const path = require('path'), fs = require('fs'), { execFile } = require('child_process');
const { autoUpdater } = require('electron-updater');

// Test için adres değiştirilebilir; kurulu programda her zaman GitHub adresi kullanılır
const URL_APP = (!app.isPackaged && process.env.PRONTO_URL) || 'https://ofischi.github.io/PRONTO/';
// Açılışta her zaman sunucudaki güncel sürümü iste (10 dk önbellek beklenmez)
const NO_CACHE = { extraHeaders: 'pragma: no-cache\ncache-control: no-cache\n' };
if (!app.requestSingleInstanceLock()) app.quit();
// Sadece PRONTO'nun kendi adresi (aynı köken + yol öneki) güvenilir sayılır
const sameApp = (u) => { try { const a = new URL(u), b = new URL(URL_APP); return a.origin === b.origin && a.pathname.startsWith(b.pathname); } catch { return false; } };

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1100, minHeight: 700, show: false,
    title: 'PRONTO', backgroundColor: '#F2F1EE',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: !app.isPackaged, webviewTag: false }
  });
  win.removeMenu();
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  // Dış bağlantılar tarayıcıda açılsın, program başka siteye gitmesin
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^(https:|mailto:|whatsapp:)/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!sameApp(url)) e.preventDefault(); });
  win.webContents.on('will-redirect', (e, url) => { if (!sameApp(url)) e.preventDefault(); });
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());
  // İnternet yoksa boş ekran yerine açıklama göster
  win.webContents.on('did-fail-load', (_e, code, _d, url) => {
    if (code === -3 || !String(url).startsWith(URL_APP)) return;
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
      '<body style="font:16px Segoe UI,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#F2F1EE;color:#1C1C1E">' +
      '<div style="text-align:center"><h2>İnternet bağlantısı yok</h2><p>Bağlantı gelince yeniden deneyin.</p>' +
      '<button onclick="location.href=\'' + URL_APP + '\'" style="padding:10px 20px;border:0;border-radius:10px;background:#E6B22A;font-weight:700;cursor:pointer">Tekrar Dene</button></div></body>'));
  });
  // F5 veya Ctrl+R: önbelleği atlayarak yenile (GitHub'daki son sürüm hemen gelir)
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type === 'keyDown' && (i.key === 'F5' || (i.control && i.key.toLowerCase() === 'r'))) {
      e.preventDefault();
      if (win.webContents.getURL().startsWith(URL_APP)) win.webContents.reloadIgnoringCache();
      else win.loadURL(URL_APP, NO_CACHE);
    }
  });
  win.loadURL(URL_APP, NO_CACHE);
}

// ---- PDF kaydet / paylaş (yalnızca PRONTO sayfasından gelen istekler kabul edilir)
const fromApp = e => e.senderFrame && String(e.senderFrame.url).startsWith(URL_APP);
const cleanName = s => (String(s || '').replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Teklif').replace(/(\.pdf)?$/i, '.pdf');
let pdfBusy = false;
const madeFiles = new Set();   // yalnızca programın ürettiği PDF'ler panoya kopyalanabilir
// Alt bilgi (firma satırı + Sayfa x / y) Electron'un şablonuyla basılır; metinler HTML'den arındırılır
const esc = v => String(v || '').slice(0, 300).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function makePdf(wc, o) {
  const f = o.footer && typeof o.footer === 'object' ? o.footer : null;
  return wc.printToPDF({
    pageSize: o.pageSize === 'A3' ? 'A3' : 'A4', landscape: !!o.landscape, printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: !!f, headerTemplate: '<span></span>',
    footerTemplate: f ? `<div style="width:100%;margin:0 12mm;display:flex;justify-content:space-between;font:8px Manrope,Segoe UI,sans-serif;color:#4a4f5a"><span>${esc(f.left)}</span><span>${esc(f.page)} <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>` : ''
  });
}
ipcMain.handle('pdf:save', async (e, o = {}) => {
  if (!fromApp(e)) return { ok: false, error: 'izin yok' };
  if (pdfBusy) return { ok: false, error: 'meşgul' };
  pdfBusy = true;
  try {
    const name = cleanName(o.fileName);
    let file;
    if (o.ask !== false) {
      const r = await dialog.showSaveDialog(win, { title: 'PDF olarak kaydet', defaultPath: path.join(app.getPath('downloads'), name), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
      if (r.canceled || !r.filePath) return { ok: false, canceled: true };
      file = r.filePath.toLowerCase().endsWith('.pdf') ? r.filePath : r.filePath + '.pdf';
    } else {
      const dir = path.join(app.getPath('downloads'), 'PRONTO Teklifler');
      fs.mkdirSync(dir, { recursive: true });
      file = path.join(dir, name);
    }
    // Pencerenin gri zemini PDF kenarlarına basılmasın
    const bw = BrowserWindow.fromWebContents(e.sender);
    if (bw) bw.setBackgroundColor('#FFFFFF');
    const data = await makePdf(e.sender, o);
    if (bw) bw.setBackgroundColor('#F2F1EE');
    fs.writeFileSync(file, data); madeFiles.add(file);
    if (o.reveal) shell.showItemInFolder(file);
    return { ok: true, path: file };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  } finally { pdfBusy = false; }
});
const OUT_OK = /^(https:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\/|whatsapp:|mailto:)/i;
// PDF'i dosya olarak panoya kopyala (WhatsApp / Outlook'ta Ctrl+V ile ek olarak yapışır)
ipcMain.handle('file:copy', (e, file) => new Promise(ok => {
  file = String(file || '');
  if (!fromApp(e) || !madeFiles.has(file) || !fs.existsSync(file)) return ok(false);
  const reveal = () => { shell.showItemInFolder(file); ok(false); };   // kopyalanamazsa klasörde göster (sürükle-bırak)
  if (process.platform !== 'win32') return reveal();
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', 'Set-Clipboard -LiteralPath $env:PRONTO_FILE'],
    { env: { ...process.env, PRONTO_FILE: file }, windowsHide: true, timeout: 15000 }, err => err ? reveal() : ok(true));
}));
// WhatsApp: masaüstü uygulaması kuruluysa onu, değilse varsayılan tarayıcıda WhatsApp Web'i açar
ipcMain.handle('wa:open', async (e, phone) => {
  if (!fromApp(e)) return false;
  const num = /^\d{10,15}$/.test(String(phone || '')) ? String(phone) : '';
  const hasApp = !!app.getApplicationNameForProtocol('whatsapp://');
  const url = hasApp ? (num ? `whatsapp://send?phone=${num}` : 'whatsapp://') : (num ? `https://web.whatsapp.com/send?phone=${num}` : 'https://web.whatsapp.com/');
  try { await shell.openExternal(url); return hasApp ? 'app' : 'web'; } catch { return false; }
});
ipcMain.handle('open:external', (e, url) => {
  url = String(url || '');
  if (!fromApp(e) || url.length > 8000 || !OUT_OK.test(url)) return false;
  return shell.openExternal(url).then(() => true, () => false);
});

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
  const { session } = require('electron');
  const IZIN = new Set(['clipboard-sanitized-write', 'fullscreen']);
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(IZIN.has(perm) && sameApp(wc.getURL())));
  session.defaultSession.setPermissionCheckHandler((wc, perm) => IZIN.has(perm));
  createWindow();
  if (app.isPackaged) setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
