const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("schoolAPI", {
  version: "1.0.0",
  isElectron: true,
  apiBase: "http://127.0.0.1:3780"
});
