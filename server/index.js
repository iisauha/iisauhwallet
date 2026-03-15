/**
 * Minimal Plaid sandbox backend for iisauhwallet.
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
// Plaid credentials: backend env only. Do not hardcode or expose to frontend.
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;
const PLAID_ENV = (process.env.PLAID_ENV || 'sandbox').toLowerCase();

const STORE_DIR = path.join(__dirname, '.store');
const ACCESS_TOKENS_FILE = path.join(STORE_DIR, 'access_tokens.json');
const DETECTED_FILE = path.join(STORE_DIR, 'detected_activity.json');
const RULES_FILE = path.join(STORE_DIR, 'detected_activity_rules.json');
const SYNC_STATE_FILE = path.join(STORE_DIR, 'plaid_sync_state.json');
const PILOT_STATUS_FILE = path.join(STORE_DIR, 'plaid_pilot_status.json');

const MIN_SYNC_INTERVAL_MS = 20 * 1000; // 20 seconds between syncs per item
const SYNC_LOCK_EXPIRY_MS = 5 * 60 * 1000; // 5 min max lock

let syncLock = null;

function getSyncState() {
  const raw = readJson(SYNC_STATE_FILE, {});
  return typeof raw === 'object' && raw !== null ? raw : {};
}

function setSyncStateItem(itemId, data) {
  const state = getSyncState();
  state[itemId] = { ...state[itemId], ...data };
  writeJson(SYNC_STATE_FILE, state);
}

function getCursorForItem(itemId) {
  const state = getSyncState();
  const item = state[itemId];
  const c = item?.transactionsSyncCursor;
  return c && typeof c === 'string' && c.length > 0 ? c : null;
}

function acquireSyncLock() {
  const now = Date.now();
  if (syncLock) {
    if (now < syncLock.expiresAt) return false;
    syncLock = null;
  }
  syncLock = { lockedAt: now, expiresAt: now + SYNC_LOCK_EXPIRY_MS };
  return true;
}

function releaseSyncLock() {
  syncLock = null;
}

function isRateLimited(itemId) {
  const state = getSyncState();
  const item = state[itemId];
  if (!item || !item.lastSyncTime) return false;
  const elapsed = Date.now() - new Date(item.lastSyncTime).getTime();
  return elapsed < MIN_SYNC_INTERVAL_MS;
}

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

// item_id -> access_token (legacy string) or { accessToken, environment }
function getStoredAccessTokens() {
  return readJson(ACCESS_TOKENS_FILE, {});
}

/** Returns list of { itemId, accessToken, environment } for iteration. Supports legacy string tokens. */
function getAccessTokensList() {
  const raw = getStoredAccessTokens();
  return Object.entries(raw).map(([itemId, val]) => {
    if (typeof val === 'string') {
      return { itemId, accessToken: val, environment: 'sandbox' };
    }
    return {
      itemId,
      accessToken: val?.accessToken || '',
      environment: (val?.environment || 'sandbox').toLowerCase(),
    };
  }).filter((e) => e.accessToken);
}

function setAccessToken(itemId, accessToken, environment = PLAID_ENV) {
  const tokens = getStoredAccessTokens();
  const env = (environment || PLAID_ENV || 'sandbox').toLowerCase();
  tokens[itemId] = { accessToken, environment: env };
  writeJson(ACCESS_TOKENS_FILE, tokens);
}

// Return the first stored access token entry for the current Plaid environment.
function getPrimaryAccessTokenForEnv() {
  const env = (PLAID_ENV || 'sandbox').toLowerCase();
  const list = getAccessTokensList();
  return list.find((e) => (e.environment || 'sandbox') === env) || null;
}

// Remove all non-sandbox (real pilot) access tokens and their sync state,
// and optionally clear real-pilot detected items for pilot debugging.
function clearRealPilotAccessTokensAndItems() {
  const tokens = getStoredAccessTokens();
  const nextTokens = {};
  let removedTokens = 0;

  for (const [itemId, val] of Object.entries(tokens)) {
    const env =
      typeof val === 'string'
        ? 'sandbox'
        : (val && typeof val.environment === 'string' ? val.environment.toLowerCase() : 'sandbox');
    if (env === 'sandbox') {
      nextTokens[itemId] = val;
    } else {
      removedTokens += 1;
    }
  }

  if (removedTokens > 0) {
    writeJson(ACCESS_TOKENS_FILE, nextTokens);
  }

  // Clear sync state for any removed items.
  const syncState = getSyncState();
  const nextSyncState = {};
  for (const [itemId, value] of Object.entries(syncState)) {
    if (Object.prototype.hasOwnProperty.call(nextTokens, itemId)) {
      nextSyncState[itemId] = value;
    }
  }
  writeJson(SYNC_STATE_FILE, nextSyncState);

  // Optionally clear detected items that came from real pilot.
  const items = getDetectedItems();
  const nextItems = items.filter(
    (i) => !(i.source === 'plaid' && ((i.sourceMode || i.sourceEnvironment) === 'real_pilot'))
  );
  const removedItems = items.length - nextItems.length;
  if (removedItems > 0) {
    setDetectedItems(nextItems);
  }

  return { removedTokens, removedItems };
}

// Detected activity queue (server-side)
function getDetectedItems() {
  return readJson(DETECTED_FILE, []);
}

function setDetectedItems(items) {
  writeJson(DETECTED_FILE, items);
}

// --- Detected activity rules (suggestions only; no auto-posting) ---
const RULE_MATCH_TYPES = ['merchant_exact', 'merchant_contains', 'description_contains', 'account_description_contains', 'account_merchant'];
const RULE_ACTIONS = ['add_purchase', 'pending_in', 'pending_out', 'transfer', 'review_manually', 'suggest_ignore'];

function getRules() {
  const raw = readJson(RULES_FILE, []);
  if (!Array.isArray(raw)) return [];
  return raw;
}

