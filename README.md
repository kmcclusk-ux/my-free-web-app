# My Free Web App
# Amplify Lambda + REST API Project

## CI/CD (GitHub Actions)

Pushing to `main` now invokes `.github/workflows/amplify-deploy.yml`. The workflow installs the root/frontend dependencies, builds the React app (`npm run build` in `frontend`), and runs `npx amplify push --yes` so Amplify hosting and the Lambda backend stay in sync without requiring you to run the build locally.

Before that workflow can successfully push, provide the following GitHub secrets in your repo:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- (optional) `AWS_SESSION_TOKEN` if you use temporary credentials

The workflow already sets `AWS_REGION` to `us-west-2` based on your existing Amplify project configuration.

## Portfolio AI Assistant

The React app includes a compact portfolio assistant panel. The browser sends the current compact portfolio snapshot to the Lambda backend, and the backend proxies chat requests to OpenRouter so the API key is never exposed in frontend code.

Required Lambda environment variables:

- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`, default/recommended for zero-cost use: `openrouter/free`

Current free model options checked on OpenRouter:

- `openrouter/free`: zero-cost router that picks from available free models.
- `openrouter/owl-alpha`: fixed free model, agentic/tool-use oriented.
- `deepseek/deepseek-v4-flash:free`: fixed free model with a large context window.
- `openai/gpt-oss-20b:free`: fixed free model with tool/structured-output capability.

Optional Lambda environment variable:

- `OPENROUTER_SITE_URL`, used for OpenRouter request attribution
- `ENABLE_ASSISTANT_WEB_SEARCH`, default `false`. Set to `true` only if you want OpenRouter web search enabled for the assistant.
- `OPENROUTER_WEB_SEARCH_MODEL`, optional model used only for web-search requests. A free tool-oriented option to try is `openrouter/owl-alpha`.
- `OPENROUTER_TIMEOUT_MS`, default `22000` for web-search requests and capped at `24000` so API Gateway can receive a clean error instead of timing out.
- `ASSISTANT_WEB_SEARCH_MAX_RESULTS`, default `3`, capped at `10`.
- `ASSISTANT_WEB_SEARCH_CONTEXT_SIZE`, default `low`; allowed values are `low`, `medium`, or `high`.

Web search note: OpenRouter free models can be used with the `openrouter:web_search` server tool, but search operations may add OpenRouter costs even when the model itself is free. Keep `ENABLE_ASSISTANT_WEB_SEARCH=false` for strict lowest-cost operation.

Frontend environment still uses `VITE_API_BASE_URL` for the existing Amplify REST API base URL. Do not put `OPENROUTER_API_KEY` in any frontend `.env` file.

PowerShell example for the live Lambda after you have AWS credentials configured. This command keeps the existing workbook variables and adds OpenRouter free-model settings:

```powershell
aws lambda update-function-configuration `
  --region us-west-2 `
  --function-name helloWorld-portfolio `
  --environment "Variables={ENV=portfolio,REGION=us-west-2,WORKBOOK_TABLE_NAME=portfolio-workbook-portfolio,OPENROUTER_MODEL=openrouter/free,OPENROUTER_WEB_SEARCH_MODEL=openrouter/owl-alpha,OPENROUTER_TIMEOUT_MS=22000,OPENROUTER_SITE_URL=https://live.d3gqzb2viphf8u.amplifyapp.com,ENABLE_ASSISTANT_WEB_SEARCH=false,ASSISTANT_WEB_SEARCH_MAX_RESULTS=3,ASSISTANT_WEB_SEARCH_CONTEXT_SIZE=low,OPENROUTER_API_KEY=$env:OPENROUTER_API_KEY}"
```

