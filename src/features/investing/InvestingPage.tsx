import { useMemo, useState } from 'react';
import { formatCents, parseCents } from '../../state/calc';
import { useLedgerStore } from '../../state/store';
import {
  loadInvesting,
  saveInvesting,
  accrueHysaAccounts,
  getMonthKeyFromTimestamp,
  loadCoastFire,
  saveCoastFire,
  COASTFIRE_DEFAULTS,
  type InvestingState,
  type InvestingAccount,
  type HysaAccount,
  type CoastFireAssumptions
} from '../../state/storage';
import { Select } from '../../ui/Select';
import { loadCategoryConfig, getCategoryName } from '../../state/storage';

function CoastFireInfoIcon({
  id,
  content,
  activeId,
  onToggle
}: {
  id: string;
  content: string;
  activeId: string | null;
  onToggle: (id: string) => void;
}) {
  const open = activeId === id;
  return (
    <span style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle', marginLeft: 6 }}>
      <button
        type="button"
        aria-label="Info"
        onClick={(e) => {
          e.stopPropagation();
          onToggle(open ? '' : id);
        }}
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          border: '1px solid var(--muted)',
          background: 'transparent',
          color: 'var(--muted)',
          fontSize: '0.7rem',
          fontWeight: 700,
          cursor: 'pointer',
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        i
      </button>
      {open ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: '100%',
            marginTop: 4,
            padding: '8px 10px',
            background: '#1e293b',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontSize: '0.75rem',
            color: 'var(--text)',
            maxWidth: 280,
            zIndex: 10,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
          }}
        >
          {content}
        </div>
      ) : null}
    </span>
  );
}

function computeCoastFire(
  assumptions: CoastFireAssumptions,
  pvDollars: number,
  monthlyContributionDollars: number
): {
  fireNumber: number;
  coastFireNumber: number;
  pv: number;
  realReturnPercent: number;
  coastReached: boolean;
  gap: number;
  validationError: string | null;
  realReturnWarning: boolean;
  coastAge: number | null;
  fvIfStopNow: number;
} {
  const annualSpending = assumptions.annualSpendingDollars;
  const swrDecimal = assumptions.swrPercent / 100;
  const investmentReturnDecimal = assumptions.investmentReturnPercent / 100;
  const inflationDecimal = assumptions.inflationPercent / 100;
  const realReturnDecimal = investmentReturnDecimal - inflationDecimal;
  const realReturnPercent = assumptions.investmentReturnPercent - assumptions.inflationPercent;
  const currentAge = assumptions.currentAge;
  const retirementAge = assumptions.retirementAge;
  const yearsToRetirement = retirementAge - currentAge;

  if (retirementAge <= currentAge) {
    return {
      fireNumber: 0,
      coastFireNumber: 0,
      pv: pvDollars,
      realReturnPercent: 0,
      coastReached: false,
      gap: 0,
      validationError: 'Retirement age must be greater than current age.',
      realReturnWarning: false,
      coastAge: null,
      fvIfStopNow: pvDollars
    };
  }
  if (annualSpending <= 0) {
    return {
      fireNumber: 0,
      coastFireNumber: 0,
      pv: pvDollars,
      realReturnPercent: realReturnPercent,
      coastReached: false,
      gap: 0,
      validationError: 'Annual spending must be positive.',
      realReturnWarning: false,
      coastAge: null,
      fvIfStopNow: pvDollars
    };
  }
  if (swrDecimal <= 0) {
    return {
      fireNumber: 0,
      coastFireNumber: 0,
      pv: pvDollars,
      realReturnPercent: realReturnPercent,
      coastReached: false,
      gap: 0,
      validationError: 'Safe withdrawal rate must be positive.',
      realReturnWarning: false,
      coastAge: null,
      fvIfStopNow: pvDollars
    };
  }

  const fireNumber = annualSpending / swrDecimal;
  const realReturnWarning = realReturnDecimal <= 0;

  let coastFireNumber = 0;
  if (!realReturnWarning && realReturnDecimal > -1) {
    coastFireNumber =
      annualSpending / (swrDecimal * Math.pow(1 + realReturnDecimal, yearsToRetirement));
  }

  const coastReached = !realReturnWarning && pvDollars >= coastFireNumber;
  const gap = !realReturnWarning && coastFireNumber > pvDollars ? coastFireNumber - pvDollars : 0;

  const fvIfStopNow =
    realReturnDecimal <= -1 || yearsToRetirement <= 0
      ? pvDollars
      : pvDollars * Math.pow(1 + realReturnDecimal, yearsToRetirement);

  let coastAge: number | null = null;
  const C = monthlyContributionDollars * 12;
  if (!realReturnWarning && realReturnDecimal > 0 && yearsToRetirement > 0) {
    if (pvDollars >= coastFireNumber) {
      coastAge = currentAge;
    } else {
      for (let A = currentAge; A <= retirementAge; A++) {
        const t = A - currentAge;
        const N2 = retirementAge - A;
        const growthFromPV = pvDollars * Math.pow(1 + realReturnDecimal, t);
        const annuityFV =
          realReturnDecimal === 0
            ? C * t
            : C * (Math.pow(1 + realReturnDecimal, t) - 1) / realReturnDecimal;
        const pvA = growthFromPV + annuityFV;
        const fv = N2 <= 0 ? pvA : pvA * Math.pow(1 + realReturnDecimal, N2);
        if (fv >= fireNumber) {
          coastAge = A;
          break;
        }
      }
    }
  }

  return {
    fireNumber,
    coastFireNumber,
    pv: pvDollars,
    realReturnPercent,
    coastReached,
    gap,
    validationError: null,
    realReturnWarning,
    coastAge,
    fvIfStopNow
  };
}

