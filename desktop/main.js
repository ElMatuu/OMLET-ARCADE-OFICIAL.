const { app, BrowserWindow, shell, dialog, session, desktopCapturer } = require('electron');
const path = require('node:path');

let mainWindow = null;
let splashWindow = null;

function isTrustedAppContent(webContents) {
  const url = webContents && webContents.getURL();
  return typeof url === 'string' && url.startsWith('file://') && url.includes('/www/');
}

function configureMediaPermissions() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details = {}) => {
    if (permission === 'display-capture' && isTrustedAppContent(webContents)) {
      callback(true);
      return;
    }
    if (permission !== 'media' || !isTrustedAppContent(webContents)) {
      callback(false);
      return;
    }
    const requested = Array.isArray(details.mediaTypes) && details.mediaTypes.length
      ? details.mediaTypes.join(' y ')
      : 'cámara o micrófono';
    dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Permitir', 'Bloquear'],
      defaultId: 1,
      cancelId: 1,
      title: 'Permisos multimedia de PLAYVERSE',
      message: 'PLAYVERSE solicita acceso a ' + requested + '.',
      detail: 'El acceso se usa únicamente cuando iniciás una transmisión. Podés bloquearlo si no querés emitir.'
    }).then((result) => callback(result.response === 0)).catch(() => callback(false));
  });

  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    const requesterUrl = request.frame && request.frame.url;
    if (typeof requesterUrl !== 'string' || !requesterUrl.startsWith('file://') || !requesterUrl.includes('/www/')) {
      callback(null);
      return;
    }
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 240, height: 135 }
      });
      if (!sources.length) {
        callback(null);
        return;
      }
      const choices = sources.map((source) => source.name).concat('Cancelar');
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: choices,
        cancelId: choices.length - 1,
        defaultId: choices.length - 1,
        title: 'Compartir pantalla en PLAYVERSE',
        message: 'Elegí la pantalla o ventana que querés compartir.'
      });
      const selected = sources[result.response];
      if (!selected) {
        callback(null);
        return;
      }
      callback({ video: selected, ...(request.audioRequested ? { audio: 'loopback' } : {}) });
    } catch {
      callback(null);
    }
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    show: false,
    backgroundColor: '#08090D',
    icon: path.join(__dirname, '..', 'assets', 'playverse-icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow = window;
  window.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    splashWindow = null;
    window.show();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    const localEntry = path.join(__dirname, '..', 'www', 'index.html');
    if (url.startsWith('file://') && url.includes('www/index.html')) return;
    if (url.startsWith('https://')) {
      event.preventDefault();
      shell.openExternal(url);
      return;
    }
    if (!url.startsWith('file://') || !url.includes(path.basename(localEntry))) {
      event.preventDefault();
    }
  });

  window.loadFile(path.join(__dirname, '..', 'www', 'index.html'));
}

app.whenReady().then(() => {
  configureMediaPermissions();
  splashWindow = new BrowserWindow({
    width: 440, height: 320, resizable: false, movable: true, frame: false,
    center: true, show: true, backgroundColor: '#08090D',
    icon: path.join(__dirname, '..', 'assets', 'playverse-icon.png'),
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
