import {
  CASH_STORAGE_KEY,
  CATEGORY_COLOR_MAP_KEY,
  CATEGORY_STORAGE_KEY,
  COASTFIRE_KEY,
  EXPECTED_COSTS_KEY,
  EXPECTED_INCOME_KEY,
  INVESTING_KEY,
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
  UI_DROPDOWN_STATE_KEY,
  UPCOMING_WINDOW_KEY,
  LOANS_KEY,
  BIRTHDATE_KEY,
  FEDERAL_REPAYMENT_CONFIG_KEY,
  PUBLIC_PAYMENT_NOW_ADDED_KEY,
  PRIVATE_PAYMENT_NOW_BASE_KEY,
  LAST_RECOMPUTE_DATE_KEY,
  PAYMENT_NOW_MANUAL_OVERRIDE_KEY,
  APP_THEME_COLOR_KEY,
  APP_ACCENT_COLOR_KEY,
  APP_FONT_FAMILY_KEY,
  APP_FONT_SCALE_KEY,
  LOANS_SECTION_SHOW_PUBLIC_KEY,
  LOANS_SECTION_SHOW_PRIVATE_KEY,
  UI_ADVANCED_COLORS_KEY,
  PASSCODE_HASH_KEY,
  PASSCODE_HINT_KEY,
  PASSCODE_RECOVERY_KEY_HASH_KEY,
  PASSCODE_SECURITY_QA_KEY,
  PASSCODE_RECOVERY_SETUP_DONE_KEY,
  PASSCODE_FAILED_ATTEMPTS_KEY,
  PASSCODE_LOCKOUT_UNTIL_KEY,
  SECURITY_QUIZ_COMPLETED_KEY,
  PASSCODE_PAUSED_KEY,
  PASSCODE_6DIGIT_KEY,
  CARD_REWARD_ADJUSTMENTS_KEY,
  CARD_REWARD_ONLY_ENTRIES_KEY,
  REWARDS_VISIBLE_CARD_IDS_KEY,
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

/** UI-only: advanced UI surface color overrides. All values optional hex strings. */
export type AdvancedUIColors = Partial<{
  cardBg: string;
  surfaceSecondary: string;
  sectionBg: string;
  modalBg: string;
  dropdownBg: string;
  tabBarBg: string;
  border: string;
  muted: string;
  /** Title text = page titles / strong headings */
  titleText: string;
  /** Primary text = regular text in cards/rows */
  primaryText: string;
  /** Muted text = descriptors, subheaders, helper text (overrides muted surface label when used for text) */
  mutedText: string;
}>;

export function loadAdvancedUIColors(): AdvancedUIColors {
  try {
    const raw = localStorage.getItem(UI_ADVANCED_COLORS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
    return {};
  } catch (_) {
    return {};
  }
}

export function saveAdvancedUIColors(colors: AdvancedUIColors) {
  try {
    localStorage.setItem(UI_ADVANCED_COLORS_KEY, JSON.stringify(colors));
  } catch (_) {}
}

export function loadDropdownState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(UI_DROPDOWN_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
    return {};
  } catch (_) {
    return {};
  }
}

export function getDropdownOpen(id: string, defaultOpen: boolean): boolean {
  const state = loadDropdownState();
  return state[id] !== undefined ? state[id] : defaultOpen;
}

export function saveDropdownState(id: string, open: boolean): void {
  try {
    const prev = loadDropdownState();
    const next = { ...prev, [id]: open };
    localStorage.setItem(UI_DROPDOWN_STATE_KEY, JSON.stringify(next));
  } catch (_) {}
}

export function getDropdownCollapsed(id: string, defaultCollapsed: boolean): boolean {
  return !getDropdownOpen(id, !defaultCollapsed);
}

export function saveDropdownCollapsed(id: string, collapsed: boolean): void {
  saveDropdownState(id, !collapsed);
}

export type CardRewardAdjustment = { amountCents: number; mode: 'add' | 'set' };
export type CardRewardAdjustmentsState = Record<string, Record<string, CardRewardAdjustment>>;

export function loadCardRewardAdjustments(): CardRewardAdjustmentsState {
  try {
    const raw = localStorage.getItem(CARD_REWARD_ADJUSTMENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CardRewardAdjustmentsState;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

export function saveCardRewardAdjustments(state: CardRewardAdjustmentsState): void {
  try {
    localStorage.setItem(CARD_REWARD_ADJUSTMENTS_KEY, JSON.stringify(state));
  } catch (_) {}
}

export type CardRewardOnlyEntry = {
  id: string;
  title?: string;
  amountCents: number;
  category: string;
  subcategory: string;
  /** When true, counts under "Other purchases on card". */
  isOther: boolean;
};
export type CardRewardOnlyEntriesState = Record<string, CardRewardOnlyEntry[]>;

export function loadCardRewardOnlyEntries(): CardRewardOnlyEntriesState {
  try {
    const raw = localStorage.getItem(CARD_REWARD_ONLY_ENTRIES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CardRewardOnlyEntriesState;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

export function saveCardRewardOnlyEntries(state: CardRewardOnlyEntriesState): void {
  try {
    localStorage.setItem(CARD_REWARD_ONLY_ENTRIES_KEY, JSON.stringify(state));
  } catch (_) {}
}

export function loadRewardsVisibleCardIds(): string[] {
  try {
    const raw = localStorage.getItem(REWARDS_VISIBLE_CARD_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id: unknown) => typeof id === 'string') : [];
  } catch (_) {
    return [];
  }
}

export function saveRewardsVisibleCardIds(ids: string[]): void {
  try {
    localStorage.setItem(REWARDS_VISIBLE_CARD_IDS_KEY, JSON.stringify(ids));
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

export type CompletedBonusUnitType = 'miles' | 'points' | 'cash' | 'other';

export type CompletedBonusBankAccountRef =
  | { type: 'bank'; bankId: string }
  | { type: 'manual'; name: string };

export type CompletedBonus = {
  id: string;
  cardId?: string;
  cardName: string;
  unitType: CompletedBonusUnitType;
  rewardQuantity: number;
  rewardLabel: string;
  centsPerUnit?: number;
  bankAccountRef?: CompletedBonusBankAccountRef;
  completedAt: string;
  notes?: string;
};

export type SubTrackerData = {
  version: 1;
  entries: SubTrackerEntry[];
  completedBonuses?: CompletedBonus[];
};

export function loadSubTracker(): SubTrackerData {
  try {
    const raw = localStorage.getItem(SUB_TRACKER_KEY);
    if (!raw) return { version: 1, entries: [], completedBonuses: [] };
    const parsed = JSON.parse(raw) as any;
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : Array.isArray(parsed) ? parsed : [];
    const completedBonuses = Array.isArray(parsed?.completedBonuses) ? parsed.completedBonuses : [];
    return { version: 1, entries, completedBonuses };
  } catch (_) {
    return { version: 1, entries: [], completedBonuses: [] };
  }
}

export function saveSubTracker(next: Partial<SubTrackerData> & { version: 1 }) {
  try {
    const current = loadSubTracker();
    const merged: SubTrackerData = {
      version: 1,
      entries: next.entries !== undefined ? next.entries : current.entries,
      completedBonuses: next.completedBonuses !== undefined ? next.completedBonuses : (current.completedBonuses ?? [])
    };
    localStorage.setItem(SUB_TRACKER_KEY, JSON.stringify(merged));
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

export type InvestingAccountType = 'hysa' | 'roth' | 'k401' | 'general';

export type InvestingAccountBase = {
  id: string;
  type: InvestingAccountType;
  name: string;
  balanceCents: number;
};

export type HysaBalanceEvent = { timestamp: number; balanceAfterCents: number };

export type HysaAccount = InvestingAccountBase & {
  type: 'hysa';
  interestRate: number; // APY percent
  lastAccruedAt: number; // timestamp ms
  monthKey?: string; // "YYYY-MM"
  interestThisMonth?: number; // cents of interest accrued in monthKey
  /** Optional: balance-change events within the current month for daily-balance interest accuracy */
  monthlyBalanceEvents?: HysaBalanceEvent[];
  /** Optional: user-provided baseline for "interest accrued this month"; display = baseline + accrual since baseline */
  manualInterestBaselineThisMonth?: number;
  manualInterestBaselineSetAt?: number;
  manualInterestBaselineMonthKey?: string;
  /** Optional: user override for projected month-end interest (cents) for current month */
  manualProjectedInterestThisMonthCents?: number;
  /** Optional: month key when manualProjectedInterestThisMonthCents was set (YYYY-MM) */
  manualProjectedInterestMonthKey?: string;
  /** Optional: linked checking bank account id whose balance can instantly draw from a liquid portion of this HYSA. */
  linkedCheckingBankId?: string | null;
  /** Optional: cents within this HYSA that are treated as reserved savings (not auto-used for linked checking). */
  reservedSavingsCents?: number | null;
};

export type OtherInvestAccount = InvestingAccountBase & {
  type: 'roth' | 'k401' | 'general';
};

export type InvestingAccount = HysaAccount | OtherInvestAccount;

export type InvestingState = {
  version: 1;
  accounts: InvestingAccount[];
};

export function loadInvesting(): InvestingState {
  try {
    const raw = localStorage.getItem(INVESTING_KEY);
    if (!raw) return { version: 1, accounts: [] };
    const parsed = JSON.parse(raw) as any;
    if (parsed && Array.isArray(parsed.accounts)) {
      return { version: 1, accounts: parsed.accounts as InvestingAccount[] };
    }
    if (Array.isArray(parsed)) {
      return { version: 1, accounts: parsed as InvestingAccount[] };
    }
    return { version: 1, accounts: [] };
  } catch (_) {
    return { version: 1, accounts: [] };
  }
}

export function saveInvesting(state: InvestingState) {
  try {
    localStorage.setItem(INVESTING_KEY, JSON.stringify(state));
  } catch (_) {}
}

// ===== Loans =====

export type LoanCategory = 'public' | 'private';
export type LoanRateType = 'fixed' | 'variable';
export type LoanRepaymentStatus =
  | 'in_school_interest_only'
  | 'grace_interest_only'
  | 'full_repayment'
  | 'idr'
  | 'deferred_forbearance'
  | 'custom_payment';

/** For public loans: expected repayment plan after grace. N/A = not yet chosen. */
export type FutureRepaymentPlan = 'na' | 'idr' | 'standard' | 'graduated' | 'extended' | 'custom';

/** Public loan subsidy: subsidized = no interest during school/grace; unsubsidized = interest from disbursement. */
export type LoanSubsidyType = 'subsidized' | 'unsubsidized';

/** For federal eligibility: student borrower vs parent (Parent PLUS). Parent PLUS = Standard only unless consolidated. */
export type LoanBorrowerType = 'student' | 'parent';

/** State of residency for federal poverty guideline (48 contiguous, Alaska, Hawaii). */
export type LoanStateOfResidency = 'contiguous' | 'AK' | 'HI';

/** One range in a loan's payment schedule. Dates are YYYY-MM-DD. */
export type PaymentScheduleRange = {
  id: string;
  startDate: string;
  endDate: string;
  paymentCents: number;
  /** Rate assumed for this range (%; for variable loans can differ from loan's current rate). */
  ratePercent?: number;
  note?: string;
  /** Optional: interest accrued during this date range (e.g. for $0 deferment rows). Used for balance timeline. */
  accruedInterestCents?: number | null;
};

/** Private loan only: one date range with a payment mode. Dates YYYY-MM-DD. */
export type PrivatePaymentRangeMode = 'deferred' | 'interest_only' | 'full_repayment' | 'custom_monthly';

export type PrivatePaymentRange = {
  id: string;
  startDate: string;
  endDate: string;
  mode: PrivatePaymentRangeMode;
  /** Used when mode is custom_monthly. Cents per month. */
  customPaymentCents?: number | null;
};

export type Loan = {
  id: string;
  name: string;
  lender?: string;
  category: LoanCategory;
  balanceCents: number;
  interestRatePercent: number; // APR, e.g. 6.8 = 6.8%
  rateType: LoanRateType;
  termMonths?: number; // custom repayment term in months
  repaymentStatus: LoanRepaymentStatus;
  /** Public loans only: plan to use after grace (when status is in-school or grace). */
  futureRepaymentPlan?: FutureRepaymentPlan;
  /** Public loans only: subsidized (no interest in school/grace) vs unsubsidized. */
  subsidyType?: LoanSubsidyType;
  /** Public loans: first disbursement date (for eligibility and unsubsidized interest). YYYY-MM-DD */
  disbursementDate?: string;
  /** Optional payment schedule ranges (start/end date + payment + optional rate). */
  paymentScheduleRanges?: PaymentScheduleRange[];
  nextPaymentCents?: number;
  nextPaymentDate?: string; // YYYY-MM-DD
  notes?: string;
  active?: boolean;
  /** When repayment status is in_school_interest_only: optional grace period end (full repayment starts after this). YYYY-MM-DD */
  gracePeriodEndDate?: string;
  /** Private in-school interest-only: accrued unpaid interest (cents). Version 1 live accrual. */
  accruedInterestCents?: number | null;
  /** Private in-school interest-only: date through which accrual was last applied. YYYY-MM-DD. */
  accrualLastUpdatedAt?: string | null;
  // Federal repayment / IDR (public loans).
  idrUseManualIncome?: boolean;
  /** Manual AGI when not using detected full-time income. Cents per year. */
  idrManualAnnualIncomeCents?: number;
  /** Student vs parent (Parent PLUS). Affects plan eligibility. */
  borrowerType?: LoanBorrowerType;
  /** Household size for poverty guideline (default 1). */
  householdSize?: number;
  /** Number of dependents (default 0). */
  dependents?: number;
  /** State of residency for FPG (default contiguous). */
  stateOfResidency?: LoanStateOfResidency;
  /** Private only: if true, this loan's payment is not included in Payment(now) total (still included in grace/after-grace calculations). */
  excludeFromCurrentPayment?: boolean;
  /** Private only: how current monthly payment is determined (used when privatePaymentRanges is empty or missing). */
  privatePaymentMode?: 'interest_only' | 'full_repayment' | 'custom_monthly';
  /** Private only: date ranges that define payment mode over time. If present and non-empty, overrides privatePaymentMode. */
  privatePaymentRanges?: PrivatePaymentRange[];
  /** Private only: interest accrual anchor/reset date for lender-style daily accrual. YYYY-MM-DD. */
  accrualAnchorDate?: string | null;
  /** Private only: manual override for unpaid interest (cents). When set, overrides estimated accrual. */
  unpaidInterestOverrideCents?: number | null;
  /** Private only: end dates (YYYY-MM-DD) of deferred ranges for which we already added accrued interest to balance. Prevents double-application. */
  deferredInterestAppliedForRangeEndDates?: string[];
};

export type LoansState = {
  version: 1;
  loans: Loan[];
};

export function loadLoans(): LoansState {
  try {
    const raw = localStorage.getItem(LOANS_KEY);
    if (!raw) return { version: 1, loans: [] };
    const parsed = JSON.parse(raw) as any;
    if (Array.isArray(parsed)) {
      return { version: 1, loans: parsed as Loan[] };
    }
    if (parsed && Array.isArray(parsed.loans)) {
      return { version: 1, loans: parsed.loans as Loan[] };
    }
    return { version: 1, loans: [] };
  } catch (_) {
    return { version: 1, loans: [] };
  }
}

export function saveLoans(state: LoansState) {
  try {
    localStorage.setItem(LOANS_KEY, JSON.stringify(state));
  } catch (_) {}
}

export function loadPublicPaymentNowAdded(): number {
  try {
    const raw = localStorage.getItem(PUBLIC_PAYMENT_NOW_ADDED_KEY);
    if (raw == null) return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch (_) {
    return 0;
  }
}

export function savePublicPaymentNowAdded(cents: number) {
  try {
    const value = Math.max(0, Math.round(cents));
    localStorage.setItem(PUBLIC_PAYMENT_NOW_ADDED_KEY, String(value));
  } catch (_) {}
}

export function loadPrivatePaymentNowBase(): number | null {
  try {
    const raw = localStorage.getItem(PRIVATE_PAYMENT_NOW_BASE_KEY);
    if (raw == null) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch (_) {
    return null;
  }
}

export function savePrivatePaymentNowBase(cents: number | null) {
  try {
    if (cents === null || cents === undefined) {
      localStorage.removeItem(PRIVATE_PAYMENT_NOW_BASE_KEY);
      return;
    }
    const value = Math.max(0, Math.round(cents));
    localStorage.setItem(PRIVATE_PAYMENT_NOW_BASE_KEY, String(value));
  } catch (_) {}
}

export function loadLastRecomputeDate(): string | null {
  try {
    const raw = localStorage.getItem(LAST_RECOMPUTE_DATE_KEY);
    if (raw == null || typeof raw !== 'string') return null;
    return raw.trim() || null;
  } catch (_) {
    return null;
  }
}

export function saveLastRecomputeDate(dateISO: string) {
  try {
    if (dateISO) localStorage.setItem(LAST_RECOMPUTE_DATE_KEY, dateISO);
  } catch (_) {}
}

export function loadPaymentNowManualOverride(): number | null {
  try {
    const raw = localStorage.getItem(PAYMENT_NOW_MANUAL_OVERRIDE_KEY);
    if (raw == null) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch (_) {
    return null;
  }
}

export function savePaymentNowManualOverride(cents: number | null) {
  try {
    if (cents === null || cents === undefined) {
      localStorage.removeItem(PAYMENT_NOW_MANUAL_OVERRIDE_KEY);
      return;
    }
    const value = Math.max(0, Math.round(cents));
    localStorage.setItem(PAYMENT_NOW_MANUAL_OVERRIDE_KEY, String(value));
  } catch (_) {}
}

export function loadLoansSectionShowPublic(): boolean {
  try {
    const raw = localStorage.getItem(LOANS_SECTION_SHOW_PUBLIC_KEY);
    if (raw == null) return true;
    return raw === 'true';
  } catch (_) {
    return true;
  }
}

export function saveLoansSectionShowPublic(value: boolean) {
  try {
    localStorage.setItem(LOANS_SECTION_SHOW_PUBLIC_KEY, value ? 'true' : 'false');
  } catch (_) {}
}

export function loadLoansSectionShowPrivate(): boolean {
  try {
    const raw = localStorage.getItem(LOANS_SECTION_SHOW_PRIVATE_KEY);
    if (raw == null) return false;
    return raw === 'true';
  } catch (_) {
    return false;
  }
}

export function saveLoansSectionShowPrivate(value: boolean) {
  try {
    localStorage.setItem(LOANS_SECTION_SHOW_PRIVATE_KEY, value ? 'true' : 'false');
  } catch (_) {}
}

/** Default base for surface/border/muted when only app background is customized. Exported for theme init. */
export const DEFAULT_THEME_COLOR = '#1e293b';
const DEFAULT_ACCENT_COLOR = '#0ea5e9';

function isValidHex(hex: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(hex);
}

export function loadAppThemeColor(): string {
  try {
    const raw = localStorage.getItem(APP_THEME_COLOR_KEY);
    if (raw && isValidHex(raw)) return raw;
  } catch (_) {}
  return DEFAULT_THEME_COLOR;
}

export function saveAppThemeColor(hex: string) {
  try {
    if (isValidHex(hex)) localStorage.setItem(APP_THEME_COLOR_KEY, hex);
  } catch (_) {}
}

export function loadAppAccentColor(): string {
  try {
    const raw = localStorage.getItem(APP_ACCENT_COLOR_KEY);
    if (raw && isValidHex(raw)) return raw;
  } catch (_) {}
  return DEFAULT_ACCENT_COLOR;
}

export function saveAppAccentColor(hex: string) {
  try {
    if (isValidHex(hex)) localStorage.setItem(APP_ACCENT_COLOR_KEY, hex);
  } catch (_) {}
}

const VALID_FONT_FAMILIES = new Set([
  'system', 'inter', 'arial', 'helvetica', 'calibri', 'times', 'georgia',
  'verdana', 'trebuchet', 'garamond', 'courier', 'roboto', 'poppins'
]);

export function loadAppFontFamily(): string {
  try {
    const raw = localStorage.getItem(APP_FONT_FAMILY_KEY);
    if (raw && VALID_FONT_FAMILIES.has(raw)) return raw;
  } catch (_) {}
  return 'system';
}

export function saveAppFontFamily(value: string) {
  try {
    if (VALID_FONT_FAMILIES.has(value)) localStorage.setItem(APP_FONT_FAMILY_KEY, value);
  } catch (_) {}
}

const VALID_FONT_SCALES = new Set([0.92, 0.94, 0.97, 1, 1.04, 1.06, 1.08]);

export function loadAppFontScale(): number {
  try {
    const raw = localStorage.getItem(APP_FONT_SCALE_KEY);
    if (raw == null) return 1;
    const n = parseFloat(raw);
    if (Number.isFinite(n) && VALID_FONT_SCALES.has(n)) return n;
  } catch (_) {}
  return 1;
}

export function saveAppFontScale(value: number) {
  try {
    if (VALID_FONT_SCALES.has(value)) localStorage.setItem(APP_FONT_SCALE_KEY, String(value));
  } catch (_) {}
}

/**
 * Returns the same visible Payment(now) value shown in the Loans tab.
 * Use this for recurring "Use current loan payment" and anywhere the single general Payment(now) is the source of truth.
 * @param derivedPrivatePaymentNowBase - sum of current per-loan private Payment(now) (e.g. from getPrivatePaymentNowTotal)
 */
export function getVisiblePaymentNowCents(derivedPrivatePaymentNowBase: number): number {
  const override = loadPaymentNowManualOverride();
  if (override !== null && override !== undefined) return override;
  const privateBase = loadPrivatePaymentNowBase();
  const p = privateBase !== null && privateBase !== undefined ? privateBase : derivedPrivatePaymentNowBase;
  return p + loadPublicPaymentNowAdded();
}

function todayISO(): string {
  return nowIso().slice(0, 10);
}

function daysBetween(startISO: string, endISO: string): number {
  const a = new Date(startISO + 'T00:00:00').getTime();
  const b = new Date(endISO + 'T00:00:00').getTime();
  return Math.max(0, Math.round((b - a) / (24 * 60 * 60 * 1000)));
}

/**
 * For private In School / Interest Only: compute accrued interest through asOfISO (lazy, does not persist).
 * Returns null if loan is not private in_school_interest_only.
 */
export function computeInSchoolAccruedToDate(
  loan: Loan,
  asOfISO: string
): { accruedInterestCents: number; totalOwedCents: number } | null {
  if (loan.category !== 'private' || loan.repaymentStatus !== 'in_school_interest_only') return null;
  let accrued = loan.accruedInterestCents ?? 0;
  const last = loan.accrualLastUpdatedAt;
  if (last && last < asOfISO) {
    const days = daysBetween(last, asOfISO);
    if (days > 0 && loan.balanceCents > 0 && loan.interestRatePercent > 0) {
      const dailyCents = (loan.balanceCents * (loan.interestRatePercent / 100)) / 365;
      accrued += Math.round(dailyCents * days);
    }
  }
  return {
    accruedInterestCents: accrued,
    totalOwedCents: loan.balanceCents + accrued
  };
}

/**
 * Apply one recompute cycle: add each private loan's current Payment(now) contribution to that loan's balance.
 * Then persist lastRecomputeDate so same-day repeated recompute does not apply again.
 */
export function applyRecomputeCycleToPrivateBalances(paymentNowByLoanId: Record<string, number>): void {
  const today = todayISO();
  const state = loadLoans();
  const loans = state.loans.map((l: Loan) => {
    if (l.category !== 'private') return l;
    const addCents = paymentNowByLoanId[l.id] ?? 0;
    if (addCents <= 0) return l;
    const balanceCents = l.balanceCents ?? 0;
    const newBalance = balanceCents + addCents;
    return {
      ...l,
      balanceCents: newBalance,
      accrualLastUpdatedAt: today
    };
  });
  saveLoans({ ...state, loans });
  saveLastRecomputeDate(today);
}

/**
 * Apply a confirmed payment to a private In School / Interest Only loan.
 * Interest first, then principal. Updates and saves loans.
 */
export function applyInSchoolLoanPayment(loanId: string, amountCents: number): void {
  if (!(amountCents > 0)) return;
  const state = loadLoans();
  const loan = state.loans.find((l) => l.id === loanId);
  if (!loan || loan.category !== 'private' || loan.repaymentStatus !== 'in_school_interest_only') return;
  const today = todayISO();
  const { accruedInterestCents } = computeInSchoolAccruedToDate(loan, today) ?? { accruedInterestCents: 0, totalOwedCents: loan.balanceCents };
  let newAccrued = accruedInterestCents - amountCents;
  if (newAccrued < 0) newAccrued = 0;
  let remainder = amountCents - accruedInterestCents;
  if (remainder < 0) remainder = 0;
  let newBalance = loan.balanceCents - remainder;
  if (newBalance < 0) newBalance = 0;
  const updated: Loan = {
    ...loan,
    balanceCents: newBalance,
    accruedInterestCents: newAccrued,
    accrualLastUpdatedAt: today
  };
  saveLoans({
    ...state,
    loans: state.loans.map((l) => (l.id === loanId ? updated : l))
  });
}

export type FederalRepaymentConfig = {
  povertyLevelDollars: number;
};

const DEFAULT_POVERTY_LEVEL_DOLLARS = 15650;

export function loadFederalRepaymentConfig(): FederalRepaymentConfig {
  try {
    const raw = localStorage.getItem(FEDERAL_REPAYMENT_CONFIG_KEY);
    if (!raw) return { povertyLevelDollars: DEFAULT_POVERTY_LEVEL_DOLLARS };
    const parsed = JSON.parse(raw) as FederalRepaymentConfig;
    if (typeof parsed.povertyLevelDollars === 'number' && parsed.povertyLevelDollars >= 0) {
      return { povertyLevelDollars: parsed.povertyLevelDollars };
    }
    return { povertyLevelDollars: DEFAULT_POVERTY_LEVEL_DOLLARS };
  } catch (_) {
    return { povertyLevelDollars: DEFAULT_POVERTY_LEVEL_DOLLARS };
  }
}

export function saveFederalRepaymentConfig(config: FederalRepaymentConfig) {
  try {
    localStorage.setItem(FEDERAL_REPAYMENT_CONFIG_KEY, JSON.stringify(config));
  } catch (_) {}
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function getMonthKeyFromTimestamp(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function getStartOfMonthMs(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

/**
 * Ensure monthlyBalanceEvents is for the current month; if not, reset to a single event at month start.
 * Returns the events array to use (possibly updated).
 */
function ensureMonthlyBalanceEventsForCurrentMonth(
  a: HysaAccount,
  now: number
): HysaBalanceEvent[] {
  const currentMonthKey = getMonthKeyFromTimestamp(now);
  const events = Array.isArray(a.monthlyBalanceEvents) ? a.monthlyBalanceEvents : [];
  if (events.length === 0) return [];
  const firstEventMonthKey = getMonthKeyFromTimestamp(events[0].timestamp);
  if (firstEventMonthKey !== currentMonthKey) return [];
  return events;
}

/**
 * Compute interest accrued this month using daily-balance segments (when events exist).
 * Falls back to simple balance × dailyRate × days when no events.
 */
export function computeHysaMonthlyInterest(
  a: HysaAccount,
  now: number
): { interestAccruedThisMonthCents: number; projectedInterestThisMonthCents: number } {
  const rate = typeof a.interestRate === 'number' ? a.interestRate : 0;
  const balanceCents = typeof a.balanceCents === 'number' ? a.balanceCents : 0;
  const currentMonthKey = getMonthKeyFromTimestamp(now);
  const monthStartMs = getStartOfMonthMs(now);

  const baselineCents =
    typeof a.manualInterestBaselineThisMonth === 'number' && a.manualInterestBaselineThisMonth >= 0
      ? a.manualInterestBaselineThisMonth
      : null;
  const baselineMonthKey = a.manualInterestBaselineMonthKey || null;
  const baselineSetAt = typeof a.manualInterestBaselineSetAt === 'number' ? a.manualInterestBaselineSetAt : null;

  if (baselineCents !== null && baselineMonthKey === currentMonthKey && baselineSetAt !== null) {
    const daysSinceBaseline = Math.max(
      0,
      Math.floor((now - baselineSetAt) / MS_PER_DAY)
    );
    const r = rate / 100;
    const dailyRate = r / 365;
    const newAccrualCents =
      rate <= 0 ? 0 : Math.round(balanceCents * dailyRate * daysSinceBaseline);
    const interestAccruedThisMonthCents = baselineCents + newAccrualCents;
    const useManualProjected =
      typeof a.manualProjectedInterestThisMonthCents === 'number' &&
      a.manualProjectedInterestMonthKey === currentMonthKey;
    const projectedInterestThisMonthCents = useManualProjected
      ? a.manualProjectedInterestThisMonthCents!
      : (() => {
          const d = new Date(now);
          const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
          const daysElapsed = Math.max(0, Math.floor((now - monthStartMs) / MS_PER_DAY));
          const daysRemaining = Math.max(0, daysInMonth - daysElapsed);
          const projectedRemaining =
            rate <= 0 ? 0 : Math.round(balanceCents * dailyRate * daysRemaining);
          return interestAccruedThisMonthCents + projectedRemaining;
        })();
    return { interestAccruedThisMonthCents, projectedInterestThisMonthCents };
  }

  if (rate <= 0) {
    return { interestAccruedThisMonthCents: 0, projectedInterestThisMonthCents: 0 };
  }
  const r = rate / 100;
  const dailyRate = r / 365;
  const events = ensureMonthlyBalanceEventsForCurrentMonth(a, now);

  let interestAccruedThisMonthCents: number;

  if (events.length === 0) {
    const daysElapsed = Math.max(
      0,
      Math.floor((now - monthStartMs) / MS_PER_DAY)
    );
    interestAccruedThisMonthCents = Math.round(balanceCents * dailyRate * daysElapsed);
  } else {
    const sortedEvents = [...events].sort((x, y) => x.timestamp - y.timestamp);
    const boundaries: number[] = [monthStartMs];
    for (const e of sortedEvents) {
      if (e.timestamp > boundaries[boundaries.length - 1] && e.timestamp <= now) {
        boundaries.push(e.timestamp);
      }
    }
    boundaries.push(now);

    let totalCents = 0;
    for (let i = 0; i < boundaries.length - 1; i++) {
      const segmentStart = boundaries[i];
      const segmentEnd = boundaries[i + 1];
      const daysInSegment = Math.max(
        0,
        Math.floor((segmentEnd - segmentStart) / MS_PER_DAY)
      );
      if (daysInSegment <= 0) continue;
      const balanceForSegment =
        sortedEvents.find((e) => e.timestamp === segmentStart)?.balanceAfterCents ??
        (segmentStart === monthStartMs ? sortedEvents[0].balanceAfterCents : balanceCents);
      const segmentInterest = Math.round(balanceForSegment * dailyRate * daysInSegment);
      totalCents += segmentInterest;
    }
    interestAccruedThisMonthCents = totalCents;
  }

  const d = new Date(now);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const daysElapsed = Math.max(
    0,
    Math.floor((now - monthStartMs) / MS_PER_DAY)
  );
  const daysRemaining = Math.max(0, daysInMonth - daysElapsed);
  const projectedRemaining = Math.round(balanceCents * dailyRate * daysRemaining);
  const useManualProjected =
    typeof a.manualProjectedInterestThisMonthCents === 'number' &&
    a.manualProjectedInterestMonthKey === currentMonthKey;
  const projectedInterestThisMonthCents = useManualProjected
    ? a.manualProjectedInterestThisMonthCents!
    : interestAccruedThisMonthCents + projectedRemaining;

  return { interestAccruedThisMonthCents, projectedInterestThisMonthCents };
}

/**
 * Record a balance change event for an HYSA (Set, Add, transfer, add interest).
 * Ensures monthlyBalanceEvents is for the current month; resets if new month.
 */
export function recordHysaBalanceEvent(
  a: HysaAccount,
  now: number,
  balanceAfterCents: number
): HysaAccount {
  const currentMonthKey = getMonthKeyFromTimestamp(now);
  const monthStartMs = getStartOfMonthMs(now);
  let events = Array.isArray(a.monthlyBalanceEvents) ? [...a.monthlyBalanceEvents] : [];

  const firstEventMonthKey =
    events.length > 0 ? getMonthKeyFromTimestamp(events[0].timestamp) : null;
  if (events.length === 0 || firstEventMonthKey !== currentMonthKey) {
    events = [{ timestamp: monthStartMs, balanceAfterCents: a.balanceCents }];
  }

  events.push({ timestamp: now, balanceAfterCents });
  return {
    ...a,
    balanceCents: balanceAfterCents,
    monthlyBalanceEvents: events
  };
}

function accrueSingleHysaAccount(a: HysaAccount, now: number): HysaAccount {
  const balanceStart = typeof a.balanceCents === 'number' ? a.balanceCents : 0;
  const rate = typeof a.interestRate === 'number' ? a.interestRate : 0;
  if (balanceStart <= 0 || rate <= 0) {
    const baseTs = typeof a.lastAccruedAt === 'number' && a.lastAccruedAt > 0 ? a.lastAccruedAt : now;
    const mk = a.monthKey || getMonthKeyFromTimestamp(now);
    return {
      ...a,
      balanceCents: balanceStart,
      lastAccruedAt: baseTs,
      monthKey: mk,
      interestThisMonth: typeof a.interestThisMonth === 'number' ? a.interestThisMonth : 0
    };
  }

  const startTs = typeof a.lastAccruedAt === 'number' && a.lastAccruedAt > 0 ? a.lastAccruedAt : now;
  if (now <= startTs) {
    const mk = a.monthKey || getMonthKeyFromTimestamp(now);
    return {
      ...a,
      balanceCents: balanceStart,
      lastAccruedAt: startTs,
      monthKey: mk,
      interestThisMonth: typeof a.interestThisMonth === 'number' ? a.interestThisMonth : 0
    };
  }

  const days = Math.floor((now - startTs) / MS_PER_DAY);
  if (days <= 0) {
    const mk = a.monthKey || getMonthKeyFromTimestamp(now);
    return {
      ...a,
      balanceCents: balanceStart,
      lastAccruedAt: startTs,
      monthKey: mk,
      interestThisMonth: typeof a.interestThisMonth === 'number' ? a.interestThisMonth : 0
    };
  }

  let balance = balanceStart;
  let ts = startTs;
  let monthKey = a.monthKey || getMonthKeyFromTimestamp(startTs);
  let interestThisMonth = typeof a.interestThisMonth === 'number' ? a.interestThisMonth : 0;

  const r = rate / 100;
  const dailyRate = r / 365;

  for (let i = 0; i < days; i += 1) {
    ts += MS_PER_DAY;
    const dayMonthKey = getMonthKeyFromTimestamp(ts);
    const dailyInterest = Math.round(balance * dailyRate);
    if (dayMonthKey !== monthKey) {
      monthKey = dayMonthKey;
      interestThisMonth = 0;
    }
    if (dailyInterest !== 0) {
      balance += dailyInterest;
      // Only track interest for the active monthKey (current month for this account).
      interestThisMonth += dailyInterest;
    }
  }

  return {
    ...a,
    balanceCents: balance,
    lastAccruedAt: ts,
    monthKey,
    interestThisMonth
  };
}

export function accrueHysaAccounts(state: InvestingState, now?: number): InvestingState {
  const tsNow = typeof now === 'number' ? now : Date.now();
  let changed = false;
  const accounts = state.accounts.map((acc) => {
    if (acc.type !== 'hysa') return acc;
    const updated = accrueSingleHysaAccount(acc as HysaAccount, tsNow);
    if (updated !== acc) changed = true;
    return updated;
  });
  if (!changed) return state;
  return { ...state, accounts };
}

export type CoastFireAssumptions = {
  currentAge: number;
  retirementAge: number;
  annualSpendingDollars: number;
  swrPercent: number;
  investmentReturnPercent: number;
  inflationPercent: number;
  includeRoth: boolean;
  include401k: boolean;
  includeGeneral: boolean;
  includeHysa: boolean;
  useDetectedContributions: boolean;
  manualMonthlyContributionDollars: number;
};

const COASTFIRE_DEFAULTS: CoastFireAssumptions = {
  currentAge: 30,
  retirementAge: 65,
  annualSpendingDollars: 50000,
  swrPercent: 4,
  investmentReturnPercent: 7,
  inflationPercent: 3,
  includeRoth: true,
  include401k: true,
  includeGeneral: false,
  includeHysa: false,
  useDetectedContributions: true,
  manualMonthlyContributionDollars: 0
};

export function loadCoastFire(): CoastFireAssumptions | null {
  try {
    const raw = localStorage.getItem(COASTFIRE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    const a = parsed as any;
    const currentAge = typeof a.currentAge === 'number' ? a.currentAge : COASTFIRE_DEFAULTS.currentAge;
    const retirementAge = typeof a.retirementAge === 'number' ? a.retirementAge : COASTFIRE_DEFAULTS.retirementAge;
    const annualSpendingDollars = typeof a.annualSpendingDollars === 'number' ? a.annualSpendingDollars : COASTFIRE_DEFAULTS.annualSpendingDollars;
    const swrPercent = typeof a.swrPercent === 'number' ? a.swrPercent : COASTFIRE_DEFAULTS.swrPercent;
    let investmentReturnPercent = typeof a.investmentReturnPercent === 'number' ? a.investmentReturnPercent : COASTFIRE_DEFAULTS.investmentReturnPercent;
    let inflationPercent = typeof a.inflationPercent === 'number' ? a.inflationPercent : COASTFIRE_DEFAULTS.inflationPercent;
    if (typeof a.realReturnPercent === 'number' && typeof a.investmentReturnPercent !== 'number') {
      investmentReturnPercent = 7;
      inflationPercent = Math.max(0, Math.min(10, 7 - a.realReturnPercent));
    }
    const includeRoth = typeof a.includeRoth === 'boolean' ? a.includeRoth : COASTFIRE_DEFAULTS.includeRoth;
    const include401k = typeof a.include401k === 'boolean' ? a.include401k : COASTFIRE_DEFAULTS.include401k;
    const includeGeneral = typeof a.includeGeneral === 'boolean' ? a.includeGeneral : COASTFIRE_DEFAULTS.includeGeneral;
    const includeHysa = typeof a.includeHysa === 'boolean' ? a.includeHysa : COASTFIRE_DEFAULTS.includeHysa;
    const useDetectedContributions = typeof a.useDetectedContributions === 'boolean' ? a.useDetectedContributions : COASTFIRE_DEFAULTS.useDetectedContributions;
    const manualMonthlyContributionDollars = typeof a.manualMonthlyContributionDollars === 'number' ? a.manualMonthlyContributionDollars : COASTFIRE_DEFAULTS.manualMonthlyContributionDollars;
    return {
      currentAge,
      retirementAge,
      annualSpendingDollars,
      swrPercent,
      investmentReturnPercent,
      inflationPercent,
      includeRoth,
      include401k,
      includeGeneral,
      includeHysa,
      useDetectedContributions,
      manualMonthlyContributionDollars
    };
  } catch (_) {
    return null;
  }
}

export function saveCoastFire(assumptions: CoastFireAssumptions) {
  try {
    localStorage.setItem(COASTFIRE_KEY, JSON.stringify(assumptions));
  } catch (_) {}
}

export { COASTFIRE_DEFAULTS };

// ===== Profile / birthdate =====

export function loadBirthdateISO(): string | null {
  try {
    const raw = localStorage.getItem(BIRTHDATE_KEY);
    if (typeof raw !== 'string' || !raw) return null;
    return raw;
  } catch (_) {
    return null;
  }
}

export function loadPasscodeHash(): string | null {
  try {
    const raw = localStorage.getItem(PASSCODE_HASH_KEY);
    return typeof raw === 'string' && raw.length > 0 ? raw : null;
  } catch (_) {
    return null;
  }
}

export function savePasscodeHash(hash: string) {
  try {
    localStorage.setItem(PASSCODE_HASH_KEY, hash);
  } catch (_) {}
}

export function clearPasscodeHash() {
  try {
    localStorage.removeItem(PASSCODE_HASH_KEY);
  } catch (_) {}
}

/** Hash passcode for storage/comparison. Uses SHA-256 and returns hex string. App requires 6-digit passcode. */
export async function hashPasscode(passcode: string): Promise<string> {
  const msg = new TextEncoder().encode(passcode);
  const buf = await crypto.subtle.digest('SHA-256', msg);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Hash any string (recovery key, security answers) for local comparison. SHA-256 hex. */
export async function hashForStorage(value: string): Promise<string> {
  const msg = new TextEncoder().encode(value.trim().toLowerCase());
  const buf = await crypto.subtle.digest('SHA-256', msg);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// --- Passcode recovery (local-only) ---

export type SecurityQA = {
  q1: string;
  q2: string;
  a1Hash: string;
  a2Hash: string;
};

export function loadPasscodeHint(): string | null {
  try {
    const raw = localStorage.getItem(PASSCODE_HINT_KEY);
    return typeof raw === 'string' && raw.length > 0 ? raw : null;
  } catch (_) {
    return null;
  }
}

export function savePasscodeHint(hint: string | null) {
  try {
    if (!hint || !hint.trim()) localStorage.removeItem(PASSCODE_HINT_KEY);
    else localStorage.setItem(PASSCODE_HINT_KEY, hint.trim());
  } catch (_) {}
}

export function loadRecoveryKeyHash(): string | null {
  try {
    const raw = localStorage.getItem(PASSCODE_RECOVERY_KEY_HASH_KEY);
    return typeof raw === 'string' && raw.length > 0 ? raw : null;
  } catch (_) {
    return null;
  }
}

export function saveRecoveryKeyHash(hash: string) {
  try {
    localStorage.setItem(PASSCODE_RECOVERY_KEY_HASH_KEY, hash);
  } catch (_) {}
}

export function loadSecurityQA(): SecurityQA | null {
  try {
    const raw = localStorage.getItem(PASSCODE_SECURITY_QA_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as SecurityQA;
    if (p && p.q1 && p.q2 && p.a1Hash && p.a2Hash) return p;
    return null;
  } catch (_) {
    return null;
  }
}

export function saveSecurityQA(qa: SecurityQA | null) {
  try {
    if (!qa) localStorage.removeItem(PASSCODE_SECURITY_QA_KEY);
    else localStorage.setItem(PASSCODE_SECURITY_QA_KEY, JSON.stringify(qa));
  } catch (_) {}
}

export function loadRecoverySetupDone(): boolean {
  try {
    const raw = localStorage.getItem(PASSCODE_RECOVERY_SETUP_DONE_KEY);
    return raw === 'true';
  } catch (_) {
    return false;
  }
}

export function saveRecoverySetupDone(done: boolean) {
  try {
    if (done) localStorage.setItem(PASSCODE_RECOVERY_SETUP_DONE_KEY, 'true');
    else localStorage.removeItem(PASSCODE_RECOVERY_SETUP_DONE_KEY);
  } catch (_) {}
}

export function loadPasscodeFailedAttempts(): number {
  try {
    const raw = localStorage.getItem(PASSCODE_FAILED_ATTEMPTS_KEY);
    if (raw == null) return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch (_) {
    return 0;
  }
}

export function savePasscodeFailedAttempts(n: number) {
  try {
    localStorage.setItem(PASSCODE_FAILED_ATTEMPTS_KEY, String(Math.max(0, n)));
  } catch (_) {}
}

export function loadPasscodeLockoutUntil(): string | null {
  try {
    const raw = localStorage.getItem(PASSCODE_LOCKOUT_UNTIL_KEY);
    return typeof raw === 'string' && raw.length > 0 ? raw : null;
  } catch (_) {
    return null;
  }
}

export function savePasscodeLockoutUntil(iso: string | null) {
  try {
    if (!iso) localStorage.removeItem(PASSCODE_LOCKOUT_UNTIL_KEY);
    else localStorage.setItem(PASSCODE_LOCKOUT_UNTIL_KEY, iso);
  } catch (_) {}
}

export function loadSecurityQuizCompleted(): boolean {
  try {
    return localStorage.getItem(SECURITY_QUIZ_COMPLETED_KEY) === 'true';
  } catch (_) {
    return false;
  }
}

export function saveSecurityQuizCompleted(completed: boolean) {
  try {
    if (completed) localStorage.setItem(SECURITY_QUIZ_COMPLETED_KEY, 'true');
    else localStorage.removeItem(SECURITY_QUIZ_COMPLETED_KEY);
  } catch (_) {}
}

export function loadPasscodePaused(): boolean {
  try {
    return localStorage.getItem(PASSCODE_PAUSED_KEY) === 'true';
  } catch (_) {
    return false;
  }
}

export function savePasscodePaused(paused: boolean) {
  try {
    if (paused) localStorage.setItem(PASSCODE_PAUSED_KEY, 'true');
    else localStorage.removeItem(PASSCODE_PAUSED_KEY);
  } catch (_) {}
}

export function loadPasscode6Digit(): boolean {
  try {
    return localStorage.getItem(PASSCODE_6DIGIT_KEY) === 'true';
  } catch (_) {
    return false;
  }
}

export function savePasscode6Digit(six: boolean) {
  try {
    if (six) localStorage.setItem(PASSCODE_6DIGIT_KEY, 'true');
    else localStorage.removeItem(PASSCODE_6DIGIT_KEY);
  } catch (_) {}
}

/** Generate a random recovery key (e.g. 12 alphanumeric). Shown once; only hash is stored. */
export function generateRecoveryKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const arr = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < 12; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr)
    .map((b) => chars[b % chars.length])
    .join('');
}

/** Wipe all app data from localStorage (passcode, recovery, and wallet keys). */
export function wipeAllAppData(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('ledgerlite') || k.startsWith('iisauhwallet') || k.startsWith('snapshot_') || k.startsWith('category') || k.startsWith('expected') || k.startsWith('loansSection'))) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (_) {}
}

export function saveBirthdateISO(iso: string | null) {
  try {
    if (!iso) {
      localStorage.removeItem(BIRTHDATE_KEY);
    } else {
      localStorage.setItem(BIRTHDATE_KEY, iso);
    }
  } catch (_) {}
}

