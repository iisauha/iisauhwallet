## LedgerLite (React refactor)

This repository contains a maintainable **Vite + React + TypeScript** version of the LedgerLite PWA.

- **Legacy single-file app** is preserved in `legacy/` for reference.
- **Local data compatibility** is preserved: the React app uses the **same `localStorage` keys** as the legacy app (no key renames; no automatic wipes).

**Developer note:** Real banking integrations are not yet implemented in a production-safe form. Future Plaid integration will require a backend. See `SECURITY_NOTES.md` and `PLAID_BACKEND_PLAN.md`.

## Run locally

```bash
npm install
npm run dev
```

Vite will print the local URL (it includes the repo base path).

## Build locally

```bash
npm run build
npm run preview
```

## Deploy (GitHub Pages)

This repo is configured to deploy via **GitHub Actions** on every push to `main`.

- **Vite base path** is set to `"/ledgerlite-copy/"` in `vite.config.ts`.
- Workflow: `.github/workflows/deploy.yml` builds and deploys `/dist` to GitHub Pages.

### One-time GitHub Pages setting

In the GitHub repo settings:

- Go to **Settings → Pages**
- Set **Build and deployment** → **Source** to **GitHub Actions**

## Live site URL

Once Pages is enabled, the app will be hosted at:

`https://iisauha.github.io/ledgerlite-copy/`

