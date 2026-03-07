## iisauhwallet (React refactor)

This repository contains a maintainable **Vite + React + TypeScript** version of the iisauhwallet PWA.

- **Legacy single-file app** is preserved in `legacy/` for reference.
- **Local data compatibility** is preserved: the React app uses the **same `localStorage` keys** as the legacy app (no key renames; no automatic wipes).

**Developer note:** Real banking integrations are not yet implemented in a production-safe form. A **sandbox-only** Plaid backend is included for testing the Detected Activity flow. See `SECURITY_NOTES.md` and `PLAID_BACKEND_PLAN.md`.

## Run locally

**Frontend only (mock mode):**
```bash
npm install
npm run dev
```
Vite will print the local URL (it includes the repo base path). The Detected Activity inbox uses mock data from localStorage.

**With Plaid sandbox backend (optional):**
1. In `server/`: copy `server/.env.example` to `server/.env` and set `PLAID_CLIENT_ID`, `PLAID_SECRET` (sandbox keys from [Plaid Dashboard](https://dashboard.plaid.com/developers/keys)), and `PORT=3001`.
2. Start the backend on **port 3001**: `cd server && npm install && npm start`. The backend must be running at `http://localhost:3001` for Connect Bank to work.
3. Run the frontend: `npm run dev`. The Vite dev server **proxies `/api` to `http://localhost:3001`**, so you do not need to set `VITE_API_BASE_URL` for local development. (Optional: set `VITE_API_BASE_URL=http://localhost:3001` in `.env.local` to call the backend directly.)
4. Open the app, click **Connect Bank** (or **Detected Activity** → **Connect Bank**) to link a sandbox account, then **Sync Detected Activity** to load transactions (or use **Refresh** after webhook-driven updates). The backend supports Plaid webhooks for automatic queue updates; see `server/README.md` for local webhook setup (e.g. ngrok). No production credentials; sandbox only.

## Build locally

```bash
npm run build
npm run preview
```

## Deploy (GitHub Pages)

This repo is configured to deploy via **GitHub Actions** on every push to `main`.

- **Vite base path** is set to `"/iisauhwallet/"` in `vite.config.ts`.
- Workflow: `.github/workflows/deploy.yml` builds and deploys `/dist` to GitHub Pages.

### One-time GitHub Pages setting

In the GitHub repo settings:

- Go to **Settings → Pages**
- Set **Build and deployment** → **Source** to **GitHub Actions**

## Live site URL

Once Pages is enabled, the app will be hosted at:

`https://iisauha.github.io/iisauhwallet/`

