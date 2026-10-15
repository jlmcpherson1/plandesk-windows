// Gives the PlanDesk page desktop abilities: receive files Windows opens with PlanDesk, show a file in its folder, set up the printer.
const { contextBridge, ipcRenderer } = require("electron");
let handler = null;
const waiting = [];
ipcRenderer.on("open-file", (_e, f) => { if (handler) handler(f); else waiting.push(f); });
contextBridge.exposeInMainWorld("pdDesktop", {
  platform: "windows",
  onOpenFile(cb) { handler = cb; while (waiting.length) cb(waiting.shift()); ipcRenderer.send("renderer-ready"); },
  reveal: name => ipcRenderer.invoke("reveal", name),
  setupPrinter: () => ipcRenderer.invoke("setup-printer"),
});
