param(
  [string]$ComposeFilePath = "../docker-compose.yml",
  [int]$MaxRetry = 30
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

  throw "Cannot find $toolName."
}

function Test-DbReady([string]$pgIsReadyCmd, [int]$port) {
  & $pgIsReadyCmd -h localhost -p $port -U root -d rider_claims 2>$null | Out-Null
  return ($LASTEXITCODE -eq 0)
}

function Set-DatabaseUrlPort([string]$backendRoot, [int]$port) {
  $envFile = Join-Path $backendRoot ".env"
  $url = "DATABASE_URL=`"postgresql://root:password@localhost:$port/rider_claims?schema=public`""

  if (-not (Test-Path $envFile)) {
    Set-Content -Path $envFile -Value ($url + [Environment]::NewLine) -Encoding UTF8
    return
  }

  $text = Get-Content -Raw -Path $envFile
  if ($text -match 'DATABASE_URL="postgresql://root:password@localhost:\d+/rider_claims\?schema=public"') {
    $next = [System.Text.RegularExpressions.Regex]::Replace(
      $text,
      'DATABASE_URL="postgresql://root:password@localhost:\d+/rider_claims\?schema=public"',
      [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $url },
      1
    )
    Set-Content -Path $envFile -Value $next -Encoding UTF8
    return
  }

  Set-Content -Path $envFile -Value ($url + [Environment]::NewLine + $text) -Encoding UTF8
}

function Enable-JsonFallback([string]$backendRoot) {
  $envFile = Join-Path $backendRoot ".env"
  if (-not (Test-Path $envFile)) {
    return
  }

  $text = Get-Content -Raw -Path $envFile
  if ($text -notmatch "ALLOW_JSON_FALLBACK\s*=\s*true") {
    $next = [System.Text.RegularExpressions.Regex]::Replace(
      $text,
      "ALLOW_JSON_FALLBACK\s*=\s*false",
      "ALLOW_JSON_FALLBACK=true",
      1
    )
    Set-Content -Path $envFile -Value $next -Encoding UTF8
  }
}

$backendRoot = Split-Path -Parent $PSScriptRoot
$projectRoot = Split-Path -Parent $backendRoot
$composeFile = Resolve-Path (Join-Path $backendRoot $ComposeFilePath)
$pgIsReady = Resolve-PgTool "pg_isready"

Push-Location $projectRoot
try {
  $docker = Get-Command docker -ErrorAction SilentlyContinue
  if ($docker) {
    try {
      docker info 2>$null | Out-Null
      if ($LASTEXITCODE -eq 0) {
        docker compose -f $composeFile up -d db redis 2>$null | Out-Null
        $ready = $false
        for ($i = 1; $i -le $MaxRetry; $i++) {
          if (Test-DbReady -pgIsReadyCmd $pgIsReady -port 5432) {
            $ready = $true
            break
          }
          [System.Threading.Thread]::Sleep(1000)
        }
        if ($ready) {
          Set-DatabaseUrlPort -backendRoot $backendRoot -port 5432
          Write-Output "DB_READY: postgres://root@localhost:5432/rider_claims (docker)"
          return
        }
      }
    }
    catch {
      # Docker not fully functional, continue to fallback
    }
  }

  Write-Output "DB_SETUP: Using JSON fallback mode (no live database required)"
  Enable-JsonFallback -backendRoot $backendRoot
}
finally {
  Pop-Location
}
