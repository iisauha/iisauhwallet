export type IsoDateTime = string; // legacy uses ISO strings via new Date().toISOString()

export type BankType = 'bank' | 'physical_cash';

export interface BankAccount {
  id: string;
  name: string;
  type: BankType;
  balanceCents: number;
  updatedAt: IsoDateTime;
}

/** Reward unit: cashback %, points multiplier, or miles multiplier. */
export type RewardUnitType = 'cashback_percent' | 'points_multiplier' | 'miles_multiplier';

export interface RewardRule {
  id: string;
  category: string;
  /** Omit or empty = category-only rule (matches any subcategory under category). */
  subcategory?: string;
  /** Numeric value: % for cashback, multiplier for points/miles (e.g. 4 = 4%, 3 = 3x). */
  value: number;
  unit: RewardUnitType;
  /** When true, this rule is the card's catch-all (only one per card). */
  isCatchAll?: boolean;
}

export interface CreditCard {
  id: string;
  name: string;
  balanceCents: number; // positive = debt, negative = credit
  updatedAt: IsoDateTime;
  /** @deprecated Use rewardRules instead. Kept for migration. */
  rewardCategory?: string;
  /** @deprecated Use rewardRules instead. Kept for migration. */
  rewardSubcategory?: string;
  /** @deprecated Use rewardRules instead. Kept for migration. */
  isCatchAll?: boolean;
  /** Multiple reward rules per card. Takes precedence over legacy single-rule fields. */
  rewardRules?: RewardRule[];
  /** Manual/accumulated reward totals (display only; do not count toward net cash). */
  rewardCashbackCents?: number;
  rewardPoints?: number;
  rewardMiles?: number;
  /** When true, balance was cleared by user; current balance only grows from new purchases added after clear. */
  rewardBalanceCleared?: boolean;
  /** Optional: average cents per point for approximate dollar value display (e.g. 1.2 = 1.2 cpp). */
  avgCentsPerPoint?: number;
  /** Optional: average cents per mile for approximate dollar value display (e.g. 1.3 = 1.3 cpm). */
  avgCentsPerMile?: number;
}

export type PendingDepositTo = 'bank' | 'card' | 'hysa';
export type PendingOutboundType = 'standard' | 'cc_payment';

export interface PendingInboundItem {
  id: string;
  label: string;
  amountCents: number;
  targetBankId?: string;
  isRefund?: boolean;
  depositTo?: PendingDepositTo;
  targetCardId?: string;
  /** When depositTo === 'hysa': which HYSA account to deposit to. */
  targetInvestingAccountId?: string;
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
  paymentSource?: 'card' | 'bank' | 'cash' | 'credit_card' | 'hysa';
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
  /** When transfer involves HYSA with sub-buckets: 'liquid' = checking/liquid portion, 'reserved' = savings/reserved portion. */
  hysaSubBucket?: 'liquid' | 'reserved';
  // Optional metadata for special-case flows (e.g. Upcoming -> Pending Outbound).
  source?: string;
  addToSpendingOnConfirm?: boolean;
  originalCategory?: string;
  originalSubcategory?: string;
  originalTitle?: string;
  originalNotes?: string;
  originalAccount?: string;
  /** Per-loan cents to subtract from private loan balances when this outbound is posted (loanId -> cents). */
  privateLoanBreakdownCents?: Record<string, number>;
  /** Public portion of the payment (cents) to subtract from visible Payment(now) when posted; does not reduce private balances. */
  publicPortionCents?: number;
  /** Total visible Payment(now) at move-to-pending time (for deterministic posting). */
  totalVisiblePaymentNowCents?: number;
  /** When pending outbound is from a recurring with HYSA payment source: which account and sub-bucket to deduct from. */
  recurringHysaSource?: { investingAccountId: string; hysaSubBucket: 'liquid' | 'reserved' };
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

  /** When true, added via "Add Card Purchase (Full reimbursement expected)"; counts only in Reimbursed/other, not My purchases. */
  fullReimbursementExpected?: boolean;

  /** Estimated reward from matched card rule (informational; not counted as cash). */
  estimatedRewardCashbackCents?: number;
  estimatedRewardPoints?: number;
  estimatedRewardMiles?: number;

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
  /** Employer contribution type. Omit/legacy = treat as none or infer from employerMatchPct. */
  employerContributionType?: 'none' | 'pct_employee' | 'pct_gross';
  /** When employerContributionType === 'pct_employee': % of employee contribution (e.g. 5 = 5%). */
  employerMatchPct?: number;
  /** When employerContributionType === 'pct_gross': % of recurring gross income (e.g. 5 = 5%). */
  employerMatchPctOfGross?: number;
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
  /** When false, recurring income is excluded from all calculations and projections (default true when missing). */
  isActive?: boolean;
  autoPay?: boolean;
  paymentSource?: 'card' | 'bank' | 'hysa';
  paymentTargetId?: string;
  /** When paymentSource === 'hysa': which HYSA sub-bucket to deduct from when posted. */
  hysaSubBucket?: 'liquid' | 'reserved';
  applyToSnapshot?: boolean;
  // Investing-related, all optional and backward-compatible
  countsForInvestingPct?: boolean;
  isFullTimeJob?: boolean;
  preTaxDeductions?: PreTaxDeduction[];
  investingTransferEnabled?: boolean;
  investingFromBankId?: string;
  investingTargetAccountId?: string;
  investingTargetType?: 'hysa' | 'general';
  /** When true, recurring amount is sourced from linked loan's current Payment(now). */
  useLoanEstimatedPayment?: boolean;
  /** Loan id to use for estimated payment when useLoanEstimatedPayment is true. */
  linkedLoanId?: string;
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

