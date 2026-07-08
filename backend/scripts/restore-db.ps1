param(
  [string]$HostName = "localhost",
  [int]$Port = 5432,
  [string]$UserName = "root",
  [string]$DatabaseName = "rider_claims",
  [string]$Password = "password",
  [Parameter(Mandatory = $true)]
  [string]$BackupFile
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

if (-not (Test-Path $BackupFile)) {
  throw "Backup file not found: $BackupFile"
}

$pgRestore = Resolve-PgTool "pg_restore"
$env:PGPASSWORD = $Password

# --clean/--if-exists: overwrite existing objects safely
& $pgRestore -h $HostName -p $Port -U $UserName -d $DatabaseName --clean --if-exists --no-owner --no-privileges $BackupFile
if ($LASTEXITCODE -ne 0) {
  throw "pg_restore failed with exit code $LASTEXITCODE"
}

Write-Output "RESTORE_OK: $BackupFile -> $DatabaseName"
