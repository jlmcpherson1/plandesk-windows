// PlanDesk for Windows: a desktop window around PlanDesk, which loads from Highline's site behind its sign-in.
// It opens PDFs and FDFs that Windows hands it (double-click, Outlook attachments, "Open with"), remembers
// where each file lives for "Show in folder", runs the PlanDesk printer, keeps links like checkout in the
// normal browser, and updates itself from GitHub releases.
const { app, BrowserWindow, ipcMain, shell, Menu, session, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const printer = require("./printer");

// Both copies (Microsoft Store MSIX and the direct download from getplandesk.com/windows) open /app/: sign in by emailed
// code, 7-day trial, billed through Stripe. Testers on the server's COMP_EMAILS list get Pro without paying.
const STORE = !!process.windowsStore;
const START_URL = process.env.PLANDESK_URL || "https://highlinepropertiesnc.com/app/";
const SITE = new URL(START_URL).origin;
const ALLOWED_IN_WINDOW = [SITE, "https://damp-glade-9c00.cloudflareaccess.com"];
const isFile = a => typeof a === "string" && /\.(pdf|fdf|docx|docm|doc|rtf|xlsx|xlsm|xls|csv|dxf|dwg|jpe?g|jfif|png|gif|bmp|webp|heic|heif|tiff?)$/i.test(a) && !a.startsWith("-"); // Word, Excel, DXF and pictures via "Open with"; converted to PDF in the page
// Started at Windows sign-in to run the printer, or restarted by a background update: no window either way.
const BACKGROUND = process.argv.includes("--background") || process.argv.includes("--updated");

let win = null, rendererReady = false, quitting = false;
const TITLE_H = 40; // must match the page's top bar height in the desktop app (html.wco .top)
const queue = [];
const data = n => path.join(app.getPath("userData"), n);
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(data(f), "utf8")); } catch (e) { return d; } };
const writeJson = (f, v) => { try { fs.writeFileSync(data(f), JSON.stringify(v)); } catch (e) {} };
const known = readJson("opened-files.json", {});
const prefs = readJson("prefs.json", {});
const remember = (name, full) => { known[name.toLowerCase()] = full; const keys = Object.keys(known); if (keys.length > 800) keys.slice(0, 200).forEach(k => delete known[k]); writeJson("opened-files.json", known); };

function createWindow() {
  if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); return win; }
  rendererReady = false;
  win = new BrowserWindow({
    width: 1440, height: 900, show: false, title: "PlanDesk", backgroundColor: "#13171b", icon: path.join(__dirname, "build", "icon.ico"),
    // No separate Windows title strip: PlanDesk's own top bar (logo, menus, file name) is the title bar, with
    // Windows' minimize/maximize/close drawn over its right end. The page colors them to match its theme.
    titleBarStyle: "hidden", titleBarOverlay: { color: "#13171b", symbolColor: "#ecebe7", height: TITLE_H },
    webPreferences: { preload: path.join(__dirname, "preload.js"), partition: "persist:plandesk", contextIsolation: true, sandbox: false, spellcheck: false },
  });
  win.once("ready-to-show", () => { win.maximize(); win.show(); setTimeout(offerPrinter, 4000); });
  win.on("closed", () => { win = null; rendererReady = false; setTimeout(installUpdateIfIdle, 500); });
  checkForUpdate();
  // F11 full screen hides Windows' buttons; the page drops the space it keeps for them.
  win.on("enter-full-screen", () => win.webContents.send("full-screen", true));
  win.on("leave-full-screen", () => win.webContents.send("full-screen", false));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => {
    if (ALLOWED_IN_WINDOW.some(o => url.startsWith(o))) return;
    e.preventDefault(); if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
  });
  win.webContents.on("did-start-navigation", (_e, _url, inPage, isMain) => { if (isMain && !inPage) rendererReady = false; });
  win.webContents.on("did-fail-load", (_e, code, _desc, _url, isMain) => {
    if (!isMain || code === -3) return;
    win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(`<body style="font:16px Segoe UI,sans-serif;background:#13171b;color:#ecebe7;display:grid;place-items:center;height:100vh;margin:0"><div style="position:fixed;top:0;left:0;right:0;height:40px;-webkit-app-region:drag"></div><div style="max-width:460px;text-align:center"><h2>PlanDesk can't connect</h2><p style="color:#a9b0b6">The first time you open PlanDesk it needs the internet to sign in. Check your connection and try again.</p><button onclick="location.href='${START_URL}'" style="font:600 15px Segoe UI;padding:10px 22px;border-radius:8px;border:0;background:#f2a541;color:#141a1f;cursor:pointer">Try again</button></div></body>`));
  });
  win.webContents.on("before-input-event", (e, i) => {
    if (i.type !== "keyDown") return;
    if (i.key === "F5" || (i.control && i.key.toLowerCase() === "r")) { e.preventDefault(); win.webContents.reload(); }
    if (i.key === "F11") { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
    if (i.control && i.shift && i.key.toLowerCase() === "i") { e.preventDefault(); win.webContents.toggleDevTools(); }
  });
  win.loadURL(START_URL);
  return win;
}

