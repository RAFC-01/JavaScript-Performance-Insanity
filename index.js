const { app, globalShortcut, BrowserWindow, Menu } = require('electron');
const path = require('path');

let devMode = true;

if (devMode) require('electron-reload')(__dirname);

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    autoHideMenuBar: true,
    webPreferences: {
      // offscreen: true,
      nodeIntegration: true,
      contextIsolation: false,
    }
  }, );

  // Load the index.html file inside the 'app/' folder
  mainWindow.loadFile(path.join(__dirname, 'app', 'index.html'));
}

if (!devMode) Menu.setApplicationMenu(null);
// app.disableHardwareAcceleration();

app.whenReady().then(() => {
    // app.commandLine.appendSwitch("--disable-frame-rate-limit");
    // app.commandLine.appendSwitch("--disable-gpu-vsync");
    // app.commandLine.appendSwitch('--gc-interval --expose_gc', '1');
    // app.commandLine.appendSwitch('--expose_gc');
    createWindow()
});
app.on('will-quit', () => {
  
    // Unregister all shortcuts.
    globalShortcut.unregisterAll()
  })
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
