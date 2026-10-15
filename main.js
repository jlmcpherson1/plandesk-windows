// PlanDesk for Windows: a desktop window around PlanDesk, which loads from Highline's site behind its sign-in.
// It opens PDFs and FDFs that Windows hands it (double-click, Outlook attachments, "Open with"), remembers
// where each file lives for "Show in folder", and keeps links like checkout in the normal browser.
const { app, BrowserWindow, ipcMain, shell, Menu, session, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

const START_URL = process.env.PLANDESK_URL || "https://highlinepropertiesnc.com/desk/";
const SITE = new URL(START_URL).origin;
const ALLOWED_IN_WINDOW = [SITE, "https://damp-glade-9c00.cloudflareaccess.com"];
const isFile = a => typeof a === "string" && /\.(pdf|fdf)$/i.test(a) && !a.startsWith("-");

let win = null, rendererReady = false;
const queue = [];
const knownPath = path.join(app.getPath("userData"), "opened-files.json");
let known = {};
try { known = JSON.parse(fs.readFileSync(knownPath, "utf8")); } catch (e) {}
const remember = (name, full) => { known[name.toLowerCase()] = full; const keys = Object.keys(known); if (keys.length > 800) keys.slice(0, 200).forEach(k => delete known[k]); try { fs.writeFileSync(knownPath, JSON.stringify(known)); } catch (e) {} };

function sendFile(full) {
  try {
    const data = fs.readFileSync(full), name = path.basename(full);
    remember(name, full);
    const msg = { name, path: full, data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) };
    if (win && rendererReady) win.webContents.send("open-file", msg); else queue.push(msg);
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  } catch (e) { dialog.showErrorBox("PlanDesk", "PlanDesk couldn't open " + full + "\n\n" + e.message); }
}
const filesIn = argv => argv.slice(1).filter(isFile).map(a => path.resolve(a)).filter(a => fs.existsSync(a));

if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on("second-instance", (_e, argv) => { const f = filesIn(argv); f.forEach(sendFile); if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    win = new BrowserWindow({
      width: 1440, height: 900, show: false, title: "PlanDesk", backgroundColor: "#13171b", icon: path.join(__dirname, "build", "icon.ico"),
      webPreferences: { preload: path.join(__dirname, "preload.js"), partition: "persist:plandesk", contextIsolation: true, sandbox: false, spellcheck: false },
    });
    win.once("ready-to-show", () => { win.maximize(); win.show(); });
    win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: "deny" }; });
    win.webContents.on("will-navigate", (e, url) => {
      if (ALLOWED_IN_WINDOW.some(o => url.startsWith(o))) return;
      e.preventDefault(); if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
    });
    win.webContents.on("did-start-navigation", (_e, _url, inPage, isMain) => { if (isMain && !inPage) rendererReady = false; });
    win.webContents.on("did-fail-load", (_e, code, desc, url, isMain) => {
      if (!isMain || code === -3) return;
      win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(`<body style="font:16px Segoe UI,sans-serif;background:#13171b;color:#ecebe7;display:grid;place-items:center;height:100vh;margin:0"><div style="max-width:460px;text-align:center"><h2>PlanDesk can't connect</h2><p style="color:#a9b0b6">The first time you open PlanDesk it needs the internet to sign in. Check your connection and try again.</p><button onclick="location.href='${START_URL}'" style="font:600 15px Segoe UI;padding:10px 22px;border-radius:8px;border:0;background:#f2a541;color:#141a1f;cursor:pointer">Try again</button></div></body>`));
    });
    // Keyboard shortcuts the hidden menu would normally provide.
    win.webContents.on("before-input-event", (e, i) => {
      if (i.type !== "keyDown") return;
      if (i.key === "F5" || (i.control && i.key.toLowerCase() === "r")) { e.preventDefault(); win.webContents.reload(); }
      if (i.key === "F11") { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
      if (i.control && i.shift && i.key.toLowerCase() === "i") { e.preventDefault(); win.webContents.toggleDevTools(); }
    });
    session.fromPartition("persist:plandesk").setPermissionRequestHandler((_wc, perm, cb) => cb(["clipboard-read", "clipboard-sanitized-write", "fileSystem", "notifications", "fullscreen"].includes(perm)));
    win.loadURL(START_URL);
    filesIn(process.argv).forEach(sendFile);
  });
  ipcMain.on("renderer-ready", () => { rendererReady = true; while (queue.length) win.webContents.send("open-file", queue.shift()); });
  ipcMain.handle("reveal", (_e, name) => {
    const full = known[String(name || "").toLowerCase()];
    if (full && fs.existsSync(full)) { shell.showItemInFolder(full); return true; }
    return false;
  });
  app.on("window-all-closed", () => app.quit());
}
