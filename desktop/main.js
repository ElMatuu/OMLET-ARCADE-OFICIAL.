const { app, BrowserWindow, shell, dialog, session } = require('electron');
const path = require('node:path');

let mainWindow = null;

function isTrustedAppContent(webContents) {
  const url = webContents && webContents.getURL();
  return typeof url === 'string' && url.startsWith('file://') && url.includes('/www/');
}

function configureMediaPermissions() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details = {}) => {
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
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#050509',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow = window;
  window.once('ready-to-show', () => window.show());

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
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
