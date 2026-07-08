param(
  [string]$TaskName = "RiderClaims-Postgres-DailyBackup",
  [string]$StartTime = "02:00",
  [string]$WorkingDirectory = "",
  [string]$HostName = "localhost",
  [int]$Port = 5432,
  [string]$UserName = "root",
  [string]$DatabaseName = "rider_claims",
  [string]$Password = "password",
  [string]$BackupDir = "./backups",
  [int]$RetentionDays = 14
)

$ErrorActionPreference = "Stop"

if (-not $WorkingDirectory) {
  $WorkingDirectory = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$scriptPath = Join-Path $PSScriptRoot "backup-db.ps1"

# Use a short wrapper path to avoid schtasks /TR max length limitation.
$wrapperDir = Join-Path $env:ProgramData "RiderClaims"
$null = New-Item -ItemType Directory -Force -Path $wrapperDir
$wrapperPath = Join-Path $wrapperDir "db-backup.cmd"

$cmdContent = @(
  "@echo off",
  "setlocal",
  "cd /d `"$WorkingDirectory`"",
  "powershell -NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -HostName `"$HostName`" -Port $Port -UserName `"$UserName`" -DatabaseName `"$DatabaseName`" -Password `"$Password`" -BackupDir `"$BackupDir`" -RetentionDays $RetentionDays",
  "exit /b %errorlevel%"
) -join "`r`n"

Set-Content -Path $wrapperPath -Value $cmdContent -Encoding ASCII

$taskCommand = "`"$wrapperPath`""
schtasks /Create /F /SC DAILY /TN $TaskName /TR $taskCommand /ST $StartTime | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Failed to register scheduled task $TaskName"
}

Write-Output "TASK_REGISTERED: $TaskName @ $StartTime -> $wrapperPath"
