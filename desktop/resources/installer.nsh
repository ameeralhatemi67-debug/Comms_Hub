; The application's uninstaller, one step added (Desktop_App_Plan.md 7.4, phase D3; decision D-11).
; electron-builder's installer keeps a copy of itself in %LOCALAPPDATA%\<name>-updater for later updates,
; and the updater downloads there too; its own uninstaller leaves that folder behind (about 110 MB).
; Removing the application removes it as well, but never during an update, which still needs it.
!macro customUnInstall
  !ifndef COMMS_HUB_UPDATER_DIR
    !searchreplace COMMS_HUB_UPDATER_DIR "${APP_INSTALLER_STORE_FILE}" "\installer.exe" ""
  !endif
  ${ifNot} ${isUpdated}
    RMDir /r "$LOCALAPPDATA\${COMMS_HUB_UPDATER_DIR}"
  ${endIf}
!macroend
