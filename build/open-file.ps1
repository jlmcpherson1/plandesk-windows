# PlanDesk opener: Windows runs this when a PDF or FDF is opened with PlanDesk (double-click, Outlook
# attachments, Open with). Outlook keeps attachments in a hidden temporary folder, so those are copied to
# Downloads\PlanDesk email attachments first; then the file is handed to PlanDesk.
param([string]$Path)
$res = Split-Path -Parent $MyInvocation.MyCommand.Path
$exe = Join-Path (Split-Path -Parent $res) "PlanDesk.exe"
try {
  if (-not $Path) { Start-Process -FilePath $exe; exit 0 }
  $file = (Get-Item -LiteralPath $Path).FullName
  if ($file -match '\\AppData\\|\\APPDAT~\d\\|\\Temp\\|\\INetCache\\|\\Content\.Outlook\\') {
    $out = Join-Path ([Environment]::GetFolderPath("UserProfile")) "Downloads\PlanDesk email attachments"
    New-Item -ItemType Directory -Force -Path $out | Out-Null
    Get-ChildItem -LiteralPath $out -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item -Force -ErrorAction SilentlyContinue
    $name = [IO.Path]::GetFileNameWithoutExtension($file); $x = [IO.Path]::GetExtension($file)
    $dest = Join-Path $out ($name + $x); $n = 2; $h = (Get-FileHash -LiteralPath $file).Hash
    while ((Test-Path -LiteralPath $dest) -and (Get-FileHash -LiteralPath $dest).Hash -ne $h) { $dest = Join-Path $out ("{0} ({1}){2}" -f $name, $n, $x); $n++ }
    if (-not (Test-Path -LiteralPath $dest)) { Copy-Item -LiteralPath $file -Destination $dest }
    try { (Get-Item -LiteralPath $dest).Attributes = "Normal" } catch {}
    $file = $dest
  }
  Start-Process -FilePath $exe -ArgumentList ('"' + $file + '"')
} catch {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show("PlanDesk couldn't open this file.`n`n" + $_.Exception.Message + "`n`nTry dragging it onto the PlanDesk window instead.", "PlanDesk") | Out-Null
}
