[Setup]
AppName=CLEJS (JumpStart 3D Extension)
AppVersion=1.0.0
AppPublisher=CLE Open Source
DefaultDirName=D:\CLEJS
DefaultGroupName=CLEJS
PrivilegesRequired=lowest
OutputDir=D:\CLEJS\dist
OutputBaseFilename=CLEJS_Setup
Compression=lzma2/normal
SolidCompression=yes
DisableProgramGroupPage=yes
DisableWelcomePage=no
CloseApplications=yes
RestartApplications=no
ArchitecturesInstallIn64BitMode=x64compatible
UsedUserAreasWarning=no

[Dirs]
Name: "{app}"; Permissions: users-modify
Name: "{app}\tools"; Permissions: users-modify
Name: "{app}\vault"; Permissions: users-modify
Name: "{app}\sessions"; Permissions: users-modify

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; CLEJS Workspace files
Source: "D:\CLEJS\Dev\*"; DestDir: "{app}\Dev"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "D:\CLEJS\tools\*"; DestDir: "{app}\tools"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "D:\CLEJS\vault\*"; DestDir: "{app}\vault"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "D:\CLEJS\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "D:\CLEJS\PROJECT_STATUS.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "D:\CLEJS\cle_start.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "D:\CLEJS\Save-CLEJSCheckpoint.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "D:\CLEJS\Update-JumpStart.ps1"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{userdesktop}\CLEJS JumpStart"; Filename: "{app}\cle_start.bat"; Tasks: desktopicon; WorkingDir: "{app}"
Name: "{group}\CLEJS JumpStart"; Filename: "{app}\cle_start.bat"; WorkingDir: "{app}"

[Run]
Filename: "{app}\cle_start.bat"; Description: "{cm:LaunchProgram,CLEJS JumpStart}"; Flags: nowait postinstall skipifsilent