function sendFile(full) {
  try {
    const buf = fs.readFileSync(full), name = path.basename(full);
    remember(name, full);
    const msg = { name, path: full, data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
    createWindow();
    if (rendererReady) win.webContents.send("open-file", msg); else queue.push(msg);
  } catch (e) { logLine("open failed " + full + ": " + e.message); dialog.showErrorBox("PlanDesk", "PlanDesk couldn't open " + full + "\n\n" + e.message); }
}
// Any argument that is an existing file (Outlook can pass short 8.3 names or odd quoting).
const filesIn = argv => {
  const out = [];
  for (let a of argv.slice(1)) {
    if (typeof a !== "string" || !a || a.startsWith("-")) continue;
    a = a.replace(/^"+|"+$/g, "").trim();
    if (!isFile(a)) continue;
    try { const full = path.resolve(a); if (fs.statSync(full).isFile()) out.push(fs.realpathSync.native ? fs.realpathSync.native(full) : full); } catch (e) {}
  }
  return out;
};
const logLine = m => { try { const f = data("debug.log"); if (fs.existsSync(f) && fs.statSync(f).size > 200000) fs.unlinkSync(f); fs.appendFileSync(f, new Date().toISOString() + "  " + m + "\n"); } catch (e) {} };

// The printer: offered once on first run, and any time from Help > Set up the PlanDesk printer.
let printerOn = false;
async function startPrinter() {
  if (printerOn || process.platform !== "win32") return;
  if (!(await printer.ours())) return;
  printerOn = true;
  printer.watch(sendFile);
  // Store apps can't add themselves to sign-in this way; there, printouts made while PlanDesk is closed open next time it starts.
  if (!STORE) app.setLoginItemSettings({ openAtLogin: true, args: ["--background"] });
}
async function setupPrinter(fromMenu) {
  if (process.platform !== "win32") return "PlanDesk's printer is for Windows.";
  const existing = await printer.port();
  if (existing && existing.toLowerCase() === printer.FILE.toLowerCase()) { await startPrinter(); if (fromMenu) dialog.showMessageBox(win, { type: "info", title: "PlanDesk", message: "The PlanDesk printer is ready.", detail: "Print from any program and choose PlanDesk. The PDF opens here and is saved in Documents\\PlanDesk Prints." }); return "ok"; }
  const r = await printer.install();
  if (r === "ok") { await startPrinter(); dialog.showMessageBox(win, { type: "info", title: "PlanDesk", message: "The PlanDesk printer is ready.", detail: "Print from Excel, Outlook, a browser or any program, choose PlanDesk, and the PDF opens here. Printouts are saved in Documents\\PlanDesk Prints." }); }
  else dialog.showMessageBox(win, { type: "warning", title: "PlanDesk", message: "The PlanDesk printer wasn't added.", detail: r + "\n\nYou can try again any time from Help › Set up the PlanDesk printer." });
  return r;
}
async function offerPrinter() {
  if (prefs.printerOffered || process.platform !== "win32" || !win) return;
  if (await printer.port()) { prefs.printerOffered = true; writeJson("prefs.json", prefs); return; } // a PlanDesk printer already exists
  prefs.printerOffered = true; writeJson("prefs.json", prefs);
  const { response } = await dialog.showMessageBox(win, { type: "question", title: "PlanDesk", buttons: ["Add the printer", "Not now"], defaultId: 0, cancelId: 1,
    message: "Add the PlanDesk printer?", detail: "Print from Excel, Outlook, a browser or any program, choose PlanDesk, and the PDF opens right here.\n\nWindows will ask permission to make changes. Choose Yes." });
  if (response === 0) setupPrinter();
}

// Updates to this window and installer download in the background and install the next time PlanDesk closes.
// (PlanDesk itself loads from the website, so its features update on their own.)
// Updates: the printer keeps PlanDesk running after its window closes, so "install on quit" alone never happens.
// Instead a downloaded update installs as soon as no window is open (right away in the background, or when you
// close the window), silently, and PlanDesk restarts in the background with --updated.
let updater = null, updateReady = false;
function installUpdateIfIdle() {
  if (!updateReady || !updater || (win && !win.isDestroyed())) return;
  logLine("installing update"); quitting = true;
  try { updater.quitAndInstall(true, true); } catch (e) { logLine("install failed " + e.message); }
}
function checkForUpdate() { if (updater && !updateReady) updater.checkForUpdates().catch(e => logLine("update check " + (e && e.message))); }
function startUpdater() {
  if (!app.isPackaged || STORE) return; // the Microsoft Store updates its own copy
  try {
    updater = require("electron-updater").autoUpdater;
    updater.autoInstallOnAppQuit = true;
    updater.on("update-downloaded", i => { logLine("update downloaded " + (i && i.version)); updateReady = true; installUpdateIfIdle(); });
    checkForUpdate();
    setInterval(checkForUpdate, 3600 * 1000);
  } catch (e) {}
}

if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on("second-instance", (_e, argv) => { const f = filesIn(argv); logLine("second-instance " + JSON.stringify(argv) + " -> " + JSON.stringify(f)); if (f.length) f.forEach(sendFile); else if (!argv.includes("--background")) createWindow(); });
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    session.fromPartition("persist:plandesk").setPermissionRequestHandler((_wc, perm, cb, d) => cb(["clipboard-read", "clipboard-sanitized-write", "fileSystem", "notifications", "fullscreen"].includes(perm) || (perm === "media" && d && (d.mediaTypes || []).every(t => t === "audio")))); // audio only: voice notes
    const files = filesIn(process.argv); logLine("start " + JSON.stringify(process.argv) + " -> " + JSON.stringify(files));
    if (!BACKGROUND || files.length) createWindow();
    files.forEach(sendFile);
    startPrinter().then(() => { if (BACKGROUND && !printerOn && !win) app.quit(); }); // nothing to do in the background without the printer
    startUpdater();
  });
  ipcMain.on("renderer-ready", () => { logLine("renderer ready, sending " + queue.length); rendererReady = true; while (queue.length && win) win.webContents.send("open-file", queue.shift()); });
  ipcMain.on("title-bar", (e, c) => {
    try { const w = BrowserWindow.fromWebContents(e.sender); if (w && c && /^#[0-9a-f]{3,8}$/i.test(c.color) && /^#[0-9a-f]{3,8}$/i.test(c.symbol)) w.setTitleBarOverlay({ color: c.color, symbolColor: c.symbol, height: TITLE_H }); } catch (err) {}
  });
  ipcMain.handle("reveal", (_e, name) => {
    const full = known[String(name || "").toLowerCase()];
    if (full && fs.existsSync(full)) { shell.showItemInFolder(full); return true; }
    return false;
  });
  ipcMain.handle("setup-printer", () => setupPrinter(true));
  // Save back to a file PlanDesk opened (only paths it was handed by Windows, never arbitrary ones).
  ipcMain.handle("save-file", (_e, full, buf) => {
    if (typeof full !== "string" || !Object.values(known).some(k => k.toLowerCase() === full.toLowerCase())) return { ok: false, error: "PlanDesk didn't open that file." };
    try { const tmp = full + ".plandesk-saving"; fs.writeFileSync(tmp, Buffer.from(buf)); fs.renameSync(tmp, full); return { ok: true }; }
    catch (e) { try { fs.unlinkSync(full + ".plandesk-saving"); } catch (e2) {} return { ok: false, busy: /EBUSY|EPERM|EACCES/.test(e.code || ""), error: e.message }; }
  });
  // Word and Excel files: the page lays the document out as HTML; a hidden window prints it to a PDF with real text.
  // Scripts are off and nothing loads from the network in that window; the temp file is removed right after.
  ipcMain.handle("html-to-pdf", async (_e, html, opts) => {
    if (typeof html !== "string" || !html.length || html.length > 300e6) return { ok: false, error: "Nothing to print." };
    const tmp = path.join(app.getPath("temp"), "plandesk-office-" + process.pid + "-" + Date.now() + ".html");
    let w = null;
    try {
      fs.writeFileSync(tmp, html);
      w = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true, partition: "plandesk-office" } });
      w.webContents.session.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !/^(file|data|blob):/i.test(d.url) }));
      await w.loadFile(tmp);
      const pdf = await w.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true, landscape: !!(opts && opts.landscape) });
      return { ok: true, data: pdf };
    } catch (e) { return { ok: false, error: e.message }; }
    finally { if (w) w.destroy(); try { fs.unlinkSync(tmp); } catch (e) {} }
  });
  app.on("before-quit", () => { quitting = true; });
  // With the printer on, closing the window keeps PlanDesk running quietly so printouts still open.
  app.on("window-all-closed", () => { if (!printerOn || STORE) app.quit(); });
}
