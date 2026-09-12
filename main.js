const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("path");
const log = require("./logger");
const { startServer, syncRemote } = require("./server");

// Every process fault lands in <userData>/logs/app.log before anything else
// runs, so a failed start on a school computer leaves a trace to read.
log.init(app.getPath("userData"));
log.installProcessHandlers();

let serverInfo = null;
let mainWindow = null;

async function createWindow() {
  serverInfo = await startServer();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 620,
    show: false,
    backgroundColor: "#f4f7fb",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    log.error("واجهة البرنامج لم تُحمّل", `${errorCode} ${errorDescription} ${validatedURL || ""}`);
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    log.error("renderer process gone", details);
  });
  mainWindow.webContents.on("unresponsive", () => log.warn("window unresponsive"));
  mainWindow.webContents.on("responsive", () => log.info("window responsive again"));

  await mainWindow.loadURL(serverInfo.url);
}

// Settings → account: opens the folder holding app.log in the file manager.
ipcMain.handle("open-logs", () => shell.openPath(log.dir()));

app.on("child-process-gone", (_event, details) => log.error("child process gone", details));

app.whenReady().then(() => {
  log.info(`application starting: version ${app.getVersion()}, electron ${process.versions.electron}`);
  return createWindow();
}).catch(error => {
  log.error("تعذر تشغيل البرنامج", error);
  dialog.showErrorBox("تعذر تشغيل البرنامج", `${error.message || error}\n\nراجع ملف السجل:\n${log.file()}`);
  app.exit(1);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow().catch(error => log.error("تعذر فتح النافذة", error));
});

// Closing the application pushes the snapshot to the web copy when one is
// configured; offline or refused, the application still closes (bounded wait).
let quitting = false;
app.on("before-quit", event => {
  if (quitting) return;
  quitting = true;
  event.preventDefault();
  syncRemote({ timeout: 5000 }).catch(() => {}).finally(() => {
    if (serverInfo && serverInfo.close) serverInfo.close();
    log.info("application closed");
    app.exit(0);
  });
});
