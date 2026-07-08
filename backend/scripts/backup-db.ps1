param(
  [string]$HostName = "localhost",
  [int]$Port = 5432,
  [string]$UserName = "root",
  [string]$DatabaseName = "rider_claims",
  [string]$Password = "password",
  [string]$BackupDir = "./backups",
  [int]$RetentionDays = 14
)

$ErrorActionPreference = "Stop"

function Resolve-PgTool([string]$toolName) {
  $tool = Get-Command $toolName -ErrorAction SilentlyContinue
  if ($tool) { return $tool.Source }

  $candidates = @(
    "C:\Program Files\PostgreSQL\17\bin\$toolName.exe",
    "C:\Program Files\PostgreSQL\16\bin\$toolName.exe",
    "C:\Program Files\PostgreSQL\15\bin\$toolName.exe"
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) { return $candidate }
  }

  throw "Cannot find $toolName. Please install PostgreSQL client tools or add them to PATH."
}

$pgDump = Resolve-PgTool "pg_dump"
$null = New-Item -ItemType Directory -Force -Path $BackupDir

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$fileName = "${DatabaseName}_${timestamp}.dump"
$backupFile = Join-Path $BackupDir $fileName

$env:PGPASSWORD = $Password
& $pgDump -h $HostName -p $Port -U $UserName -d $DatabaseName -F c -f $backupFile
if ($LASTEXITCODE -ne 0) {
  throw "pg_dump failed with exit code $LASTEXITCODE"
}

# Retention cleanup
$threshold = (Get-Date).AddDays(-1 * $RetentionDays)
Get-ChildItem -Path $BackupDir -Filter "${DatabaseName}_*.dump" -File |
  Where-Object { $_.LastWriteTime -lt $threshold } |
  Remove-Item -Force

Write-Output "BACKUP_OK: $backupFile"
