const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("parkflowDesktop", {
  isDesktop: true,
});
