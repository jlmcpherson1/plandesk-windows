; PlanDesk's own file registration. PDFs and FDFs open through build\open-file.ps1 (run by Windows' signed
; PowerShell), which Outlook will launch for attachments and which then hands the file to PlanDesk.exe.
!macro pdRegister EXT PROGID DESC ICON
  WriteRegStr HKCU "Software\Classes\${PROGID}" "" "${DESC}"
  WriteRegStr HKCU "Software\Classes\${PROGID}\DefaultIcon" "" "$INSTDIR\resources\${ICON}"
  WriteRegStr HKCU "Software\Classes\${PROGID}\shell\open\command" "" '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\open-file.ps1" "%1"'
  WriteRegStr HKCU "Software\Classes\${PROGID}\Application" "ApplicationName" "PlanDesk"
  WriteRegStr HKCU "Software\Classes\${PROGID}\Application" "ApplicationIcon" "$INSTDIR\PlanDesk.exe,0"
  WriteRegStr HKCU "Software\Classes\${PROGID}\Application" "ApplicationCompany" "Highline Properties LLC"
  WriteRegStr HKCU "Software\Classes\${EXT}\OpenWithProgids" "${PROGID}" ""
  WriteRegStr HKCU "Software\PlanDesk\Capabilities\FileAssociations" "${EXT}" "${PROGID}"
!macroend

!macro customInstall
  WriteRegStr HKCU "Software\PlanDesk\Capabilities" "ApplicationName" "PlanDesk"
  WriteRegStr HKCU "Software\PlanDesk\Capabilities" "ApplicationDescription" "PDF markup and takeoff for construction drawings"
  WriteRegStr HKCU "Software\PlanDesk\Capabilities" "ApplicationIcon" "$INSTDIR\PlanDesk.exe,0"
  !insertmacro pdRegister ".pdf" "PlanDesk.Pdf" "PDF document" "pdf.ico"
  !insertmacro pdRegister ".fdf" "PlanDesk.Fdf" "Markup file (FDF)" "fdf.ico"
  WriteRegStr HKCU "Software\RegisteredApplications" "PlanDesk" "Software\PlanDesk\Capabilities"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\PlanDesk.Pdf"
  DeleteRegKey HKCU "Software\Classes\PlanDesk.Fdf"
  DeleteRegValue HKCU "Software\Classes\.pdf\OpenWithProgids" "PlanDesk.Pdf"
  DeleteRegValue HKCU "Software\Classes\.fdf\OpenWithProgids" "PlanDesk.Fdf"
  DeleteRegValue HKCU "Software\RegisteredApplications" "PlanDesk"
  DeleteRegKey HKCU "Software\PlanDesk"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
