/**
 * Minimal Plaid sandbox backend for LedgerLite.
 * - Creates link tokens, exchanges public token, fetches transactions.
 * - Normalizes transactions into detected-activity queue; never exposes secrets.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 3001;
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;
const PLAID_ENV = (process.env.PLAID_ENV || 'sandbox').toLowerCase();

const STORE_DIR = path.join(__dirname, '.store');
const ACCESS_TOKENS_FILE = path.join(STORE_DIR, 'access_tokens.json');
const DETECTED_FILE = path.join(STORE_DIR, 'detected_activity.json');

function ensureStore() {
  if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
}

function readJson(filePath, defaultValue) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

function writeJson(filePath, data) {
  ensureStore();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// In-memory for sandbox prototype: item_id -> access_token
function getStoredAccessTokens() {
  return readJson(ACCESS_TOKENS_FILE, {});
}

function setAccessToken(itemId, accessToken) {
  const tokens = getStoredAccessTokens();
  tokens[itemId] = accessToken;
  writeJson(ACCESS_TOKENS_FILE, tokens);
}

// Detected activity queue (server-side)
function getDetectedItems() {
  return readJson(DETECTED_FILE, []);
}

function setDetectedItems(items) {
  writeJson(DETECTED_FILE, items);
}

function normalizePlaidTransaction(tx, accountName, accountType, existingItem = null) {
  const amountCents = Math.round(Math.abs((tx.amount || 0) * 100));
  const isDebit = (tx.amount || 0) < 0;
  const amount = isDebit ? -amountCents : amountCents;
  const title = tx.merchant_name || tx.name || tx.payment_channel || 'Transaction';
  const dateISO = (tx.date || '').slice(0, 10);
  const base = {
    id: existingItem?.id ?? `plaid_${tx.transaction_id}`,
    plaidTransactionId: tx.transaction_id,
    title,
    amountCents: amount,
    dateISO,
    accountName: accountName || 'Unknown',
    accountType: accountType || 'unknown',
    pending: !!tx.pending,
    source: 'plaid',
  };
  if (existingItem) {
    return { ...base, status: existingItem.status, resolvedAs: existingItem.resolvedAs };
  }
  return { ...base, status: 'new' };
}

/** Best-effort match for pending->posted: same amount, account, date proximity, name similarity */
function findMatchingDetectedItem(existing, tx, accountId, amountCents, dateISO, name) {
  const nameNorm = (n) => (n || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 40);
  const txName = nameNorm(name);
  const dateTs = dateISO ? new Date(dateISO).getTime() : 0;
  const dayMs = 24 * 60 * 60 * 1000;
  for (const item of existing) {
    if (item.source !== 'plaid' || !item.plaidTransactionId) continue;
    if (item.status !== 'new' && item.status !== 'in_progress') continue;
    if (Math.abs((item.amountCents || 0) - amountCents) > 1) continue;
    if (item.dateISO && dateTs && Math.abs(new Date(item.dateISO).getTime() - dateTs) > 3 * dayMs) continue;
    if (txName && nameNorm(item.title).slice(0, 20) !== txName.slice(0, 20)) continue;
    return item;
  }
  return null;
}

/**
 * Refresh detected activity from Plaid for given item(s). If itemIds is empty, refresh all.
 * Reuses normalization; preserves resolved/ignored; merges pending->posted.
 */
async function refreshDetectedActivityFromPlaid(itemIds = []) {
  const tokens = getStoredAccessTokens();
  const idsToRefresh = itemIds.length > 0 ? itemIds.filter((id) => tokens[id]) : Object.keys(tokens);
  if (idsToRefresh.length === 0) return;
  const client = getPlaidClient();
  const now = new Date();
  const endDate = now.toISOString().slice(0, 10);
  const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let existing = getDetectedItems();
  const byPlaidId = new Map(existing.filter((i) => i.plaidTransactionId).map((i) => [i.plaidTransactionId, i]));

  for (const itemId of idsToRefresh) {
    const accessToken = tokens[itemId];
    if (!accessToken) continue;
    let accounts = [];
    try {
      const acctRes = await client.accountsGet({ access_token: accessToken });
      accounts = acctRes.data.accounts || [];
    } catch (e) {
      console.error('webhook/sync accountsGet error', itemId, e.response?.data?.error_message || e.message);
      continue;
    }
    const accountById = new Map(accounts.map((a) => [a.account_id, a]));
    let transactions = [];
    try {
      const txRes = await client.transactionsGet({
        access_token: accessToken,
        start_date: startDate,
        end_date: endDate,
        options: { count: 500, offset: 0 },
      });
      transactions = txRes.data.transactions || [];
    } catch (e) {
      if (e.response?.data?.error_code === 'PRODUCT_NOT_READY') continue;
      console.error('webhook/sync transactionsGet error', itemId, e.response?.data?.error_message || e.message);
      continue;
    }
    for (const tx of transactions) {
      const acc = accountById.get(tx.account_id);
      const accountName = acc?.name || 'Unknown';
      const accountType = (acc?.type || 'other').replace(/-/g, '_');
      const amountCents = Math.round(Math.abs((tx.amount || 0) * 100));
      const isDebit = (tx.amount || 0) < 0;
      const amount = isDebit ? -amountCents : amountCents;
      const dateISO = (tx.date || '').slice(0, 10);
      const name = tx.merchant_name || tx.name || tx.payment_channel || '';

      let existingItem = byPlaidId.get(tx.transaction_id);
      if (!existingItem && tx.pending_transaction_id) {
        existingItem = byPlaidId.get(tx.pending_transaction_id) || null;
        if (existingItem) byPlaidId.delete(tx.pending_transaction_id);
      }
      if (!existingItem && !tx.pending) {
        const fallback = findMatchingDetectedItem(existing, tx, tx.account_id, amount, dateISO, name);
        if (fallback) existingItem = fallback;
      }
      const item = normalizePlaidTransaction(tx, accountName, accountType, existingItem || undefined);
      if (existingItem) {
        if (existingItem.plaidTransactionId && existingItem.plaidTransactionId !== tx.transaction_id) {
          byPlaidId.delete(existingItem.plaidTransactionId);
        }
        const idx = existing.findIndex((i) => i.id === existingItem.id);
        if (idx !== -1) existing[idx] = item;
        byPlaidId.set(tx.transaction_id, item);
      } else {
        byPlaidId.set(tx.transaction_id, item);
        existing.push(item);
      }
    }
  }
  setDetectedItems(existing);
}

let plaidClient = null;
function getPlaidClient() {
  if (plaidClient) return plaidClient;
  if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
    throw new Error('PLAID_CLIENT_ID and PLAID_SECRET must be set');
  }
  const basePath = PLAID_ENV === 'production' ? PlaidEnvironments.production : PlaidEnvironments.sandbox;
  const configuration = new Configuration({
    basePath,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
        'PLAID-SECRET': PLAID_SECRET,
      },
    },
  });
  plaidClient = new PlaidApi(configuration);
  return plaidClient;
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// POST /api/plaid/create_link_token
app.post('/api/plaid/create_link_token', async (req, res) => {
  try {
    const client = getPlaidClient();
    const response = await client.linkTokenCreate({
      user: { client_user_id: 'ledgerlite-sandbox' },
      client_name: 'LedgerLite',
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en',
    });
    return res.json({ link_token: response.data.link_token });
  } catch (err) {
    const data = err.response?.data || { error_message: err.message };
    console.error('create_link_token error', data);
    return res.status(500).json({ error: data.error_message || 'Failed to create link token' });
  }
});

// POST /api/plaid/exchange_public_token
app.post('/api/plaid/exchange_public_token', async (req, res) => {
  const { public_token } = req.body || {};
  if (!public_token) return res.status(400).json({ error: 'public_token required' });
  try {
    const client = getPlaidClient();
    const response = await client.itemPublicTokenExchange({ public_token });
    const accessToken = response.data.access_token;
    const itemId = response.data.item_id;
    setAccessToken(itemId, accessToken);
    return res.json({ item_id: itemId, ok: true });
  } catch (err) {
    const data = err.response?.data || { error_message: err.message };
    console.error('exchange_public_token error', data);
    return res.status(500).json({ error: data.error_message || 'Exchange failed' });
  }
});

// POST /api/plaid/sync_transactions (manual fallback; webhooks also trigger refresh)
app.post('/api/plaid/sync_transactions', async (req, res) => {
  try {
    const tokens = getStoredAccessTokens();
    if (Object.keys(tokens).length === 0) {
      return res.json({ synced: 0, message: 'No linked items' });
    }
    await refreshDetectedActivityFromPlaid([]);
    const existing = getDetectedItems();
    return res.json({ synced: existing.filter((i) => i.source === 'plaid').length, total: existing.length });
  } catch (err) {
    const data = err.response?.data || { error_message: err.message };
    console.error('sync_transactions error', data);
    return res.status(500).json({ error: data.error_message || 'Sync failed' });
  }
});

// POST /api/plaid/webhook — Plaid sends transaction/item updates. Respond 200 immediately; process async.
app.post('/api/plaid/webhook', (req, res) => {
  const body = req.body || {};
  const webhookType = body.webhook_type;
  const webhookCode = body.webhook_code;
  const itemId = body.item_id;
  const requestId = body.request_id;
  const removedIds = body.removed_transactions;
  // Log for debugging; do not log secrets or full payload
  console.log('[plaid webhook]', {
    webhook_type: webhookType,
    webhook_code: webhookCode,
    item_id: itemId ? `${itemId.slice(0, 8)}...` : undefined,
    request_id: requestId ? `${String(requestId).slice(0, 8)}...` : undefined,
    removed_count: Array.isArray(removedIds) ? removedIds.length : 0,
  });
  res.status(200).json({ received: true });
  const tokens = getStoredAccessTokens();
  const shouldRefresh = itemId && tokens[itemId];
  const removedSet = Array.isArray(removedIds) && removedIds.length ? new Set(removedIds) : null;
  setImmediate(() => {
    (async () => {
      if (shouldRefresh) await refreshDetectedActivityFromPlaid([itemId]).catch((err) => {
        console.error('[plaid webhook] refresh failed', err.message);
      });
      if (removedSet && removedSet.size > 0) {
        const existing = getDetectedItems();
        const next = existing.filter((i) => !i.plaidTransactionId || !removedSet.has(i.plaidTransactionId));
        if (next.length !== existing.length) setDetectedItems(next);
      }
    })();
  });
});

// GET /api/detected-activity
app.get('/api/detected-activity', (req, res) => {
  const items = getDetectedItems();
  return res.json({ items });
});

// POST /api/detected-activity/:id/ignore
app.post('/api/detected-activity/:id/ignore', (req, res) => {
  const { id } = req.params;
  const items = getDetectedItems();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  items[idx] = { ...items[idx], status: 'ignored' };
  setDetectedItems(items);
  return res.json({ ok: true });
});

// POST /api/detected-activity/:id/resolve
app.post('/api/detected-activity/:id/resolve', (req, res) => {
  const { id } = req.params;
  const { resolvedAs } = req.body || {};
  const items = getDetectedItems();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  items[idx] = { ...items[idx], status: 'resolved', resolvedAs: resolvedAs || undefined };
  setDetectedItems(items);
  return res.json({ ok: true });
});

// POST /api/detected-activity/:id/reset (testing: set status back to new)
app.post('/api/detected-activity/:id/reset', (req, res) => {
  const { id } = req.params;
  const items = getDetectedItems();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  items[idx] = { ...items[idx], status: 'new', resolvedAs: undefined };
  setDetectedItems(items);
  return res.json({ ok: true });
});

// Health (no Plaid creds required)
app.get('/api/health', (req, res) => {
  const hasCreds = !!(PLAID_CLIENT_ID && PLAID_SECRET);
  return res.json({ ok: true, plaid_configured: hasCreds, env: PLAID_ENV });
});

ensureStore();

app.listen(PORT, () => {
  console.log(`LedgerLite backend listening on http://localhost:${PORT}`);
  if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
    console.warn('WARN: PLAID_CLIENT_ID or PLAID_SECRET not set. Plaid endpoints will fail.');
  }
});
