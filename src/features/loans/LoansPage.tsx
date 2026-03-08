import { useMemo, useState } from 'react';
import { useLedgerStore } from '../../state/store';
import { formatCents } from '../../state/calc';
import {
  loadLoans,
  saveLoans,
  type LoansState,
  type Loan,
  uid,
  loadBirthdateISO
} from '../../state/storage';
import type { RecurringItem } from '../../state/models';
import { Select } from '../../ui/Select';
import { Modal } from '../../ui/Modal';

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function parseDateISO(iso: string | undefined | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

function computeAgeFromBirthdate(birthdateISO: string | null, asOf: Date): number | null {
  if (!birthdateISO) return null;
  const d = parseDateISO(birthdateISO);
  if (!d) return null;
  let age = asOf.getFullYear() - d.getFullYear();
  const beforeBirthdayThisYear =
    asOf.getMonth() < d.getMonth() ||
    (asOf.getMonth() === d.getMonth() && asOf.getDate() < d.getDate());
  if (beforeBirthdayThisYear) age -= 1;
  return age;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

function recurringAnnualIncomeCents(r: RecurringItem): number {
  if (!r || r.type !== 'income' || !r.amountCents) return 0;
  const amt = r.amountCents;
  const freq = r.frequency || 'monthly';
  if (freq === 'monthly') return amt * 12;
  if (freq === 'weekly') return Math.round(amt * 52);
  if (freq === 'biweekly') return Math.round(amt * 26);
  if (freq === 'yearly') return amt;
  const days =
    typeof r.intervalDays === 'number' && r.intervalDays > 0
      ? r.intervalDays
      : typeof r.everyNDays === 'number' && r.everyNDays > 0
        ? r.everyNDays
        : 30;
  return Math.round((amt * 365) / days);
}

function computeInterestOnlyMonthlyCents(balanceCents: number, ratePercent: number): number {
  const r = ratePercent / 100;
  if (!(balanceCents > 0 && r > 0)) return 0;
  const monthlyRate = r / 12;
  const dollars = (balanceCents / 100) * monthlyRate;
  return Math.round(dollars * 100);
}

function computeAmortizedPaymentCents(
  balanceCents: number,
  ratePercent: number,
  termMonths: number | undefined | null
): number | null {
  const n = termMonths && termMonths > 0 ? Math.round(termMonths) : 0;
  if (!(balanceCents > 0 && n > 0)) return null;
  const rMonthly = ratePercent / 100 / 12;
  const principal = balanceCents / 100;
  let paymentDollars: number;
  if (rMonthly <= 0) {
    paymentDollars = principal / n;
  } else {
    const pow = Math.pow(1 + rMonthly, n);
    paymentDollars = (principal * rMonthly * pow) / (pow - 1);
  }
  return Math.round(paymentDollars * 100);
}

function computeMonthsToPayoff(
  balanceCents: number,
  ratePercent: number,
  monthlyPaymentCents: number
): number | null {
  if (!(balanceCents > 0 && monthlyPaymentCents > 0)) return null;
  const rMonthly = ratePercent / 100 / 12;
  if (rMonthly <= 0) {
    return Math.ceil(balanceCents / monthlyPaymentCents);
  }
  // N = -ln(1 - r*P / A) / ln(1 + r)
  const P = balanceCents / 100;
  const A = monthlyPaymentCents / 100;
  const numeratorInner = 1 - (rMonthly * P) / A;
  if (numeratorInner <= 0 || numeratorInner >= 1) return null;
  const n = -Math.log(numeratorInner) / Math.log(1 + rMonthly);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.ceil(n);
}

type LoanWithDerived = Loan & {
  monthlyNowCents: number | null;
  monthlyLaterCents: number | null;
  dailyInterestCents: number;
  monthlyInterestCents: number;
  payoffMonths: number | null;
};

function deriveForLoan(
  loan: Loan,
  detectedAnnualIncomeCents: number,
  idrManualIncomeCents: number | undefined
): LoanWithDerived {
  const { balanceCents, interestRatePercent, repaymentStatus, termMonths, category } = loan;
  const dailyInterestCents = Math.round((balanceCents * (interestRatePercent / 100)) / 365);
  const monthlyInterestCents = dailyInterestCents * 30;

  const interestOnlyMonthly = computeInterestOnlyMonthlyCents(balanceCents, interestRatePercent);
  const fullPaymentCents = computeAmortizedPaymentCents(balanceCents, interestRatePercent, termMonths) ?? interestOnlyMonthly;

  let monthlyNowCents: number | null = null;
  let monthlyLaterCents: number | null = null;
  let payoffMonths: number | null = null;

  if (repaymentStatus === 'in_school_interest_only' || repaymentStatus === 'grace_interest_only') {
    monthlyNowCents = interestOnlyMonthly;
    monthlyLaterCents = fullPaymentCents;
    payoffMonths = computeMonthsToPayoff(balanceCents, interestRatePercent, fullPaymentCents);
  } else if (repaymentStatus === 'full_repayment') {
    monthlyNowCents = fullPaymentCents;
    monthlyLaterCents = null;
    payoffMonths = computeMonthsToPayoff(balanceCents, interestRatePercent, fullPaymentCents);
  } else if (repaymentStatus === 'idr' && category === 'public') {
    const useManual = loan.idrUseManualIncome;
    const annualIncomeCents = useManual
      ? Math.max(0, idrManualIncomeCents || 0)
      : Math.max(0, detectedAnnualIncomeCents);
    const annualIncomeDollars = annualIncomeCents / 100;
    const idrMonthlyDollars = (annualIncomeDollars * 0.1) / 12; // ~10% of gross income
    const idrMonthlyCents = Math.max(0, Math.round(idrMonthlyDollars * 100));
    monthlyNowCents = idrMonthlyCents || null;
    monthlyLaterCents = null;
    payoffMonths = monthlyNowCents
      ? computeMonthsToPayoff(balanceCents, interestRatePercent, monthlyNowCents)
      : null;
  } else if (repaymentStatus === 'deferred_forbearance') {
    monthlyNowCents = 0;
    monthlyLaterCents = fullPaymentCents;
    payoffMonths = computeMonthsToPayoff(balanceCents, interestRatePercent, fullPaymentCents);
  } else if (repaymentStatus === 'custom_payment') {
    const custom = loan.nextPaymentCents && loan.nextPaymentCents > 0 ? loan.nextPaymentCents : null;
    monthlyNowCents = custom;
    monthlyLaterCents = null;
    payoffMonths =
      custom != null ? computeMonthsToPayoff(balanceCents, interestRatePercent, custom) : null;
  } else {
    monthlyNowCents = null;
    monthlyLaterCents = null;
    payoffMonths = null;
  }

  return {
    ...loan,
    monthlyNowCents,
    monthlyLaterCents,
    dailyInterestCents,
    monthlyInterestCents,
    payoffMonths
  };
}

type LoanEditorState = {
  id?: string;
  name: string;
  lender: string;
  category: Loan['category'];
  balance: string;
  ratePercent: string;
  rateType: Loan['rateType'];
  termMonths: string;
  repaymentStatus: Loan['repaymentStatus'];
  gracePeriodEndDate: string;
  nextPayment: string;
  nextPaymentDate: string;
  notes: string;
  active: boolean;
  idrUseManualIncome: boolean;
  idrManualAnnualIncome: string;
};

function loanToEditor(l: Loan | null | undefined, hasRecurringIncome: boolean): LoanEditorState {
  if (!l) {
    return {
      name: '',
      lender: '',
      category: 'public',
      balance: '',
      ratePercent: '',
      rateType: 'fixed',
      termMonths: '',
      repaymentStatus: 'full_repayment',
      gracePeriodEndDate: '',
      nextPayment: '',
      nextPaymentDate: '',
      notes: '',
      active: true,
      idrUseManualIncome: !hasRecurringIncome,
      idrManualAnnualIncome: ''
    };
  }
  return {
    id: l.id,
    name: l.name,
    lender: l.lender || '',
    category: l.category,
    balance: (l.balanceCents / 100).toFixed(2),
    ratePercent: String(l.interestRatePercent),
    rateType: l.rateType,
    termMonths: l.termMonths != null ? String(l.termMonths) : '',
    repaymentStatus: l.repaymentStatus,
    gracePeriodEndDate: l.gracePeriodEndDate || '',
    nextPayment: l.nextPaymentCents != null ? (l.nextPaymentCents / 100).toFixed(2) : '',
    nextPaymentDate: l.nextPaymentDate || '',
    notes: l.notes || '',
    active: l.active !== false,
    idrUseManualIncome: !!l.idrUseManualIncome,
    idrManualAnnualIncome:
      l.idrManualAnnualIncomeCents != null ? (l.idrManualAnnualIncomeCents / 100).toFixed(2) : ''
  };
}

function editorToLoan(e: LoanEditorState, prev: Loan | null): Loan | null {
  const balanceCents = Math.round(parseFloat(e.balance || '0') * 100);
  const ratePercent = parseFloat(e.ratePercent || '0');
  const termMonths =
    e.termMonths && parseInt(e.termMonths, 10) > 0 ? parseInt(e.termMonths, 10) : undefined;
  const nextPaymentCents =
    e.nextPayment && parseFloat(e.nextPayment) > 0
      ? Math.round(parseFloat(e.nextPayment) * 100)
      : undefined;
  const idrManualAnnualIncomeCents =
    e.idrManualAnnualIncome && parseFloat(e.idrManualAnnualIncome) > 0
      ? Math.round(parseFloat(e.idrManualAnnualIncome) * 100)
      : undefined;

  if (!(balanceCents >= 0 && !Number.isNaN(ratePercent))) return null;

  const gracePeriodEndDate =
    e.repaymentStatus === 'in_school_interest_only' && e.gracePeriodEndDate
      ? e.gracePeriodEndDate
      : undefined;

  return {
    id: prev?.id || uid(),
    name: e.name.trim() || 'Loan',
    lender: e.lender.trim() || undefined,
    category: e.category,
    balanceCents,
    interestRatePercent: ratePercent,
    rateType: e.rateType,
    termMonths,
    repaymentStatus: e.repaymentStatus,
    gracePeriodEndDate,
    nextPaymentCents,
    nextPaymentDate: e.nextPaymentDate || undefined,
    notes: e.notes.trim() || undefined,
    active: e.active,
    idrUseManualIncome: e.idrUseManualIncome,
    idrManualAnnualIncomeCents
  };
}

export function LoansPage() {
  const data = useLedgerStore((s) => s.data);
  const [state, setState] = useState<LoansState>(() => loadLoans());
  const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; value: LoanEditorState } | null>(null);
  const [refiLoan, setRefiLoan] = useState<Loan | null>(null);
  const [payoffLoan, setPayoffLoan] = useState<LoanWithDerived | null>(null);

  const birthdateISO = loadBirthdateISO();

  const detectedAnnualIncomeCents = useMemo(() => {
    const rec = (data.recurring || []).filter(
      (r) => r.type === 'income' && r.isFullTimeJob
    );
    if (!rec.length) return 0;
    return rec.reduce((s, r) => s + recurringAnnualIncomeCents(r as any), 0);
  }, [data.recurring]);

  const loansWithDerived: LoanWithDerived[] = useMemo(() => {
    return (state.loans || []).map((l) =>
      deriveForLoan(l, detectedAnnualIncomeCents, l.idrManualAnnualIncomeCents)
    );
  }, [state.loans, detectedAnnualIncomeCents]);

  const summary = useMemo(() => {
    let totalBalance = 0;
    let totalMonthlyNow = 0;
    let totalMonthlyLater = 0;
    let weightedRateNumerator = 0;

    let anyLater = false;

    loansWithDerived.forEach((l) => {
      const bal = l.balanceCents || 0;
      totalBalance += bal;
      if (l.monthlyNowCents != null) totalMonthlyNow += l.monthlyNowCents;
      if (l.monthlyLaterCents != null) {
        totalMonthlyLater += l.monthlyLaterCents;
        anyLater = true;
      }
      weightedRateNumerator += bal * l.interestRatePercent;
    });

    const weightedRate =
      totalBalance > 0 ? weightedRateNumerator / totalBalance : 0;

    // Use the latest payoff among loans (rough approximation).
    const now = new Date();
    let latestPayoffDate: Date | null = null;
    loansWithDerived.forEach((l) => {
      if (l.payoffMonths != null && l.payoffMonths > 0) {
        const estDate = addMonths(now, l.payoffMonths);
        if (!latestPayoffDate || estDate > latestPayoffDate) latestPayoffDate = estDate;
      }
    });

    let payoffAge: number | null = null;
    let payoffDateStr: string | null = null;
    if (latestPayoffDate) {
      const d: Date = latestPayoffDate;
      payoffAge = computeAgeFromBirthdate(birthdateISO, d);
      payoffDateStr = d.toLocaleDateString();
    }

    return {
      totalBalance,
      totalMonthlyNow,
      totalMonthlyLater: anyLater ? totalMonthlyLater : null,
      weightedRate,
      payoffAge,
      payoffDateStr
    };
  }, [loansWithDerived, birthdateISO]);

  function persist(next: Partial<LoansState>) {
    setState((prev) => {
      const merged: LoansState = {
        version: 1,
        loans: next.loans !== undefined ? next.loans : prev.loans
      };
      saveLoans(merged);
      return merged;
    });
  }

  const hasRecurringIncome = detectedAnnualIncomeCents > 0;

  return (
    <div className="tab-panel active" id="loansContent">
      <p className="section-title">Loans</p>

      <div className="summary-compact" style={{ marginBottom: 16 }}>
        <div className="summary-kv">
          <span className="k">Total loan balance</span>
          <span className="v" style={{ color: 'var(--red)' }}>
            {formatCents(summary.totalBalance)}
          </span>
        </div>
        <div className="summary-kv">
          <span className="k">Estimated monthly payment (now)</span>
          <span className="v" style={{ color: 'var(--red)' }}>
            {summary.totalMonthlyNow > 0 ? formatCents(summary.totalMonthlyNow) : '—'}
          </span>
        </div>
        <div className="summary-kv">
          <span className="k">Estimated payment after school/grace</span>
          <span className="v" style={{ color: 'var(--red)' }}>
            {summary.totalMonthlyLater != null ? formatCents(summary.totalMonthlyLater) : '—'}
          </span>
        </div>
        <div className="summary-kv">
          <span className="k">Weighted average rate</span>
          <span className="v">
            {summary.totalBalance > 0 ? `${summary.weightedRate.toFixed(2)}% APR` : '—'}
          </span>
        </div>
        <div className="summary-kv">
          <span className="k">Projected payoff age</span>
          <span className="v">
            {summary.payoffAge != null && summary.payoffDateStr
              ? `${summary.payoffAge} yrs (≈ ${summary.payoffDateStr})`
              : birthdateISO
                ? '—'
                : 'Add your birthdate in Settings'}
          </span>
        </div>
      </div>

      {loansWithDerived.length === 0 ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ marginTop: 0, marginBottom: 8, color: 'var(--muted)', fontSize: '0.9rem' }}>
            Track student and other loans here. All values are manual and for estimates only.
          </p>
          <button
            type="button"
            className="btn btn-add"
            onClick={() =>
              setEditor({
                mode: 'add',
                value: loanToEditor(null, hasRecurringIncome)
              })
            }
          >
            + Add loan
          </button>
        </div>
      ) : null}

      {loansWithDerived.map((l) => (
        <div className="card" key={l.id} style={{ marginBottom: 12 }}>
          <div className="row" style={{ marginBottom: 4 }}>
            <span className="name" style={{ fontSize: '1.05rem' }}>
              {l.name}
            </span>
            <span
              style={{
                fontSize: '0.8rem',
                padding: '2px 6px',
                borderRadius: 999,
                background: l.category === 'public' ? 'rgba(59,130,246,0.15)' : 'rgba(234,179,8,0.15)',
                color: l.category === 'public' ? 'var(--blue)' : 'var(--yellow)',
                marginLeft: 8
              }}
            >
              {l.category === 'public' ? 'Public' : 'Private'}
            </span>
          </div>
          {l.lender ? (
            <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 4 }}>
              Servicer: {l.lender}
            </div>
          ) : null}
          <div style={{ fontSize: '0.9rem' }}>
            <div>
              <strong>Balance:</strong>{' '}
              <span style={{ color: 'var(--red)' }}>{formatCents(l.balanceCents)}</span>
            </div>
            <div>
              <strong>Rate:</strong>{' '}
              <span>
                {l.interestRatePercent.toFixed(2)}% {l.rateType === 'fixed' ? 'fixed' : 'variable'}
              </span>
            </div>
            <div>
              <strong>Status:</strong>{' '}
              <span style={{ textTransform: 'none' }}>
                {l.repaymentStatus === 'in_school_interest_only'
                  ? 'In school / interest-only'
                  : l.repaymentStatus === 'grace_interest_only'
                    ? 'Grace period / interest-only'
                    : l.repaymentStatus === 'full_repayment'
                      ? 'Full repayment'
                      : l.repaymentStatus === 'idr'
                        ? 'IDR (estimated)'
                        : l.repaymentStatus === 'deferred_forbearance'
                          ? 'Deferred / forbearance'
                          : 'Custom monthly payment'}
              </span>
            </div>
            <div style={{ marginTop: 4 }}>
              <strong>Estimated payment (now):</strong>{' '}
              {l.monthlyNowCents != null ? formatCents(l.monthlyNowCents) : '—'}
            </div>
            <div>
              <strong>Estimated payment later:</strong>{' '}
              {l.monthlyLaterCents != null ? formatCents(l.monthlyLaterCents) : '—'}
            </div>
            {l.repaymentStatus === 'in_school_interest_only' && l.gracePeriodEndDate ? (
              <div style={{ marginTop: 4, fontSize: '0.85rem', color: 'var(--muted)' }}>
                Grace Period Ends:{' '}
                {(() => {
                  const d = parseDateISO(l.gracePeriodEndDate);
                  return d
                    ? d.toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })
                    : l.gracePeriodEndDate;
                })()}
              </div>
            ) : null}
            <div style={{ marginTop: 4, fontSize: '0.85rem', color: 'var(--muted)' }}>
              Daily interest ≈ {formatCents(l.dailyInterestCents)} • Monthly interest ≈{' '}
              {formatCents(l.monthlyInterestCents)}
            </div>
          </div>
          <div className="btn-row" style={{ marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                setEditor({
                  mode: 'edit',
                  value: loanToEditor(l, hasRecurringIncome)
                })
              }
            >
              Edit
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (!confirm('Delete this loan?')) return;
                persist({ loans: state.loans.filter((x) => x.id !== l.id) });
              }}
            >
              Delete
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPayoffLoan(l)}
            >
              See payoff age
            </button>
            {l.category === 'private' ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setRefiLoan(l)}
              >
                Refinance
              </button>
            ) : null}
          </div>
        </div>
      ))}

      {loansWithDerived.length > 0 ? (
        <button
          type="button"
          className="btn btn-add"
          style={{ width: '100%', marginTop: 8 }}
          onClick={() =>
            setEditor({
              mode: 'add',
              value: loanToEditor(null, hasRecurringIncome)
            })
          }
        >
          + Add loan
        </button>
      ) : null}

      {/* Loan editor modal */}
      <Modal
        open={!!editor}
        title={editor?.mode === 'edit' ? 'Edit loan' : 'Add loan'}
        onClose={() => setEditor(null)}
      >
        {editor ? (
          <LoanEditorForm
            state={editor.value}
            hasRecurringIncome={hasRecurringIncome}
            onChange={(next) =>
              setEditor((prev) => (prev ? { ...prev, value: next } : prev))
            }
            onCancel={() => setEditor(null)}
            onSave={() => {
              const existing =
                editor && editor.mode === 'edit' && editor.value.id
                  ? state.loans.find((x) => x.id === editor.value.id)
                  : null;
              const loan = editorToLoan(editor.value, existing || null);
              if (!loan) return;
              if (existing) {
                persist({
                  loans: state.loans.map((x) => (x.id === existing.id ? loan : x))
                });
              } else {
                persist({ loans: [...state.loans, loan] });
              }
              setEditor(null);
            }}
          />
        ) : null}
      </Modal>

      {/* Payoff age modal */}
      <Modal
        open={!!payoffLoan}
        title="Estimated payoff age"
        onClose={() => setPayoffLoan(null)}
      >
        {payoffLoan ? (
          <PayoffDetails loan={payoffLoan} birthdateISO={birthdateISO} />
        ) : null}
      </Modal>

      {/* Refinance modal (private loans only) */}
      <Modal
        open={!!refiLoan}
        title="Refinance simulation"
        onClose={() => setRefiLoan(null)}
      >
        {refiLoan ? <RefinanceSimulator loan={refiLoan} /> : null}
      </Modal>
    </div>
  );
}

