param(
  [string]$HostName = "localhost",
  [int]$Port = 5432,
  [string]$UserName = "root",
  [string]$DatabaseName = "rider_claims",
  [string]$Password = "password",
  [string]$AdminUserName = "postgres",
  [string]$AdminPassword = "postgres",
  [string]$BackupDir = "./backups"
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

$psql = Resolve-PgTool "psql"
$createdb = Resolve-PgTool "createdb"
$dropdb = Resolve-PgTool "dropdb"

$drillDb = "${DatabaseName}_drill_$(Get-Date -Format 'yyyyMMddHHmmss')"

# 1) Take a fresh backup
$backupScript = Join-Path $PSScriptRoot "backup-db.ps1"
$backupOutput = & $backupScript -HostName $HostName -Port $Port -UserName $UserName -DatabaseName $DatabaseName -Password $Password -BackupDir $BackupDir
$backupLine = ($backupOutput | Where-Object { $_ -like 'BACKUP_OK:*' } | Select-Object -First 1)
if (-not $backupLine) { throw "Cannot parse backup output." }
$backupFile = $backupLine.Replace('BACKUP_OK: ', '').Trim()

$env:PGPASSWORD = $Password

try {
  # 2) Create isolated drill database via admin account
  $env:PGPASSWORD = $AdminPassword
  & $createdb -h $HostName -p $Port -U $AdminUserName -O $UserName $drillDb
  if ($LASTEXITCODE -ne 0) { throw "createdb failed with exit code $LASTEXITCODE" }

  # 3) Restore backup into drill database
  $restoreScript = Join-Path $PSScriptRoot "restore-db.ps1"
  $env:PGPASSWORD = $Password
  & $restoreScript -HostName $HostName -Port $Port -UserName $UserName -DatabaseName $drillDb -Password $Password -BackupFile $backupFile

  # 4) Verify key business table exists and has data
  $count = (& $psql -h $HostName -p $Port -U $UserName -d $drillDb -tAc "SELECT COUNT(*) FROM app_kv_store;").Trim()
  if (-not $count) { throw "Verification failed: cannot read app_kv_store." }

  Write-Output "DRILL_OK: backup=$backupFile, drill_db=$drillDb, app_kv_store_count=$count"
}
finally {
  # Cleanup drill database via admin account
  $env:PGPASSWORD = $AdminPassword
  & $dropdb -h $HostName -p $Port -U $AdminUserName --if-exists $drillDb | Out-Null
}
