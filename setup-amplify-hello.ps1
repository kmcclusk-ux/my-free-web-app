param(
  [Parameter(Mandatory=$true)]
  [string]$RepoPath,

  [string]$Region = "us-west-2",

  # AWS CLI profile name to use (must exist in ~/.aws/credentials)
  [string]$Profile = "default",

  # Amplify env name
  [string]$EnvName = "dev"
)

$ErrorActionPreference = "Stop"

function Assert-Command($name, $installHint) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Missing dependency: $name" -ForegroundColor Red
    Write-Host "Install hint: $installHint" -ForegroundColor Yellow
    throw "DependencyMissing:$name"
  }
  Write-Host "✅ Found: $name" -ForegroundColor Green
}

function Run($cmd) {
  Write-Host "`n▶ $cmd" -ForegroundColor Cyan
  iex $cmd
}

# --- Pre-flight ---
if (-not (Test-Path $RepoPath)) { throw "RepoPath does not exist: $RepoPath" }

Write-Host "`n=== Pre-flight checks ===" -ForegroundColor Magenta
Assert-Command "node" "Install Node.js LTS from https://nodejs.org"
Assert-Command "npm"  "Node.js LTS includes npm"
Assert-Command "aws"  "Install AWS CLI from https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"

# Amplify CLI: install if missing
if (-not (Get-Command "amplify" -ErrorAction SilentlyContinue)) {
  Write-Host "⬇ Installing Amplify CLI..." -ForegroundColor Yellow
  Run "npm install -g @aws-amplify/cli"
}
Assert-Command "amplify" "npm install -g @aws-amplify/cli"

# Verify AWS creds/profile
Write-Host "`n=== Verifying AWS credentials/profile '$Profile' ===" -ForegroundColor Magenta
Run "aws sts get-caller-identity --profile $Profile | Out-String | Write-Host"

# Move to repo
Set-Location $RepoPath
Write-Host "`n=== Working directory ===`n$RepoPath" -ForegroundColor Magenta

# Ensure git repo
if (-not (Test-Path (Join-Path $RepoPath ".git"))) {
  Write-Host "⚠ This folder doesn't look like a git repo (no .git). Amplify still works, but CI/CD expects GitHub." -ForegroundColor Yellow
}

# --- amplify init (non-interactive) ---
# Amplify still expects some JSON scaffolding; we create it and call amplify init with flags.
Write-Host "`n=== Initializing Amplify (env: $EnvName, region: $Region, profile: $Profile) ===" -ForegroundColor Magenta

# If amplify already initialized, skip init
if (-not (Test-Path (Join-Path $RepoPath "amplify"))) {
  # Create minimal project settings via CLI flags (keeps it as 'none' frontend)
  Run @"
amplify init `
  --amplify `"{\`"projectName\`":\`"amplifyHello\`",\`"envName\`":\`"$EnvName\`"}" `
  --frontend `"{\`"frontend\`":\`"none\`"}" `
  --providers `"{\`"awscloudformation\`":{\`"configLevel\`":\`"project\`",\`"useProfile\`":true,\`"profileName\`":\`"$Profile\`",\`"region\`":\`"$Region\`"}}" `
  --yes
"@
} else {
  Write-Host "✅ Amplify folder exists. Skipping amplify init." -ForegroundColor Green
}

# --- add function (TypeScript) ---
Write-Host "`n=== Adding TypeScript Lambda function 'helloWorld' ===" -ForegroundColor Magenta

$funcDir = Join-Path $RepoPath "amplify\backend\function\helloWorld"
if (-not (Test-Path $funcDir)) {
  # Create a function using the nodejs runtime (TypeScript supported via Amplify function build)
  # Use the "Hello World" template, then overwrite src with TypeScript handler + build config.
  Run "amplify add function --name helloWorld --runtime nodejs --template HelloWorld --yes"
} else {
  Write-Host "✅ Function directory exists. Skipping amplify add function." -ForegroundColor Green
}

