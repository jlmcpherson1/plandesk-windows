; Every open command starts PowerShell through conhost --headless: Outlook (Office's attack-surface rules) silently
; refuses to start powershell.exe itself for an attachment, which is why Outlook JPGs did nothing. PDFs already worked this way.
; PlanDesk's own file registration. PDFs, FDFs, DXFs and pictures open through build\open-file.ps1 (run by Windows' signed
; PowerShell), which Outlook will launch for attachments and which then hands the file to PlanDesk.exe.
!macro pdRegister EXT PROGID DESC ICON
  WriteRegStr HKCU "Software\Classes\${PROGID}" "" "${DESC}"
  WriteRegStr HKCU "Software\Classes\${PROGID}\DefaultIcon" "" "$INSTDIR\resources\${ICON}"
  WriteRegStr HKCU "Software\Classes\${PROGID}\shell\open\command" "" '"$SYSDIR\conhost.exe" --headless "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\open-file.ps1" "%1"'
  WriteRegStr HKCU "Software\Classes\${PROGID}\Application" "ApplicationName" "PlanDesk"
  WriteRegStr HKCU "Software\Classes\${PROGID}\Application" "ApplicationIcon" "$INSTDIR\PlanDesk.exe,0"
  WriteRegStr HKCU "Software\Classes\${PROGID}\Application" "ApplicationCompany" "Highline Properties LLC"
  WriteRegStr HKCU "Software\Classes\${EXT}\OpenWithProgids" "${PROGID}" ""
  WriteRegStr HKCU "Software\PlanDesk\Capabilities\FileAssociations" "${EXT}" "${PROGID}"
!macroend

; "Open with" only: PlanDesk is offered for the file type without taking it over from its usual app.
!macro pdOpenWith EXT PROGID
  WriteRegStr HKCU "Software\Classes\${EXT}\OpenWithProgids" "${PROGID}" ""
  WriteRegStr HKCU "Software\PlanDesk\Capabilities\FileAssociations" "${EXT}" "${PROGID}"
!macroend

; PlanDesk picked by browsing to PlanDesk.exe ("Choose an app on your PC"), or listed under its long program description:
; send it through the opener too, so Outlook attachments (kept in a temporary folder) are copied out first, and call it PlanDesk.
!macro pdAppKey
  WriteRegStr HKCU "Software\Classes\Applications\PlanDesk.exe" "FriendlyAppName" "PlanDesk"
  WriteRegStr HKCU "Software\Classes\Applications\PlanDesk.exe\DefaultIcon" "" "$INSTDIR\PlanDesk.exe,0"
  WriteRegStr HKCU "Software\Classes\Applications\PlanDesk.exe\shell\open\command" "" '"$SYSDIR\conhost.exe" --headless "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\open-file.ps1" "%1"'
  !insertmacro pdSupported ".pdf"
  !insertmacro pdSupported ".fdf"
  !insertmacro pdSupported ".dxf"
  !insertmacro pdSupported ".dwg"
  !insertmacro pdSupported ".jpg"
  !insertmacro pdSupported ".jpeg"
  !insertmacro pdSupported ".png"
  !insertmacro pdSupported ".tif"
  !insertmacro pdSupported ".tiff"
  !insertmacro pdSupported ".gif"
  !insertmacro pdSupported ".bmp"
  !insertmacro pdSupported ".webp"
  !insertmacro pdSupported ".heic"
!macroend
!macro pdSupported EXT
  WriteRegStr HKCU "Software\Classes\Applications\PlanDesk.exe\SupportedTypes" "${EXT}" ""
!macroend

; The PlanMark-era helper (Install-PlanMarkOpener.ps1) registered "PlanMark (opens Outlook attachments)" for PDF and FDF.
; Where it's still someone's default, keep it working but route it through PlanDesk's opener and name it PlanDesk;
; drop its separate entry from Default apps.
!macro pdAdoptPlanMark PROGID DESC
  ClearErrors
  ReadRegStr $0 HKCU "Software\Classes\${PROGID}\shell\open\command" ""
  IfErrors +5 0
  WriteRegStr HKCU "Software\Classes\${PROGID}" "" "${DESC}"
  WriteRegStr HKCU "Software\Classes\${PROGID}\shell\open\command" "" '"$SYSDIR\conhost.exe" --headless "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\open-file.ps1" "%1"'
  WriteRegStr HKCU "Software\Classes\${PROGID}\Application" "ApplicationName" "PlanDesk"
  WriteRegStr HKCU "Software\Classes\${PROGID}\DefaultIcon" "" "$INSTDIR\PlanDesk.exe,0"
