# LedgerLite backend (Plaid sandbox)

Minimal Node/Express server for **sandbox-only** Plaid integration. It creates link tokens, exchanges public tokens, fetches transactions, and exposes a detected-activity queue to the frontend. No secrets are ever sent to the client.

## Setup

1. Install dependencies:
   ```bash
   cd server && npm install
   ```

2. Copy env and set sandbox credentials:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set:
   - `PLAID_CLIENT_ID` — from [Plaid Dashboard](https://dashboard.plaid.com/developers/keys) (sandbox)
   - `PLAID_SECRET` — sandbox secret
   - `PLAID_ENV=sandbox`
   - `PORT=3001` (or any port)

3. Run:
   ```bash
   npm start
   ```
   Or with auto-reload: `npm run dev`

The server listens on `http://localhost:3001` (or your `PORT`). The frontend must use `VITE_API_BASE_URL=http://localhost:3001` when running the app locally so it can call the API.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Health check; reports whether Plaid is configured |
| POST | /api/plaid/create_link_token | Returns a Plaid Link token for sandbox |
| POST | /api/plaid/exchange_public_token | Body: `{ "public_token": "..." }` — exchanges for access_token, stored server-side |
| POST | /api/plaid/sync_transactions | Fetches transactions from Plaid, normalizes to detected-activity queue |
| GET | /api/detected-activity | Returns detected activity items for the frontend |
| POST | /api/detected-activity/:id/ignore | Mark item ignored |
| POST | /api/detected-activity/:id/resolve | Mark item resolved |

## Storage

- Access tokens and detected-activity queue are stored under `server/.store/` (JSON files). This is for local/sandbox prototype only. Do not commit `.store/` or `.env`.

## Sandbox testing

1. Run backend and frontend.
2. In the app, click **Connect Plaid Sandbox** and complete Link with sandbox credentials (e.g. user `user_good`, password `pass_good`).
3. Click **Sync Detected Activity** to pull sandbox transactions into the queue.
4. Use the existing Detected Activity inbox to classify items (Add purchase, Pending in/out, Transfer, Ignore).

No production credentials; sandbox only.
