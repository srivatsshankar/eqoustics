!include "common.nsh"
!include "extractAppPackage.nsh"

# https://github.com/electron-userland/electron-builder/issues/3972#issuecomment-505171582
CRCCheck off
WindowIcon Off
AutoCloseWindow True
RequestExecutionLevel ${REQUEST_EXECUTION_LEVEL}

Function .onInit
  SetSilent silent
  !insertmacro check64BitAndSetRegView
FunctionEnd

Section
  StrCpy $INSTDIR "$PLUGINSDIR\app"
  !ifdef UNPACK_DIR_NAME
    StrCpy $INSTDIR "$TEMP\${UNPACK_DIR_NAME}"
  !endif

  IfFileExists "$INSTDIR\.eqoustics-portable-ready" 0 ExtractApp
  IfFileExists "$INSTDIR\${APP_EXECUTABLE_FILENAME}" LaunchApp ExtractApp

  ExtractApp:
    RMDir /r "$INSTDIR"
    CreateDirectory "$INSTDIR"
    SetOutPath "$INSTDIR"

    !ifdef APP_DIR_64
      !ifdef APP_DIR_ARM64
        !ifdef APP_DIR_32
          ${if} ${IsNativeARM64}
            File /r "${APP_DIR_ARM64}\*.*"
          ${elseif} ${RunningX64}
            File /r "${APP_DIR_64}\*.*"
          ${else}
            File /r "${APP_DIR_32}\*.*"
          ${endIf}
        !else
          ${if} ${IsNativeARM64}
            File /r "${APP_DIR_ARM64}\*.*"
          ${else}
            File /r "${APP_DIR_64}\*.*"
          ${endIf}
        !endif
      !else
        !ifdef APP_DIR_32
          ${if} ${RunningX64}
            File /r "${APP_DIR_64}\*.*"
          ${else}
            File /r "${APP_DIR_32}\*.*"
          ${endIf}
        !else
          File /r "${APP_DIR_64}\*.*"
        !endif
      !endif
    !else
      !ifdef APP_DIR_32
        File /r "${APP_DIR_32}\*.*"
      !else
        !insertmacro extractEmbeddedAppPackage
      !endif
    !endif

    FileOpen $9 "$INSTDIR\.eqoustics-portable-ready" w
    FileWrite $9 "${VERSION}"
    FileClose $9

  LaunchApp:
    System::Call 'Kernel32::SetEnvironmentVariable(t, t)i ("PORTABLE_EXECUTABLE_DIR", "$EXEDIR").r0'
    System::Call 'Kernel32::SetEnvironmentVariable(t, t)i ("PORTABLE_EXECUTABLE_FILE", "$EXEPATH").r0'
    System::Call 'Kernel32::SetEnvironmentVariable(t, t)i ("PORTABLE_EXECUTABLE_APP_FILENAME", "${APP_FILENAME}").r0'
    System::Call 'Kernel32::SetEnvironmentVariable(t, p)i ("ELECTRON_RUN_AS_NODE", 0).r0'
    ${StdUtils.GetAllParameters} $R0 0

    HideWindow
    ClearErrors
    Exec '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" $R0'
    IfErrors 0 LaunchSucceeded
      MessageBox MB_OK|MB_ICONEXCLAMATION "Eqoustics could not start from the portable cache."
      SetErrorLevel 1
      Quit

  LaunchSucceeded:
    SetErrorLevel 0
SectionEnd
