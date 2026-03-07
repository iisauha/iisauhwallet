# Security notes

- **This app is currently frontend-only.** All data is stored in the browser (e.g. `localStorage`). There is no server-side persistence or authentication.

- **Real Plaid (or other banking) integration must use a backend.** Plaid requires a client ID and secret; these must never be embedded in client-side code or shipped to the browser. A backend server should:
  - Hold Plaid credentials in environment variables or a secrets manager
  - Create and exchange Plaid link tokens
  - Exchange public tokens for access tokens and store them securely
  - Proxy API calls to Plaid so the frontend never sees secrets

- **No Plaid secrets should ever be stored in client code or in this repository.** Use `.env.example` only as a reminder; real values belong in a backend and in ignored env files (e.g. `.env.local`), never committed.

- **Public deployment (e.g. GitHub Pages) is only safe for mock or prototype integrations.** For production use with real banking or financial data, you need a proper backend, HTTPS, and secure storage. This repo is prepared for future secure API integration but does not yet include it.