!macroend

!macro customInstall
  WriteRegStr HKCU "Software\PlanDesk\Capabilities" "ApplicationName" "PlanDesk"
  WriteRegStr HKCU "Software\PlanDesk\Capabilities" "ApplicationDescription" "PDF markup and takeoff for construction drawings"
  WriteRegStr HKCU "Software\PlanDesk\Capabilities" "ApplicationIcon" "$INSTDIR\PlanDesk.exe,0"
  !insertmacro pdRegister ".pdf" "PlanDesk.Pdf" "PDF document" "pdf.ico"
  !insertmacro pdRegister ".fdf" "PlanDesk.Fdf" "Markup file (FDF)" "fdf.ico"
  !insertmacro pdRegister ".dxf" "PlanDesk.Dxf" "AutoCAD drawing (DXF)" "dxf.ico"
  !insertmacro pdRegister ".dwg" "PlanDesk.Dwg" "AutoCAD drawing (DWG)" "dxf.ico"
  !insertmacro pdRegister ".tif" "PlanDesk.Image" "Picture" "pdf.ico"
  !insertmacro pdOpenWith ".tiff" "PlanDesk.Image"
  !insertmacro pdOpenWith ".jpg" "PlanDesk.Image"
  !insertmacro pdOpenWith ".jpeg" "PlanDesk.Image"
  !insertmacro pdOpenWith ".png" "PlanDesk.Image"
  !insertmacro pdOpenWith ".gif" "PlanDesk.Image"
  !insertmacro pdOpenWith ".bmp" "PlanDesk.Image"
  !insertmacro pdOpenWith ".webp" "PlanDesk.Image"
  !insertmacro pdOpenWith ".heic" "PlanDesk.Image"
  WriteRegStr HKCU "Software\RegisteredApplications" "PlanDesk" "Software\PlanDesk\Capabilities"
  !insertmacro pdAppKey
  !insertmacro pdAdoptPlanMark "PlanMark.Opener.pdf" "PDF document"
  !insertmacro pdAdoptPlanMark "PlanMark.Opener.fdf" "Markup file (FDF)"
  DeleteRegValue HKCU "Software\RegisteredApplications" "PlanMark (opens Outlook attachments)"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro pdOpenWithOff EXT
  DeleteRegValue HKCU "Software\Classes\${EXT}\OpenWithProgids" "PlanDesk.Image"
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\PlanDesk.Pdf"
  DeleteRegKey HKCU "Software\Classes\PlanDesk.Fdf"
  DeleteRegKey HKCU "Software\Classes\PlanDesk.Dxf"
  DeleteRegKey HKCU "Software\Classes\PlanDesk.Dwg"
  DeleteRegKey HKCU "Software\Classes\PlanDesk.Image"
  DeleteRegValue HKCU "Software\Classes\.dxf\OpenWithProgids" "PlanDesk.Dxf"
  DeleteRegValue HKCU "Software\Classes\.dwg\OpenWithProgids" "PlanDesk.Dwg"
  !insertmacro pdOpenWithOff ".tif"
  !insertmacro pdOpenWithOff ".tiff"
  !insertmacro pdOpenWithOff ".jpg"
  !insertmacro pdOpenWithOff ".jpeg"
  !insertmacro pdOpenWithOff ".png"
  !insertmacro pdOpenWithOff ".gif"
  !insertmacro pdOpenWithOff ".bmp"
  !insertmacro pdOpenWithOff ".webp"
  !insertmacro pdOpenWithOff ".heic"
  DeleteRegValue HKCU "Software\Classes\.pdf\OpenWithProgids" "PlanDesk.Pdf"
  DeleteRegValue HKCU "Software\Classes\.fdf\OpenWithProgids" "PlanDesk.Fdf"
  DeleteRegValue HKCU "Software\RegisteredApplications" "PlanDesk"
  DeleteRegKey HKCU "Software\Classes\Applications\PlanDesk.exe"
  DeleteRegKey HKCU "Software\PlanDesk"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
