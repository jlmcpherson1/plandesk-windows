// The PlanDesk printer: Windows' built-in "Microsoft Print To PDF" driver writing to a fixed file. PlanDesk
// watches that file, moves each printout to Documents\PlanDesk Prints (named after what was printed) and opens it.
const { app } = require("electron");
const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");

const NAME = "PlanDesk";
// The Store copy runs packaged, where Windows gives the app a private view of AppData that the print spooler
// can't see, so it uses a hidden folder in Documents instead.
const DIR = process.windowsStore ? path.join(app.getPath("documents"), "PlanDesk Prints", ".incoming") : path.join(process.env.LOCALAPPDATA || app.getPath("userData"), "PlanDesk", "print");
const FILE = path.join(DIR, "PlanDesk-print.pdf");

const ps = (cmd, timeout = 20000) => new Promise(res => execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", cmd], { windowsHide: true, timeout }, (err, out) => res(err ? "" : String(out || "").trim())));

// "" = no PlanDesk printer; otherwise the file or port it prints to.
const port = () => process.platform === "win32" ? ps(`(Get-Printer -Name '${NAME}' -ErrorAction SilentlyContinue).PortName`) : Promise.resolve("");
const ours = async () => (await port()).toLowerCase() === FILE.toLowerCase();

const SETUP = `param([string]$Port)
$log = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "printer-setup.txt"
try {
  $ErrorActionPreference = "Stop"
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Port) | Out-Null
  if (Get-Printer -Name "${NAME}" -ErrorAction SilentlyContinue) { Get-PrintJob -PrinterName "${NAME}" -ErrorAction SilentlyContinue | Remove-PrintJob -ErrorAction SilentlyContinue; Remove-Printer -Name "${NAME}" }
  if (-not (Get-PrinterDriver -Name "Microsoft Print To PDF" -ErrorAction SilentlyContinue)) { Enable-WindowsOptionalFeature -Online -FeatureName "Printing-PrintToPDFServices-Features" -All -NoRestart | Out-Null }
  if (-not (Get-PrinterPort -Name $Port -ErrorAction SilentlyContinue)) { Add-PrinterPort -Name $Port }
  Restart-Service -Name Spooler -Force; Start-Sleep -Seconds 3
  Add-Printer -Name "${NAME}" -DriverName "Microsoft Print To PDF" -PortName $Port
  "ok" | Set-Content -LiteralPath $log
} catch { ("ERROR: " + $_.Exception.Message) | Set-Content -LiteralPath $log }
`;

// Adds the printer. Windows shows one "allow changes" prompt. Resolves "ok" or a reason it didn't work.
async function install() {
  fs.mkdirSync(DIR, { recursive: true });
  if (process.windowsStore) return installEncoded();
  const dir = app.getPath("userData"), script = path.join(dir, "PrinterSetup.ps1"), result = path.join(dir, "printer-setup.txt");
  fs.writeFileSync(script, "﻿" + SETUP, "utf8");
  try { fs.unlinkSync(result); } catch (e) {}
  const args = `-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${script}" -Port "${FILE}"`;
  await ps(`try { Start-Process -FilePath powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '${args.replace(/'/g, "''")}' } catch { 'declined' }`, 180000);
  let r = ""; try { r = fs.readFileSync(result, "utf8").trim(); } catch (e) { return "Windows permission was declined, so the printer wasn't added."; }
  return r === "ok" && (await ours()) ? "ok" : r.replace(/^ERROR:\s*/, "") || "The printer couldn't be added.";
}

// Store copy: the elevated PowerShell can't see files in the app's private AppData, so the script is passed
// inline and success is checked by asking Windows for the printer afterwards.
async function installEncoded() {
  try { require("child_process").execFileSync("attrib", ["+h", DIR], { windowsHide: true }); } catch (e) {}
  const body = SETUP.replace(/^param\(\[string\]\$Port\)\r?\n/, "$Port = '" + FILE.replace(/'/g, "''") + "'\n").replace(/^\$log = .*\r?\n/m, "$log = $null\n").replace(/\| Set-Content -LiteralPath \$log/g, "| Out-Null");
  const enc = Buffer.from(body, "utf16le").toString("base64");
  const r = await ps(`try { Start-Process -FilePath powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -EncodedCommand ${enc}'; 'ran' } catch { 'declined' }`, 180000);
  if (r === "declined") return "Windows permission was declined, so the printer wasn't added.";
  return (await ours()) ? "ok" : "The printer couldn't be added. Try again, or restart the computer and try once more.";
}

// Watches for printouts and hands each one to open(fullPath).
function watch(open) {
  fs.mkdirSync(DIR, { recursive: true });
  let last = -1, stable = 0, doc = null, asking = false;
  const reset = () => { last = -1; stable = 0; doc = null; };
  setInterval(async () => {
    let st; try { st = fs.statSync(FILE); } catch (e) { reset(); return; }
    if (!doc && !asking) { asking = true; ps(`Get-PrintJob -PrinterName '${NAME}' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty DocumentName`, 8000).then(n => { if (n) doc = n; asking = false; }); }
    if (st.size <= 0 || st.size !== last) { last = st.size; stable = 0; return; }
    if (++stable < 2) return;
    let name = (doc || "").replace(/^Microsoft (Word|Excel|PowerPoint|Outlook|Edge)\s*-\s*/i, "").replace(/\.(xlsx|xlsm|xls|docx|doc|pptx|ppt|msg|txt|html?|pdf|csv)$/i, "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").trim().replace(/[ .]+$/, "").slice(0, 90);
    if (!name) name = "Print " + new Date().toISOString().slice(0, 19).replace("T", " ").replace(/:/g, "-");
    const out = path.join(app.getPath("documents"), "PlanDesk Prints"); fs.mkdirSync(out, { recursive: true });
    let dest = path.join(out, name + ".pdf"), n = 2;
    while (fs.existsSync(dest)) dest = path.join(out, `${name} (${n++}).pdf`);
    try { fs.renameSync(FILE, dest); }
    catch (e) {
      if (e.code !== "EXDEV") return; // still being written: try again next tick
      try { fs.copyFileSync(FILE, dest); fs.unlinkSync(FILE); } catch (e2) { try { fs.unlinkSync(dest); } catch (e3) {} return; }
    }
    reset();
    open(dest);
  }, 700);
}

module.exports = { install, watch, port, ours, FILE };
