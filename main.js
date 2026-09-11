const { app, BrowserWindow } = require("electron");
const path = require("path");
const { startServer, syncRemote } = require("./server");

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
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    console.error("واجهة البرنامج لم تُحمّل:", errorCode, errorDescription);
  });

  await mainWindow.loadURL(serverInfo.url);
}

app.whenReady().then(createWindow).catch(error => {
  console.error("تعذر تشغيل البرنامج:", error);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
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
    app.exit(0);
  });
});
