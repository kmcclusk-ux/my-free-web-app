param(
  [string]$Region = "us-west-2",
  [string]$FunctionName = "helloWorld-portfolio"
)

$ErrorActionPreference = "Stop"

Write-Host "Turning Lambda backend back on: $FunctionName in $Region" -ForegroundColor Green
aws lambda delete-function-concurrency `
  --region $Region `
  --function-name $FunctionName

Write-Host ""
Write-Host "Backend is now on. If the next command returns no JSON, that is expected." -ForegroundColor Green
aws lambda get-function-concurrency `
  --region $Region `
  --function-name $FunctionName

