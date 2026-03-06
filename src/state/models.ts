export type IsoDateTime = string; // legacy uses ISO strings via new Date().toISOString()

export type BankType = 'bank' | 'physical_cash';

export interface BankAccount {
  id: string;
  name: string;
  type: BankType;
  balanceCents: number;
  updatedAt: IsoDateTime;
}

export interface CreditCard {
  id: string;
  name: string;
  balanceCents: number; // positive = debt, negative = credit
  updatedAt: IsoDateTime;
}

export type PendingDepositTo = 'bank' | 'card';
export type PendingOutboundType = 'standard' | 'cc_payment';

export interface PendingInboundItem {
  id: string;
  label: string;
  amountCents: number;
  targetBankId?: string;
  isRefund?: boolean;
  depositTo?: PendingDepositTo;
  targetCardId?: string;
  linkedPurchaseId?: string;
  splitRecurringPurchaseId?: string;
  fromSplit?: boolean;
  createdAt?: IsoDateTime;
  recurringId?: string;
  recurringDateKey?: string;
  meta?: PendingTransferMeta;
}

export interface PendingOutboundItem {
  id: string;
  label: string;
  amountCents: number;
  outboundType?: PendingOutboundType;
  sourceBankId?: string;
  targetCardId?: string;
  createdAt?: IsoDateTime;
  recurringId?: string;
  recurringDateKey?: string;
  paymentSource?: 'card' | 'bank' | 'cash' | 'credit_card';
  paymentTargetId?: string;
  splitTotalCents?: number;
  myPortionCents?: number;
  category?: string;
  subcategory?: string;
  notes?: string;
  meta?: PendingTransferMeta;
}

export interface PendingTransferMeta {
  kind?: string;
  investingType?: 'hysa' | 'general';
  investingAccountId?: string;
}

export interface PurchaseSplitSnapshot {
  amountCents: number;
  paymentSource: string;
  paymentTargetId: string;
}

export interface Purchase {
  id: string;
  title: string;
  amountCents: number;
  dateISO: string; // YYYY-MM-DD
  category?: string;
  subcategory?: string;
  notes?: string;

  isSplit?: boolean;
  splitTotalCents?: number;
  splitMyPortionCents?: number;
  splitInboundCents?: number;
  splitPendingId?: string;
  splitSnapshot?: PurchaseSplitSnapshot;
  originalTotal?: number;

  applyToSnapshot?: boolean;
  paymentSource?: 'card' | 'bank' | 'cash' | 'credit_card';
  paymentTargetId?: string;

  recurringId?: string;
  recurringDateKey?: string;
}

export type RecurringType = 'expense' | 'income';
export type RecurringFrequency = 'monthly' | 'weekly' | 'biweekly' | 'yearly' | 'every_n_days';

export type PreTaxDeductionType = 'retirement' | 'regular';

export interface PreTaxDeduction {
  id: string;
  /** @deprecated use deductionType + investingAccountId or customName */
  name?: string;
  amountCents: number;
  /** @deprecated use deductionType === 'retirement' */
  countsAsInvesting?: boolean;
  /** New: 'retirement' = link to investing account, 'regular' = custom deduction. Omit = legacy (treat as regular with name). */
  deductionType?: PreTaxDeductionType;
  /** When deductionType === 'retirement': id of the investing account (roth or k401). */
  investingAccountId?: string;
  /** When deductionType === 'regular': custom label (e.g. Health insurance, Dental). */
  customName?: string;
  /** Optional employer match as % of employee contribution (e.g. 5 = 5%). Only for retirement. */
  employerMatchPct?: number;
}

export interface RecurringItem {
  id: string;
  type: RecurringType;
  name: string;
  amountCents: number;
  expectedMinCents?: number;
  expectedMaxCents?: number;
  isSplit?: boolean;
  myPortionCents?: number;
  category?: string;
  subcategory?: string;
  notes?: string;
  frequency: RecurringFrequency;
  everyNDays?: number;
  intervalDays?: number;
  startDate: string; // YYYY-MM-DD
  useLastDayOfMonth?: boolean;
  endDate?: string; // YYYY-MM-DD
  active?: boolean;
  autoPay?: boolean;
  paymentSource?: 'card' | 'bank';
  paymentTargetId?: string;
  applyToSnapshot?: boolean;
  // Investing-related, all optional and backward-compatible
  countsForInvestingPct?: boolean;
  isFullTimeJob?: boolean;
  preTaxDeductions?: PreTaxDeduction[];
  investingTransferEnabled?: boolean;
  investingFromBankId?: string;
  investingTargetAccountId?: string;
  investingTargetType?: 'hysa' | 'general';
}

export type RecurringPostedMap = Record<string, any>;

export interface LedgerData {
  banks: BankAccount[];
  cards: CreditCard[];
  pendingIn: PendingInboundItem[];
  pendingOut: PendingOutboundItem[];
  purchases: Purchase[];
  recurring: RecurringItem[];
  recurringPosted: RecurringPostedMap;
  // legacy had optional cashInHandCents for older saves; we read it but never write it
  cashInHandCents?: number;
}

export interface CategoryConfigEntry {
  name: string;
  sub: string[];
}

export type CategoryConfig = Record<string, CategoryConfigEntry>;

