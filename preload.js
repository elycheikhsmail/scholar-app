const { contextBridge, ipcRenderer } = require("electron");
const { version } = require("./package.json");

contextBridge.exposeInMainWorld("schoolAPI", {
  version,
  isElectron: true,
  apiBase: "http://127.0.0.1:3780",
  openLogs: () => ipcRenderer.invoke("open-logs")
});