function setRules(rules) {
  writeJson(RULES_FILE, rules);
}

function ruleMatchesItem(rule, item) {
  if (!rule.enabled) return false;
  const title = (item.title || '').toLowerCase();
  const accountName = (item.accountName || '').toLowerCase();
  const value = (rule.matchValue || '').toLowerCase().trim();
  if (!value) return false;
  const direction = (item.amountCents ?? 0) >= 0 ? 'inflow' : 'outflow';
  if (rule.direction && rule.direction !== 'any' && rule.direction !== direction) return false;
  if (rule.accountName) {
    const ruleAccount = (rule.accountName || '').toLowerCase();
    if (ruleAccount && !accountName.includes(ruleAccount)) return false;
  }
  switch (rule.matchType) {
    case 'merchant_exact':
      return title === value;
    case 'merchant_contains':
      return title.includes(value);
    case 'description_contains':
      return title.includes(value);
    case 'account_description_contains':
      return (rule.accountName ? accountName.includes((rule.accountName || '').toLowerCase()) : true) && title.includes(value);
    case 'account_merchant':
      return accountName.includes((rule.accountName || '').toLowerCase()) && title.includes(value);
    default:
      return title.includes(value);
  }
}

function findMatchingRule(rules, item) {
  const enabled = rules.filter((r) => r.enabled);
  const sorted = [...enabled].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  return sorted.find((r) => ruleMatchesItem(r, item)) || null;
}

function normalizePlaidTransaction(tx, accountName, accountType, existingItem = null, environment = 'sandbox') {
  const amountCents = Math.round(Math.abs((tx.amount || 0) * 100));
  const isDebit = (tx.amount || 0) < 0;
  const amount = isDebit ? -amountCents : amountCents;
  const title = tx.merchant_name || tx.name || tx.payment_channel || 'Transaction';
  const dateISO = (tx.date || '').slice(0, 10);
  const wasPendingNowPosted = existingItem?.pending && !tx.pending;
  const env = (environment || 'sandbox').toLowerCase();
  const sourceMode = env === 'sandbox' ? 'sandbox' : 'real_pilot';
  const nowIso = new Date().toISOString();
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
    sourceEnvironment: env,
    sourceMode,
    ...(wasPendingNowPosted ? { updatedFromPending: true } : {}),
    ...(existingItem?.detectedAt ? { detectedAt: existingItem.detectedAt } : {}),
    ...(!existingItem ? { detectedAt: nowIso } : {}),
    ...(existingItem?.firstSeenAt ? { firstSeenAt: existingItem.firstSeenAt } : {}),
    ...(!existingItem ? { firstSeenAt: nowIso } : {}),
    ...(existingItem ? { lastUpdatedAt: nowIso } : {}),
  };
  if (existingItem) {
    return {
      ...base,
      status: existingItem.status,
      resolvedAs: existingItem.resolvedAs,
      resolvedAt: existingItem.resolvedAt,
      linkedPurchaseId: existingItem.linkedPurchaseId,
      linkedPurchaseTitle: existingItem.linkedPurchaseTitle,
      linkedPurchaseDateISO: existingItem.linkedPurchaseDateISO,
      linkedPurchaseAmountCents: existingItem.linkedPurchaseAmountCents,
    };
  }
  return { ...base, status: 'new' };
}

/**
 * Best-effort match for pending->posted reconciliation.
 * Uses: same account, same/near amount, close date, merchant/name similarity.
 * Matches only items that are currently pending (so we merge posted tx into a pending item).
 * Preserves status (new/ignored/resolved) when merging.
 */
function findMatchingDetectedItem(existing, amountCents, dateISO, name, accountName, sourceMode = 'sandbox') {
  const nameNorm = (n) => (n || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 40);
  const txName = nameNorm(name);
  const dateTs = dateISO ? new Date(dateISO).getTime() : 0;
  const dayMs = 24 * 60 * 60 * 1000;
  const amountTolerance = 5;
  const sameMode = existing.filter((i) => (i.sourceMode || 'sandbox') === sourceMode);
  const accountNorm = (a) => (a || '').toLowerCase().trim();
  const txAccount = accountNorm(accountName);
  for (const item of sameMode) {
    if (item.source !== 'plaid' || !item.plaidTransactionId) continue;
    if (!item.pending) continue;
    if (txAccount && accountNorm(item.accountName) !== txAccount) continue;
    if (Math.abs((item.amountCents || 0) - amountCents) > amountTolerance) continue;
    if (item.dateISO && dateTs && Math.abs(new Date(item.dateISO).getTime() - dateTs) > 5 * dayMs) continue;
    if (txName && nameNorm(item.title).slice(0, 20) !== txName.slice(0, 20)) continue;
    return item;
  }
  return null;
}

/**
 * Find existing detected item by account + amount + date proximity (duplicate prevention).
 * Only matches plaid items in same sourceMode. Does not match resolved/ignored (preserve user state).
 */
function findExistingByAccountAmountDate(existing, accountName, amountCents, dateISO, sourceMode) {
  const dayMs = 24 * 60 * 60 * 1000;
  const amountTolerance = 5;
  const dateTs = dateISO ? new Date(dateISO).getTime() : 0;
  const accountNorm = (a) => (a || '').toLowerCase().trim();
  const txAccount = accountNorm(accountName);
  for (const i of existing) {
    if (i.source !== 'plaid') continue;
    if ((i.sourceMode || 'sandbox') !== sourceMode) continue;
    if (i.status === 'resolved' || i.status === 'ignored') continue;
    if (txAccount && accountNorm(i.accountName) !== txAccount) continue;
    if (Math.abs((i.amountCents || 0) - amountCents) > amountTolerance) continue;
    if (i.dateISO && dateTs && Math.abs(new Date(i.dateISO).getTime() - dateTs) > 2 * dayMs) continue;
    return i;
  }
  return null;
}

