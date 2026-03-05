import { useMemo, useState } from 'react';
import { formatCents, parseCents } from '../../state/calc';
import { useLedgerStore } from '../../state/store';
import {
  loadInvesting,
  saveInvesting,
  accrueHysaAccounts,
  getMonthKeyFromTimestamp,
  type InvestingState,
  type InvestingAccount,
  type HysaAccount
} from '../../state/storage';
import { Select } from '../../ui/Select';
import { loadCategoryConfig, getCategoryName } from '../../state/storage';

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
    const totalPctGross = pct(totalInvestCents, grossIncomeCents);
    const totalPctNet = pct(totalInvestCents, netIncomeCents);

    return {
      incomeMarkedCount,
      grossIncomeCents,
      netIncomeCents,
      preTaxInvestCents,
      postTaxInvestCents,
      totalInvestCents,
      preTaxPctGross,
      postTaxPctNet,
      totalPctGross,
      totalPctNet
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
                    <span className="amount">{formatCents(a.balanceCents || 0)}</span>
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

      <button
        type="button"
        className="btn btn-secondary"
        style={{ width: '100%', marginBottom: 8 }}
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

      {renderSection('HYSA', 'hysa', hysaAccounts, 'hysa')}
      {renderSection('Roth IRA', 'roth', rothAccounts, 'roth')}
      {renderSection('401(k)', 'k401', k401Accounts, 'k401')}
      {renderSection('General Investing', 'general', generalAccounts, 'general')}

      <div className="card investing-contrib-card" style={{ marginTop: 24 }}>
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
                  {contribution.totalPctGross.toFixed(1)}% of gross • {contribution.totalPctNet.toFixed(1)}% of net
                </span>
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="card investing-summary-card" style={{ marginTop: 16 }}>
        <div className="summary-kv">
          <span className="k">Total HYSA</span>
          <span className="v">{formatCents(totals.totalHYSA)}</span>
        </div>
        <div className="summary-kv">
          <span className="k">Total Roth IRA</span>
          <span className="v">{formatCents(totals.totalRoth)}</span>
        </div>
        <div className="summary-kv">
          <span className="k">Total 401(k)</span>
          <span className="v">{formatCents(totals.total401k)}</span>
        </div>
        <div className="summary-kv">
          <span className="k">Total General Investing</span>
          <span className="v">{formatCents(totals.totalGeneral)}</span>
        </div>
        <div className="summary-kv">
          <span className="k">Total Investing</span>
          <span className="v">{formatCents(totals.totalAll)}</span>
        </div>
      </div>

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

