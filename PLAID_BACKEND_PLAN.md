# Future Plaid backend architecture (plan only)

This document sketches how real Plaid integration should be implemented **on a backend**. No Plaid code exists in this repo yet; the frontend “Detected Activity” inbox is a mock/prototype only.

## Principles

- **Secrets stay on the server.** Plaid `client_id`, `secret`, and `access_token`s must never be in frontend code, in Git, or in public deployment (e.g. GitHub Pages).
- **Frontend only talks to your backend.** The app calls your API (e.g. `VITE_API_BASE_URL`); the backend talks to Plaid.

## Suggested flow

1. **Link token**
   - Frontend requests a Plaid Link token from **your backend** (e.g. `POST /api/plaid/link-token`).
   - Backend uses Plaid’s server SDK with `client_id` and `secret` (from env/secrets manager) to create a link token and returns it to the frontend.

2. **Plaid Link on frontend**
   - Frontend opens Plaid Link (using the link token). User links their account in the browser.
   - Plaid Link returns a **public_token** to the frontend. The frontend sends this to your backend only; it is one-time use and must not be stored long-term in the client.

3. **Exchange and storage**
   - Backend exchanges the **public_token** for an **access_token** via Plaid’s API.
   - Backend stores the **access_token** securely (e.g. encrypted in your DB, keyed by user/session). The frontend never receives or stores the access_token.

4. **Transactions and webhooks**
   - Backend uses Plaid’s **Transactions** product (and optionally **Transactions Sync**) to pull or receive transaction data.
   - Backend can use **webhooks** (e.g. `DEFAULT_UPDATE`, `TRANSACTIONS_REMOVED`) to know when to refresh.
   - All Plaid API calls happen on the backend; the frontend never calls Plaid directly.

5. **What the frontend gets**
   - Frontend receives **normalized “detected activity” items** from your backend (e.g. `GET /api/detected-activity` or via your own sync). These are already sanitized (no Plaid IDs or tokens).
   - The existing Detected Activity inbox UI can later be wired to this API instead of mock/local data.

## Summary

| Item              | Location        | Frontend ever sees? |
|-------------------|-----------------|----------------------|
| Plaid client_id   | Backend env     | No                   |
| Plaid secret      | Backend env     | No                   |
| Link token        | From backend → frontend | Yes (short-lived) |
| Public token      | From Link → backend     | Sent once, not stored |
| Access token      | Backend only   | No                   |
| Transaction data  | Backend normalizes → API | Only normalized payload |

This keeps the repo safe for future backend/API work and ensures no secrets are stored in frontend code.
