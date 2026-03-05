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
  isRefund?: boolean;
  depositTo?: PendingDepositTo;
  targetCardId?: string;
  createdAt?: IsoDateTime;
}

export interface PendingOutboundItem {
  id: string;
  label: string;
  amountCents: number;
  outboundType?: PendingOutboundType;
  sourceBankId?: string;
  targetCardId?: string;
  createdAt?: IsoDateTime;
}

export interface Purchase {
  id: string;
  title: string;
  amountCents: number;
  date: string; // YYYY-MM-DD
  categoryId?: string;
  subcategory?: string;
  notes?: string;
  split?: boolean;
  myPortionCents?: number;
  reimbAmountCents?: number;
  applyToSnapshot?: boolean;
  paymentSource?: 'card' | 'bank';
  targetId?: string;
  createdAt?: IsoDateTime;
}

export type RecurringType = 'expense' | 'income';
export type RecurringFrequency = 'monthly' | 'weekly' | 'biweekly' | 'yearly' | 'every_n_days';

export interface RecurringItem {
  id: string;
  type: RecurringType;
  name: string;
  amountCents: number;
  expectedMinCents?: number;
  expectedMaxCents?: number;
  split?: boolean;
  myPortionCents?: number;
  categoryId?: string;
  subcategory?: string;
  notes?: string;
  frequency: RecurringFrequency;
  everyNDays?: number;
  startDate: string; // YYYY-MM-DD
  useLastDayOfMonth?: boolean;
  endDate?: string; // YYYY-MM-DD
  active?: boolean;
  autoPay?: boolean;
  paymentSource?: 'card' | 'bank';
  targetId?: string;
  incomeBankId?: string;
  createdAt?: IsoDateTime;
  updatedAt?: IsoDateTime;
}

export type RecurringPostedMap = Record<string, string>; // recurringId -> lastPostedDateKey

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

