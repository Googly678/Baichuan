Write-Host "Starting data persistence test..."

# Get data file info
$dataFile = ".\data\demo-db.json"
$beforeMTime = if (Test-Path $dataFile) { (Get-Item $dataFile).LastWriteTime } else { $null }

Write-Host "Data file: $dataFile"
Write-Host "Before modification time: $beforeMTime"
Write-Host ""

# Get first case ID
Write-Host "Fetching claims list..."
$claimsResponse = curl -s http://localhost:3000/claims | ConvertFrom-Json
$firstCaseId = $claimsResponse.data[0].id
Write-Host "Case ID: $firstCaseId"
Write-Host ""

# Modify case with test data
Write-Host "Modifying case data with test mark..."
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$testMark = "Test data at $timestamp"

$payload = @{
    audit_logs = @(
        @{
            timestamp = $timestamp
            user_id = "test"
            action = "save"
            remark = $testMark
        }
    )
} | ConvertTo-Json

Write-Host "Sending PUT request..."
$updateResponse = curl -s -X PUT `
    -H "Content-Type: application/json" `
    -d $payload `
    http://localhost:3000/claims/$firstCaseId

Write-Host "Response status: $($updateResponse | ConvertFrom-Json | Select-Object -ExpandProperty status)"
Write-Host ""

# Wait for file write
Start-Sleep -Seconds 2

# Check file modification time
$afterMTime = if (Test-Path $dataFile) { (Get-Item $dataFile).LastWriteTime } else { $null }
Write-Host "After modification time: $afterMTime"

if ($null -ne $beforeMTime -and $null -ne $afterMTime -and $beforeMTime -ne $afterMTime) {
    Write-Host "OK: File was updated!" -ForegroundColor Green
} else {
    Write-Host "ERROR: File was NOT modified!" -ForegroundColor Red
}
