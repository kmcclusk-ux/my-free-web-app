$FunctionName = "helloWorld-portfolio"

Write-Host "`nTesting Lambda function: $FunctionName"
Write-Host "----------------------------------------"

function Write-NoBomJsonFile($path, $jsonText) {
  # ASCII avoids BOM and is fine for our simple JSON payloads
  [System.IO.File]::WriteAllText($path, $jsonText, [System.Text.Encoding]::ASCII)
}

# ---------- Test 1: 2025 MFJ Ordinary Tax ----------
$payload1 = @'
{"calc":"FED_TAX_2025_MFJ","taxableIncome":300000}
'@
Write-NoBomJsonFile "payload.json" $payload1

Write-Host "`nInvoking FED_TAX_2025_MFJ..."
aws lambda invoke --function-name $FunctionName --payload fileb://payload.json response1.json | Out-Null
Write-Host "Response:"
Get-Content response1.json
Write-Host "----------------------------------------"

# ---------- Test 2: 2024 Preferential Tax ----------
$payload2 = @'
{"calc":"FED_PREF_TAX_2024","ordinaryTaxable":200000,"prefTaxable":50000,"filingStatus":"mfj"}
'@
Write-NoBomJsonFile "payload.json" $payload2

Write-Host "`nInvoking FED_PREF_TAX_2024..."
aws lambda invoke --function-name $FunctionName --payload fileb://payload.json response2.json | Out-Null
Write-Host "Response:"
Get-Content response2.json
Write-Host "----------------------------------------"

Write-Host "`nDone."
