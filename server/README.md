# LedgerLite backend (Plaid sandbox)

Minimal Node/Express server for **sandbox-only** Plaid integration. It creates link tokens, exchanges public tokens, fetches transactions, and exposes a detected-activity queue to the frontend. Webhooks allow Plaid to push transaction updates so the queue stays up to date without manual sync. No secrets are ever sent to the client.

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
| POST | /api/plaid/sync_transactions | Manual sync: fetches transactions from Plaid, normalizes to detected-activity queue |
| POST | /api/plaid/webhook | Plaid webhook receiver; triggers automatic refresh for the item (responds 200 immediately) |
| GET | /api/detected-activity | Returns detected activity items for the frontend |
| POST | /api/detected-activity/:id/ignore | Mark item ignored |
| POST | /api/detected-activity/:id/resolve | Mark item resolved |

## Webhooks (sandbox)

When Plaid sends a webhook (e.g. `DEFAULT_UPDATE`, `TRANSACTIONS_REMOVED`, item updates), the backend:

1. Responds with **200 OK** immediately (no secrets in response).
2. Asynchronously refreshes transactions for the linked item and updates the detected-activity queue.
3. Preserves existing status (new / ignored / resolved); does not re-queue resolved or ignored items.
4. Merges pending → posted so one detected item evolves instead of duplicating.

To receive webhooks locally, expose your backend with a tunnel:

1. Install and run a tunnel (e.g. [ngrok](https://ngrok.com/)):
   ```bash
   ngrok http 3001
   ```
2. Copy the HTTPS URL (e.g. `https://abc123.ngrok.io`).
3. In [Plaid Dashboard](https://dashboard.plaid.com/developers/webhooks) → Webhooks, set the URL to:
   `https://abc123.ngrok.io/api/plaid/webhook`
4. Use the same Link/sandbox item; when Plaid fires webhooks (e.g. after sandbox transaction changes), they hit your backend and the queue updates automatically.

To test webhooks in sandbox without waiting for real events, you can call Plaid’s [Fire Webhook](https://plaid.com/docs/api/sandbox/#sandboxitemfire_webhook) endpoint to simulate a `DEFAULT_UPDATE` for a sandbox item.

## Storage

- Access tokens and detected-activity queue are stored under `server/.store/` (JSON files). This is for local/sandbox prototype only. Do not commit `.store/` or `.env`.

## Sandbox testing

1. Run backend and frontend.
2. In the app, click **Connect Plaid Sandbox** and complete Link with sandbox credentials (e.g. user `user_good`, password `pass_good`).
3. Click **Sync Detected Activity** to pull sandbox transactions into the queue (or rely on webhooks if configured).
4. Use **Refresh** in the inbox to reload the queue from the server after webhook-driven updates.
5. Use the existing Detected Activity inbox to classify items (Add purchase, Pending in/out, Transfer, Ignore).

No production credentials; sandbox only.