# --- write TypeScript Lambda handler ---
Write-Host "`n=== Writing TypeScript handler ===" -ForegroundColor Magenta

$srcPath = Join-Path $funcDir "src"
New-Item -ItemType Directory -Force -Path $srcPath | Out-Null

# package.json (TS build)
@'
{
  "name": "helloWorld",
  "version": "1.0.0",
  "main": "index.js",
  "license": "UNLICENSED",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {},
  "devDependencies": {
    "@types/aws-lambda": "^8.10.143",
    "typescript": "^5.5.4"
  }
}
'@ | Set-Content -Encoding UTF8 -Path (Join-Path $srcPath "package.json")

# tsconfig.json
@'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "strict": true,
    "esModuleInterop": true,
    "outDir": ".",
    "declaration": false,
    "sourceMap": false
  },
  "include": ["index.ts"]
}
'@ | Set-Content -Encoding UTF8 -Path (Join-Path $srcPath "tsconfig.json")

# index.ts (Lambda handler)
@'
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      message: "Hello from TypeScript Lambda!",
      path: event.rawPath ?? event.requestContext?.http?.path ?? null,
      requestId: event.requestContext?.requestId ?? null
    })
  };
};
'@ | Set-Content -Encoding UTF8 -Path (Join-Path $srcPath "index.ts")

# Remove any python/js template handler to avoid confusion
$oldPy = Join-Path $srcPath "index.py"
if (Test-Path $oldPy) { Remove-Item $oldPy -Force }

# --- Ensure amplify will build TS ---
# Amplify functions typically run npm install/build based on src/package.json.
# We'll also ensure there's a dist-free output by compiling to index.js in-place (outDir ".").
Write-Host "✅ TypeScript function source written." -ForegroundColor Green

# --- add REST API Gateway ---
Write-Host "`n=== Adding REST API 'helloapi' with route '/hello' ===" -ForegroundColor Magenta

$apiDir = Join-Path $RepoPath "amplify\backend\api\helloapi"
if (-not (Test-Path $apiDir)) {
  # Use amplify add api in headless mode
  # Note: Headless REST add requires a JSON file. We'll generate one.
  $tmp = Join-Path $env:TEMP "amplify-rest-api-config.json"

  @"
{
  "version": 1,
  "paths": {
    "/hello": {
      "name": "/hello",
      "lambdaFunction": "helloWorld",
      "permissions": {
        "setting": "open"
      }
    }
  }
}
"@ | Set-Content -Encoding UTF8 -Path $tmp

  # The --headless flag works for many amplify categories; for REST it can vary by CLI version.
  # We'll attempt headless; if it fails, user can run interactive once.
  try {
    Run "amplify add api --apiName helloapi --type REST --headless `"$tmp`""
  } catch {
    Write-Host "`n⚠ Headless REST API creation failed (Amplify CLI variance). Falling back to interactive steps." -ForegroundColor Yellow
    Write-Host "Run manually: amplify add api  (REST -> /hello -> existing Lambda helloWorld -> open access)" -ForegroundColor Yellow
    throw
  } finally {
    if (Test-Path $tmp) { Remove-Item $tmp -Force }
  }
} else {
  Write-Host "✅ API directory exists. Skipping amplify add api." -ForegroundColor Green
}

# --- Install deps for the function (so build is ready) ---
Write-Host "`n=== Installing function dev dependencies (TypeScript) ===" -ForegroundColor Magenta
Push-Location $srcPath
Run "npm install"
Pop-Location

# --- Deploy ---
Write-Host "`n=== Deploying (amplify push) ===" -ForegroundColor Magenta
Run "amplify push --yes"

Write-Host "`n✅ Done. Next: get the API endpoint in the Amplify output, or run:" -ForegroundColor Green
Write-Host "   amplify status" -ForegroundColor Green
Write-Host "   amplify console api" -ForegroundColor Green
Write-Host "`nThen test the endpoint: https://.../dev/hello" -ForegroundColor Green