function LoanEditorForm(props: {
  state: LoanEditorState;
  hasRecurringIncome: boolean;
  onChange: (next: LoanEditorState) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { state, onChange, onCancel, onSave, hasRecurringIncome } = props;
  const idrAllowed = state.category === 'public';

  return (
    <>
      <div className="field">
        <label>Loan name</label>
        <input
          value={state.name}
          onChange={(e) => onChange({ ...state, name: e.target.value })}
          placeholder="e.g. Student Loan A"
        />
      </div>
      <div className="field">
        <label>Lender / Servicer</label>
        <input
          value={state.lender}
          onChange={(e) => onChange({ ...state, lender: e.target.value })}
          placeholder={state.category === 'public' ? 'e.g. Dept of Ed / Nelnet' : 'e.g. SoFi'}
        />
      </div>
      <div className="field">
        <label>Category</label>
        <Select
          value={state.category}
          onChange={(e) => {
            const category = e.target.value === 'private' ? 'private' : 'public';
            let repaymentStatus = state.repaymentStatus;
            if (category === 'private' && repaymentStatus === 'idr') {
              repaymentStatus = 'full_repayment';
            }
            onChange({ ...state, category, repaymentStatus });
          }}
        >
          <option value="public">Public</option>
          <option value="private">Private</option>
        </Select>
      </div>
      <div className="field">
        <label>Current balance ($)</label>
        <input
          value={state.balance}
          onChange={(e) => onChange({ ...state, balance: e.target.value })}
          inputMode="decimal"
          placeholder="0.00"
        />
      </div>
      <div className="field">
        <label>Interest rate (%)</label>
        <input
          value={state.ratePercent}
          onChange={(e) => onChange({ ...state, ratePercent: e.target.value })}
          inputMode="decimal"
          placeholder="e.g. 6.80"
        />
      </div>
      <div className="field">
        <label>Rate type</label>
        <Select
          value={state.rateType}
          onChange={(e) =>
            onChange({
              ...state,
              rateType: e.target.value === 'variable' ? 'variable' : 'fixed'
            })
          }
        >
          <option value="fixed">Fixed</option>
          <option value="variable">Variable</option>
        </Select>
      </div>
      <div className="field">
        <label>Repayment term (months)</label>
        <input
          value={state.termMonths}
          onChange={(e) => onChange({ ...state, termMonths: e.target.value })}
          inputMode="numeric"
          placeholder="e.g. 120"
        />
      </div>
      <div className="field">
        <label>Repayment status</label>
        <Select
          value={state.repaymentStatus}
          onChange={(e) =>
            onChange({
              ...state,
              repaymentStatus: e.target.value as any
            })
          }
        >
          <option value="in_school_interest_only">In school / interest-only</option>
          <option value="grace_interest_only">Grace period / interest-only</option>
          <option value="full_repayment">Full repayment</option>
          {idrAllowed ? <option value="idr">IDR (income-driven)</option> : null}
          <option value="deferred_forbearance">Deferred / forbearance</option>
          <option value="custom_payment">Custom monthly payment</option>
        </Select>
      </div>
      {state.repaymentStatus === 'in_school_interest_only' ? (
        <div className="field">
          <label>Grace Period End Date</label>
          <input
            type="date"
            value={state.gracePeriodEndDate}
            onChange={(e) => onChange({ ...state, gracePeriodEndDate: e.target.value })}
            style={{
              padding: '6px 8px',
              borderRadius: 4,
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: '0.9rem',
              width: '100%'
            }}
          />
          <p style={{ marginTop: 4, fontSize: '0.8rem', color: 'var(--muted)' }}>
            Full repayment is assumed to start after this date.
          </p>
        </div>
      ) : null}
      <div className="field">
        <label>Next payment amount ($)</label>
        <input
          value={state.nextPayment}
          onChange={(e) => onChange({ ...state, nextPayment: e.target.value })}
          inputMode="decimal"
          placeholder="Optional"
        />
      </div>
      <div className="field">
        <label>Next payment date</label>
        <input
          type="date"
          value={state.nextPaymentDate}
          onChange={(e) => onChange({ ...state, nextPaymentDate: e.target.value })}
        />
      </div>
      {state.repaymentStatus === 'idr' && idrAllowed ? (
        <div
          className="field"
          style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8 }}
        >
          <label style={{ display: 'block', marginBottom: 4 }}>IDR income source</label>
          <div className="toggle-row">
            <input
              type="checkbox"
              id="idrUseManual"
              checked={state.idrUseManualIncome || !hasRecurringIncome}
              onChange={(e) =>
                onChange({
                  ...state,
                  idrUseManualIncome: e.target.checked || !hasRecurringIncome
                })
              }
            />
            <label htmlFor="idrUseManual">
              {hasRecurringIncome
                ? 'Use manual income instead of detected full-time recurring income'
                : 'Use manual income'}
            </label>
          </div>
          <div className="field" style={{ marginTop: 6 }}>
            <label>Manual annual income ($)</label>
            <input
              value={state.idrManualAnnualIncome}
              onChange={(e) =>
                onChange({
                  ...state,
                  idrManualAnnualIncome: e.target.value
                })
              }
              inputMode="decimal"
              placeholder="Optional"
            />
          </div>
          <p style={{ marginTop: 4, fontSize: '0.8rem', color: 'var(--muted)' }}>
            Estimated IDR payment uses ~10% of annual income divided by 12. This is an
            approximation and for planning only.
          </p>
        </div>
      ) : null}
      <div className="field">
        <label>Notes (optional)</label>
        <textarea
          value={state.notes}
          onChange={(e) => onChange({ ...state, notes: e.target.value })}
          placeholder="Optional details"
        />
      </div>
      <div className="toggle-row" style={{ marginTop: 4 }}>
        <input
          type="checkbox"
          id="loanActive"
          checked={state.active}
          onChange={(e) => onChange({ ...state, active: e.target.checked })}
        />
        <label htmlFor="loanActive">Active loan</label>
      </div>
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-secondary" onClick={onSave}>
          Save
        </button>
      </div>
    </>
  );
}

