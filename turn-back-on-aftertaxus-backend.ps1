param(
  [ValidateNotNullOrEmpty()]
  [string]$Region = "us-west-2",
  [ValidateNotNullOrEmpty()]
  [string]$FunctionName = "helloWorld-portfolio"
)

$ErrorActionPreference = "Stop"

Write-Host "Turning Lambda backend back on: $FunctionName in $Region" -ForegroundColor Green
aws lambda delete-function-concurrency `
  --region $Region `
  --function-name $FunctionName `
  --output json `
  --no-cli-pager
if ($LASTEXITCODE -ne 0) {
  throw "AWS rejected the restart request (exit $LASTEXITCODE). Backend state is unverified."
}

$ConcurrencyJson = aws lambda get-function-concurrency `
  --region $Region `
  --function-name $FunctionName `
  --output json `
  --no-cli-pager
if ($LASTEXITCODE -ne 0) {
  throw "Restart was requested, but verification failed (exit $LASTEXITCODE). Backend state is unverified."
}
$ConcurrencyText = ($ConcurrencyJson -join "`n").Trim()
$Concurrency = if ($ConcurrencyText) { $ConcurrencyText | ConvertFrom-Json } else { @{} }
if ($null -ne $Concurrency.ReservedConcurrentExecutions) {
  throw "Verification still found a reserved concurrency setting. Restart is not confirmed."
}
Write-Host "Verified: reserved concurrency is removed. Backend uses the account's unreserved concurrency; this is not a health check." -ForegroundColor Green