export function InvestingPage() {
  const data = useLedgerStore((s) => s.data);
  const actions = useLedgerStore((s) => s.actions);
  const cfg = useMemo(() => loadCategoryConfig(), []);

  const [investing, setInvesting] = useState<InvestingState>(() => {
    const base = loadInvesting();
    const accrued = accrueHysaAccounts(base);
    if (accrued !== base) saveInvesting(accrued);
    return accrued;
  });

  const [collapsed, setCollapsed] = useState<{ hysa: boolean; roth: boolean; k401: boolean; general: boolean }>({
    hysa: true,
    roth: true,
    k401: true,
    general: true
  });

  const [transferOpen, setTransferOpen] = useState(false);
  const [transferFrom, setTransferFrom] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [transferError, setTransferError] = useState<string | null>(null);

  const [coastFireOpen, setCoastFireOpen] = useState(false);
  const [coastFireEditForm, setCoastFireEditForm] = useState(false);
  const [coastFireAssumptions, setCoastFireAssumptions] = useState<CoastFireAssumptions | null>(() => loadCoastFire());
  const [coastFireForm, setCoastFireForm] = useState<CoastFireAssumptions>(() => loadCoastFire() || COASTFIRE_DEFAULTS);

  function coastFireAssumptionsToFormStrings(a: CoastFireAssumptions) {
    return {
      currentAge: a.currentAge === 0 ? '' : String(a.currentAge),
      retirementAge: a.retirementAge === 0 ? '' : String(a.retirementAge),
      annualSpendingDollars: a.annualSpendingDollars === 0 ? '' : String(a.annualSpendingDollars),
      swrPercent: a.swrPercent === 0 ? '' : String(a.swrPercent),
      investmentReturnPercent: (a.investmentReturnPercent ?? 0) === 0 ? '' : String(a.investmentReturnPercent ?? 0),
      inflationPercent: (a.inflationPercent ?? 0) === 0 ? '' : String(a.inflationPercent ?? 0),
      manualMonthlyContributionDollars: (a.manualMonthlyContributionDollars ?? 0) === 0 ? '' : String(a.manualMonthlyContributionDollars ?? 0)
    };
  }

  const [coastFireFormStrings, setCoastFireFormStrings] = useState(() =>
    coastFireAssumptionsToFormStrings(loadCoastFire() || COASTFIRE_DEFAULTS)
  );
  const [coastFireTooltipId, setCoastFireTooltipId] = useState<string | null>(null);

  const hysaAccounts = useMemo(
    () => investing.accounts.filter((a) => a.type === 'hysa'),
    [investing.accounts]
  );
  const rothAccounts = useMemo(
    () => investing.accounts.filter((a) => a.type === 'roth'),
    [investing.accounts]
  );
  const k401Accounts = useMemo(
    () => investing.accounts.filter((a) => a.type === 'k401'),
    [investing.accounts]
  );
  const generalAccounts = useMemo(
    () => investing.accounts.filter((a) => a.type === 'general'),
    [investing.accounts]
  );

  const contribution = useMemo(() => {
    const recurring: any[] = (data as any).recurring || [];

    const normalizeAmount = (r: any): number => {
      if (typeof r.expectedMinCents === 'number' && typeof r.expectedMaxCents === 'number') {
        return Math.round((r.expectedMinCents + r.expectedMaxCents) / 2);
      }
      if (typeof r.amountCents === 'number') return r.amountCents;
      return 0;
    };

    let grossIncomeCents = 0;
    let preTaxTotalCents = 0;
    let preTaxInvestCents = 0;
    let postTaxInvestCents = 0;
    let incomeMarkedCount = 0;

    recurring.forEach((r) => {
      if (!r || r.type !== 'income') return;
      if (!r.countsForInvestingPct) return;
      incomeMarkedCount += 1;
      const base = normalizeAmount(r);
      grossIncomeCents += base;

      if (r.isFullTimeJob && Array.isArray(r.preTaxDeductions)) {
        r.preTaxDeductions.forEach((d: any) => {
          if (!d) return;
          const amt = typeof d.amountCents === 'number' ? d.amountCents : 0;
          if (amt <= 0) return;
          preTaxTotalCents += amt;
          if (d.countsAsInvesting) preTaxInvestCents += amt;
        });
      }
    });

    // Post-tax investing from recurring expenses categorized as "Investing"
    recurring.forEach((r) => {
      if (!r || (r.type || 'expense') === 'income') return;
      const catId = r.category || 'uncategorized';
      const name = getCategoryName(cfg, catId);
      if (name !== 'Investing') return;
      const amt = normalizeAmount(r);
      if (amt > 0) postTaxInvestCents += amt;
    });

    const netIncomeCents = Math.max(0, grossIncomeCents - preTaxTotalCents);

    const pct = (num: number, denom: number): number =>
      denom > 0 && num > 0 ? (num / denom) * 100 : 0;

    const preTaxPctGross = pct(preTaxInvestCents, grossIncomeCents);
    const postTaxPctNet = pct(postTaxInvestCents, netIncomeCents);
    const totalInvestCents = preTaxInvestCents + postTaxInvestCents;

    return {
      incomeMarkedCount,
      grossIncomeCents,
      netIncomeCents,
      preTaxInvestCents,
      postTaxInvestCents,
      totalInvestCents,
      preTaxPctGross,
      postTaxPctNet
    };
  }, [data, cfg]);

  const totals = useMemo(() => {
    const sum = (xs: InvestingAccount[]) => xs.reduce((s, a) => s + (a.balanceCents || 0), 0);
    const totalHYSA = sum(hysaAccounts);
    const totalRoth = sum(rothAccounts);
    const total401k = sum(k401Accounts);
    const totalGeneral = sum(generalAccounts);
    const totalAll = totalHYSA + totalRoth + total401k + totalGeneral;
    return { totalHYSA, totalRoth, total401k, totalGeneral, totalAll };
  }, [hysaAccounts, rothAccounts, k401Accounts, generalAccounts]);

  const detectedMonthlyRetirementDollars = useMemo(() => {
    return (contribution.totalInvestCents || 0) / 100;
  }, [contribution.totalInvestCents]);

  function persist(next: InvestingState) {
    setInvesting(next);
    saveInvesting(next);
  }

  function accrueNow() {
    const next = accrueHysaAccounts(investing);
    if (next !== investing) persist(next);
  }

  function addAccount(type: 'hysa' | 'roth' | 'k401' | 'general') {
    const name = window.prompt('Account name?');
    if (!name) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);

    if (type === 'hysa') {
      const balanceInput = window.prompt('Starting balance ($)', '0.00');
      let balanceCents = 0;
      if (balanceInput != null && balanceInput.trim() !== '') {
        const parsed = parseCents(balanceInput);
        if (parsed >= 0) balanceCents = parsed;
      }

      const whenInput = window.prompt('Balance is as of:\n1) Today (default)\n2) Start of this month', '1');
      const now = Date.now();
      const nowDate = new Date(now);
      const monthStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).getTime();
      const asOfStart = whenInput === '2';
      const lastAccruedAt = asOfStart ? monthStart : now;

      const interestInput = window.prompt('Interest already credited this month ($, optional)', '');
      let interestThisMonth = 0;
      if (interestInput != null && interestInput.trim() !== '') {
        const parsed = parseCents(interestInput);
        if (parsed >= 0) interestThisMonth = parsed;
      }

      const monthKey = getMonthKeyFromTimestamp(now);

      const acc: InvestingAccount = {
        id,
        type: 'hysa',
        name: name.trim(),
        balanceCents: balanceCents,
        interestRate: 4,
        lastAccruedAt,
        monthKey,
        interestThisMonth
      } as any as HysaAccount;

      persist({ ...investing, accounts: [...investing.accounts, acc] });
      return;
    }

    const base: InvestingAccount = {
      id,
      type,
      name: name.trim(),
      balanceCents: 0
    } as any;
    persist({ ...investing, accounts: [...investing.accounts, base] });
  }

  function setBalance(acc: InvestingAccount) {
    if (acc.type === 'hysa') accrueNow();
    const val = window.prompt('Set balance ($)', (acc.balanceCents / 100).toFixed(2));
    if (val == null) return;
    const cents = parseCents(val);
    if (cents < 0) return;
    const now = Date.now();
    const accounts = investing.accounts.map((a) => {
      if (a.id !== acc.id) return a;
      const base: any = { ...a, balanceCents: cents };
      if (a.type === 'hysa') {
        base.lastAccruedAt = now;
      }
      return base;
    });
    persist({ ...investing, accounts });
  }

  function addBalance(acc: InvestingAccount) {
    if (acc.type === 'hysa') accrueNow();
    const val = window.prompt('Add amount ($)', '0.00');
    if (val == null) return;
    const cents = parseCents(val);
    if (cents <= 0) return;
    const now = Date.now();
    const accounts = investing.accounts.map((a) => {
      if (a.id !== acc.id) return a;
      const base: any = { ...a, balanceCents: (a.balanceCents || 0) + cents };
      if (a.type === 'hysa') {
        base.lastAccruedAt = now;
      }
      return base;
    });
    persist({ ...investing, accounts });
  }

  function deleteAccount(acc: InvestingAccount) {
    if (!window.confirm(`Delete account "${acc.name}"? This cannot be undone.`)) return;
    const accounts = investing.accounts.filter((a) => a.id !== acc.id);
    persist({ ...investing, accounts });
  }

  function setHysaRate(acc: HysaAccount) {
    accrueNow();
    const val = window.prompt('Set APY (%)', acc.interestRate.toFixed(2));
    if (val == null) return;
    const rate = parseFloat(val);
    if (!Number.isFinite(rate) || rate < 0) return;
    const now = Date.now();
    const accounts = investing.accounts.map((a) =>
      a.id === acc.id ? { ...(a as HysaAccount), interestRate: rate, lastAccruedAt: now } : a
    );
    persist({ ...investing, accounts });
  }

  function getInvestingByKey(key: string | null): { type: 'hysa' | 'general'; acc: InvestingAccount } | null {
    if (!key) return null;
    const [kind, id] = key.split(':');
    if (!id) return null;
    if (kind === 'hysa') {
      const acc = investing.accounts.find((a) => a.id === id && a.type === 'hysa');
      return acc ? { type: 'hysa', acc } : null;
    }
    if (kind === 'general') {
      const acc = investing.accounts.find((a) => a.id === id && a.type === 'general');
      return acc ? { type: 'general', acc } : null;
    }
    return null;
  }

  function handleOpenHysa() {
    setCollapsed((c) => ({ ...c, hysa: !c.hysa }));
    if (collapsed.hysa) {
      accrueNow();
    }
  }

  function createTransfer() {
    setTransferError(null);
    const from = transferFrom;
    const to = transferTo;
    const amountCents = parseCents(transferAmount);
    if (!from || !to || from === to) {
      setTransferError('Select distinct From and To accounts.');
      return;
    }
    if (amountCents <= 0) {
      setTransferError('Enter a positive amount.');
      return;
    }
    const [fromKind, fromId] = from.split(':');
    const [toKind, toId] = to.split(':');
    if (!fromId || !toId) {
      setTransferError('Invalid selection.');
      return;
    }

    const fromInvest = getInvestingByKey(from);
    const toInvest = getInvestingByKey(to);

    // Disallow Roth/401k as transfer sources.
    if (fromKind === 'roth' || fromKind === 'k401') {
      setTransferError('Cannot transfer out of Roth IRA or 401(k).');
      return;
    }

    // Case 1: Bank -> HYSA/General
    if (fromKind === 'bank' && (toKind === 'hysa' || toKind === 'general')) {
      const inv = toInvest;
      if (!inv) {
        setTransferError('Invalid investing target.');
        return;
      }
      const label = `Transfer to ${inv.type === 'hysa' ? 'HYSA' : 'Investing'}: ${inv.acc.name}`;
      actions.addPendingOutbound({
        label,
        amountCents,
        outboundType: 'standard',
        meta: {
          kind: 'transfer',
          investingType: inv.type,
          investingAccountId: inv.acc.id
        }
      } as any);
      setTransferOpen(false);
      return;
    }

    // Case 2: HYSA/General -> Bank
    if ((fromKind === 'hysa' || fromKind === 'general') && toKind === 'bank') {
      const inv = fromInvest;
      if (!inv) {
        setTransferError('Invalid investing source.');
        return;
      }
      const label = `Transfer from ${inv.type === 'hysa' ? 'HYSA' : 'Investing'}: ${inv.acc.name}`;
      actions.addPendingInbound({
        label,
        amountCents,
        targetBankId: toId,
        isRefund: false,
        depositTo: 'bank',
        meta: {
          kind: 'transfer',
          investingType: inv.type,
          investingAccountId: inv.acc.id
        }
      } as any);
      setTransferOpen(false);
      return;
    }

    setTransferError('That transfer path is not allowed.');
  }

  function renderSection(
    label: string,
    type: 'hysa' | 'roth' | 'k401' | 'general',
    accounts: InvestingAccount[],
    collapsedKey: keyof typeof collapsed
  ) {
    const isCollapsed = collapsed[collapsedKey];
    return (
      <>
        <div
          className="section-header investing-section-header"
          style={{ marginTop: 24 }}
          onClick={() =>
            collapsedKey === 'hysa' ? handleOpenHysa() : setCollapsed((c) => ({ ...c, [collapsedKey]: !c[collapsedKey] }))
          }
        >
          <span className="section-header-left">{label}</span>
          <span className="chevron">{isCollapsed ? '▸' : '▾'}</span>
        </div>
        {!isCollapsed ? (
          <>
            {accounts.map((a) => {
              return (
                <div className="card ll-account-card" key={a.id}>
                  <div className="row ll-account-row">
                    <span className="name bank-card-name">{a.name}</span>
                    <span className="amount amount-pos">{formatCents(a.balanceCents || 0)}</span>
                  </div>
                  {a.type === 'hysa' ? (
                    (() => {
                      const h = a as HysaAccount & { interestThisMonth?: number };
                      const now = Date.now();
                      const d = new Date(now);
                      const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
                      const dayOfMonth = d.getDate();
                      const remainingDays = Math.max(0, daysInMonth - dayOfMonth);
                      const r = h.interestRate / 100;
                      const dailyRate = r / 365;
                      const futureFactor = remainingDays > 0 ? Math.pow(1 + dailyRate, remainingDays) - 1 : 0;
                      const currentInterest = typeof h.interestThisMonth === 'number' ? h.interestThisMonth : 0;
                      const futureInterest = Math.round((h.balanceCents || 0) * futureFactor);
                      const projected = currentInterest + futureInterest;
                      return (
                        <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: 4 }}>
                          <div>APY {h.interestRate.toFixed(2)}%</div>
                          <div>Interest this month so far: {formatCents(currentInterest)}</div>
                          <div>Projected month end interest: {formatCents(projected)}</div>
                        </div>
                      );
                    })()
                  ) : null}
                  <div className="btn-row" style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setBalance(a)}
                    >
                      Set
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => addBalance(a)}
                    >
                      Add
                    </button>
                    {a.type === 'hysa' ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setHysaRate(a as HysaAccount)}
                      >
                        APY
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => deleteAccount(a)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              className="btn btn-add"
              style={{ marginTop: 8, width: '100%' }}
              onClick={() => addAccount(type)}
            >
              + Add {label} account
            </button>
          </>
        ) : null}
      </>
    );
  }

  return (
    <div className="tab-panel active" id="investingContent">
      <p className="section-title">Investing</p>

      {renderSection('HYSA', 'hysa', hysaAccounts, 'hysa')}
      {renderSection('Roth IRA', 'roth', rothAccounts, 'roth')}
      {renderSection('401(k)', 'k401', k401Accounts, 'k401')}
      {renderSection('General Investing', 'general', generalAccounts, 'general')}

      <button
        type="button"
        className="btn btn-add"
        style={{ width: '100%', marginTop: 24, marginBottom: 8 }}
        onClick={() => {
          setTransferFrom('');
          setTransferTo('');
          setTransferAmount('');
          setTransferNote('');
          setTransferError(null);
          setTransferOpen(true);
        }}
      >
        Transfer between Cash and Investing
      </button>

      <div className="card" style={{ marginTop: 24 }}>
        <p className="section-title" style={{ marginTop: 0, marginBottom: 8, color: 'var(--green)' }}>
          Investing Summary
        </p>
        <div className="summary-kv">
          <span className="k" style={{ color: 'var(--green)' }}>Total HYSA</span>
          <span className="v amount-pos">{formatCents(totals.totalHYSA)}</span>
        </div>
        <div className="summary-kv">
          <span className="k" style={{ color: 'var(--green)' }}>Total Roth IRA</span>
          <span className="v amount-pos">{formatCents(totals.totalRoth)}</span>
        </div>
        <div className="summary-kv">
          <span className="k" style={{ color: 'var(--green)' }}>Total 401(k)</span>
          <span className="v amount-pos">{formatCents(totals.total401k)}</span>
        </div>
        <div className="summary-kv">
          <span className="k" style={{ color: 'var(--green)' }}>Total General Investing</span>
          <span className="v amount-pos">{formatCents(totals.totalGeneral)}</span>
        </div>
        <div className="summary-kv">
          <span className="k" style={{ color: 'var(--green)' }}>Total Investing</span>
          <span className="v amount-pos">{formatCents(totals.totalAll)}</span>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <p className="section-title" style={{ marginTop: 0, marginBottom: 8, color: 'var(--green)' }}>
          Investing Contribution
        </p>
        {contribution.incomeMarkedCount === 0 || contribution.grossIncomeCents <= 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            No income sources marked for investing %. Mark eligible recurring income in the Recurring tab.
          </p>
        ) : (
          <div className="summary-compact">
            <div className="summary-kv">
              <span className="k">Gross income</span>
              <span className="v">{formatCents(contribution.grossIncomeCents)}</span>
            </div>
            <div className="summary-kv">
              <span className="k">Net income (after pre-tax deductions)</span>
              <span className="v">{formatCents(contribution.netIncomeCents)}</span>
            </div>
            <div className="summary-kv">
              <span className="k">Pre-tax investing contributions</span>
              <span className="v">
                {formatCents(contribution.preTaxInvestCents)}{' '}
                <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                  ({contribution.preTaxPctGross.toFixed(1)}% of gross)
                </span>
              </span>
            </div>
            <div className="summary-kv">
              <span className="k">Post-tax investing contributions</span>
              <span className="v">
                {formatCents(contribution.postTaxInvestCents)}{' '}
                <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                  ({contribution.postTaxPctNet.toFixed(1)}% of net)
                </span>
              </span>
            </div>
            <div className="summary-kv">
              <span className="k">Total investing contributions</span>
              <span className="v">
                {formatCents(contribution.totalInvestCents)}{' '}
                <span style={{ color: 'var(--muted)', fontSize: '0.85rem', display: 'block' }}>
                  {(contribution.preTaxPctGross + contribution.postTaxPctNet).toFixed(1)}%
                </span>
              </span>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ width: '100%' }}
          onClick={() => {
            const source = coastFireAssumptions || coastFireForm;
            setCoastFireForm({ ...source });
            setCoastFireFormStrings(coastFireAssumptionsToFormStrings(source));
            setCoastFireOpen(true);
          }}
        >
          See more: Coast FIRE
        </button>
      </div>

      {coastFireOpen ? (
        <div className="modal-overlay" onClick={() => { setCoastFireTooltipId(null); setCoastFireOpen(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Coast FIRE</h3>
            {!coastFireAssumptions || coastFireEditForm ? (
              <>
                <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 0 }}>
                  Coast FIRE means you already have enough invested today that, even if you stop making new
                  retirement contributions, your investments could still grow to your retirement target. Uses
                  inflation-adjusted returns so values are in today&apos;s dollars.
                </p>
                <div className="field">
                  <label>Current age</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="ll-control"
                    placeholder="e.g. 35"
                    value={coastFireFormStrings.currentAge}
                    onChange={(e) =>
                      setCoastFireFormStrings((s) => ({ ...s, currentAge: e.target.value }))
                    }
                  />
                </div>
                <div className="field">
                  <label>Retirement age</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="ll-control"
                    placeholder="e.g. 65"
                    value={coastFireFormStrings.retirementAge}
                    onChange={(e) =>
                      setCoastFireFormStrings((s) => ({ ...s, retirementAge: e.target.value }))
                    }
                  />
                </div>
                <div className="field">
                  <label>Annual retirement spending (today&apos;s $)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="ll-control"
                    placeholder="e.g. 50000"
                    value={coastFireFormStrings.annualSpendingDollars}
                    onChange={(e) =>
                      setCoastFireFormStrings((s) => ({ ...s, annualSpendingDollars: e.target.value }))
                    }
                  />
                </div>
                <div className="field">
                  <label>Safe withdrawal rate SWR (%)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="ll-control"
                    placeholder="e.g. 4"
                    value={coastFireFormStrings.swrPercent}
                    onChange={(e) =>
                      setCoastFireFormStrings((s) => ({ ...s, swrPercent: e.target.value }))
                    }
                  />
                </div>
                <div className="field">
                  <label>Investment return (%)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="ll-control"
                    placeholder="e.g. 7"
                    value={coastFireFormStrings.investmentReturnPercent}
                    onChange={(e) =>
                      setCoastFireFormStrings((s) => ({ ...s, investmentReturnPercent: e.target.value }))
                    }
                  />
                </div>
                <div className="field">
                  <label>Inflation rate (%)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="ll-control"
                    placeholder="e.g. 3"
                    value={coastFireFormStrings.inflationPercent}
                    onChange={(e) =>
                      setCoastFireFormStrings((s) => ({ ...s, inflationPercent: e.target.value }))
                    }
                  />
                </div>
                <div style={{ marginTop: 8 }}>
                  <label style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Include in retirement portfolio</label>
                  <div className="toggle-row">
                    <input
                      type="checkbox"
                      id="cfRoth"
                      checked={coastFireForm.includeRoth}
                      onChange={(e) => setCoastFireForm((f) => ({ ...f, includeRoth: e.target.checked }))}
                    />
                    <label htmlFor="cfRoth">Roth IRA</label>
                  </div>
                  <div className="toggle-row">
                    <input
                      type="checkbox"
                      id="cf401k"
                      checked={coastFireForm.include401k}
                      onChange={(e) => setCoastFireForm((f) => ({ ...f, include401k: e.target.checked }))}
                    />
                    <label htmlFor="cf401k">401(k)</label>
                  </div>
                  <div className="toggle-row">
                    <input
                      type="checkbox"
                      id="cfGeneral"
                      checked={coastFireForm.includeGeneral}
                      onChange={(e) => setCoastFireForm((f) => ({ ...f, includeGeneral: e.target.checked }))}
                    />
                    <label htmlFor="cfGeneral">General Investing</label>
                  </div>
                  <div className="toggle-row">
                    <input
                      type="checkbox"
                      id="cfHysa"
                      checked={coastFireForm.includeHysa}
                      onChange={(e) => setCoastFireForm((f) => ({ ...f, includeHysa: e.target.checked }))}
                    />
                    <label htmlFor="cfHysa">HYSA</label>
                  </div>
                </div>
                <div className="toggle-row" style={{ marginTop: 8 }}>
                  <input
                    type="checkbox"
                    id="cfUseDetected"
                    checked={coastFireForm.useDetectedContributions}
                    onChange={(e) =>
                      setCoastFireForm((f) => ({ ...f, useDetectedContributions: e.target.checked }))
                    }
                  />
                  <label htmlFor="cfUseDetected">Use detected monthly retirement contributions</label>
                </div>
                {!coastFireForm.useDetectedContributions ? (
                  <div className="field">
                    <label>Manual monthly contribution ($)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="ll-control"
                      placeholder="e.g. 500"
                      value={coastFireFormStrings.manualMonthlyContributionDollars}
                      onChange={(e) =>
                        setCoastFireFormStrings((s) => ({ ...s, manualMonthlyContributionDollars: e.target.value }))
                      }
                    />
                  </div>
                ) : null}
                <div className="btn-row" style={{ marginTop: 12 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => { setCoastFireTooltipId(null); setCoastFireOpen(false); }}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      const s = coastFireFormStrings;
                      const currentAge = s.currentAge.trim() === '' ? NaN : parseInt(s.currentAge, 10);
                      const retirementAge = s.retirementAge.trim() === '' ? NaN : parseInt(s.retirementAge, 10);
                      const annualSpendingDollars = s.annualSpendingDollars.trim() === '' ? NaN : parseFloat(s.annualSpendingDollars);
                      const swrPercent = s.swrPercent.trim() === '' ? NaN : parseFloat(s.swrPercent);
                      const investmentReturnPercent = s.investmentReturnPercent.trim() === '' ? NaN : parseFloat(s.investmentReturnPercent);
                      const inflationPercent = s.inflationPercent.trim() === '' ? NaN : parseFloat(s.inflationPercent);
                      const manualMonthlyContributionDollars = s.manualMonthlyContributionDollars.trim() === '' ? NaN : parseFloat(s.manualMonthlyContributionDollars);

                      if (!Number.isFinite(currentAge) || currentAge < 1) {
                        window.alert('Current age must be greater than 0.');
                        return;
                      }
                      if (!Number.isFinite(retirementAge) || retirementAge < 1) {
                        window.alert('Retirement age must be greater than 0.');
                        return;
                      }
                      if (retirementAge <= currentAge) {
                        window.alert('Retirement age must be greater than current age.');
                        return;
                      }
                      if (!Number.isFinite(annualSpendingDollars) || annualSpendingDollars <= 0) {
                        window.alert('Annual spending must be positive.');
                        return;
                      }
                      if (!Number.isFinite(swrPercent) || swrPercent <= 0) {
                        window.alert('Safe withdrawal rate must be positive.');
                        return;
                      }

                      const a: CoastFireAssumptions = {
                        ...coastFireForm,
                        currentAge,
                        retirementAge,
                        annualSpendingDollars,
                        swrPercent,
                        investmentReturnPercent: Number.isFinite(investmentReturnPercent) ? investmentReturnPercent : COASTFIRE_DEFAULTS.investmentReturnPercent,
                        inflationPercent: Number.isFinite(inflationPercent) ? inflationPercent : COASTFIRE_DEFAULTS.inflationPercent,
                        manualMonthlyContributionDollars: Number.isFinite(manualMonthlyContributionDollars) && manualMonthlyContributionDollars >= 0 ? manualMonthlyContributionDollars : COASTFIRE_DEFAULTS.manualMonthlyContributionDollars
                      };
                      saveCoastFire(a);
                      setCoastFireAssumptions(a);
                      setCoastFireForm(a);
                      setCoastFireFormStrings(coastFireAssumptionsToFormStrings(a));
                      setCoastFireEditForm(false);
                    }}
                  >
                    Save Assumptions
                  </button>
                </div>
              </>
            ) : (() => {
              const a = coastFireAssumptions;
              const pvDollars =
                (a.includeRoth ? totals.totalRoth / 100 : 0) +
                (a.include401k ? totals.total401k / 100 : 0) +
                (a.includeGeneral ? totals.totalGeneral / 100 : 0) +
                (a.includeHysa ? totals.totalHYSA / 100 : 0);
              const monthlyContrib =
                a.useDetectedContributions ? detectedMonthlyRetirementDollars : a.manualMonthlyContributionDollars;
              const result = computeCoastFire(a, pvDollars, monthlyContrib);
              const fmt = (x: number) => `$${Math.round(x).toLocaleString()}`;
              const toggleTooltip = (id: string) =>
                setCoastFireTooltipId((prev) => (id === '' ? null : prev === id ? null : id));

              return (
                <>
                  <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 0 }}>
                    Coast FIRE means you already have enough invested today that, even if you stop making new
                    retirement contributions, your investments could still grow to your retirement target by
                    retirement age. This calculator adjusts returns for inflation so all values are shown in today&apos;s
                    dollars.
                  </p>
                  {result.validationError ? (
                    <p style={{ color: 'var(--red)', fontSize: '0.9rem', marginTop: 8 }}>{result.validationError}</p>
                  ) : null}
                  {result.realReturnWarning ? (
                    <p style={{ color: 'var(--red)', fontSize: '0.9rem', marginTop: 8 }}>
                      Inflation-adjusted return must be positive to compute Coast FIRE growth.
                    </p>
                  ) : null}

                  {!result.realReturnWarning ? (
                    <p
                      style={{
                        fontSize: '1.25rem',
                        fontWeight: 700,
                        marginTop: 16,
                        marginBottom: 8,
                        color: result.coastReached ? 'var(--green)' : 'var(--red)'
                      }}
                    >
                      {result.coastReached ? 'You have reached Coast FIRE' : 'You have not yet reached Coast FIRE'}
                    </p>
                  ) : null}

                  <div className="summary-compact" style={{ marginTop: 16 }}>
                    <div className="summary-kv" style={{ marginTop: 8 }}>
                      <span className="k">
                        Current Invested Assets
                        <CoastFireInfoIcon
                          id="currentAssets"
                          content="The total current value of the selected retirement accounts included in this calculation."
                          activeId={coastFireTooltipId}
                          onToggle={toggleTooltip}
                        />
                      </span>
                      <span className="v amount-pos">{fmt(result.pv)}</span>
                    </div>
                    <div className="summary-kv" style={{ marginTop: 8 }}>
                      <span className="k">
                        Current Monthly Contributions
                        <CoastFireInfoIcon
                          id="monthlyContrib"
                          content="The monthly retirement contribution amount currently used in this Coast FIRE calculation."
                          activeId={coastFireTooltipId}
                          onToggle={toggleTooltip}
                        />
                      </span>
                      <span className="v amount-pos">{fmt(monthlyContrib)}</span>
                    </div>
                    <div className="summary-kv" style={{ marginTop: 8 }}>
                      <span className="k">
                        If you stop contributing today, projected at retirement
                        <CoastFireInfoIcon
                          id="fvIfStopNow"
                          content="The projected value of your selected retirement assets at retirement age if you make no additional contributions starting today."
                          activeId={coastFireTooltipId}
                          onToggle={toggleTooltip}
                        />
                      </span>
                      <span className="v amount-pos">
                        {result.realReturnWarning ? '—' : fmt(result.fvIfStopNow)}
                      </span>
                    </div>
                    <div className="summary-kv" style={{ marginTop: 8 }}>
                      <span className="k">
                        FIRE Number
                        <CoastFireInfoIcon
                          id="fireNumber"
                          content="The total portfolio needed at retirement to support your annual spending using the selected withdrawal rate."
                          activeId={coastFireTooltipId}
                          onToggle={toggleTooltip}
                        />
                      </span>
                      <span className="v amount-pos">{fmt(result.fireNumber)}</span>
                    </div>
                    <div className="summary-kv" style={{ marginTop: 8 }}>
                      <span className="k">
                        Coast FIRE Number
                        <CoastFireInfoIcon
                          id="coastFireNumber"
                          content="The amount you would need invested today so it can grow to your FIRE Number by retirement age without any new contributions."
                          activeId={coastFireTooltipId}
                          onToggle={toggleTooltip}
                        />
                      </span>
                      <span className="v amount-pos">
                        {result.realReturnWarning ? '—' : fmt(result.coastFireNumber)}
                      </span>
                    </div>
                    <div className="summary-kv" style={{ marginTop: 8 }}>
                      <span className="k">
                        Gap to Coast FIRE
                        <CoastFireInfoIcon
                          id="gap"
                          content="Gap to Coast FIRE is the amount you would need invested today to reach your Coast FIRE number. Once your invested assets reach this level, you could stop contributing to retirement and your investments could still grow to your FIRE number by retirement age."
                          activeId={coastFireTooltipId}
                          onToggle={toggleTooltip}
                        />
                      </span>
                      <span className={`v ${result.gap > 0 && !result.realReturnWarning ? 'amount-neg' : ''}`}>
                        {result.realReturnWarning || result.gap <= 0 ? 'None' : fmt(result.gap)}
                      </span>
                    </div>
                    <div className="summary-kv" style={{ marginTop: 8 }}>
                      <span className="k">
                        Inflation assumption
                        <CoastFireInfoIcon
                          id="inflation"
                          content="Your expected long-term annual inflation rate."
                          activeId={coastFireTooltipId}
                          onToggle={toggleTooltip}
                        />
                      </span>
                      <span className="v">{a.inflationPercent}%</span>
                    </div>
                    <div className="summary-kv" style={{ marginTop: 8 }}>
                      <span className="k">
                        Investment return assumption
                        <CoastFireInfoIcon
                          id="investmentReturn"
                          content="Your expected long-term annual investment growth rate before inflation."
                          activeId={coastFireTooltipId}
                          onToggle={toggleTooltip}
                        />
                      </span>
                      <span className="v">{a.investmentReturnPercent}%</span>
                    </div>
                    <div className="summary-kv" style={{ marginTop: 8 }}>
                      <span className="k">
                        Inflation-adjusted return
                        <CoastFireInfoIcon
                          id="realReturn"
                          content="Your real return after subtracting inflation from investment growth."
                          activeId={coastFireTooltipId}
                          onToggle={toggleTooltip}
                        />
                      </span>
                      <span className="v">
                        {result.realReturnWarning ? '—' : `${result.realReturnPercent.toFixed(1)}%`}
                      </span>
                    </div>
                    <div className="summary-kv" style={{ marginTop: 8 }}>
                      <span className="k">
                        Safe withdrawal rate (SWR)
                        <CoastFireInfoIcon
                          id="swr"
                          content="The percentage of your retirement portfolio you expect to withdraw annually in retirement."
                          activeId={coastFireTooltipId}
                          onToggle={toggleTooltip}
                        />
                      </span>
                      <span className="v">{a.swrPercent}%</span>
                    </div>
                  </div>
                  <div className="btn-row" style={{ marginTop: 16 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setCoastFireTooltipId(null);
                        setCoastFireOpen(false);
                      }}
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        if (coastFireAssumptions) {
                          setCoastFireForm({ ...coastFireAssumptions });
                          setCoastFireFormStrings(coastFireAssumptionsToFormStrings(coastFireAssumptions));
                        }
                        setCoastFireEditForm(true);
                      }}
                    >
                      Edit assumptions
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}

      {transferOpen ? (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Transfer between accounts</h3>
            <div className="field">
              <label>From</label>
              <Select value={transferFrom} onChange={(e) => setTransferFrom(e.target.value)}>
                <option value="">— Select —</option>
                {(data.banks || []).map((b) => (
                  <option key={b.id} value={`bank:${b.id}`}>
                    Bank — {b.name}
                  </option>
                ))}
                {hysaAccounts.map((a) => (
                  <option key={a.id} value={`hysa:${a.id}`}>
                    HYSA — {a.name}
                  </option>
                ))}
                {generalAccounts.map((a) => (
                  <option key={a.id} value={`general:${a.id}`}>
                    Investing — {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="field">
              <label>To</label>
              <Select value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
                <option value="">— Select —</option>
                {(data.banks || []).map((b) => (
                  <option key={b.id} value={`bank:${b.id}`}>
                    Bank — {b.name}
                  </option>
                ))}
                {hysaAccounts.map((a) => (
                  <option key={a.id} value={`hysa:${a.id}`}>
                    HYSA — {a.name}
                  </option>
                ))}
                {generalAccounts.map((a) => (
                  <option key={a.id} value={`general:${a.id}`}>
                    Investing — {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="field">
              <label>Amount ($)</label>
              <input
                className="ll-control"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
              />
            </div>
            <div className="field">
              <label>Note (optional)</label>
              <input
                className="ll-control"
                value={transferNote}
                onChange={(e) => setTransferNote(e.target.value)}
              />
            </div>
            {transferError ? (
              <div style={{ color: 'var(--red)', fontSize: '0.85rem', marginTop: 4 }}>{transferError}</div>
            ) : null}
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setTransferOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-secondary" onClick={createTransfer}>
                Create transfer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

