import {
  CASH_STORAGE_KEY,
  CATEGORY_COLOR_MAP_KEY,
  CATEGORY_STORAGE_KEY,
  EXPECTED_COSTS_KEY,
  EXPECTED_INCOME_KEY,
  LAST_ADJUSTMENTS_KEY,
  LAST_IN_BANK_KEY,
  LAST_OUT_BANK_KEY,
  PENDING_IN_COLLAPSED_KEY,
  PENDING_OUT_COLLAPSED_KEY,
  PHYSICAL_CASH_ID,
  SHOW_ZERO_BALANCES_KEY,
  SHOW_ZERO_CARDS_KEY,
  SHOW_ZERO_CASH_KEY,
  STORAGE_KEY,
  SUB_TRACKER_KEY,
  UPCOMING_WINDOW_KEY
} from './keys';
import type { CategoryConfig, CreditCard, LedgerData } from './models';

function now(): string {
  return new Date().toISOString();
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function nowIso(): string {
  return now();
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

export const CATEGORIES = [
  { id: 'food', name: 'Food', sub: ['Groceries', 'Snacks', 'Restaurants'] },
  { id: 'travel', name: 'Travel', sub: ['MTA', 'Flights'] },
  { id: 'loan_payment', name: 'Loan Payment', sub: [] },
  { id: 'rent', name: 'Rent', sub: [] },
  { id: 'fun_money', name: 'Fun Money', sub: [] },
  { id: 'necessities', name: 'Necessities', sub: ['Home Necessities'] },
  { id: 'utilities', name: 'Utilities', sub: ['WiFi', 'Electricity + Gas'] },
  { id: 'subscriptions', name: 'Subscriptions', sub: [] }
] as const;

export const CATEGORY_COLORS: Record<string, string> = {
  food: '#FF8C42',
  travel: '#3B82F6',
  utilities: '#10B981',
  rent: '#6366F1',
  fun_money: '#F59E0B',
  loan_payment: '#EF4444',
  subscriptions: '#8B5CF6',
  necessities: '#14B8A6'
};

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

export function loadBoolPref(key: string, defaultValue: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultValue;
    if (raw === '1' || raw === 'true') return true;
    if (raw === '0' || raw === 'false') return false;
    return defaultValue;
  } catch (_) {
    return defaultValue;
  }
}

export function saveBoolPref(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch (_) {}
}

export function getLastPostedBankId(kind: 'in' | 'out'): string {
  const key = kind === 'in' ? LAST_IN_BANK_KEY : LAST_OUT_BANK_KEY;
  try {
    return localStorage.getItem(key) || '';
  } catch (_) {
    return '';
  }
}

export function setLastPostedBankId(kind: 'in' | 'out', bankId: string) {
  const key = kind === 'in' ? LAST_IN_BANK_KEY : LAST_OUT_BANK_KEY;
  try {
    if (bankId) localStorage.setItem(key, bankId);
  } catch (_) {}
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
  // Mirrors legacy buildLocalStorageExportPayload() exactly (structure + allow list).
  const payload: { version: string; exportedAt: string; data: Record<string, unknown> } = {
    version: 'iisauhwallet-backup-v1',
    exportedAt: new Date().toISOString(),
    data: {}
  };

  const allow = new Set<string>([
    STORAGE_KEY,
    CASH_STORAGE_KEY,
    LAST_OUT_BANK_KEY,
    LAST_IN_BANK_KEY,
    // BACKUP_BEFORE_COLOR_UPDATE_KEY intentionally not used by React app, but still exported for compatibility
    'ledgerlite_backup_before_color_update',
    SHOW_ZERO_BALANCES_KEY,
    SHOW_ZERO_CASH_KEY,
    SHOW_ZERO_CARDS_KEY,
    PENDING_IN_COLLAPSED_KEY,
    PENDING_OUT_COLLAPSED_KEY,
    CATEGORY_STORAGE_KEY,
    CATEGORY_COLOR_MAP_KEY,
    EXPECTED_COSTS_KEY,
    EXPECTED_INCOME_KEY,
    UPCOMING_WINDOW_KEY
  ]);

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

  // Format A: full localStorage export payload (exportJSON()).
  if (parsed && parsed.version === 'iisauhwallet-backup-v1' && parsed.data && typeof parsed.data === 'object') {
    const data = parsed.data as Record<string, unknown>;
    Object.entries(data).forEach(([k, v]) => {
      // Restore strings verbatim; everything else JSON-stringified (matching localStorage storage format).
      if (typeof v === 'string') localStorage.setItem(k, v);
      else localStorage.setItem(k, JSON.stringify(v));
    });
    return;
  }

  // Format B: legacy importFile handler expects a plain "data" object (banks/cards/pending/purchases/recurring...).
  // We merge into STORAGE_KEY only, preserving any other keys.
  if (parsed && typeof parsed === 'object') {
    const current = loadData();
    const next: LedgerData = { ...current };
    if (Array.isArray(parsed.banks)) (next as any).banks = parsed.banks;
    if (Array.isArray(parsed.cards)) (next as any).cards = parsed.cards;
    if (Array.isArray(parsed.pendingIn)) (next as any).pendingIn = parsed.pendingIn;
    if (Array.isArray(parsed.pendingOut)) (next as any).pendingOut = parsed.pendingOut;
    if (Array.isArray(parsed.purchases)) (next as any).purchases = parsed.purchases;
    if (Array.isArray(parsed.recurring)) (next as any).recurring = parsed.recurring;
    if (parsed.recurringPosted && typeof parsed.recurringPosted === 'object') (next as any).recurringPosted = parsed.recurringPosted;
    saveData(next);
    return;
  }

  throw new Error('Invalid import format');
}

export function loadCategoryConfig(): CategoryConfig {
  try {
    const raw = localStorage.getItem(CATEGORY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object') return parsed as CategoryConfig;
    }
  } catch (_) {}
  const initial: CategoryConfig = {};
  CATEGORIES.forEach((c) => {
    initial[c.id] = { name: c.name, sub: Array.isArray(c.sub) ? c.sub.slice() : [] };
  });
  try {
    localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(initial));
  } catch (_) {}
  return initial;
}

