; =====================================================================
; JSVCLE Studio Master Installer Script (Inno Setup 6)
; Packages JumpStart 3D + Vellum Vector Studio + Continuous Layer Extension
; =====================================================================

#define AppName "JSVCLE Studio"
#define AppVersion "01.00.66"
#define AppPublisher "JSVCLE Community"
#define AppURL "https://github.com/CLEJS"
#define OutputFilename "JSVCLE_Experimental_v01.00.66"

[Setup]
AppId={{D86B9140-54EA-4B77-9E45-8B296AE27B50}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
DefaultDirName=C:\JSVCLE
DefaultGroupName={#AppName}
DisableProgramGroupPage=no
DisableDirPage=no
DisableWelcomePage=no
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=commandline dialog
OutputDir=D:\CLEJS\dist
OutputBaseFilename={#OutputFilename}
Compression=lzma2/ultra64
SolidCompression=yes
CloseApplications=yes
RestartApplications=no
ArchitecturesInstallIn64BitMode=x64compatible
UsedUserAreasWarning=no
WizardStyle=modern

[Code]
// System Requirements Card Dialog before setup begins
function InitializeSetup(): Boolean;
var
  ReqMsg: String;
begin
  if not WizardSilent then
  begin
    ReqMsg := '===================================================' + #13#10 +
              '            JSVCLE Studio - System Requirements    ' + #13#10 +
              '===================================================' + #13#10#13#10 +
              'Before proceeding with installation, please verify your system specs:' + #13#10#13#10 +
              '• MINIMUM REQUIREMENTS:' + #13#10 +
              '    - Processor:  Intel Core i7 (8-Way / 8 Cores)' + #13#10 +
              '    - Memory:     16 GB RAM' + #13#10 +
              '    - Storage:    High-Speed SSD (Solid State Drive)' + #13#10 +
              '    - OS:         Windows 11 (64-bit)' + #13#10#13#10 +
              '• RECOMMENDED REQUIREMENTS:' + #13#10 +
              '    - Processor:  Intel Core i9 (24-Way / 24 Cores @ 4.0GHz+)' + #13#10 +
              '    - Memory:     32 GB RAM' + #13#10 +
              '    - Storage:    Ultra-Fast NVMe SSD' + #13#10 +
              '    - OS:         Windows 11 (64-bit)' + #13#10#13#10 +
              'Click OK to begin configuration and select install options.';
    MsgBox(ReqMsg, mbInformation, MB_OK);
  end;
  Result := True;
end;

[Dirs]
Name: "{app}"; Permissions: users-full
Name: "{app}\Dev"; Permissions: users-full
Name: "{app}\Vellum"; Permissions: users-full
Name: "{app}\tools"; Permissions: users-full
Name: "{app}\vault"; Permissions: users-full
Name: "{app}\dist"; Permissions: users-full

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; Core JumpStart 3D Application + CLE Extension
Source: "D:\CLEJS\Dev\*"; DestDir: "{app}\Dev"; Flags: recursesubdirs createallsubdirs ignoreversion

; Vellum Vector Studio Standalone Application
Source: "D:\CLEJS\Vellum\*"; DestDir: "{app}\Vellum"; Flags: recursesubdirs createallsubdirs ignoreversion

; Tools, Scripts & Embedded Python Runtime
Source: "D:\CLEJS\tools\*"; DestDir: "{app}\tools"; Flags: recursesubdirs createallsubdirs ignoreversion

; Machine Vault & Profiles
Source: "D:\CLEJS\vault\*"; DestDir: "{app}\vault"; Flags: recursesubdirs createallsubdirs ignoreversion

; Pristine Upstream Tracking Folders
Source: "D:\CLEJS\JSoriginal\*"; DestDir: "{app}\JSoriginal"; Flags: recursesubdirs createallsubdirs ignoreversion; Excludes: "*.tmp,*.bak"
Source: "D:\CLEJS\VVSource\*"; DestDir: "{app}\VVSource"; Flags: recursesubdirs createallsubdirs ignoreversion; Excludes: "*.tmp,*.bak"

; Launchers and Documentation
Source: "D:\CLEJS\cle_start.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "D:\CLEJS\cle_server_start.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "D:\CLEJS\vellum_start.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "D:\CLEJS\update_jumpstart.sh"; DestDir: "{app}"; Flags: ignoreversion
Source: "D:\CLEJS\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "D:\CLEJS\PROJECT_STATUS.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; Desktop Shortcuts (All Users when elevated, current user otherwise)
Name: "{autodesktop}\JSVCLE Studio"; Filename: "{app}\cle_start.bat"; WorkingDir: "{app}"; Tasks: desktopicon; Comment: "Launch unified JSVCLE Studio (JumpStart 3D + CLE + Vellum)"
Name: "{autodesktop}\Vellum Vector Studio"; Filename: "{app}\vellum_start.bat"; WorkingDir: "{app}\Vellum"; Tasks: desktopicon; Comment: "Launch standalone Vellum Vector Studio"

; Start Menu Shortcuts
Name: "{autoprograms}\{#AppName}\JSVCLE Studio"; Filename: "{app}\cle_start.bat"; WorkingDir: "{app}"; Comment: "Launch unified JSVCLE Studio"
Name: "{autoprograms}\{#AppName}\Vellum Vector Studio"; Filename: "{app}\vellum_start.bat"; WorkingDir: "{app}\Vellum"; Comment: "Launch standalone Vellum Vector Studio"
Name: "{autoprograms}\{#AppName}\CLE Server (Background)"; Filename: "{app}\cle_server_start.bat"; WorkingDir: "{app}"; Flags: runminimized; Comment: "Start CLE Local Background Service"
Name: "{autoprograms}\{#AppName}\Uninstall {#AppName}"; Filename: "{uninstallexe}"

; Autostart CLE_Server on Windows Login for ALL Users
Name: "{autostartup}\CLE_Server"; Filename: "{app}\cle_server_start.bat"; WorkingDir: "{app}"; Flags: runminimized

[Run]
; 1. Start background CLE_Server service silently
Filename: "{app}\cle_server_start.bat"; Description: "Launch Background Hardware & Vault Service"; Flags: nowait runminimized

; 2. Launch main JSVCLE Studio application on Finish
Filename: "{app}\cle_start.bat"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent
