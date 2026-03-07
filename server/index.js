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

// POST /api/plaid/sync_transactions
app.post('/api/plaid/sync_transactions', async (req, res) => {
  try {
    const tokens = getStoredAccessTokens();
    const itemIds = Object.keys(tokens);
    if (itemIds.length === 0) {
      return res.json({ synced: 0, message: 'No linked items' });
    }
    const client = getPlaidClient();
    const now = new Date();
    const endDate = now.toISOString().slice(0, 10);
    const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const existing = getDetectedItems();
    const byPlaidId = new Map(existing.filter((i) => i.plaidTransactionId).map((i) => [i.plaidTransactionId, i]));

    for (const itemId of itemIds) {
      const accessToken = tokens[itemId];
      if (!accessToken) continue;
      let accounts = [];
      try {
        const acctRes = await client.accountsGet({ access_token: accessToken });
        accounts = acctRes.data.accounts || [];
      } catch (e) {
        console.error('accountsGet error', itemId, e.response?.data || e.message);
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
        if (e.response?.data?.error_code === 'PRODUCT_NOT_READY') {
          // Sandbox can return this; skip
          continue;
        }
        console.error('transactionsGet error', itemId, e.response?.data || e.message);
        continue;
      }
      for (const tx of transactions) {
        const acc = accountById.get(tx.account_id);
        const accountName = acc?.name || 'Unknown';
        const accountType = (acc?.type || 'other').replace(/-/g, '_');
        const existingItem = byPlaidId.get(tx.transaction_id);
        const item = normalizePlaidTransaction(tx, accountName, accountType, existingItem || undefined);
        if (existingItem) {
          const idx = existing.findIndex((i) => i.plaidTransactionId === tx.transaction_id);
          if (idx !== -1) existing[idx] = item;
        } else {
          byPlaidId.set(tx.transaction_id, item);
          existing.push(item);
        }
      }
    }
    setDetectedItems(existing);
    return res.json({ synced: existing.filter((i) => i.source === 'plaid').length, total: existing.length });
  } catch (err) {
    const data = err.response?.data || { error_message: err.message };
    console.error('sync_transactions error', data);
    return res.status(500).json({ error: data.error_message || 'Sync failed' });
  }
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
