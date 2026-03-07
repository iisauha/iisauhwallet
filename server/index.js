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
const RULES_FILE = path.join(STORE_DIR, 'detected_activity_rules.json');

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
    ...(!existingItem ? { detectedAt: new Date().toISOString() } : {}),
  };
  if (existingItem) {
    return { ...base, status: existingItem.status, resolvedAs: existingItem.resolvedAs };
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
 * Refresh detected activity from Plaid for given item(s). If itemIds is empty, refresh all.
 * Reuses normalization; preserves resolved/ignored; merges pending->posted.
 */
async function refreshDetectedActivityFromPlaid(itemIds = []) {
  const list = getAccessTokensList();
  const env = PLAID_ENV.toLowerCase();
  const idsToRefresh = itemIds.length > 0
    ? list.filter((e) => itemIds.includes(e.itemId) && e.environment === env).map((e) => e.itemId)
    : list.filter((e) => e.environment === env).map((e) => e.itemId);
  if (idsToRefresh.length === 0) return;
  const client = getPlaidClient();
  const now = new Date();
  const endDate = now.toISOString().slice(0, 10);
  const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let existing = getDetectedItems();
  const byPlaidId = new Map(existing.filter((i) => i.plaidTransactionId).map((i) => [i.plaidTransactionId, i]));

  const listById = new Map(list.map((e) => [e.itemId, e]));
  for (const itemId of idsToRefresh) {
    const entry = listById.get(itemId);
    if (!entry || entry.environment !== env) continue;
    const { accessToken, environment } = entry;
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
      const sourceMode = environment === 'sandbox' ? 'sandbox' : 'real_pilot';
      if (!existingItem && !tx.pending) {
        const fallback = findMatchingDetectedItem(existing, amount, dateISO, name, accountName, sourceMode);
        if (fallback) existingItem = fallback;
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

// POST /api/plaid/sync_transactions (manual fallback; webhooks also trigger refresh)
app.post('/api/plaid/sync_transactions', async (req, res) => {
  try {
    const list = getAccessTokensList();
    if (list.length === 0) {
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
  const hasToken = itemId && (typeof tokens[itemId] === 'string' ? tokens[itemId] : tokens[itemId]?.accessToken);
  const shouldRefresh = !!hasToken;
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

// --- Suggested action and transfer-pair (UX only; no auto-posting) ---
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
    const matchedRule = findMatchingRule(rules, item);
    let suggested;
    let suggestedFromRule = false;
    if (matchedRule && matchedRule.actionSuggestion) {
      suggested = matchedRule.actionSuggestion;
      suggestedFromRule = true;
    } else if (pairs.has(item.id)) {
      suggested = 'transfer';
    } else {
      suggested = computeSuggestedAction(item);
    }
    const possibleTransferMatchId = pairs.get(item.id) || undefined;
    const { likelyRefund, likelyReversal } = detectLikelyRefundOrReversal(item);
    return {
      ...item,
      suggestedAction: suggested,
      suggestedFromRule: suggestedFromRule || undefined,
      possibleTransferMatchId,
      likelyRefund: likelyRefund || undefined,
      likelyReversal: likelyReversal || undefined,
    };
  });
}

// GET /api/detected-activity
app.get('/api/detected-activity', (req, res) => {
  const items = getDetectedItems();
  const enriched = enrichWithSuggestions(items);
  return res.json({ items: enriched });
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
  const body = req.body || {};
  const { resolvedAs, linkedPurchaseId, linkedPurchaseTitle, linkedPurchaseDateISO, linkedPurchaseAmountCents } = body;
  const items = getDetectedItems();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const next = { ...items[idx], status: 'resolved', resolvedAs: resolvedAs || undefined };
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
    linkedPurchaseId: undefined,
    linkedPurchaseTitle: undefined,
    linkedPurchaseDateISO: undefined,
    linkedPurchaseAmountCents: undefined,
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
