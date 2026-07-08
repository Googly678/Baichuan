# 测试数据保存功能

# 获取当前时间和数据文件信息
$dataFile = ".\data\demo-db.json"
$beforeMTime = if (Test-Path $dataFile) { (Get-Item $dataFile).LastWriteTime } else { $null }

Write-Host "测试开始..."
Write-Host "数据文件: $dataFile"
Write-Host "修改前时间: $beforeMTime"
Write-Host ""

# 获取第一个案件的 ID
Write-Host "获取案件列表..."
$claimsResponse = curl -s http://localhost:3000/claims | ConvertFrom-Json
$firstCaseId = $claimsResponse.data[0].id
Write-Host "案件 ID: $firstCaseId"
Write-Host ""

# 修改案件（添加备注）
Write-Host "修改案件数据..."
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$testRemark = "测试备注 - $timestamp"

$payload = @{
    audit_logs = @(
        @{
            timestamp = $timestamp
            user_id = "test-user"
            action = "save"
            remark = $testRemark
        }
    )
} | ConvertTo-Json

Write-Host "发送 PUT 请求..."
$updateResponse = curl -s -X PUT `
    -H "Content-Type: application/json" `
    -d $payload `
    http://localhost:3000/claims/$firstCaseId

Write-Host "响应: $updateResponse"
Write-Host ""

# 等待一秒，确保文件写入完成
Start-Sleep -Seconds 1

# 检查文件修改时间
$afterMTime = if (Test-Path $dataFile) { (Get-Item $dataFile).LastWriteTime } else { $null }
Write-Host "修改后时间: $afterMTime"

if ($beforeMTime -ne $afterMTime) {
    Write-Host "✓ 文件已更新！" -ForegroundColor Green
} else {
    Write-Host "✗ 文件没有被修改！" -ForegroundColor Red
}

Write-Host ""
Write-Host "检查保存的数据..."
$dbContent = Get-Content $dataFile | ConvertFrom-Json
$savedCase = $dbContent.claims | Where-Object { $_.id -eq $firstCaseId }
if ($savedCase) {
    Write-Host "✓ 案件存在" -ForegroundColor Green
    if ($savedCase.audit_logs -and $savedCase.audit_logs[-1].remark -eq $testRemark) {
        Write-Host "✓ 数据已正确保存！" -ForegroundColor Green
        Write-Host "保存的备注: $($savedCase.audit_logs[-1].remark)"
    } else {
        Write-Host "✗ 备注未被保存" -ForegroundColor Red
        Write-Host "当前审计日志: $($savedCase.audit_logs | ConvertTo-Json)"
    }
} else {
    Write-Host "✗ 案件未找到" -ForegroundColor Red
}
