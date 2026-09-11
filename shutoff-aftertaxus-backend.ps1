param(
  [ValidateNotNullOrEmpty()]
  [string]$Region = "us-west-2",
  [ValidateNotNullOrEmpty()]
  [string]$FunctionName = "helloWorld-portfolio"
)

$ErrorActionPreference = "Stop"

Write-Host "Shutting off Lambda backend: $FunctionName in $Region" -ForegroundColor Yellow
aws lambda put-function-concurrency `
  --region $Region `
  --function-name $FunctionName `
  --reserved-concurrent-executions 0 `
  --output json `
  --no-cli-pager
if ($LASTEXITCODE -ne 0) {
  throw "AWS rejected the shutoff request (exit $LASTEXITCODE). Backend state is unverified."
}

$ConcurrencyJson = aws lambda get-function-concurrency `
  --region $Region `
  --function-name $FunctionName `
  --output json `
  --no-cli-pager
if ($LASTEXITCODE -ne 0) {
  throw "Shutoff was requested, but verification failed (exit $LASTEXITCODE). Backend state is unverified."
}
$Concurrency = ($ConcurrencyJson -join "`n") | ConvertFrom-Json
if ($null -eq $Concurrency.ReservedConcurrentExecutions -or $Concurrency.ReservedConcurrentExecutions -ne 0) {
  throw "Verification did not confirm reserved concurrency of zero. Backend state is unverified."
}
Write-Host "Verified: backend reserved concurrency is zero. New Lambda invocations are blocked; other AWS charges can continue." -ForegroundColor Yellow
