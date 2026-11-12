'use strict';

const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Tray,
  Menu,
  nativeImage,
  Notification,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const Store = require('./store.cjs');
const ProcessManager = require('./process-manager.cjs');
const MonitorManager = require('./monitor.cjs');
const CommandRunner = require('./command-runner.cjs');

app.setName('ADNANDEV-APP');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let trayHintShown = false;
let store = null;
let pm = null;
let monitor = null;
let runner = null;

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  if (tray) return;

  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  let icon = nativeImage.createFromPath(iconPath);
  if (!icon.isEmpty()) {
    icon = icon.resize({ width: 22, height: 22, quality: 'best' });
  }

  tray = new Tray(icon);
  tray.setToolTip('ADNANDEV-APP — monitoring service');

  const menu = Menu.buildFromTemplate([
    { label: 'Buka ADNANDEV-APP', click: () => showWindow() },
    { type: 'separator' },
    {
      label: 'Keluar',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);

  tray.on('click', () => showWindow());
  tray.on('double-click', () => showWindow());
}

function hideToTray() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.hide();

  if (!trayHintShown) {
    trayHintShown = true;
    try {
      if (Notification.isSupported()) {
        new Notification({
          title: 'ADNANDEV-APP masih berjalan',
          body: 'Aplikasi dipindahkan ke system tray. Klik ikon tray untuk membuka, atau pilih "Keluar" untuk menghentikan.',
          icon: path.join(__dirname, '..', 'assets', 'icon.png'),
        }).show();
      }
    } catch {
      // Notifikasi opsional; abaikan bila desktop tidak mendukung.
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 940,
    minHeight: 620,
    backgroundColor: '#0a0d12',
    title: 'ADNANDEV-APP',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, source) => {
    console.log(`[renderer] ${message} (${source}:${line})`);
  });
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[preload-error]', preloadPath, error);
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, desc, url) => {
    console.error('[did-fail-load]', code, desc, url);
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));

  // Tombol close = sembunyikan ke tray, bukan keluar.
  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    hideToTray();
  });

  // Buka link eksternal di browser, bukan di dalam app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function registerIpc() {
  ipcMain.handle('data:get', () => store.getData());
  ipcMain.handle('app:version', () => app.getVersion());

  ipcMain.handle('project:add', (_e, name) => store.addProject(name));
  ipcMain.handle('project:update', (_e, id, patch) => store.updateProject(id, patch));
  ipcMain.handle('project:delete', (_e, id) => {
    const project = store.getProject(id);
    if (project) {
      for (const service of project.services) pm.stop(service.id);
    }
    return store.deleteProject(id);
  });

  ipcMain.handle('service:add', (_e, projectId, data) => store.addService(projectId, data));
  ipcMain.handle('service:update', (_e, id, patch) => store.updateService(id, patch));
  ipcMain.handle('service:delete', (_e, id) => {
    pm.stop(id);
    pm.clearLogs(id);
    return store.deleteService(id);
  });

  ipcMain.handle('service:run', (_e, id) => {
    const service = store.findService(id);
    if (!service) return { ok: false, error: 'Service tidak ditemukan.' };
    return pm.run(service);
  });

  ipcMain.handle('service:stop', (_e, id) => pm.stop(id));
  ipcMain.handle('service:restart', (_e, id) => {
    const service = store.findService(id);
    if (!service) return { ok: false, error: 'Service tidak ditemukan.' };
    return pm.restart(service);
  });
  ipcMain.handle('service:logs', (_e, id) => pm.getLogs(id));
  ipcMain.handle('service:logs:clear', (_e, id) => {
    pm.clearLogs(id);
    return true;
  });

  ipcMain.handle('shell:open-external', async (_e, rawUrl) => {
    try {
      const url = new URL(String(rawUrl));
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { ok: false, error: 'Hanya link http/https yang diizinkan.' };
      }
      await shell.openExternal(url.toString());
      return { ok: true };
    } catch {
      return { ok: false, error: 'Link tidak valid.' };
    }
  });

  ipcMain.handle('shell:open-path', async (_e, rawPath) => {
    const target = String(rawPath || '').trim();
    if (!target) {
      return { ok: false, error: 'Folder service belum diatur.' };
    }
    try {
      const stat = await fs.promises.stat(target);
      if (!stat.isDirectory()) {
        return { ok: false, error: 'Path bukan sebuah folder.' };
      }
    } catch {
      return { ok: false, error: 'Folder tidak ditemukan.' };
    }
    const error = await shell.openPath(target);
    if (error) return { ok: false, error };
    return { ok: true };
  });

  ipcMain.handle('dialog:pick-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Pilih folder service',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('config:export', async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Simpan backup konfigurasi',
      defaultPath: path.join(
        app.getPath('home'),
        `adnandev-backup-${stamp}.json`
      ),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true };
    }
    try {
      fs.writeFileSync(
        result.filePath,
        JSON.stringify(store.getData(), null, 2),
        'utf8'
      );
      return { ok: true, path: result.filePath };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('config:import', async () => {
    const startDir = fs.existsSync(store.backupsDir)
      ? store.backupsDir
      : app.getPath('userData');

    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Pulihkan konfigurasi dari backup',
      defaultPath: startDir,
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }

    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
      if (!Array.isArray(parsed.projects)) {
        throw new Error('Struktur file tidak valid.');
      }
    } catch (err) {
      return { ok: false, error: `File backup tidak valid: ${err.message}` };
    }

    const confirm = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Batal', 'Ganti data'],
      defaultId: 0,
      cancelId: 0,
      title: 'Restore konfigurasi',
      message: 'Ganti semua projek & service saat ini?',
      detail:
        'Data saat ini akan digantikan oleh isi file backup. Service yang sedang berjalan akan dihentikan.',
    });
    if (confirm.response !== 1) return { ok: false, canceled: true };

    pm.stopAll();
    store.replaceData(parsed);
    return { ok: true };
  });

  ipcMain.handle('monitor:ready', () => monitor.start());
  ipcMain.handle('monitor:input', (_e, data) => {
    monitor.write(String(data));
    return true;
  });
  ipcMain.handle('monitor:resize', (_e, cols, rows) => {
    monitor.resize(Number(cols), Number(rows));
    return true;
  });
  ipcMain.handle('monitor:status', () => monitor.status());

  ipcMain.handle('command:run', (_e, command) => {
    const cmd = String(command || '').trim();
    if (!cmd) return { ok: false, error: 'Command kosong.' };
    if (cmd.length > 2000) {
      return { ok: false, error: 'Command terlalu panjang.' };
    }
    return runner.run(cmd);
  });
  ipcMain.handle('command:add', (_e, data) => store.addCommand(data));
  ipcMain.handle('command:update', (_e, id, patch) =>
    store.updateCommand(id, patch)
  );
  ipcMain.handle('command:delete', (_e, id) => store.deleteCommand(id));
  ipcMain.handle('command:stop', () => runner.stop());
  ipcMain.handle('command:clear', () => {
    runner.clear();
    return true;
  });
  ipcMain.handle('command:status', () => runner.status());
}

