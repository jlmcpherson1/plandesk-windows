// Gives the PlanDesk page desktop abilities: receive files Windows opens with PlanDesk, show a file in its folder, set up the printer.
const { contextBridge, ipcRenderer } = require("electron");
let handler = null;
const waiting = [];
ipcRenderer.on("open-file", (_e, f) => { if (handler) handler(f); else waiting.push(f); });
contextBridge.exposeInMainWorld("pdDesktop", {
  platform: "windows",
  titleBar: 40, // PlanDesk's top bar is the window title bar; Windows' buttons sit over its right end
  setTitleBar: (color, symbol) => ipcRenderer.send("title-bar", { color, symbol }),
  onFullScreen: cb => ipcRenderer.on("full-screen", (_e, on) => cb(!!on)),
  onOpenFile(cb) { handler = cb; while (waiting.length) cb(waiting.shift()); ipcRenderer.send("renderer-ready"); },
  reveal: name => ipcRenderer.invoke("reveal", name),
  setupPrinter: () => ipcRenderer.invoke("setup-printer"),
  saveFile: (path, data) => ipcRenderer.invoke("save-file", path, data),
  saveAs: (name, data, cur) => ipcRenderer.invoke("save-as", name, data, cur), // Windows' Save As window; returns the chosen path
  htmlToPdf: (html, opts) => ipcRenderer.invoke("html-to-pdf", html, opts), // Word and Excel files laid out by the page, printed to a text PDF
});