export function saveCategoryConfig(cfg: CategoryConfig) {
  try {
    localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(cfg));
  } catch (_) {}
}

export function getCategoryName(cfg: CategoryConfig, id: string): string {
  const key = (id || '').trim();
  const entry = key ? cfg[key] : null;
  if (entry && entry.name) return entry.name;
  return 'Uncategorized';
}

export function getCategorySubcategories(cfg: CategoryConfig, id: string): string[] {
  const entry = cfg[id];
  return entry && Array.isArray(entry.sub) ? entry.sub : [];
}

export type ExpectedCost = {
  id: string;
  title: string;
  expectedDate: string; // YYYY-MM-DD
  amountCents: number;
  minCents?: number | null;
  maxCents?: number | null;
  notes?: string;
  status?: 'expected' | 'moved_to_pending';
};

export type ExpectedIncome = {
  id: string;
  title: string;
  expectedDate: string; // YYYY-MM-DD
  amountCents: number;
  minCents?: number | null;
  maxCents?: number | null;
  notes?: string;
  status?: 'expected' | 'moved_to_pending';
};

export function loadExpectedCosts(): ExpectedCost[] {
  try {
    const raw = localStorage.getItem(EXPECTED_COSTS_KEY);
    if (raw == null) return [];
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [];
    return arr.map((c: any) => Object.assign({}, c, { status: c.status || 'expected' }));
  } catch (_) {
    return [];
  }
}

export function saveExpectedCosts(arr: ExpectedCost[]) {
  try {
    localStorage.setItem(EXPECTED_COSTS_KEY, JSON.stringify(Array.isArray(arr) ? arr : []));
  } catch (_) {}
}

export function loadExpectedIncome(): ExpectedIncome[] {
  try {
    const raw = localStorage.getItem(EXPECTED_INCOME_KEY);
    if (raw == null) return [];
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [];
    return arr.map((i: any) => Object.assign({}, i, { status: i.status || 'expected' }));
  } catch (_) {
    return [];
  }
}

export function saveExpectedIncome(arr: ExpectedIncome[]) {
  try {
    localStorage.setItem(EXPECTED_INCOME_KEY, JSON.stringify(Array.isArray(arr) ? arr : []));
  } catch (_) {}
}

export function loadUpcomingWindowPreference(): { days: number } {
  try {
    const raw = localStorage.getItem(UPCOMING_WINDOW_KEY);
    if (raw == null) return { days: 30 };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.days === 'number' && parsed.days >= 1) return { days: Math.min(365, parsed.days) };
    return { days: 30 };
  } catch (_) {
    return { days: 30 };
  }
}

export type SubTrackerTier = {
  id: string;
  spendTargetCents: number;
  rewardText: string;
};

export type SubTrackerEntry = {
  id: string;
  cardRef: { type: 'card'; cardId: string } | { type: 'manual'; name: string };
  startDate: string; // YYYY-MM-DD
  deadlineDate?: string; // YYYY-MM-DD
  monthsWindow?: number;
  tiers: SubTrackerTier[];
  spendCents: number;
  appliedPurchaseIds?: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type SubTrackerData = { version: 1; entries: SubTrackerEntry[] };

export function loadSubTracker(): SubTrackerData {
  try {
    const raw = localStorage.getItem(SUB_TRACKER_KEY);
    if (!raw) return { version: 1, entries: [] };
    const parsed = JSON.parse(raw) as any;
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : Array.isArray(parsed) ? parsed : [];
    return { version: 1, entries };
  } catch (_) {
    return { version: 1, entries: [] };
  }
}

export function saveSubTracker(next: SubTrackerData) {
  try {
    localStorage.setItem(SUB_TRACKER_KEY, JSON.stringify(next));
  } catch (_) {}
}

export function saveUpcomingWindowPreference(pref: { days: number }) {
  try {
    const merged = { ...loadUpcomingWindowPreference(), ...pref };
    localStorage.setItem(UPCOMING_WINDOW_KEY, JSON.stringify(merged));
  } catch (_) {}
}

export type LastAdjustmentsMap = Record<string, number>;

export function loadLastAdjustments(): LastAdjustmentsMap {
  try {
    const raw = localStorage.getItem(LAST_ADJUSTMENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const result: LastAdjustmentsMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof k === 'string') {
        const n = typeof v === 'number' ? v : typeof v === 'string' ? parseInt(v, 10) : NaN;
        if (!Number.isNaN(n) && n >= 0) result[k] = n;
      }
    }
    return result;
  } catch (_) {
    return {};
  }
}

export function saveLastAdjustments(map: LastAdjustmentsMap) {
  try {
    localStorage.setItem(LAST_ADJUSTMENTS_KEY, JSON.stringify(map || {}));
  } catch (_) {}
}