// Hanya boleh satu instance. Saat app dibuka lagi, tampilkan window yang ada.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showWindow();
  });

  app.whenReady().then(() => {
    const configPath = process.env.ADNANDEV_CONFIG
      ? path.resolve(process.env.ADNANDEV_CONFIG)
      : path.join(app.getPath('userData'), 'config.json');

    store = new Store(configPath);
    pm = new ProcessManager();
    monitor = new MonitorManager();
    runner = new CommandRunner();

    monitor.on('data', (data) => send('monitor:data', data));
    monitor.on('exit', (payload) => send('monitor:exit', payload));

    runner.on('data', (data) => send('command:data', data));
    runner.on('start', (payload) => send('command:start', payload));
    runner.on('exit', (payload) => send('command:exit', payload));
    runner.on('error', (payload) => send('command:error', payload));

    pm.on('log', ({ id, text }) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('service:log', { id, text });
      }
    });

    pm.on('status', (payload) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('service:status', payload);
      }
    });

    registerIpc();
    createTray();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else showWindow();
    });
  });
}

// Jangan keluar saat semua window ditutup: aplikasi hidup di system tray.
app.on('window-all-closed', () => {
  // Biarkan tetap berjalan; keluar hanya lewat menu tray "Keluar".
});

// Pastikan semua proses service dimatikan saat aplikasi ditutup.
app.on('before-quit', () => {
  isQuitting = true;
  if (tray) {
    tray.destroy();
    tray = null;
  }
  if (pm) pm.stopAll();
  if (monitor) monitor.stop();
  if (runner) runner.stop();
});

// Bersihkan proses juga saat aplikasi dihentikan lewat sinyal (mis. kill).
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    isQuitting = true;
    if (pm) pm.stopAll();
    if (monitor) monitor.stop();
    if (runner) runner.stop();
    app.quit();
  });
}
