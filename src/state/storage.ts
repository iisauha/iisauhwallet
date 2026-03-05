import {
  CASH_STORAGE_KEY,
  CATEGORY_STORAGE_KEY,
  EXPECTED_COSTS_KEY,
  EXPECTED_INCOME_KEY,
  PHYSICAL_CASH_ID,
  STORAGE_KEY,
  UPCOMING_WINDOW_KEY
} from './keys';
import type { CategoryConfig, CreditCard, LedgerData } from './models';

function uid(): string {
  // Same shape as legacy: Date.now().toString(36) + Math.random().toString(36).slice(2)
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function now(): string {
  return new Date().toISOString();
}

const DEFAULT_CARD_NAMES = [
  'Amex Delta Gold',
  'Amex Blue Cash Preferred',
  'US Bank Altitude Reserve',
  'Robinhood Gold Card',
  'Capital One Quicksilver',
  'Discover',
  'Citi Custom Cash',
  'Chase Freedom Unlimited',
  'Venmo Visa',
  'Amazon Store Card'
];

export function defaultData(): LedgerData {
  const banks = [
    { id: uid(), name: 'Bank', type: 'bank' as const, balanceCents: 0, updatedAt: now() },
    { id: PHYSICAL_CASH_ID, name: 'Physical Cash', type: 'physical_cash' as const, balanceCents: 0, updatedAt: now() }
  ];
  const cards: CreditCard[] = DEFAULT_CARD_NAMES.map((name) => ({ id: uid(), name, balanceCents: 0, updatedAt: now() }));
  return {
    banks,
    cards,
    pendingIn: [],
    pendingOut: [],
    purchases: [],
    recurring: [],
    recurringPosted: {}
  };
}

function normalizeText(str: unknown): string {
  if (typeof str !== 'string') return '';
  return str.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function findPhysicalCashBank(d: LedgerData) {
  return (
    (d.banks || []).find(
      (b) => b && (b.id === PHYSICAL_CASH_ID || b.type === 'physical_cash' || normalizeText(b.name) === 'physical cash')
    ) || null
  );
}

function ensurePhysicalCashBank(d: LedgerData) {
  if (!d.banks) d.banks = [];
  let pc = findPhysicalCashBank(d);
  if (!pc) {
    pc = { id: PHYSICAL_CASH_ID, name: 'Physical Cash', type: 'physical_cash', balanceCents: 0, updatedAt: now() };
    d.banks.push(pc);
  } else {
    pc.id = pc.id || PHYSICAL_CASH_ID;
    pc.name = pc.name || 'Physical Cash';
    pc.type = 'physical_cash';
    if (typeof pc.balanceCents !== 'number') pc.balanceCents = 0;
  }
  return pc;
}

function migrateLegacyCashIntoBanksInMemory(d: LedgerData) {
  // Compatibility-only: read legacy cash fields/keys but DO NOT remove/clear any localStorage keys.
  let legacy: number | null = null;
  try {
    const raw = localStorage.getItem(CASH_STORAGE_KEY);
    if (raw !== null) {
      const n = parseInt(raw, 10);
      legacy = Number.isNaN(n) ? 0 : n;
    }
  } catch (_) {
    // ignore
  }

  if (legacy === null && typeof d.cashInHandCents === 'number') legacy = d.cashInHandCents;
  if (legacy !== null) {
    const pc = ensurePhysicalCashBank(d);
    // Only apply if it's a sane number and pc was not already set by newer data.
    if (typeof pc.balanceCents !== 'number') pc.balanceCents = 0;
    if (pc.balanceCents === 0) pc.balanceCents = legacy;
    pc.updatedAt = pc.updatedAt || now();
  }
  // Do not delete d.cashInHandCents; we simply ignore it on save.
}

export function loadData(): LedgerData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    const d = JSON.parse(raw) as LedgerData;

    const defaults = defaultData();
    if (!Array.isArray(d.banks) || d.banks.length === 0) d.banks = defaults.banks;
    if (!Array.isArray(d.cards) || d.cards.length === 0) d.cards = defaults.cards;
    (d.banks || []).forEach((b) => {
      if (b && !(b as any).type) (b as any).type = 'bank';
    });

    migrateLegacyCashIntoBanksInMemory(d);

    if (!Array.isArray(d.pendingIn)) d.pendingIn = [];
    if (!Array.isArray(d.pendingOut)) d.pendingOut = [];
    if (!Array.isArray(d.purchases)) d.purchases = [];
    if (!Array.isArray(d.recurring)) d.recurring = [];
    if (!d.recurringPosted || typeof d.recurringPosted !== 'object') d.recurringPosted = {};

    return d;
  } catch (_) {
    return defaultData();
  }
}

export function saveData(data: LedgerData) {
  // Save uses the same main storage key as legacy.
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function safeJsonParse(raw: string | null): { ok: boolean; value: unknown } {
  if (raw == null) return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (_) {
    return { ok: false, value: raw };
  }
}

export function exportJSON(): string {
  // Mirrors legacy behavior: enumerate localStorage keys and include known/allowed ones.
  const allow = new Set<string>([STORAGE_KEY, CATEGORY_STORAGE_KEY, EXPECTED_COSTS_KEY, EXPECTED_INCOME_KEY, UPCOMING_WINDOW_KEY]);
  const payload: { version: 1; exportedAt: string; data: Record<string, unknown> } = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {}
  };

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith('ledgerlite') || allow.has(k) || k.includes('snapshot_') || k.includes('expected') || k.includes('upcoming')) {
        const v = localStorage.getItem(k);
        payload.data[k] = safeJsonParse(v).value;
      }
    }
  } catch (_) {
    allow.forEach((k) => {
      try {
        const v = localStorage.getItem(k);
        if (v !== null) payload.data[k] = safeJsonParse(v).value;
      } catch (_) {
        // ignore
      }
    });
  }

  return JSON.stringify(payload, null, 2);
}

export function importJSON(jsonText: string) {
  const parsed = JSON.parse(jsonText) as any;
  const data = parsed && parsed.data && typeof parsed.data === 'object' ? (parsed.data as Record<string, unknown>) : null;
  if (!data) throw new Error('Invalid import format');
  Object.entries(data).forEach(([k, v]) => {
    localStorage.setItem(k, JSON.stringify(v));
  });
}

export function loadCategoryConfig(): CategoryConfig {
  try {
    const raw = localStorage.getItem(CATEGORY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object') return parsed as CategoryConfig;
    }
  } catch (_) {}
  return {};
}

