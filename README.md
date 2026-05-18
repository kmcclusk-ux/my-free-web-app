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
- `OPENROUTER_MODEL`, for example `openrouter/free` or `deepseek/deepseek-r1:free`

Optional Lambda environment variable:

- `OPENROUTER_SITE_URL`, used for OpenRouter request attribution

Frontend environment still uses `VITE_API_BASE_URL` for the existing Amplify REST API base URL. Do not put `OPENROUTER_API_KEY` in any frontend `.env` file.

