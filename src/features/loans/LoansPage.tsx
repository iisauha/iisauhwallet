import { useMemo, useState } from 'react';
import { useLedgerStore } from '../../state/store';
import { formatCents } from '../../state/calc';
import {
  loadLoans,
  saveLoans,
  type LoansState,
  type Loan,
  type FutureRepaymentPlan,
  type PaymentScheduleRange,
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

function computeIdrMonthlyCents(
  loan: Loan,
  detectedAnnualIncomeCents: number,
  idrManualIncomeCents: number | undefined
): number {
  const useManual = loan.idrUseManualIncome;
  const annualIncomeCents = useManual
    ? Math.max(0, idrManualIncomeCents || 0)
    : Math.max(0, detectedAnnualIncomeCents);
  const annualIncomeDollars = annualIncomeCents / 100;
  const idrMonthlyDollars = (annualIncomeDollars * 0.1) / 12; // ~10% of gross income
  return Math.max(0, Math.round(idrMonthlyDollars * 100));
}

function deriveForLoan(
  loan: Loan,
  detectedAnnualIncomeCents: number,
  idrManualIncomeCents: number | undefined
): LoanWithDerived {
  const { balanceCents, interestRatePercent, repaymentStatus, termMonths, category } = loan;
  const isPublicSubsidizedInSchoolOrGrace =
    category === 'public' &&
    loan.subsidyType === 'subsidized' &&
    (repaymentStatus === 'in_school_interest_only' || repaymentStatus === 'grace_interest_only');
  const dailyInterestCents = isPublicSubsidizedInSchoolOrGrace
    ? 0
    : Math.round((balanceCents * (interestRatePercent / 100)) / 365);
  const monthlyInterestCents = dailyInterestCents * 30;

  const interestOnlyMonthly = computeInterestOnlyMonthlyCents(balanceCents, interestRatePercent);
  const fullPaymentCents = computeAmortizedPaymentCents(balanceCents, interestRatePercent, termMonths) ?? interestOnlyMonthly;

  let monthlyNowCents: number | null = null;
  let monthlyLaterCents: number | null = null;
  let payoffMonths: number | null = null;

  const isPublicInSchoolOrGrace =
    category === 'public' &&
    (repaymentStatus === 'in_school_interest_only' || repaymentStatus === 'grace_interest_only');
  const futurePlan = loan.futureRepaymentPlan || 'na';

  if (repaymentStatus === 'in_school_interest_only' || repaymentStatus === 'grace_interest_only') {
    monthlyNowCents = isPublicSubsidizedInSchoolOrGrace ? 0 : interestOnlyMonthly;
    if (isPublicInSchoolOrGrace) {
      if (futurePlan === 'idr') {
        const idrCents = computeIdrMonthlyCents(loan, detectedAnnualIncomeCents, idrManualIncomeCents);
        monthlyLaterCents = idrCents || null;
        payoffMonths = monthlyLaterCents
          ? computeMonthsToPayoff(balanceCents, interestRatePercent, monthlyLaterCents)
          : computeMonthsToPayoff(balanceCents, interestRatePercent, fullPaymentCents);
      } else if (futurePlan === 'custom' && loan.nextPaymentCents && loan.nextPaymentCents > 0) {
        monthlyLaterCents = loan.nextPaymentCents;
        payoffMonths = computeMonthsToPayoff(balanceCents, interestRatePercent, loan.nextPaymentCents);
      } else if (futurePlan === 'standard' || futurePlan === 'graduated' || futurePlan === 'extended') {
        monthlyLaterCents = fullPaymentCents;
        payoffMonths = computeMonthsToPayoff(balanceCents, interestRatePercent, fullPaymentCents);
      } else {
        // N/A or unknown: no after-grace estimate shown; payoff uses standard for projection
        monthlyLaterCents = null;
        payoffMonths = computeMonthsToPayoff(balanceCents, interestRatePercent, fullPaymentCents);
      }
    } else {
      monthlyLaterCents = fullPaymentCents;
      payoffMonths = computeMonthsToPayoff(balanceCents, interestRatePercent, fullPaymentCents);
    }
  } else if (repaymentStatus === 'full_repayment') {
    monthlyNowCents = fullPaymentCents;
    monthlyLaterCents = null;
    payoffMonths = computeMonthsToPayoff(balanceCents, interestRatePercent, fullPaymentCents);
  } else if (repaymentStatus === 'idr' && category === 'public') {
    const idrCents = computeIdrMonthlyCents(loan, detectedAnnualIncomeCents, idrManualIncomeCents);
    monthlyNowCents = idrCents || null;
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
  futureRepaymentPlan: FutureRepaymentPlan;
  subsidyType: 'subsidized' | 'unsubsidized';
  disbursementDate: string;
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
      futureRepaymentPlan: 'na',
      subsidyType: 'unsubsidized',
      disbursementDate: '',
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
    futureRepaymentPlan: l.futureRepaymentPlan || 'na',
    subsidyType: l.subsidyType || 'unsubsidized',
    disbursementDate: l.disbursementDate || '',
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

  const futureRepaymentPlan =
    e.category === 'public' ? (e.futureRepaymentPlan || 'na') : undefined;

  const subsidyType = e.category === 'public' ? e.subsidyType : undefined;
  const disbursementDate =
    e.category === 'public' && e.subsidyType === 'unsubsidized' && e.disbursementDate
      ? e.disbursementDate
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
    futureRepaymentPlan,
    subsidyType,
    disbursementDate,
    paymentScheduleRanges: prev?.paymentScheduleRanges,
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
  const [scheduleLoan, setScheduleLoan] = useState<LoanWithDerived | null>(null);

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
    if (latestPayoffDate) {
      payoffAge = computeAgeFromBirthdate(birthdateISO, latestPayoffDate);
    }

    return {
      totalBalance,
      totalMonthlyNow,
      totalMonthlyLater: anyLater ? totalMonthlyLater : null,
      weightedRate,
      payoffAge
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
      <p className="section-title" style={{ marginBottom: 8 }}>Loans</p>

      <div className="summary-compact" style={{ marginBottom: 12, padding: '10px 12px' }}>
        <div className="summary-kv" style={{ marginTop: 0 }}>
          <span className="k">Total balance</span>
          <span className="v" style={{ color: 'var(--red)', fontWeight: 600 }}>
            {formatCents(summary.totalBalance)}
          </span>
        </div>
        <div className="summary-kv" style={{ marginTop: 4 }}>
          <span className="k">Payment (now)</span>
          <span className="v" style={{ color: 'var(--red)' }}>
            {summary.totalMonthlyNow > 0 ? formatCents(summary.totalMonthlyNow) : '—'}
          </span>
        </div>
        <div className="summary-kv" style={{ marginTop: 2 }}>
          <span className="k">After grace</span>
          <span className="v" style={{ color: 'var(--red)' }}>
            {summary.totalMonthlyLater != null ? formatCents(summary.totalMonthlyLater) : '—'}
          </span>
        </div>
        <div className="summary-kv" style={{ marginTop: 2 }}>
          <span className="k">Avg rate</span>
          <span className="v">
            {summary.totalBalance > 0 ? `${summary.weightedRate.toFixed(2)}%` : '—'}
          </span>
        </div>
        <div className="summary-kv" style={{ marginTop: 2 }}>
          <span className="k">Payoff age</span>
          <span className="v">
            {summary.payoffAge != null
              ? `${summary.payoffAge} yrs`
              : birthdateISO
                ? '—'
                : 'Set birthdate in Settings'}
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
        <div className="card" key={l.id} style={{ marginBottom: 10, padding: '12px 14px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span className="name" style={{ fontSize: '1rem', fontWeight: 600 }}>
              {l.name}
            </span>
            <span
              style={{
                fontSize: '0.7rem',
                padding: '2px 6px',
                borderRadius: 999,
                background: l.category === 'public' ? 'rgba(59,130,246,0.15)' : 'rgba(234,179,8,0.15)',
                color: l.category === 'public' ? 'var(--blue)' : 'var(--yellow)'
              }}
            >
              {l.category === 'public' ? 'Public' : 'Private'}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 16px', marginBottom: 6 }}>
            <span style={{ color: 'var(--red)', fontWeight: 600 }}>{formatCents(l.balanceCents)}</span>
            <span style={{ fontSize: '0.9rem' }}>
              {l.interestRatePercent.toFixed(2)}% {l.rateType === 'fixed' ? 'fixed' : 'variable'}
            </span>
          </div>
          <div style={{ fontSize: '0.85rem', marginBottom: 6 }}>
            <span style={{ color: 'var(--muted)' }}>
              {l.repaymentStatus === 'in_school_interest_only'
                ? 'In school'
                : l.repaymentStatus === 'grace_interest_only'
                  ? 'Grace'
                  : l.repaymentStatus === 'full_repayment'
                    ? 'Full repayment'
                    : l.repaymentStatus === 'idr'
                      ? 'IDR'
                      : l.repaymentStatus === 'deferred_forbearance'
                        ? 'Deferred'
                        : 'Custom'}
            </span>
            {' · '}
            <span style={{ color: 'var(--red)' }}>
              Now: {l.monthlyNowCents != null ? formatCents(l.monthlyNowCents) : '—'}
            </span>
            {l.monthlyLaterCents != null ? (
              <>
                {' · '}
                <span>After grace: {formatCents(l.monthlyLaterCents)}</span>
              </>
            ) : null}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 8 }}>
            {l.lender ? `Servicer: ${l.lender} · ` : null}
            Daily ≈ {formatCents(l.dailyInterestCents)} · Monthly ≈ {formatCents(l.monthlyInterestCents)}
          </div>
          <div className="btn-row" style={{ marginTop: 6, flexWrap: 'wrap', gap: 6 }}>
            <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.85rem' }} onClick={() => setEditor({ mode: 'edit', value: loanToEditor(l, hasRecurringIncome) })}>Edit</button>
            <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.85rem' }} onClick={() => { if (!confirm('Delete this loan?')) return; persist({ loans: state.loans.filter((x) => x.id !== l.id) }); }}>Delete</button>
            <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.85rem' }} onClick={() => setPayoffLoan(l)}>Payoff age</button>
            <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.85rem' }} onClick={() => setScheduleLoan(l)}>Breakdown</button>
            {l.category === 'private' ? <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.85rem' }} onClick={() => setRefiLoan(l)}>Refinance</button> : null}
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

      {/* Payment breakdown / schedule modal */}
      <Modal
        open={!!scheduleLoan}
        title="Payment breakdown"
        onClose={() => setScheduleLoan(null)}
      >
        {scheduleLoan ? (
          <PaymentScheduleModal
            loan={scheduleLoan}
            onClose={() => setScheduleLoan(null)}
            onSave={(ranges) => {
              persist({
                loans: state.loans.map((l) =>
                  l.id === scheduleLoan.id ? { ...l, paymentScheduleRanges: ranges } : l
                )
              });
              setScheduleLoan(null);
            }}
          />
        ) : null}
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
      {state.category === 'public' ? (
        <>
          <div className="field">
            <label>Subsidy type</label>
            <Select
              value={state.subsidyType}
              onChange={(e) =>
                onChange({
                  ...state,
                  subsidyType: e.target.value === 'subsidized' ? 'subsidized' : 'unsubsidized'
                })
              }
            >
              <option value="subsidized">Subsidized</option>
              <option value="unsubsidized">Unsubsidized</option>
            </Select>
            <p style={{ marginTop: 2, fontSize: '0.8rem', color: 'var(--muted)' }}>
              Subsidized: no interest during school/grace. Unsubsidized: interest from disbursement.
            </p>
          </div>
          {state.subsidyType === 'unsubsidized' ? (
            <div className="field">
              <label>Disbursement date</label>
              <input
                type="date"
                value={state.disbursementDate}
                onChange={(e) => onChange({ ...state, disbursementDate: e.target.value })}
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
              <p style={{ marginTop: 2, fontSize: '0.8rem', color: 'var(--muted)' }}>
                Date interest started accruing
              </p>
            </div>
          ) : null}
        </>
      ) : null}
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
        <label>Current status</label>
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
        <p style={{ marginTop: 2, fontSize: '0.8rem', color: 'var(--muted)' }}>
          Current repayment status
        </p>
      </div>
      {state.category === 'public' ? (
        <div className="field">
          <label>Plan after grace</label>
          <Select
            value={state.futureRepaymentPlan}
            onChange={(e) =>
              onChange({
                ...state,
                futureRepaymentPlan: (e.target.value || 'na') as FutureRepaymentPlan
              })
            }
          >
            <option value="na">N/A</option>
            <option value="idr">IDR</option>
            <option value="standard">Standard</option>
            <option value="graduated">Graduated</option>
            <option value="extended">Extended</option>
            <option value="custom">Custom</option>
          </Select>
          <p style={{ marginTop: 2, fontSize: '0.8rem', color: 'var(--muted)' }}>
            Future repayment plan (used for &quot;after grace&quot; estimate)
          </p>
        </div>
      ) : null}
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
      {(state.repaymentStatus === 'idr' && idrAllowed) ||
      (state.category === 'public' && state.futureRepaymentPlan === 'idr') ? (
        <div
          className="field"
          style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8 }}
        >
          <label style={{ display: 'block', marginBottom: 4 }}>
            IDR income source
            {state.repaymentStatus !== 'idr' && state.futureRepaymentPlan === 'idr'
              ? ' (for after-grace estimate)'
              : ''}
          </label>
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

function sortRanges(ranges: PaymentScheduleRange[]): PaymentScheduleRange[] {
  return [...ranges].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function rangesOverlap(a: { startDate: string; endDate: string }, b: { startDate: string; endDate: string }): boolean {
  return a.startDate < b.endDate && a.endDate > b.startDate;
}

function PaymentScheduleModal(props: {
  loan: LoanWithDerived;
  onClose: () => void;
  onSave: (ranges: PaymentScheduleRange[]) => void;
}) {
  const { loan, onClose, onSave } = props;
  const [ranges, setRanges] = useState<PaymentScheduleRange[]>(() =>
    sortRanges(loan.paymentScheduleRanges || [])
  );
  const [adding, setAdding] = useState(false);
  const [addStart, setAddStart] = useState(todayISO());
  const [addEnd, setAddEnd] = useState('');
  const [addPayment, setAddPayment] = useState(
    loan.monthlyNowCents != null ? (loan.monthlyNowCents / 100).toFixed(2) : ''
  );
  const [addRate, setAddRate] = useState(loan.interestRatePercent ? String(loan.interestRatePercent) : '');
  const [addNote, setAddNote] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const sortedRanges = useMemo(() => sortRanges(ranges), [ranges]);

  function handleGenerate() {
    const newRanges: PaymentScheduleRange[] = [];
    const start = todayISO();
    if (loan.monthlyNowCents != null && loan.monthlyNowCents > 0) {
      const end = loan.gracePeriodEndDate || addMonths(new Date(), 12).toISOString().slice(0, 10);
      newRanges.push({
        id: uid(),
        startDate: start,
        endDate: end,
        paymentCents: loan.monthlyNowCents,
        ratePercent: loan.interestRatePercent,
        note: 'Estimated (current)'
      });
    }
    if (loan.monthlyLaterCents != null && loan.monthlyLaterCents > 0 && loan.gracePeriodEndDate) {
      const graceEnd = loan.gracePeriodEndDate;
      const laterEnd = addMonths(new Date(graceEnd + 'T00:00:00'), 120).toISOString().slice(0, 10);
      newRanges.push({
        id: uid(),
        startDate: graceEnd,
        endDate: laterEnd,
        paymentCents: loan.monthlyLaterCents,
        ratePercent: loan.interestRatePercent,
        note: 'Estimated (after grace)'
      });
    }
    if (newRanges.length > 0) setRanges((prev) => sortRanges([...prev, ...newRanges]));
  }

  function handleAdd() {
    setAddError(null);
    if (!addStart || !addEnd) {
      setAddError('Start and end date required');
      return;
    }
    if (addStart >= addEnd) {
      setAddError('End date must be after start date');
      return;
    }
    const paymentCents = Math.round(parseFloat(addPayment || '0') * 100);
    if (!(paymentCents > 0)) {
      setAddError('Payment must be greater than 0');
      return;
    }
    const newRange: PaymentScheduleRange = {
      id: uid(),
      startDate: addStart,
      endDate: addEnd,
      paymentCents,
      ratePercent: addRate ? parseFloat(addRate) : undefined,
      note: addNote.trim() || undefined
    };
    for (const r of ranges) {
      if (rangesOverlap(newRange, r)) {
        setAddError('This range overlaps an existing range');
        return;
      }
    }
    setRanges((prev) => sortRanges([...prev, newRange]));
    setAdding(false);
    setAddStart(todayISO());
    setAddEnd('');
    setAddPayment(loan.monthlyNowCents != null ? (loan.monthlyNowCents / 100).toFixed(2) : '');
    setAddRate(String(loan.interestRatePercent));
    setAddNote('');
  }

  return (
    <>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: 0, marginBottom: 8 }}>
        Optional payment schedule ranges. No gaps or overlaps.
      </p>
      <div style={{ marginBottom: 8 }}>
        <button type="button" className="btn btn-secondary" style={{ marginRight: 8 }} onClick={handleGenerate}>
          Generate estimated schedule
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>
          Add range
        </button>
      </div>
      {loan.rateType === 'variable' ? (
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '4px 0 8px' }}>
          Variable-rate: each range stores its rate. Use “Recompute” to update a range’s payment when the loan’s rate changes.
        </p>
      ) : null}
      {sortedRanges.length > 0 ? (
        <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0' }}>
          {sortedRanges.map((r) => {
            const recomputedPayment =
              loan.rateType === 'variable' && loan.interestRatePercent != null
                ? computeAmortizedPaymentCents(
                    loan.balanceCents,
                    loan.interestRatePercent,
                    loan.termMonths
                  ) ?? computeInterestOnlyMonthlyCents(loan.balanceCents, loan.interestRatePercent)
                : null;
            const rateDiffers =
              loan.rateType === 'variable' &&
              r.ratePercent != null &&
              Math.abs(r.ratePercent - (loan.interestRatePercent ?? 0)) > 0.01;
            return (
              <li
                key={r.id}
                style={{
                  padding: '6px 8px',
                  marginBottom: 4,
                  background: 'var(--bg-muted, rgba(0,0,0,0.05))',
                  borderRadius: 4,
                  fontSize: '0.9rem',
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <span>
                  {r.startDate} – {r.endDate} = {formatCents(r.paymentCents)}
                  {r.ratePercent != null ? ` (${r.ratePercent.toFixed(2)}%)` : ''}
                </span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {loan.rateType === 'variable' && rateDiffers && recomputedPayment != null ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '2px 8px', fontSize: '0.8rem' }}
                      onClick={() => {
                        setRanges((prev) =>
                          prev.map((x) =>
                            x.id === r.id
                              ? {
                                  ...x,
                                  paymentCents: recomputedPayment,
                                  ratePercent: loan.interestRatePercent
                                }
                              : x
                          )
                        );
                      }}
                    >
                      Recompute with current rate
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '2px 8px', fontSize: '0.8rem' }}
                    onClick={() => {
                      setRanges((prev) => prev.filter((x) => x.id !== r.id));
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {adding ? (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginTop: 8 }}>
          <div className="field">
            <label>Start date</label>
            <input type="date" value={addStart} onChange={(e) => setAddStart(e.target.value)} />
          </div>
          <div className="field">
            <label>End date</label>
            <input type="date" value={addEnd} onChange={(e) => setAddEnd(e.target.value)} />
          </div>
          <div className="field">
            <label>Payment ($)</label>
            <input
              value={addPayment}
              onChange={(e) => setAddPayment(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <div className="field">
            <label>Rate % (optional)</label>
            <input value={addRate} onChange={(e) => setAddRate(e.target.value)} inputMode="decimal" />
          </div>
          <div className="field">
            <label>Note (optional)</label>
            <input value={addNote} onChange={(e) => setAddNote(e.target.value)} placeholder="Optional" />
          </div>
          {addError ? <p style={{ color: 'var(--red)', fontSize: '0.85rem', marginTop: 4 }}>{addError}</p> : null}
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={() => { setAdding(false); setAddError(null); }}>Cancel</button>
            <button type="button" className="btn btn-secondary" onClick={handleAdd}>Add</button>
          </div>
        </div>
      ) : null}
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-secondary" onClick={() => onSave(ranges)}>Save</button>
      </div>
    </>
  );
}

