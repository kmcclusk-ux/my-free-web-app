param(
  [string]$Region = "us-west-2",
  [string]$FunctionName = "helloWorld-portfolio"
)

$ErrorActionPreference = "Stop"

Write-Host "Shutting off Lambda backend: $FunctionName in $Region" -ForegroundColor Yellow
aws lambda put-function-concurrency `
  --region $Region `
  --function-name $FunctionName `
  --reserved-concurrent-executions 0

Write-Host ""
Write-Host "Backend is now shut off. Current concurrency:" -ForegroundColor Yellow
aws lambda get-function-concurrency `
  --region $Region `
  --function-name $FunctionName