function PayoffDetails(props: { loan: LoanWithDerived; birthdateISO: string | null }) {
  const { loan, birthdateISO } = props;
  const now = new Date();
  const payoffDate =
    loan.payoffMonths != null && loan.payoffMonths > 0 ? addMonths(now, loan.payoffMonths) : null;
  const payoffAge =
    payoffDate && birthdateISO ? computeAgeFromBirthdate(birthdateISO, payoffDate) : null;

  return (
    <>
      <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginTop: 0 }}>
        This estimate assumes your current interest rate and estimated monthly payment stay
        constant until the loan is paid off.
      </p>
      <div className="summary-compact" style={{ marginTop: 8 }}>
        <div className="summary-kv">
          <span className="k">Loan</span>
          <span className="v">{loan.name}</span>
        </div>
        <div className="summary-kv">
          <span className="k">Balance</span>
          <span className="v" style={{ color: 'var(--red)' }}>
            {formatCents(loan.balanceCents)}
          </span>
        </div>
        <div className="summary-kv">
          <span className="k">Estimated monthly payment</span>
          <span className="v">
            {loan.monthlyNowCents != null ? formatCents(loan.monthlyNowCents) : '—'}
          </span>
        </div>
        {loan.repaymentStatus === 'in_school_interest_only' && loan.gracePeriodEndDate ? (
          <div className="summary-kv">
            <span className="k">Full repayment from</span>
            <span className="v">
              {(() => {
                const d = parseDateISO(loan.gracePeriodEndDate);
                return d
                  ? d.toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })
                  : loan.gracePeriodEndDate;
              })()}
            </span>
          </div>
        ) : null}
        <div className="summary-kv">
          <span className="k">Estimated payoff date</span>
          <span className="v">
            {payoffDate ? payoffDate.toLocaleDateString() : 'N/A (payment too low or missing)'}
          </span>
        </div>
        <div className="summary-kv">
          <span className="k">Estimated payoff age</span>
          <span className="v">
            {payoffAge != null
              ? `${payoffAge} years`
              : birthdateISO
                ? 'N/A'
                : 'Add your birthdate in Settings'}
          </span>
        </div>
      </div>
    </>
  );
}