/**
 * Process a single Plaid transaction (from sync added/modified) into detected activity.
 * Returns the normalized item; caller merges into existing list and byPlaidId.
 */
function processOneTransaction(tx, accountById, existing, byPlaidId, environment, sourceMode) {
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
    const fallback = findMatchingDetectedItem(existing, amount, dateISO, name, accountName, sourceMode);
    if (fallback) existingItem = fallback;
  }
  let duplicatePrevented = false;
  if (!existingItem) {
    const dup = findExistingByAccountAmountDate(existing, accountName, amount, dateISO, sourceMode);
    if (dup) {
      existingItem = dup;
      duplicatePrevented = true;
    }
  }
  const item = normalizePlaidTransaction(tx, accountName, accountType, existingItem || undefined, environment);
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
  return { duplicatePrevented };
}

/**
 * Core refresh: cursor-based transactions/sync. Processes added, modified, removed.
 * Preserves resolved/ignored; merges pending->posted; one source of truth.
 * Caller must hold sync lock and handle rate limit.
 */
async function refreshDetectedActivityFromPlaidCore(itemIds = []) {
  const list = getAccessTokensList();
  const env = PLAID_ENV.toLowerCase();
  const idsToRefresh = itemIds.length > 0
    ? list.filter((e) => itemIds.includes(e.itemId) && e.environment === env).map((e) => e.itemId)
    : list.filter((e) => e.environment === env).map((e) => e.itemId);
  if (idsToRefresh.length === 0) return { added: 0, modified: 0, removed: 0, duplicatesPrevented: 0 };

  const client = getPlaidClient();
  const listById = new Map(list.map((e) => [e.itemId, e]));
  let totalAdded = 0;
  let totalModified = 0;
  let totalRemoved = 0;
  let totalDuplicatesPrevented = 0;

  for (const itemId of idsToRefresh) {
    const entry = listById.get(itemId);
    if (!entry || entry.environment !== env) continue;
    const { accessToken, environment } = entry;
    const sourceMode = environment === 'sandbox' ? 'sandbox' : 'real_pilot';

    let cursor = getCursorForItem(itemId);
    let existing = getDetectedItems();
    const byPlaidId = new Map(existing.filter((i) => i.plaidTransactionId).map((i) => [i.plaidTransactionId, i]));
    let itemAdded = 0;
    let itemModified = 0;
    let itemRemoved = 0;
    let itemDuplicates = 0;

    console.log('[plaid sync] item', itemId.slice(0, 8) + '...', 'sync started', cursor ? '(incremental)' : '(initial)');

    const accountById = new Map();
    try {
      for (;;) {
        const request = { access_token: accessToken };
        if (cursor) request.cursor = cursor;

        const res = await client.transactionsSync(request);
        for (const a of res.data.accounts || []) {
          accountById.set(a.account_id, a);
        }

        for (const tx of res.data.added || []) {
          const { duplicatePrevented } = processOneTransaction(tx, accountById, existing, byPlaidId, environment, sourceMode);
          if (duplicatePrevented) itemDuplicates += 1;
          itemAdded += 1;
        }
        for (const tx of res.data.modified || []) {
          const existingItem = byPlaidId.get(tx.transaction_id) || (tx.pending_transaction_id ? byPlaidId.get(tx.pending_transaction_id) : null);
          const acc = accountById.get(tx.account_id);
          const accountName = acc?.name || 'Unknown';
          const accountType = (acc?.type || 'other').replace(/-/g, '_');
          const normalized = normalizePlaidTransaction(tx, accountName, accountType, existingItem || undefined, environment);
          if (existingItem) {
            if (existingItem.plaidTransactionId && existingItem.plaidTransactionId !== tx.transaction_id) byPlaidId.delete(existingItem.plaidTransactionId);
            const idx = existing.findIndex((i) => i.id === existingItem.id);
            if (idx !== -1) existing[idx] = normalized;
            byPlaidId.set(tx.transaction_id, normalized);
          } else {
            byPlaidId.set(tx.transaction_id, normalized);
            existing.push(normalized);
          }
          itemModified += 1;
        }
        for (const r of res.data.removed || []) {
          const tid = r.transaction_id;
          const idx = existing.findIndex((i) => i.plaidTransactionId === tid);
          if (idx !== -1) {
            const item = existing[idx];
            existing[idx] = {
              ...item,
              plaidRemoved: true,
              ...(item.status === 'new' || item.status === 'in_progress' ? { status: 'removed' } : {}),
            };
            byPlaidId.delete(tid);
            itemRemoved += 1;
          }
        }

        cursor = res.data.next_cursor;
        if (!res.data.has_more) break;
      }

      setDetectedItems(existing);
      const nowIso = new Date().toISOString();
      setSyncStateItem(itemId, {
        transactionsSyncCursor: cursor,
        lastSyncTime: nowIso,
        lastTransactionFetchCount: itemAdded + itemModified + itemRemoved,
      });

      totalAdded += itemAdded;
      totalModified += itemModified;
      totalRemoved += itemRemoved;
      totalDuplicatesPrevented += itemDuplicates;

      console.log('[plaid sync] item', itemId.slice(0, 8) + '...', 'completed', 'added:', itemAdded, 'modified:', itemModified, 'removed:', itemRemoved, 'duplicates_prevented:', itemDuplicates, 'cursor advanced:', !!cursor);
    } catch (e) {
      if (e.response?.data?.error_code === 'PRODUCT_NOT_READY') continue;
      console.error('[plaid sync] item', itemId.slice(0, 8) + '...', 'sync failed', e.response?.data?.error_message || e.message);
    }
  }

  const processed = totalAdded + totalModified + totalRemoved;
  return { processed, added: totalAdded, modified: totalModified, removed: totalRemoved, duplicatesPrevented: totalDuplicatesPrevented };
}

/**
 * Single entry point for sync: lock, rate limit, then core refresh.
 * Used by both webhook and manual sync. Returns { skipped } when no work done (lock or rate limit).
 */
