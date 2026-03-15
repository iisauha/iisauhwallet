/**
 * Device wallet sync: create pairing code, join with code, get/put wallet payload.
 * Last-write-wins. In-memory store; pairing codes expire after 15 minutes.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WALLET_STORE_FILE = path.join(__dirname, '.store', 'wallet_sync.json');
const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function ensureStore() {
  const dir = path.dirname(WALLET_STORE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadStore() {
  try {
    const raw = fs.readFileSync(WALLET_STORE_FILE, 'utf8');
    const data = JSON.parse(raw);
    return {
      wallets: new Map(Object.entries(data.wallets || {}).map(([k, v]) => [k, v])),
      codeToWalletId: new Map(Object.entries(data.codeToWalletId || {}).map(([k, v]) => [k, v])),
    };
  } catch {
    return { wallets: new Map(), codeToWalletId: new Map() };
  }
}

function saveStore(store) {
  ensureStore();
  const data = {
    wallets: Object.fromEntries(store.wallets),
    codeToWalletId: Object.fromEntries(store.codeToWalletId),
  };
  fs.writeFileSync(WALLET_STORE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateWalletId() {
  return 'w_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

let memoryStore = loadStore();

function getStore() {
  return memoryStore;
}

function persistStore(store) {
  memoryStore = store;
  saveStore(store);
}

/** Create a sync code and store the payload. Returns { walletId, pairingCode }. */
export function createSyncCode(payload) {
  const store = getStore();
  const pairingCode = generateCode();
  const walletId = generateWalletId();
  const now = new Date().toISOString();
  store.wallets.set(walletId, {
    payload: payload || {},
    updatedAt: now,
    createdAt: now,
  });
  store.codeToWalletId.set(pairingCode, { walletId, expiresAt: Date.now() + CODE_TTL_MS });
  persistStore(store);
  return { walletId, pairingCode };
}

/** Join with a pairing code. Returns { walletId, payload } or null if invalid/expired. */
export function joinWithCode(pairingCode) {
  const store = getStore();
  const entry = store.codeToWalletId.get(String(pairingCode).trim());
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.codeToWalletId.delete(pairingCode);
    persistStore(store);
    return null;
  }
  const wallet = store.wallets.get(entry.walletId);
  if (!wallet) return null;
  store.codeToWalletId.delete(pairingCode);
  persistStore(store);
  return { walletId: entry.walletId, payload: wallet.payload, updatedAt: wallet.updatedAt };
}

/** Get current wallet state. */
export function getWallet(walletId) {
  const store = getStore();
  const wallet = store.wallets.get(walletId);
  if (!wallet) return null;
  return { payload: wallet.payload, updatedAt: wallet.updatedAt };
}

/** Update wallet state (last-write-wins). */
export function putWallet(walletId, payload) {
  const store = getStore();
  if (!store.wallets.has(walletId)) return false;
  const now = new Date().toISOString();
  store.wallets.set(walletId, {
    payload: payload || {},
    updatedAt: now,
    createdAt: store.wallets.get(walletId).createdAt || now,
  });
  persistStore(store);
  return true;
}

export function registerWalletSyncRoutes(app) {
  app.post('/api/sync/create-code', (req, res) => {
    try {
      const { payload } = req.body || {};
      const { walletId, pairingCode } = createSyncCode(payload);
      return res.json({ ok: true, walletId, pairingCode });
    } catch (e) {
      console.error('[wallet sync] create-code error', e.message);
      return res.status(500).json({ error: e.message || 'Failed to create sync code' });
    }
  });

  app.post('/api/sync/join', (req, res) => {
    try {
      const { pairingCode } = req.body || {};
      if (!pairingCode) return res.status(400).json({ error: 'pairingCode required' });
      const result = joinWithCode(String(pairingCode).trim());
      if (!result) return res.status(404).json({ error: 'Invalid or expired pairing code' });
      return res.json({ ok: true, walletId: result.walletId, payload: result.payload, updatedAt: result.updatedAt });
    } catch (e) {
      console.error('[wallet sync] join error', e.message);
      return res.status(500).json({ error: e.message || 'Failed to join' });
    }
  });

  app.get('/api/sync/wallet/:walletId', (req, res) => {
    try {
      const { walletId } = req.params;
      const wallet = getWallet(walletId);
      if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
      return res.json({ ok: true, payload: wallet.payload, updatedAt: wallet.updatedAt });
    } catch (e) {
      console.error('[wallet sync] get wallet error', e.message);
      return res.status(500).json({ error: e.message || 'Failed to get wallet' });
    }
  });

  app.put('/api/sync/wallet/:walletId', (req, res) => {
    try {
      const { walletId } = req.params;
      const { payload } = req.body || {};
      const updated = putWallet(walletId, payload);
      if (!updated) return res.status(404).json({ error: 'Wallet not found' });
      const wallet = getWallet(walletId);
      return res.json({ ok: true, updatedAt: wallet.updatedAt });
    } catch (e) {
      console.error('[wallet sync] put wallet error', e.message);
      return res.status(500).json({ error: e.message || 'Failed to update wallet' });
    }
  });
}
