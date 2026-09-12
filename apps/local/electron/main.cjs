const { app, BrowserWindow, Menu, globalShortcut, dialog } = require("electron");
const path = require("path");

const PORT = Number(process.env.LOCAL_PORT || 3100);

let mainWindow = null;

function userDataDir() {
  return path.join(app.getPath("userData"), "data");
}

async function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    title: "ParkFlow Caisse",
    backgroundColor: "#0b1220",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.maximize();
  mainWindow.on("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(url);
}

function buildMenu() {
  const template = [
    {
      label: "Caisse",
      submenu: [
        {
          label: "Plein ecran",
          accelerator: "F11",
          click: () => {
            if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen());
          },
        },
        { type: "separator" },
        { label: "Quitter", accelerator: "Alt+F4", role: "quit" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function start() {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  process.env.PARKFLOW_APP_ROOT = path.join(__dirname, "..");
  process.env.LOCAL_DATA_DIR = userDataDir();
  process.env.LOCAL_HOST = "127.0.0.1";
  process.env.LOCAL_PORT = String(PORT);
  process.env.LOCAL_SCHEMA_PATH = path.join(__dirname, "..", "dist-server", "schema.sql");

  const serverModule = require(path.join(__dirname, "..", "dist-server", "server.cjs"));
  try {
    await serverModule.startLocalServer({ port: PORT, host: "127.0.0.1" });
  } catch (err) {
    dialog.showErrorBox(
      "ParkFlow Caisse",
      "Impossible de demarrer le logiciel local.\n\n" + (err && err.message ? err.message : String(err)),
    );
    app.quit();
    return;
  }

  buildMenu();
  await createWindow(`http://127.0.0.1:${PORT}`);

  globalShortcut.register("F11", () => {
    if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen());
  });
}

app.whenReady().then(start);

app.on("window-all-closed", () => {
  app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
