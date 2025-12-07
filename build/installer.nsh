; Custom NSIS script for Interview AI installer
; Helps bypass some Windows SmartScreen issues

!macro preInit
    ; Request admin rights if needed
    SetShellVarContext all
    !ifdef INSTALL_MODE_PER_ALL_USERS
        SetShellVarContext all
    !else
        SetShellVarContext current
    !endif
!macroend

!macro customInstall
    ; Add registry keys to make Windows trust the app more
    WriteRegStr HKCU "Software\Interview AI" "InstallPath" "$INSTDIR"
    WriteRegStr HKCU "Software\Interview AI" "Version" "${VERSION}"
!macroend

!macro customUnInstall
    ; Clean up registry on uninstall
    DeleteRegKey HKCU "Software\Interview AI"
!macroend
