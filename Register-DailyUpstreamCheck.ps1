<#
.SYNOPSIS
Registers a daily Windows Scheduled Task at 8:00 AM on CL3 to check for Max Smolens' latest JumpStart release.
#>

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File D:\CLEJS\Update-JumpStart.ps1"
$trigger = New-ScheduledTaskTrigger -Daily -At "08:00AM"
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest

try {
    Register-ScheduledTask -TaskName "CLEJS_Daily_Upstream_Check" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force
    Write-Host "[CLEJS] Scheduled Task 'CLEJS_Daily_Upstream_Check' successfully registered for 8:00 AM daily." -ForegroundColor Green
} catch {
    Write-Warning "[CLEJS] Could not register scheduled task with admin privileges: $_"
    Write-Host "[CLEJS] You can run D:\CLEJS\Update-JumpStart.ps1 manually at any time." -ForegroundColor Yellow
}