async function refreshDetectedActivityFromPlaid(itemIds = [], options = {}) {
  const { fromWebhook = false } = options;
  const list = getAccessTokensList();
  const env = PLAID_ENV.toLowerCase();
  const idsToRun = itemIds.length > 0
    ? list.filter((e) => itemIds.includes(e.itemId) && e.environment === env).map((e) => e.itemId)
    : list.filter((e) => e.environment === env).map((e) => e.itemId);

  if (idsToRun.length === 0) {
    if (fromWebhook) console.log('[plaid sync] webhook: no items to sync');
    return { skipped: false };
  }

  if (!acquireSyncLock()) {
    console.log('[plaid sync] skipped: sync already running');
    return { skipped: true };
  }
  const toRefresh = idsToRun.filter((id) => !isRateLimited(id));
  const skippedRateLimit = idsToRun.length - toRefresh.length;
  if (skippedRateLimit > 0) {
    console.log('[plaid sync] rate limited: skipped', skippedRateLimit, 'item(s)');
  }
  if (toRefresh.length === 0) {
    releaseSyncLock();
    return { skipped: true };
  }

  try {
    if (fromWebhook) {
      console.log('[plaid sync] webhook-triggered sync started', toRefresh.map((id) => id.slice(0, 8) + '...'));
    } else {
      console.log('[plaid sync] sync started', toRefresh.length, 'item(s)');
    }
    const result = await refreshDetectedActivityFromPlaidCore(toRefresh.length ? toRefresh : []);
    console.log('[plaid sync] sync completed', 'added:', result.added, 'modified:', result.modified, 'removed:', result.removed, 'duplicates_prevented:', result.duplicatesPrevented);
    const nowIso = new Date().toISOString();
    try {
      const pilot = readJson(PILOT_STATUS_FILE, {});
      if (fromWebhook) {
        pilot.lastWebhookSyncAt = nowIso;
      } else {
        pilot.lastManualSyncAt = nowIso;
      }
      writeJson(PILOT_STATUS_FILE, pilot);
    } catch (_) {}
    return { skipped: false };
  } catch (err) {
    console.error('[plaid sync] sync failed', err.message);
    return { skipped: false };
  } finally {
    releaseSyncLock();
  }
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

// POST /api/plaid/create_link_token — backend only; no secrets sent to client.
app.post('/api/plaid/create_link_token', async (req, res) => {
  try {
    const client = getPlaidClient();
    const isProduction = PLAID_ENV.toLowerCase() === 'production';
    const response = await client.linkTokenCreate({
      user: { client_user_id: isProduction ? 'iisauhwallet-pilot' : 'iisauhwallet-sandbox' },
      client_name: 'iisauhwallet',
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
    const env = PLAID_ENV.toLowerCase();
    if (env !== 'sandbox') {
      const list = getAccessTokensList();
      const realCount = list.filter((e) => e.environment !== 'sandbox').length;
      if (realCount >= 1) {
        return res.status(400).json({
          error: 'Pilot mode is limited to one real account. Disconnect the existing real account first to link another.',
        });
      }
    }
    const client = getPlaidClient();
    const response = await client.itemPublicTokenExchange({ public_token });
    const accessToken = response.data.access_token;
    const itemId = response.data.item_id;
    setAccessToken(itemId, accessToken, env);
    return res.json({ item_id: itemId, ok: true });
  } catch (err) {
    const data = err.response?.data || { error_message: err.message };
    console.error('exchange_public_token error', data);
    return res.status(500).json({ error: data.error_message || 'Exchange failed' });
  }
});

// POST /api/plaid/sync_transactions (manual; same pipeline as webhook)
app.post('/api/plaid/sync_transactions', async (req, res) => {
  try {
    const list = getAccessTokensList();
    if (list.length === 0) {
      return res.json({ synced: 0, message: 'No linked items' });
    }
    const result = await refreshDetectedActivityFromPlaid([], { fromWebhook: false });
    const existing = getDetectedItems();
    const payload = { synced: existing.filter((i) => i.source === 'plaid').length, total: existing.length };
    if (result?.skipped) payload.skipped = true;
    return res.json(payload);
  } catch (err) {
    const data = err.response?.data || { error_message: err.message };
    console.error('[plaid sync] sync_transactions error', data);
    return res.status(500).json({ error: data.error_message || 'Sync failed' });
  }
});

// GET /api/plaid/accounts — snapshot of Plaid accounts and balances (assets/liabilities only; no ledger changes)
app.get('/api/plaid/accounts', async (req, res) => {
  try {
    const primary = getPrimaryAccessTokenForEnv();
    if (!primary) {
      return res.json({
        ok: true,
        environment: PLAID_ENV,
        institutionName: null,
        accounts: [],
        summary: null,
        message: 'No linked Plaid items',
      });
    }

    const client = getPlaidClient();
    const accessToken = primary.accessToken;
    const env = (primary.environment || PLAID_ENV || 'sandbox').toLowerCase();
    let institutionName = null;

    try {
      const itemRes = await client.itemGet({ access_token: accessToken });
      const institutionId = itemRes.data.item?.institution_id;
      if (institutionId) {
        const instRes = await client.institutionsGetById({
          institution_id: institutionId,
          country_codes: ['US'],
        });
        institutionName = instRes.data.institution?.name || null;
      }
    } catch (e) {
      console.warn('[plaid accounts] failed to fetch institution metadata', e.response?.data || e.message);
    }

    const accountsRes = await client.accountsGet({ access_token: accessToken });
    const rawAccounts = accountsRes.data.accounts || [];

    function toNumberOrNull(value) {
      if (value === null || value === undefined) return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }

    const sourceMode = env === 'sandbox' ? 'sandbox' : 'real_pilot';
    const normalized = rawAccounts.map((a) => {
      const currentRaw = toNumberOrNull(a.balances?.current ?? a.balances?.available);
      const availableRaw = toNumberOrNull(a.balances?.available);
      const currentCents = currentRaw != null ? Math.round(currentRaw * 100) : null;
      const availableCents = availableRaw != null ? Math.round(availableRaw * 100) : null;
      const isoCurrencyCode =
        a.balances?.iso_currency_code || a.balances?.unofficial_currency_code || null;
      return {
        institutionName,
        accountId: a.account_id,
        name: a.name || '',
        officialName: a.official_name || null,
        mask: a.mask || null,
        type: a.type || '',
        subtype: a.subtype || null,
        currentBalance: currentCents,
        availableBalance: availableCents,
        isoCurrencyCode,
        source: 'plaid',
        sourceMode,
      };
    });

    // #region agent log
    try {
      if (typeof fetch === 'function') {
        fetch('http://127.0.0.1:7458/ingest/27b509c0-59e8-4a4f-9012-8a8e58914640', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Debug-Session-Id': 'e20ffd',
          },
          body: JSON.stringify({
            sessionId: 'e20ffd',
            runId: 'balances',
            hypothesisId: 'H3',
            location: 'server/index.js:664-693',
            message: 'Plaid accounts raw vs normalized',
            data: rawAccounts.map((a, idx) => ({
              accountId: a.account_id,
              name: a.name,
              rawCurrent: a.balances?.current,
              rawAvailable: a.balances?.available,
              normalizedCurrentCents: normalized[idx]?.currentBalance,
              normalizedAvailableCents: normalized[idx]?.availableBalance,
              isoCurrencyCode:
                a.balances?.iso_currency_code || a.balances?.unofficial_currency_code || null,
            })),
            timestamp: Date.now(),
          }),
        }).catch(() => {});
      }
    } catch {
      // ignore debug logging failures
    }
    // #endregion

    function isLiability(acc) {
      const t = (acc.type || '').toLowerCase();
      const s = (acc.subtype || '').toLowerCase();
      return t === 'credit' || t === 'loan' || s === 'credit card' || s === 'credit';
    }

    function isCash(acc) {
      const t = (acc.type || '').toLowerCase();
      const s = (acc.subtype || '').toLowerCase();
      return t === 'depository' && ['checking', 'savings', 'money market'].includes(s);
    }

    function isInvestment(acc) {
      const t = (acc.type || '').toLowerCase();
      const s = (acc.subtype || '').toLowerCase();
      return (
        t === 'investment' ||
        ['brokerage', '401k', 'ira', 'roth', 'hsa'].some((k) => s.includes(k))
      );
    }

    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalCash = 0;
    let totalCredit = 0;
    let totalInvestments = 0;

    for (const acc of normalized) {
      const bal = typeof acc.currentBalance === 'number' ? acc.currentBalance : 0;
      if (!Number.isFinite(bal)) continue;

      if (isLiability(acc)) {
        const liability = bal < 0 ? -bal : bal;
        totalLiabilities += liability;
        totalCredit += liability;
      } else {
        if (bal > 0) totalAssets += bal;
        if (isCash(acc)) totalCash += bal;
        if (isInvestment(acc)) totalInvestments += bal;
      }
    }

    const netWorth = totalAssets - totalLiabilities;

    return res.json({
      ok: true,
      environment: env,
      institutionName,
      accounts: normalized,
      summary: {
        totalAssets,
        totalLiabilities,
        totalCash,
        totalCredit,
        totalInvestments,
        netWorth,
      },
    });
  } catch (e) {
    const msg = e.response?.data?.error_message || e.message || 'Failed to fetch Plaid accounts';
    console.error('[plaid accounts] error', e.response?.data || e.message);
    return res.status(500).json({ error: msg });
  }
});

// GET /api/plaid/transactions/sync — trigger transactions sync and return queue counts (same as POST sync_transactions).
app.get('/api/plaid/transactions/sync', async (req, res) => {
  try {
    const list = getAccessTokensList();
    if (list.length === 0) {
      return res.json({ synced: 0, total: 0, message: 'No linked items' });
    }
    await refreshDetectedActivityFromPlaid([], { fromWebhook: false });
    const existing = getDetectedItems();
    const synced = existing.filter((i) => i.source === 'plaid').length;
    return res.json({ synced, total: existing.length });
  } catch (err) {
    const data = err.response?.data || { error_message: err.message };
    console.error('[plaid sync] transactions/sync error', data);
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
  const hasToken = itemId && (typeof tokens[itemId] === 'string' ? tokens[itemId] : tokens[itemId]?.accessToken);
  const shouldRefresh = !!hasToken;
  const removedSet = Array.isArray(removedIds) && removedIds.length ? new Set(removedIds) : null;
  setImmediate(() => {
    (async () => {
      if (shouldRefresh) {
        await refreshDetectedActivityFromPlaid([itemId], { fromWebhook: true }).catch((err) => {
          console.error('[plaid sync] webhook refresh failed', err.message);
        });
      }
      if (removedSet && removedSet.size > 0) {
        const existing = getDetectedItems();
        const next = existing.filter((i) => !i.plaidTransactionId || !removedSet.has(i.plaidTransactionId));
        if (next.length !== existing.length) setDetectedItems(next);
      }
    })();
  });
});

// --- Suggested action and transfer-pair (UX only; no auto-posting) ---
const ACTION_LABELS = {
  add_purchase: 'Add purchase',
  pending_in: 'Pending inbound',
  pending_out: 'Pending outbound',
  transfer: 'Transfer between cash and investing',
  review_manually: 'Review manually',
  suggest_ignore: 'Ignore / likely irrelevant',
};

function computeSuggestedAction(item) {
  const title = (item.title || '').toLowerCase();
  const accountType = (item.accountType || '').toLowerCase();
  const amountCents = item.amountCents ?? 0;
  const isInbound = amountCents > 0;

  const incomingKeywords = ['venmo', 'zelle', 'paypal', 'ach credit', 'transfer in', 'deposit', 'direct dep'];
  const outgoingKeywords = ['ach', 'transfer out', 'payment', 'withdrawal', 'wire'];
  const hasIncoming = incomingKeywords.some((k) => title.includes(k));
  const hasOutgoing = outgoingKeywords.some((k) => title.includes(k));

  const isCredit = accountType.includes('credit');
  const isBank = accountType.includes('depository') || accountType.includes('checking') || accountType.includes('savings') || accountType === 'bank';

  if (isCredit) return 'add_purchase';
  if (isInbound && (hasIncoming || title.includes('transfer'))) return 'pending_in';
  if (!isInbound && isBank && (hasOutgoing || title.includes('transfer'))) return 'pending_out';
  return 'review_manually';
}

function buildHeuristicReason(item, suggested) {
  const title = (item.title || '').toLowerCase();
  const accountType = (item.accountType || '').toLowerCase();
  const amountCents = item.amountCents ?? 0;
  const isInbound = amountCents > 0;
  const isCredit = accountType.includes('credit');
  const isBank = accountType.includes('depository') || accountType.includes('checking') || accountType.includes('savings') || accountType === 'bank';
  const refundNote = (item.likelyRefund || item.likelyReversal) ? ' Possible refund/reversal detected (inbound or keywords).' : '';
  if (suggested === 'add_purchase') return `Likely credit card purchase (account type is credit).${refundNote}`;
  if (suggested === 'pending_in') return `Inbound transaction with transfer/incoming keywords.${refundNote}`;
  if (suggested === 'pending_out') return `Outbound from bank with transfer/payment keywords.${refundNote}`;
  if (suggested === 'transfer') return 'Possible transfer pair with matching opposite transaction (amount/date).';
  return `No strong pattern; review manually.${refundNote}`;
}

function ruleToSummary(rule) {
  if (!rule) return '';
  const typeLabels = { merchant_exact: 'merchant is', merchant_contains: 'merchant contains', description_contains: 'description contains', account_description_contains: 'account + description contains', account_merchant: 'account + merchant' };
  const t = typeLabels[rule.matchType] || rule.matchType;
  const v = (rule.matchValue || '').slice(0, 40);
  const action = ACTION_LABELS[rule.actionSuggestion] || rule.actionSuggestion;
  return `${t} "${v}" → ${action}`;
}

/** Best-effort: detect likely refund or reversal (positive inflow on credit, or description keywords). */
function detectLikelyRefundOrReversal(item) {
  const title = (item.title || '').toLowerCase();
  const accountType = (item.accountType || '').toLowerCase();
  const amountCents = item.amountCents ?? 0;
  const isInbound = amountCents > 0;
  const refundKeywords = ['refund', 'reversal', 'returned', 'adjustment'];
  const hasRefundKeyword = refundKeywords.some((k) => title.includes(k));
  const hasCreditWord = /\bcredit\b/.test(title) && !title.includes('credit card');
  const isCredit = accountType.includes('credit');
  const likelyReversal = hasRefundKeyword && (title.includes('reversal') || title.includes('revers'));
  const likelyRefund = isInbound && (
    (isCredit && (hasRefundKeyword || hasCreditWord)) ||
    (!isCredit && (hasRefundKeyword || hasCreditWord))
  );
  return {
    likelyRefund: !!likelyRefund || (!!likelyReversal && isInbound),
    likelyReversal: !!likelyReversal,
  };
}

function findTransferPairs(items) {
  const active = items.filter((i) => (i.status === 'new' || i.status === 'in_progress') && i.source === 'plaid');
  const pairs = new Map();
  const dayMs = 24 * 60 * 60 * 1000;
  const amountTolerance = 5;

  for (let i = 0; i < active.length; i++) {
    if (pairs.has(active[i].id)) continue;
    const a = active[i];
    const aAmount = Math.abs(a.amountCents || 0);
    const aDate = a.dateISO ? new Date(a.dateISO).getTime() : 0;
    const aType = (a.accountType || '').toLowerCase();
    const aTitle = (a.title || '').toLowerCase();
    const aIsBank = aType.includes('depository') || aType.includes('checking') || aType.includes('savings') || aType === 'bank';
    const aIsInvest = aType.includes('investment') || aType.includes('brokerage');

    for (let j = i + 1; j < active.length; j++) {
      if (pairs.has(active[j].id)) continue;
      const b = active[j];
      if (a.id === b.id) continue;
      const oppositeSign = (a.amountCents || 0) * (b.amountCents || 0) < 0;
      if (!oppositeSign) continue;
      if (Math.abs(aAmount - Math.abs(b.amountCents || 0)) > amountTolerance) continue;
      const bDate = b.dateISO ? new Date(b.dateISO).getTime() : 0;
      if (aDate && bDate && Math.abs(aDate - bDate) > 5 * dayMs) continue;
      const bType = (b.accountType || '').toLowerCase();
      const bIsBank = bType.includes('depository') || bType.includes('checking') || bType.includes('savings') || bType === 'bank';
      const bIsInvest = bType.includes('investment') || bType.includes('brokerage');
      const transferLike = aTitle.includes('transfer') || (b.title || '').toLowerCase().includes('transfer') || aTitle.includes('ach') || (b.title || '').toLowerCase().includes('ach');
      if ((aIsBank && bIsInvest) || (aIsInvest && bIsBank) || (aIsBank && bIsBank && transferLike)) {
        pairs.set(a.id, b.id);
        pairs.set(b.id, a.id);
        break;
      }
    }
  }
  return pairs;
}

function enrichWithSuggestions(items) {
  const rules = getRules();
  const pairs = findTransferPairs(items);
  return items.map((item) => {
    const { likelyRefund, likelyReversal } = detectLikelyRefundOrReversal(item);
    const matchedRule = findMatchingRule(rules, item);
    let suggested;
    let suggestedFromRule = false;
    let suggestionSource = 'heuristic';
    let suggestionReason = '';
    let matchedRuleId;
    let matchedRuleSummary;
    if (matchedRule && matchedRule.actionSuggestion) {
      suggested = matchedRule.actionSuggestion;
      suggestedFromRule = true;
      suggestionSource = 'rule';
      matchedRuleId = matchedRule.id;
      matchedRuleSummary = ruleToSummary(matchedRule);
      suggestionReason = `Matched saved rule: ${matchedRuleSummary}`;
    } else if (pairs.has(item.id)) {
      suggested = 'transfer';
      suggestionSource = 'transfer_match';
      suggestionReason = 'Possible transfer pair detected with matching opposite transaction (amount and date).';
    } else {
      suggested = computeSuggestedAction(item);
      suggestionReason = buildHeuristicReason({ ...item, likelyRefund, likelyReversal }, suggested);
    }
    const possibleTransferMatchId = pairs.get(item.id) || undefined;
    return {
      ...item,
      suggestedAction: suggested,
      suggestedFromRule: suggestedFromRule || undefined,
      possibleTransferMatchId,
      likelyRefund: likelyRefund || undefined,
      likelyReversal: likelyReversal || undefined,
      suggestionSource: suggestionSource || undefined,
      suggestionReason: suggestionReason || undefined,
      matchedRuleId: matchedRuleId || undefined,
      matchedRuleSummary: matchedRuleSummary || undefined,
    };
  });
}

// GET /api/detected-activity
app.get('/api/detected-activity', (req, res) => {
  const items = getDetectedItems();
  const enriched = enrichWithSuggestions(items);
  return res.json({ items: enriched });
});

// POST /api/detected-activity/enrich-item — run a single item (e.g. test) through same suggestion/rules logic. No persistence.
app.post('/api/detected-activity/enrich-item', (req, res) => {
  const body = req.body || {};
  const {
    id,
    title,
    amountCents,
    dateISO,
    accountName,
    accountType,
    pending,
    source,
  } = body;
  if (!title || amountCents == null || !dateISO || !accountName || !accountType) {
    return res.status(400).json({ error: 'title, amountCents, dateISO, accountName, accountType required' });
  }
  const item = {
    id: id || `test_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    source: source || 'test',
    title: String(title).trim().slice(0, 200),
    amountCents: Number(amountCents),
    dateISO: String(dateISO).slice(0, 10),
    accountName: String(accountName).trim().slice(0, 100),
    accountType: String(accountType).trim().slice(0, 50),
    pending: !!pending,
    status: 'new',
  };
  const enriched = enrichWithSuggestions([item]);
  return res.json({ item: enriched[0] });
});

// POST /api/detected-activity/:id/ignore
app.post('/api/detected-activity/:id/ignore', (req, res) => {
  const { id } = req.params;
  const items = getDetectedItems();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  items[idx] = { ...items[idx], status: 'ignored', lastUpdatedAt: new Date().toISOString() };
  setDetectedItems(items);
  return res.json({ ok: true });
});

// POST /api/detected-activity/:id/resolve
app.post('/api/detected-activity/:id/resolve', (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const { resolvedAs, linkedPurchaseId, linkedPurchaseTitle, linkedPurchaseDateISO, linkedPurchaseAmountCents } = body;
  const items = getDetectedItems();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const nowIso = new Date().toISOString();
  const next = { ...items[idx], status: 'resolved', resolvedAs: resolvedAs || undefined, resolvedAt: nowIso, lastUpdatedAt: nowIso };
  if (linkedPurchaseId != null) {
    next.linkedPurchaseId = linkedPurchaseId;
    next.linkedPurchaseTitle = linkedPurchaseTitle != null ? String(linkedPurchaseTitle).slice(0, 200) : undefined;
    next.linkedPurchaseDateISO = linkedPurchaseDateISO != null ? String(linkedPurchaseDateISO).slice(0, 10) : undefined;
    next.linkedPurchaseAmountCents = typeof linkedPurchaseAmountCents === 'number' ? linkedPurchaseAmountCents : undefined;
  } else {
    next.linkedPurchaseId = undefined;
    next.linkedPurchaseTitle = undefined;
    next.linkedPurchaseDateISO = undefined;
    next.linkedPurchaseAmountCents = undefined;
  }
  items[idx] = next;
  setDetectedItems(items);
  return res.json({ ok: true });
});

// POST /api/detected-activity/:id/reset (testing: set status back to new)
app.post('/api/detected-activity/:id/reset', (req, res) => {
  const { id } = req.params;
  const items = getDetectedItems();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const item = items[idx];
  items[idx] = {
    ...item,
    status: 'new',
    resolvedAs: undefined,
    resolvedAt: undefined,
    linkedPurchaseId: undefined,
    linkedPurchaseTitle: undefined,
    linkedPurchaseDateISO: undefined,
    linkedPurchaseAmountCents: undefined,
    lastUpdatedAt: new Date().toISOString(),
  };
  setDetectedItems(items);
  return res.json({ ok: true });
});

// --- Detected activity rules (suggestions only) ---
// GET /api/detected-activity/rules
app.get('/api/detected-activity/rules', (req, res) => {
  const rules = getRules();
  return res.json({ rules });
});

// POST /api/detected-activity/rules
app.post('/api/detected-activity/rules', (req, res) => {
  const body = req.body || {};
  const { matchType, matchValue, accountName, direction, actionSuggestion } = body;
  if (!matchType || !matchValue || !actionSuggestion) {
    return res.status(400).json({ error: 'matchType, matchValue, and actionSuggestion required' });
  }
  if (!RULE_MATCH_TYPES.includes(matchType)) {
    return res.status(400).json({ error: 'Invalid matchType' });
  }
  if (!RULE_ACTIONS.includes(actionSuggestion)) {
    return res.status(400).json({ error: 'Invalid actionSuggestion' });
  }
  const rules = getRules();
  const id = `rule_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date().toISOString();
  const rule = {
    id,
    enabled: true,
    matchType,
    matchValue: String(matchValue).trim().slice(0, 200),
    accountName: accountName != null ? String(accountName).trim().slice(0, 100) : undefined,
    direction: direction && ['inflow', 'outflow', 'any'].includes(direction) ? direction : 'any',
    actionSuggestion,
    priority: Number.isFinite(body.priority) ? body.priority : 0,
    createdAt: now,
    updatedAt: now,
  };
  rules.push(rule);
  setRules(rules);
  return res.status(201).json({ rule });
});

// PATCH /api/detected-activity/rules/:id
app.patch('/api/detected-activity/rules/:id', (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const rules = getRules();
  const idx = rules.findIndex((r) => r.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const r = rules[idx];
  if (body.enabled !== undefined) r.enabled = !!body.enabled;
  if (body.matchType && RULE_MATCH_TYPES.includes(body.matchType)) r.matchType = body.matchType;
  if (body.matchValue !== undefined) r.matchValue = String(body.matchValue).trim().slice(0, 200);
  if (body.accountName !== undefined) r.accountName = body.accountName ? String(body.accountName).trim().slice(0, 100) : undefined;
  if (body.direction !== undefined) r.direction = ['inflow', 'outflow', 'any'].includes(body.direction) ? body.direction : 'any';
  if (body.actionSuggestion && RULE_ACTIONS.includes(body.actionSuggestion)) r.actionSuggestion = body.actionSuggestion;
  if (body.priority !== undefined && Number.isFinite(body.priority)) r.priority = body.priority;
  r.updatedAt = new Date().toISOString();
  setRules(rules);
  return res.json({ rule: r });
});

// DELETE /api/detected-activity/rules/:id
app.delete('/api/detected-activity/rules/:id', (req, res) => {
  const { id } = req.params;
  const rules = getRules();
  const idx = rules.findIndex((r) => r.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  rules.splice(idx, 1);
  setRules(rules);
  return res.json({ ok: true });
});

// --- Plaid pilot diagnostics and recovery (queue only; no ledger changes) ---
function getPilotStatusData() {
  const pilot = readJson(PILOT_STATUS_FILE, {});
  const items = getDetectedItems();
  const plaidItems = items.filter((i) => i.source === 'plaid');
  const sandbox = plaidItems.filter((i) => (i.sourceMode || i.sourceEnvironment || 'sandbox') === 'sandbox');
  const realPilot = plaidItems.filter((i) => (i.sourceMode || i.sourceEnvironment) === 'real_pilot');
  const count = (arr, status) => arr.filter((i) => i.status === status).length;
  const newCount = (arr) => count(arr, 'new') + count(arr, 'in_progress');
  return {
    plaidMode: (PLAID_ENV || 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox',
    lastManualSyncAt: pilot.lastManualSyncAt || null,
    lastWebhookSyncAt: pilot.lastWebhookSyncAt || null,
    counts: {
      new: newCount(plaidItems),
      ignored: count(plaidItems, 'ignored'),
      resolved: count(plaidItems, 'resolved'),
    },
    bySource: {
      sandbox: { new: newCount(sandbox), ignored: count(sandbox, 'ignored'), resolved: count(sandbox, 'resolved') },
      real_pilot: { new: newCount(realPilot), ignored: count(realPilot, 'ignored'), resolved: count(realPilot, 'resolved') },
    },
  };
}

app.get('/api/plaid/pilot-status', (req, res) => {
  try {
    return res.json(getPilotStatusData());
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to get pilot status' });
  }
});

app.post('/api/plaid/pilot/clear-sandbox-detected', (req, res) => {
  try {
    const items = getDetectedItems();
    const next = items.filter((i) => i.source !== 'plaid' || ((i.sourceMode || i.sourceEnvironment || 'sandbox') !== 'sandbox'));
    setDetectedItems(next);
    return res.json({ ok: true, removed: items.length - next.length });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to clear sandbox detected items' });
  }
});

app.post('/api/plaid/pilot/clear-resolved-sandbox', (req, res) => {
  try {
    const items = getDetectedItems();
    const next = items.filter(
      (i) =>
        !(i.source === 'plaid' && (i.sourceMode || i.sourceEnvironment || 'sandbox') === 'sandbox' && i.status === 'resolved')
    );
    setDetectedItems(next);
    return res.json({ ok: true, removed: items.length - next.length });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to clear resolved sandbox items' });
  }
});

app.post('/api/plaid/pilot/resync', async (req, res) => {
  try {
    const body = req.body || {};
    const itemId = body.itemId && typeof body.itemId === 'string' ? body.itemId.trim() : null;
    await refreshDetectedActivityFromPlaid(itemId ? [itemId] : [], { fromWebhook: false });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Resync failed' });
  }
});

app.post('/api/plaid/pilot/rebuild-queue', async (req, res) => {
  try {
    await refreshDetectedActivityFromPlaid([], { fromWebhook: false });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Rebuild failed' });
  }
});

// POST /api/plaid/pilot/disconnect-real — local pilot-only: remove real-account access tokens and items
app.post('/api/plaid/pilot/disconnect-real', (req, res) => {
  try {
    const { removedTokens, removedItems } = clearRealPilotAccessTokensAndItems();
    return res.json({ ok: true, removedTokens, removedItems });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to disconnect real pilot account' });
  }
});

// Health (no Plaid creds required)
app.get('/api/health', (req, res) => {
  const hasCreds = !!(PLAID_CLIENT_ID && PLAID_SECRET);
  return res.json({ ok: true, plaid_configured: hasCreds, env: PLAID_ENV });
});

ensureStore();

app.listen(PORT, () => {
  console.log(`iisauhwallet backend listening on http://localhost:${PORT}`);
  if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
    console.warn('WARN: PLAID_CLIENT_ID or PLAID_SECRET not set. Plaid endpoints will fail.');
  }
});
