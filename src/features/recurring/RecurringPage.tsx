import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCents, formatLongLocalDate, parseCents } from '../../state/calc';
import type { RecurringItem } from '../../state/models';
import { useLedgerStore } from '../../state/store';
import { loadCategoryConfig, getCategoryName, getCategorySubcategories, loadInvesting, loadLoans, getVisiblePaymentNowCents } from '../../state/storage';
import { getLoanEstimatedPaymentNowMap, getDetectedAnnualIncomeCentsFromRecurring, getPrivatePaymentNowTotal } from '../loans/loanDerivation';
import { useDropdownCollapsed, useDropdownState } from '../../state/DropdownStateContext';
import { Select } from '../../ui/Select';
import { OptimizerModal } from '../optimizer/OptimizerModal';
import { ViewLastOptimizerModal } from '../optimizer/ViewLastOptimizerModal';

export function RecurringPage({ addTrigger = 0 }: { addTrigger?: number } = {}) {
  const data = useLedgerStore((s) => s.data);
  const actions = useLedgerStore((s) => s.actions);
  const cfg = useMemo(() => loadCategoryConfig(), []);
  const investingState = useMemo(() => loadInvesting(), []);

  useEffect(() => {
    actions.processRecurringBillsUpToToday();
  }, [actions]);

  const [open, setOpen] = useState(false);

  const lastAddTriggerRef = useRef(addTrigger);
  useEffect(() => {
    if (addTrigger !== lastAddTriggerRef.current) {
      lastAddTriggerRef.current = addTrigger;
      if (addTrigger > 0) setOpen(true);
    }
  }, [addTrigger]);
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [expectedMin, setExpectedMin] = useState('');
  const [expectedMax, setExpectedMax] = useState('');
  const [frequency, setFrequency] = useState<'monthly' | 'weekly' | 'biweekly' | 'yearly' | 'every_n_days'>('monthly');
  const [everyNDays, setEveryNDays] = useState('30');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  });
  const [active, setActive] = useState(true);
  const [isActiveIncome, setIsActiveIncome] = useState(true);
  const [autoPay, setAutoPay] = useState(false);
  const [paymentSource, setPaymentSource] = useState<'card' | 'bank' | 'hysa' | ''>('');
  const [paymentTargetId, setPaymentTargetId] = useState('');
  const [hysaSubBucket, setHysaSubBucket] = useState<'liquid' | 'reserved' | ''>('');
  const [category, setCategory] = useState('food');
  const [subcategory, setSubcategory] = useState('');
  const [notes, setNotes] = useState('');
  const [isSplit, setIsSplit] = useState(false);
  const [myPortion, setMyPortion] = useState('');
  const [useLastDayOfMonth, setUseLastDayOfMonth] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFullTimeJob, setIsFullTimeJob] = useState(false);
  const [preTaxDeductions, setPreTaxDeductions] = useState<
    {
      id: string;
      amount: string;
      deductionType: 'retirement' | 'regular';
      investingAccountId?: string;
      customName?: string;
      employerContributionType: 'none' | 'pct_employee' | 'pct_gross';
      employerMatchPct?: string;
      employerMatchPctOfGross?: string;
    }[]
  >([]);
  const [investingTransferEnabled, setInvestingTransferEnabled] = useState(false);
  const [investingFromBankId, setInvestingFromBankId] = useState('');
  const [investingTargetAccountId, setInvestingTargetAccountId] = useState('');
  const [investingTargetType, setInvestingTargetType] = useState<'hysa' | 'general' | ''>('');
  const [useLoanEstimatedPayment, setUseLoanEstimatedPayment] = useState(false);
  const [linkedLoanId, setLinkedLoanId] = useState('');
  const [optimizerModalOpen, setOptimizerModalOpen] = useState(false);
  const [viewLastOptimizerOpen, setViewLastOptimizerOpen] = useState(false);

  const subs = useMemo(() => getCategorySubcategories(cfg, category), [cfg, category]);

  const loansState = useMemo(() => loadLoans(), []);
  const loanPaymentMap = useMemo(() => {
    const detectedIncome = getDetectedAnnualIncomeCentsFromRecurring((data as any).recurring || []);
    return getLoanEstimatedPaymentNowMap(loansState.loans || [], detectedIncome);
  }, [data.recurring, loansState.loans]);
  const totalVisiblePaymentNowCents = useMemo(() => {
    const detectedIncome = getDetectedAnnualIncomeCentsFromRecurring((data as any).recurring || []);
    const derivedPrivate = getPrivatePaymentNowTotal(loansState.loans || [], detectedIncome);
    return getVisiblePaymentNowCents(derivedPrivate);
  }, [loansState.loans, data.recurring]);
  const loanList = loansState.loans || [];
  const showLoanLinkSection = type === 'expense' && (category === 'loan_payment' || useLoanEstimatedPayment);

  const recurring = (data as any).recurring || [];
  const income = recurring.filter((r: any) => r.type === 'income');
  const expenses = recurring.filter((r: any) => (r.type || 'expense') !== 'income');
  const expensesByCategory = useMemo(() => {
    const map = new Map<string, any[]>();
    expenses.forEach((r: any) => {
      const cat = (r.category || 'uncategorized') as string;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(r);
    });
    return Array.from(map.entries());
  }, [expenses]);
  const [incomeCollapsed, setIncomeCollapsed] = useDropdownCollapsed('recurring_income', true);
  const [expensesSectionCollapsed, setExpensesSectionCollapsed] = useDropdownCollapsed('recurring_expenses_main', false);
  const { getDropdownCollapsed, setDropdownCollapsed } = useDropdownState();
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string } | null>(null);

  return (
    <div className="tab-panel active" id="recurringContent">
      <p className="section-title page-title">Recurring Items</p>
      <div
        className="section-header"
        style={{
          marginTop: 16,
          fontSize: '1.05rem',
          fontWeight: 640,
          borderRadius: 10
        }}
        onClick={() => setIncomeCollapsed(!incomeCollapsed)}
      >
        <span className="section-header-left">
          Recurring Income
        </span>
        <span className="chevron">{incomeCollapsed ? '▸' : '▾'}</span>
      </div>
      {!incomeCollapsed ? (
        <>
          {income.map((r: any) => {
            const inactive = r.isActive === false;
            return (
            <div
              className="card"
              key={r.id}
              style={
                inactive
                  ? { opacity: 0.7, background: 'var(--surface)', borderColor: 'var(--border)' }
                  : undefined
              }
            >
              {inactive ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))', marginBottom: 6 }}>
                  Inactive – not included in projections
                </div>
              ) : null}
              <div className="row">
                <span className="name">{r.name || 'Income'}</span>
                <span className="amount" style={{ color: 'var(--green)' }}>
                  {`$${((r.amountCents || 0) / 100).toFixed(2)}`}
                </span>
              </div>
              <div style={{ color: 'var(--ui-primary-text, var(--text))', fontSize: '0.9rem', marginTop: 6 }}>
                {r.frequency || 'monthly'} • start {formatLongLocalDate(r.startDate)}
              </div>
              <div className="btn-row" style={{ display: 'flex', flexWrap: 'nowrap', gap: 8, marginTop: 10 }}>
                {inactive ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => actions.updateRecurringItem(r.id, { isActive: true })}
                  >
                    Resume
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary btn-outline-neutral"
                    onClick={() => actions.updateRecurringItem(r.id, { isActive: false })}
                  >
                    Pause
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setEditingId(r.id);
                    setType(r.type || 'income');
                    setName(r.name || '');
                    setAmount(((r.amountCents || 0) / 100).toFixed(2));
                    setExpectedMin(
                      typeof r.expectedMinCents === 'number' ? (r.expectedMinCents / 100).toFixed(2) : ''
                    );
                    setExpectedMax(
                      typeof r.expectedMaxCents === 'number' ? (r.expectedMaxCents / 100).toFixed(2) : ''
                    );
                    setFrequency(r.frequency || 'monthly');
                    const nDays = r.everyNDays || r.intervalDays || 30;
                    setEveryNDays(String(nDays));
                    setStartDate(r.startDate || startDate);
                    setActive(r.active !== false);
                    setIsActiveIncome((r as any).isActive !== false);
                    setAutoPay(!!r.autoPay);
                    setPaymentSource((r.paymentSource as any) || '');
                    setPaymentTargetId(r.paymentTargetId || '');
                    setHysaSubBucket((r as any).hysaSubBucket || '');
                    setCategory(r.category || 'food');
                    setSubcategory(r.subcategory || '');
                    setNotes(r.notes || '');
                    const split = !!r.isSplit && typeof r.myPortionCents === 'number';
                    setIsSplit(split);
                    setMyPortion(
                      split && typeof r.myPortionCents === 'number'
                        ? (r.myPortionCents / 100).toFixed(2)
                        : ''
                    );
                      setUseLastDayOfMonth(!!r.useLastDayOfMonth);
                      setIsFullTimeJob(!!r.isFullTimeJob);
                      setPreTaxDeductions(
                        Array.isArray(r.preTaxDeductions)
                          ? r.preTaxDeductions.map((d: any) => {
                              const deductionType =
                                d.deductionType === 'retirement' || d.deductionType === 'regular'
                                  ? d.deductionType
                                  : !!d.countsAsInvesting
                                    ? 'retirement'
                                    : 'regular';
                              const hasLegacyMatch = typeof d.employerMatchPct === 'number' && d.employerMatchPct >= 0;
                              const employerContributionType =
                                d.employerContributionType === 'none' || d.employerContributionType === 'pct_employee' || d.employerContributionType === 'pct_gross'
                                  ? d.employerContributionType
                                  : hasLegacyMatch
                                    ? 'pct_employee'
                                    : 'none';
                              return {
                                id: d.id,
                                amount:
                                  typeof d.amountCents === 'number'
                                    ? (d.amountCents / 100).toFixed(2)
                                    : '',
                                deductionType,
                                investingAccountId: d.investingAccountId || undefined,
                                customName: d.customName ?? d.name ?? '',
                                employerContributionType,
                                employerMatchPct:
                                  typeof d.employerMatchPct === 'number'
                                    ? String(d.employerMatchPct)
                                    : '',
                                employerMatchPctOfGross:
                                  typeof d.employerMatchPctOfGross === 'number'
                                    ? String(d.employerMatchPctOfGross)
                                    : ''
                              };
                            })
                          : []
                      );
                      setInvestingTransferEnabled(!!r.investingTransferEnabled);
                      setInvestingFromBankId(r.investingFromBankId || '');
                      setInvestingTargetAccountId(r.investingTargetAccountId || '');
                      setInvestingTargetType((r.investingTargetType as any) || '');
                    setOpen(true);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => setConfirmDelete({ id: r.id, label: r.name || 'Recurring income' })}
                >
                  Delete
                </button>
              </div>
            </div>
          );})}
        </>
      ) : null}

      <div
        className="section-header recurring-expenses-section-header"
        style={{
          marginTop: 24,
          fontSize: '1.05rem',
          fontWeight: 640,
          padding: '8px 12px',
          borderRadius: 10
        }}
        onClick={() => setExpensesSectionCollapsed(!expensesSectionCollapsed)}
      >
        <span className="section-header-left">Recurring Expenses</span>
        <span className="chevron">{expensesSectionCollapsed ? '▸' : '▾'}</span>
      </div>
      {!expensesSectionCollapsed ? (
      <>
      {expensesByCategory.map(([catId, items]) => {
        const headerLabel = getCategoryName(cfg, catId);
        const id = `recurring_expenses_${catId}`;
        const collapsed = getDropdownCollapsed(id, true);
        return (
          <div key={catId} style={{ marginBottom: 8 }}>
            <div
              className="section-header"
              onClick={() => setDropdownCollapsed(id, !collapsed)}
              style={{ fontSize: '0.98rem', fontWeight: 600 }}
            >
              <span className="section-header-left">
                {items.length === 1 ? headerLabel : `${headerLabel} (${items.length} items)`}
              </span>
              <span className="chevron">{collapsed ? '▸' : '▾'}</span>
            </div>
            {!collapsed ? (
              <>
                <div className="card-carousel">
                {items.map((r: any) => (
                  <div className="card-carousel-item" key={r.id}>
                  <div className="card">
                    <div className="row">
                      <span className="name">{r.name || 'Expense'}</span>
                      <span className="amount" style={{ color: 'var(--red)' }}>
                        {`$${((r.amountCents || 0) / 100).toFixed(2)}`}
                      </span>
                    </div>
                    <div style={{ color: 'var(--ui-primary-text, var(--text))', fontSize: '0.9rem', marginTop: 6 }}>
                      {getCategoryName(cfg, r.category || 'uncategorized')} • {r.frequency || 'monthly'} • start{' '}
                      {formatLongLocalDate(r.startDate)} {r.autoPay ? '• autopay' : ''}
                    </div>
                    {r.useLoanEstimatedPayment ? (
                      <div style={{ fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))', marginTop: 4 }}>
                        Amount: auto-filled from your current loan payment
                      </div>
                    ) : null}
                    <div className="btn-row">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setEditingId(r.id);
                          setType((r.type as any) || 'expense');
                          setName(r.name || '');
                          const loanCents =
                            r.useLoanEstimatedPayment && totalVisiblePaymentNowCents > 0
                              ? totalVisiblePaymentNowCents
                              : r.amountCents || 0;
                          setAmount((loanCents / 100).toFixed(2));
                          setExpectedMin(
                            typeof r.expectedMinCents === 'number' ? (r.expectedMinCents / 100).toFixed(2) : ''
                          );
                          setExpectedMax(
                            typeof r.expectedMaxCents === 'number' ? (r.expectedMaxCents / 100).toFixed(2) : ''
                          );
                          setFrequency(r.frequency || 'monthly');
                          const nDays = r.everyNDays || r.intervalDays || 30;
                          setEveryNDays(String(nDays));
                          setStartDate(r.startDate || startDate);
                          setActive(r.active !== false);
                          setAutoPay(!!r.autoPay);
                          setPaymentSource((r.paymentSource as any) || '');
                          setPaymentTargetId(r.paymentTargetId || '');
                          setHysaSubBucket((r as any).hysaSubBucket || '');
                          setCategory(r.category || 'food');
                          setSubcategory(r.subcategory || '');
                          setNotes(r.notes || '');
                          const split = !!r.isSplit && typeof r.myPortionCents === 'number';
                          setIsSplit(split);
                          setMyPortion(
                            split && typeof r.myPortionCents === 'number'
                              ? (r.myPortionCents / 100).toFixed(2)
                              : ''
                          );
                          setUseLastDayOfMonth(!!r.useLastDayOfMonth);
                          setUseLoanEstimatedPayment(!!r.useLoanEstimatedPayment);
                          setLinkedLoanId('');
                          setOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => setConfirmDelete({ id: r.id, label: r.name || 'Recurring' })}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  </div>
                ))}
                </div>
              </>
            ) : null}
          </div>
        );
      })}
      </>
      ) : null}

      <button
        type="button"
        className="btn btn-add"
        style={{ marginTop: 16, width: '100%' }}
        onClick={() => {
          setEditingId(null);
          setType('expense');
          setName('');
          setAmount('');
          setExpectedMin('');
          setExpectedMax('');
          setFrequency('monthly');
          setEveryNDays('30');
          const d = new Date();
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          setStartDate(`${y}-${m}-${dd}`);
          setActive(true);
          setAutoPay(false);
          setPaymentSource('');
          setPaymentTargetId('');
          setHysaSubBucket('');
          setCategory('food');
          setSubcategory('');
          setNotes('');
          setIsSplit(false);
          setMyPortion('');
          setUseLastDayOfMonth(false);
          setIsFullTimeJob(false);
          setPreTaxDeductions([]);
          setInvestingTransferEnabled(false);
          setInvestingFromBankId('');
          setInvestingTargetAccountId('');
          setInvestingTargetType('');
          setUseLoanEstimatedPayment(false);
          setLinkedLoanId('');
          setOpen(true);
        }}
      >
        Add Recurring Item
      </button>

      {open ? (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Recurring Item</h3>
            <div className="field">
              <label>Type</label>
              <Select value={type} onChange={(e) => setType(e.target.value as any)}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </Select>
            </div>
            <div className="field">
              <label>Name / Merchant</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rent" />
            </div>
            <div className="field">
              <label>Amount ($)</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                readOnly={useLoanEstimatedPayment && totalVisiblePaymentNowCents > 0}
              />
            </div>
            <div className="field">
              <label>Expected min ($) optional</label>
              <input value={expectedMin} onChange={(e) => setExpectedMin(e.target.value)} inputMode="decimal" placeholder="e.g. 90" />
            </div>
            <div className="field">
              <label>Expected max ($) optional</label>
              <input
                value={expectedMax}
                onChange={(e) => setExpectedMax(e.target.value)}
                inputMode="decimal"
                placeholder="e.g. 150"
              />
            </div>

            {type === 'income' ? (
              <>
                <div className="toggle-row">
                  <input
                    type="checkbox"
                    id="recFullTimeJob"
                    checked={isFullTimeJob}
                    onChange={(e) => setIsFullTimeJob(e.target.checked)}
                  />
                  <label htmlFor="recFullTimeJob">Full-time job (has pre-tax deductions)</label>
                </div>
                {isFullTimeJob ? (
                  <div className="card" style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ width: '100%', justifyContent: 'center' }}
                        onClick={() => setOptimizerModalOpen(true)}
                      >
                        Estimate Optimized Pre-Tax Deductions
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ width: '100%', justifyContent: 'center' }}
                        onClick={() => setViewLastOptimizerOpen(true)}
                      >
                        View last computed values
                      </button>
                    </div>
                    <div className="row" style={{ marginBottom: 6 }}>
                      <span className="name" style={{ fontSize: '0.95rem' }}>
                        Pre-tax deductions
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ minHeight: 32, padding: '6px 10px', fontSize: '0.85rem' }}
                        onClick={() => {
                          const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
                          setPreTaxDeductions((prev) => [
                            ...prev,
                            { id, amount: '', deductionType: 'regular' as const, customName: '', employerContributionType: 'none' as const }
                          ]);
                        }}
                      >
                        Add deduction
                      </button>
                    </div>
                    {preTaxDeductions.length === 0 ? (
                    <p style={{ color: 'var(--ui-primary-text, var(--text))', fontSize: '0.85rem', marginTop: 0 }}>
                        No pre-tax deductions added yet.
                      </p>
                    ) : null}
                    {preTaxDeductions.map((d) => (
                      <div key={d.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                        <div className="field">
                          <label>Deduction Type</label>
                          <Select
                            value={d.deductionType}
                            onChange={(e) =>
                              setPreTaxDeductions((prev) =>
                                prev.map((x) =>
                                  x.id === d.id
                                    ? {
                                        ...x,
                                        deductionType: e.target.value as 'retirement' | 'regular',
                                        investingAccountId: e.target.value === 'retirement' ? x.investingAccountId : undefined,
                                        customName: e.target.value === 'regular' ? (x.customName ?? '') : undefined
                                      }
                                    : x
                                )
                              )
                            }
                          >
                            <option value="retirement">Employer retirement contribution</option>
                            <option value="regular">Regular deduction</option>
                          </Select>
                        </div>
                        {d.deductionType === 'retirement' ? (
                          <>
                            <div className="field">
                              <label>Retirement Account</label>
                              <Select
                                value={d.investingAccountId || ''}
                                onChange={(e) =>
                                  setPreTaxDeductions((prev) =>
                                    prev.map((x) =>
                                      x.id === d.id ? { ...x, investingAccountId: e.target.value || undefined } : x
                                    )
                                  )
                                }
                              >
                                <option value="">Select...</option>
                                {investingState.accounts
                                  .filter((a) => a.type === 'k401')
                                  .map((a) => (
                                    <option key={a.id} value={a.id}>
                                      {a.name}
                                    </option>
                                  ))}
                              </Select>
                            </div>
                            <div className="field">
                              <label>Employer contribution type</label>
                              <Select
                                value={d.employerContributionType}
                                onChange={(e) =>
                                  setPreTaxDeductions((prev) =>
                                    prev.map((x) =>
                                      x.id === d.id
                                        ? { ...x, employerContributionType: e.target.value as 'none' | 'pct_employee' | 'pct_gross' }
                                        : x
                                    )
                                  )
                                }
                              >
                                <option value="pct_employee">Employer matches</option>
                                <option value="pct_gross">% of gross income</option>
                                <option value="none">None</option>
                              </Select>
                            </div>
                            {d.employerContributionType === 'pct_employee' ? (
                              <div className="field">
                                <label>Percent</label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={d.employerMatchPct ?? ''}
                                  onChange={(e) =>
                                    setPreTaxDeductions((prev) =>
                                      prev.map((x) => (x.id === d.id ? { ...x, employerMatchPct: e.target.value } : x))
                                    )
                                  }
                                  placeholder="e.g. 5"
                                />
                              </div>
                            ) : null}
                            {d.employerContributionType === 'pct_gross' ? (
                              <div className="field">
                                <label>Percent</label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={d.employerMatchPctOfGross ?? ''}
                                  onChange={(e) =>
                                    setPreTaxDeductions((prev) =>
                                      prev.map((x) => (x.id === d.id ? { ...x, employerMatchPctOfGross: e.target.value } : x))
                                    )
                                  }
                                  placeholder="e.g. 5"
                                />
                              </div>
                            ) : null}
                            {(() => {
                              const grossCents = parseCents(amount);
                              const amtCents = (() => {
                                if (d.employerContributionType === 'pct_gross') {
                                  const pctRaw = d.employerMatchPctOfGross != null && d.employerMatchPctOfGross.trim() !== '' ? parseFloat(d.employerMatchPctOfGross) : NaN;
                                  if (Number.isFinite(pctRaw) && pctRaw >= 0 && grossCents > 0) {
                                    return Math.round(grossCents * (pctRaw / 100));
                                  }
                                  return 0;
                                }
                                return d.amount.trim() ? parseCents(d.amount) : 0;
                              })();
                              const employerCents = (() => {
                                if (d.employerContributionType === 'pct_employee') {
                                  const pctRaw = d.employerMatchPct != null && d.employerMatchPct.trim() !== '' ? parseFloat(d.employerMatchPct) : NaN;
                                  if (Number.isFinite(pctRaw) && pctRaw >= 0 && amtCents > 0) {
                                    return Math.round(amtCents * (pctRaw / 100));
                                  }
                                  return 0;
                                }
                                if (d.employerContributionType === 'pct_gross') {
                                  const pctRaw = d.employerMatchPctOfGross != null && d.employerMatchPctOfGross.trim() !== '' ? parseFloat(d.employerMatchPctOfGross) : NaN;
                                  if (Number.isFinite(pctRaw) && pctRaw >= 0 && grossCents > 0) {
                                    return Math.round(grossCents * (pctRaw / 100));
                                  }
                                  return 0;
                                }
                                return 0;
                              })();
                              const totalCents = amtCents + employerCents;
                              if (!(amtCents > 0) && !(employerCents > 0)) return null;
                              return (
                                <div style={{ fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))', marginTop: 4 }}>
                                  {d.employerContributionType === 'pct_employee' ? (
                                    <>
                                      <div>Employee contribution: ${ (amtCents / 100).toFixed(2) }</div>
                                      <div>Employer contribution: ${ (employerCents / 100).toFixed(2) }</div>
                                      <div>Total contribution: ${ (totalCents / 100).toFixed(2) }</div>
                                    </>
                                  ) : (
                                    <>
                                      <div>Gross income this item: ${ (grossCents / 100).toFixed(2) }</div>
                                      <div>Percent: {d.employerMatchPctOfGross || '0'}%</div>
                                      <div>Employee contribution amount: ${ (amtCents / 100).toFixed(2) }</div>
                                    </>
                                  )}
                                </div>
                              );
                            })()}
                          </>
                        ) : (
                          <div className="field">
                            <label>Deduction name</label>
                            <input
                              value={d.customName ?? ''}
                              onChange={(e) =>
                                setPreTaxDeductions((prev) =>
                                  prev.map((x) => (x.id === d.id ? { ...x, customName: e.target.value } : x))
                                )
                              }
                              placeholder="e.g. Health insurance, Dental, Transit"
                            />
                          </div>
                        )}
                        <div className="field">
                          <label>Amount ($)</label>
                          <input
                            value={
                              d.employerContributionType === 'pct_gross'
                                ? (() => {
                                    const grossCents = parseCents(amount);
                                    const pctRaw = d.employerMatchPctOfGross != null && d.employerMatchPctOfGross.trim() !== '' ? parseFloat(d.employerMatchPctOfGross) : NaN;
                                    if (Number.isFinite(pctRaw) && pctRaw >= 0 && grossCents > 0) {
                                      const cents = Math.round(grossCents * (pctRaw / 100));
                                      return (cents / 100).toFixed(2);
                                    }
                                    return d.amount;
                                  })()
                                : d.amount
                            }
                            onChange={(e) => {
                              if (d.employerContributionType === 'pct_gross') return;
                              const v = e.target.value;
                              setPreTaxDeductions((prev) =>
                                prev.map((x) => (x.id === d.id ? { ...x, amount: v } : x))
                              );
                            }}
                            readOnly={d.employerContributionType === 'pct_gross'}
                            inputMode="decimal"
                            placeholder="0.00"
                          />
                        </div>
                        <button
                          type="button"
                          className="btn-delete"
                          style={{ marginTop: 8 }}
                          onClick={() => {
                            if (!window.confirm('Remove this deduction?')) return;
                            setPreTaxDeductions((prev) => prev.filter((x) => x.id !== d.id));
                          }}
                        >
                          Delete deduction
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="toggle-row">
                  <input
                    type="checkbox"
                    checked={isSplit}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setIsSplit(next);
                      if (next) {
                        const totalCents = parseCents(amount);
                        if (totalCents > 0) {
                          const half = Math.round(totalCents / 2);
                          setMyPortion((half / 100).toFixed(2));
                        }
                      } else {
                        setMyPortion('');
                      }
                    }}
                    id="recSplit"
                  />
                  <label htmlFor="recSplit">Split with others</label>
                </div>
                {isSplit ? (
                  <div className="field">
                    <label>My portion ($)</label>
                    <input
                      value={myPortion}
                      onChange={(e) => setMyPortion(e.target.value)}
                      inputMode="decimal"
                      placeholder="0.00"
                    />
                  </div>
                ) : null}
                <div className="field">
                  <label>Category</label>
                  <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {Object.keys(cfg).map((id) => (
                      <option key={id} value={id}>
                        {getCategoryName(cfg, id)}
                      </option>
                    ))}
                  </Select>
                </div>
                {subs.length ? (
                  <div className="field">
                    <label>Subcategory</label>
                    <Select value={subcategory} onChange={(e) => setSubcategory(e.target.value)}>
                      <option value="">None</option>
                      {subs.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}
                {showLoanLinkSection ? (
                  <div className="field" style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                    <div className="toggle-row">
                      <input
                        type="checkbox"
                        id="useLoanEst"
                        checked={useLoanEstimatedPayment}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setUseLoanEstimatedPayment(checked);
                          setLinkedLoanId('');
                          if (checked) {
                            setExpectedMin('');
                            setExpectedMax('');
                            setAmount(totalVisiblePaymentNowCents > 0 ? (totalVisiblePaymentNowCents / 100).toFixed(2) : '');
                          }
                        }}
                      />
                      <label htmlFor="useLoanEst">Use current loan payment</label>
                    </div>
                    {useLoanEstimatedPayment ? (
                      <p style={{ fontSize: '0.85rem', color: 'var(--ui-primary-text, var(--text))', marginTop: 6 }}>
                        Auto-filled from your Loans tab. Current amount: {totalVisiblePaymentNowCents > 0 ? `$${(totalVisiblePaymentNowCents / 100).toFixed(2)}` : 'not set'}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}

            <div className="field">
              <label>Notes (optional)</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </div>

            <div className="field">
              <label>Frequency</label>
              <Select value={frequency} onChange={(e) => setFrequency(e.target.value as any)}>
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="yearly">Yearly</option>
                <option value="every_n_days">Custom (every N days)</option>
              </Select>
            </div>
            {frequency === 'every_n_days' ? (
              <div className="field">
                <label>Every N days</label>
                <input type="number" value={everyNDays} onChange={(e) => setEveryNDays(e.target.value)} min={1} step={1} />
              </div>
            ) : null}
            <div className="field">
              <label>Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) {
                    setStartDate(v);
                    return;
                  }
                  if (useLastDayOfMonth) {
                    const [y, m] = v.split('-').map(Number);
                    if (Number.isFinite(y) && Number.isFinite(m)) {
                      const last = new Date(y, m, 0);
                      const mm = String(last.getMonth() + 1).padStart(2, '0');
                      const dd = String(last.getDate()).padStart(2, '0');
                      setStartDate(`${y}-${mm}-${dd}`);
                    } else {
                      setStartDate(v);
                    }
                  } else {
                    setStartDate(v);
                  }
                }}
              />
            </div>
            <div className="toggle-row">
              <input
                type="checkbox"
                checked={useLastDayOfMonth}
                onChange={(e) => {
                  const next = e.target.checked;
                  setUseLastDayOfMonth(next);
                  if (next && startDate) {
                    const [yStr, mStr] = startDate.split('-');
                    const y = Number(yStr);
                    const m = Number(mStr);
                    if (Number.isFinite(y) && Number.isFinite(m)) {
                      const last = new Date(y, m, 0);
                      const mm = String(last.getMonth() + 1).padStart(2, '0');
                      const dd = String(last.getDate()).padStart(2, '0');
                      setStartDate(`${y}-${mm}-${dd}`);
                    }
                  }
                }}
                id="lastDay"
              />
              <label htmlFor="lastDay">Use last day of month</label>
            </div>
            <div className="toggle-row">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} id="active" />
              <label htmlFor="active">Active</label>
            </div>
            <div className="toggle-row">
              <input type="checkbox" checked={autoPay} onChange={(e) => setAutoPay(e.target.checked)} id="autopay" />
              <label htmlFor="autopay">Auto Pay / Auto Deposit</label>
            </div>

            {type === 'income' ? (
              <div className="field">
                <label>Default deposit bank (for posting)</label>
                <Select value={paymentTargetId} onChange={(e) => setPaymentTargetId(e.target.value)}>
                  <option value="">— Select bank —</option>
                  {(data.banks || []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : (
              <>
                <div className="field">
                  <label>Default payment source</label>
                  <Select
                    value={paymentSource}
                    onChange={(e) => {
                      const v = e.target.value as 'card' | 'bank' | 'hysa' | '';
                      setPaymentSource(v);
                      if (v !== 'hysa') setHysaSubBucket('');
                      if (v !== 'hysa') setPaymentTargetId('');
                    }}
                  >
                    <option value="">— Select source —</option>
                    <option value="card">Credit Card</option>
                    <option value="bank">Cash (Bank)</option>
                    <option value="hysa">HYSA / Investing</option>
                  </Select>
                </div>
                <div className="field">
                  <label>Default payment target</label>
                  <Select
                    value={
                      paymentSource === 'hysa' && paymentTargetId
                        ? `hysa:${paymentTargetId}`
                        : paymentTargetId
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (paymentSource === 'hysa' && v.startsWith('hysa:')) {
                        setPaymentTargetId(v.slice(5));
                        return;
                      }
                      setPaymentTargetId(v);
                    }}
                  >
                    <option value="">Select</option>
                    {paymentSource === 'card'
                      ? (data.cards || []).map((x: any) => (
                          <option key={x.id} value={x.id}>
                            {x.name}: {formatCents(x.balanceCents || 0)}
                          </option>
                        ))
                      : paymentSource === 'hysa'
                        ? (investingState.accounts || [])
                            .filter((a: any) => a.type === 'hysa')
                            .map((a: any) => (
                              <option key={a.id} value={`hysa:${a.id}`}>
                                {a.name}: {formatCents(a.balanceCents || 0)}
                              </option>
                            ))
                        : (data.banks || []).map((x: any) => (
                            <option key={x.id} value={x.id}>
                              {x.name}: {formatCents(x.balanceCents || 0)}
                            </option>
                          ))}
                  </Select>
                </div>
                {paymentSource === 'hysa' ? (
                  <div className="field">
                    <label>Use which HYSA portion?</label>
                    <Select
                      value={hysaSubBucket}
                      onChange={(e) => setHysaSubBucket(e.target.value as 'liquid' | 'reserved' | '')}
                    >
                      <option value="">Select...</option>
                      <option value="liquid">Money in HYSA Designated for Bills</option>
                      <option value="reserved">Reserved savings</option>
                    </Select>
                  </div>
                ) : null}

                {getCategoryName(cfg, category) === 'Investing' ? (
                  <div className="card" style={{ marginTop: 8 }}>
                    <div className="toggle-row">
                      <input
                        type="checkbox"
                        id="recInvestingTransfer"
                        checked={investingTransferEnabled}
                        onChange={(e) => setInvestingTransferEnabled(e.target.checked)}
                      />
                      <label htmlFor="recInvestingTransfer">Investing transfer (contribution)</label>
                    </div>
                    {investingTransferEnabled ? (
                      <>
                        <div className="field">
                          <label>Pay from (bank)</label>
                          <Select
                            value={investingFromBankId}
                            onChange={(e) => setInvestingFromBankId(e.target.value)}
                          >
                      <option value="">Select</option>
                            {(data.banks || []).map((b: any) => (
                              <option key={b.id} value={b.id}>
                          {b.name}: {formatCents(b.balanceCents || 0)}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div className="field">
                          <label>Deposit to (investing)</label>
                          <Select
                            value={
                              investingTargetAccountId
                                ? `${investingTargetType || ''}:${investingTargetAccountId}`
                                : ''
                            }
                            onChange={(e) => {
                              const v = e.target.value;
                              if (!v) {
                                setInvestingTargetAccountId('');
                                setInvestingTargetType('');
                                return;
                              }
                              const [kind, id] = v.split(':');
                              setInvestingTargetType(kind === 'hysa' ? 'hysa' : 'general');
                              setInvestingTargetAccountId(id);
                            }}
                          >
                            <option value="">Select...</option>
                            {investingState.accounts
                              .filter((a) => a.type === 'hysa' || a.type === 'general')
                              .map((a) => (
                                <option key={a.id} value={`${a.type}:${a.id}`}>
                                  {a.type === 'hysa' ? 'HYSA' : 'Investing'} — {a.name}
                                </option>
                              ))}
                          </Select>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}

            <div className="btn-row">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setOpen(false);
                  setEditingId(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  const resolvedCents =
                    useLoanEstimatedPayment && totalVisiblePaymentNowCents > 0
                      ? totalVisiblePaymentNowCents
                      : parseCents(amount);
                  if (!(resolvedCents > 0)) return;
                  const amountCents = resolvedCents;
                  const expectedMinCents = expectedMin.trim() ? parseCents(expectedMin) : undefined;
                  const expectedMaxCents = expectedMax.trim() ? parseCents(expectedMax) : undefined;
                  const every =
                    frequency === 'every_n_days' ? Math.max(1, parseInt(everyNDays || '1', 10) || 1) : undefined;
                  const intervalDays = frequency === 'every_n_days' ? every : undefined;
                  const preTax =
                    type === 'income'
                      ? preTaxDeductions
                          .map((d) => {
                            const contribType = d.employerContributionType || 'none';
                            let amtCents = 0;
                            if (contribType === 'pct_gross') {
                              const rawPctGross =
                                d.employerMatchPctOfGross != null && d.employerMatchPctOfGross.trim() !== ''
                                  ? parseFloat(d.employerMatchPctOfGross)
                                  : NaN;
                              if (Number.isFinite(rawPctGross) && rawPctGross >= 0 && amountCents > 0) {
                                amtCents = Math.round(amountCents * (rawPctGross / 100));
                              }
                            } else {
                              amtCents = d.amount.trim() ? parseCents(d.amount) : 0;
                            }
                            if (!(amtCents > 0)) return null;
                            const rawPctEmployee =
                              d.employerMatchPct != null && d.employerMatchPct.trim() !== ''
                                ? parseFloat(d.employerMatchPct)
                                : NaN;
                            const employerMatchPctVal =
                              Number.isFinite(rawPctEmployee) && rawPctEmployee >= 0 ? rawPctEmployee : undefined;
                            const rawPctGross =
                              d.employerMatchPctOfGross != null && d.employerMatchPctOfGross.trim() !== ''
                                ? parseFloat(d.employerMatchPctOfGross)
                                : NaN;
                            const employerMatchPctOfGrossVal =
                              Number.isFinite(rawPctGross) && rawPctGross >= 0 ? rawPctGross : undefined;
                            return {
                              id: d.id,
                              amountCents: amtCents,
                              deductionType: d.deductionType,
                              investingAccountId:
                                d.deductionType === 'retirement' ? d.investingAccountId : undefined,
                              customName:
                                d.deductionType === 'regular'
                                  ? (d.customName || '').trim() || undefined
                                  : undefined,
                              employerContributionType: contribType,
                              employerMatchPct:
                                contribType === 'pct_employee' ? employerMatchPctVal : undefined,
                              employerMatchPctOfGross:
                                contribType === 'pct_gross' ? employerMatchPctOfGrossVal : undefined
                            };
                          })
                          .filter(Boolean)
                      : [];
                  const payload: Partial<RecurringItem> = {
                    name: name.trim() || (type === 'income' ? 'Recurring income' : 'Recurring'),
                    amountCents,
                    expectedMinCents,
                    expectedMaxCents,
                    type,
                    frequency,
                    everyNDays: every,
                    intervalDays,
                    startDate,
                    endDate: undefined,
                    active,
                    ...(type === 'income' && { isActive: isActiveIncome }),
                    autoPay: autoPay || undefined,
                    paymentSource: type === 'income' ? undefined : (paymentSource || undefined),
                    paymentTargetId: paymentTargetId || undefined,
                    hysaSubBucket:
                      type !== 'income' && paymentSource === 'hysa' && (hysaSubBucket === 'liquid' || hysaSubBucket === 'reserved')
                        ? hysaSubBucket
                        : undefined,
                    useLastDayOfMonth: useLastDayOfMonth || undefined,
                    category: type === 'income' ? undefined : category,
                    subcategory: type === 'income' ? undefined : (subcategory || undefined),
                    notes: notes || undefined,
                    isSplit: type !== 'income' && isSplit ? true : undefined,
                    myPortionCents: type !== 'income' && isSplit ? parseCents(myPortion) : undefined,
                    isFullTimeJob: type === 'income' && isFullTimeJob ? true : undefined,
                    preTaxDeductions: type === 'income' && preTax.length ? (preTax as any) : undefined,
                    investingTransferEnabled:
                      type !== 'income' && investingTransferEnabled && getCategoryName(cfg, category) === 'Investing'
                        ? true
                        : undefined,
                    investingFromBankId:
                      type !== 'income' && investingTransferEnabled && investingFromBankId
                        ? investingFromBankId
                        : undefined,
                    investingTargetAccountId:
                      type !== 'income' && investingTransferEnabled && investingTargetAccountId
                        ? investingTargetAccountId
                        : undefined,
                    investingTargetType:
                      type !== 'income' && investingTransferEnabled && investingTargetType
                        ? investingTargetType
                        : undefined,
                    useLoanEstimatedPayment:
                      type !== 'income' && useLoanEstimatedPayment ? true : undefined,
                    linkedLoanId: undefined
                  };
                  if (editingId) {
                    actions.updateRecurringItem(editingId, payload);
                  } else {
                    actions.addRecurringItem(payload);
                  }
                  setOpen(false);
                  setEditingId(null);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDelete ? (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Are you sure you want to delete this?</h3>
            <p style={{ color: 'var(--ui-primary-text, var(--text))', marginTop: 0 }}>{confirmDelete.label}</p>
            <div className="btn-row">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  actions.deleteRecurringItem(confirmDelete.id);
                  setConfirmDelete(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <OptimizerModal
        open={optimizerModalOpen}
        onClose={() => setOptimizerModalOpen(false)}
        recurring={recurring}
      />
      <ViewLastOptimizerModal open={viewLastOptimizerOpen} onClose={() => setViewLastOptimizerOpen(false)} />
    </div>
  );
}