function RefinanceSimulator(props: { loan: Loan }) {
  const { loan } = props;
  const [ratePercent, setRatePercent] = useState<string>(String(loan.interestRatePercent));
  const [termMonths, setTermMonths] = useState<string>(
    loan.termMonths != null ? String(loan.termMonths) : '120'
  );
  const [overridePayment, setOverridePayment] = useState<string>('');

  const derived = useMemo(() => {
    const currentPayment =
      computeAmortizedPaymentCents(loan.balanceCents, loan.interestRatePercent, loan.termMonths) ??
      computeInterestOnlyMonthlyCents(loan.balanceCents, loan.interestRatePercent);
    const currentMonths = computeMonthsToPayoff(
      loan.balanceCents,
      loan.interestRatePercent,
      currentPayment
    );

    const newRate = parseFloat(ratePercent || '0');
    const newTerm = termMonths && parseInt(termMonths, 10) > 0 ? parseInt(termMonths, 10) : 0;
    let refiPayment =
      computeAmortizedPaymentCents(loan.balanceCents, newRate, newTerm) ??
      computeInterestOnlyMonthlyCents(loan.balanceCents, newRate);
    const override =
      overridePayment && parseFloat(overridePayment) > 0
        ? Math.round(parseFloat(overridePayment) * 100)
        : null;
    if (override != null) refiPayment = override;
    const refiMonths =
      refiPayment != null
        ? computeMonthsToPayoff(loan.balanceCents, newRate, refiPayment)
        : null;

    return { currentPayment, currentMonths, refiPayment, refiMonths };
  }, [loan, ratePercent, termMonths, overridePayment]);

  return (
    <>
      <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginTop: 0 }}>
        This tool compares your current loan to a simplified refinance scenario. All values
        are estimates only and do not reflect lender-specific terms.
      </p>
      <div className="field">
        <label>New interest rate (%)</label>
        <input
          value={ratePercent}
          onChange={(e) => setRatePercent(e.target.value)}
          inputMode="decimal"
        />
      </div>
      <div className="field">
        <label>New term (months)</label>
        <input
          value={termMonths}
          onChange={(e) => setTermMonths(e.target.value)}
          inputMode="numeric"
        />
      </div>
      <div className="field">
        <label>Optional monthly payment override ($)</label>
        <input
          value={overridePayment}
          onChange={(e) => setOverridePayment(e.target.value)}
          inputMode="decimal"
          placeholder="Optional"
        />
      </div>

      <div className="summary-compact" style={{ marginTop: 8 }}>
        <div className="summary-kv">
          <span className="k">Current est. payment</span>
          <span className="v">
            {derived.currentPayment != null ? formatCents(derived.currentPayment) : '—'}
          </span>
        </div>
        <div className="summary-kv">
          <span className="k">Current est. months to payoff</span>
          <span className="v">
            {derived.currentMonths != null ? `~${derived.currentMonths} months` : '—'}
          </span>
        </div>
        <div className="summary-kv">
          <span className="k">Refinanced est. payment</span>
          <span className="v">
            {derived.refiPayment != null ? formatCents(derived.refiPayment) : '—'}
          </span>
        </div>
        <div className="summary-kv">
          <span className="k">Refinanced est. months to payoff</span>
          <span className="v">
            {derived.refiMonths != null ? `~${derived.refiMonths} months` : '—'}
          </span>
        </div>
      </div>
    </>
  );
}

