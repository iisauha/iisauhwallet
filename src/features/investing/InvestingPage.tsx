import React, { useMemo, useState, useRef, useEffect } from 'react';
import { formatCents, parseCents } from '../../state/calc';
import { useLedgerStore } from '../../state/store';
import { IconPlus } from '../../ui/icons';
import {
  loadInvesting,
  saveInvesting,
  accrueHysaAccounts,
  getMonthKeyFromTimestamp,
  getStartOfMonthMs,
  loadCoastFire,
  saveCoastFire,
  COASTFIRE_DEFAULTS,
  computeHysaMonthlyInterest,
  recordHysaBalanceEvent,
  type InvestingState,
  type InvestingAccount,
  type HysaAccount,
  type CoastFireAssumptions,
  loadBoolPref,
  saveBoolPref
} from '../../state/storage';
import { INVESTING_SHOW_ZERO_HYSA_KEY } from '../../state/keys';
import { useDropdownState } from '../../state/DropdownStateContext';
import { Select } from '../../ui/Select';
import { Modal } from '../../ui/Modal';
import { loadCategoryConfig, getCategoryName } from '../../state/storage';
import Chart from 'chart.js/auto';

function HysaMoveRow({
  totalCents,
  reservedCents,
  onReservedChange,
  parseCents,
  formatCents
}: {
  totalCents: number;
  reservedCents: number;
  onReservedChange: (cents: number) => void;
  parseCents: (s: string) => number;
  formatCents: (c: number) => string;
}) {
  const [moveAmount, setMoveAmount] = useState('');
  const billsCents = totalCents - reservedCents;
  const applyMove = (direction: 'reservedToBills' | 'billsToReserved') => {
    const cents = parseCents(moveAmount);
    if (!Number.isFinite(cents) || cents <= 0) return;
    if (direction === 'reservedToBills') {
      onReservedChange(Math.max(0, reservedCents - cents));
    } else {
      onReservedChange(Math.min(totalCents, reservedCents + cents));
    }
    setMoveAmount('');
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <input
        type="text"
        inputMode="decimal"
        placeholder="Amount"
        value={moveAmount}
        onChange={(e) => setMoveAmount(e.target.value)}
        style={{ width: 80, padding: '6px 8px', fontSize: '0.9rem' }}
      />
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => applyMove('reservedToBills')}
        disabled={reservedCents <= 0 || !moveAmount.trim()}
      >
        Reserved → Bills
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => applyMove('billsToReserved')}
        disabled={billsCents <= 0 || !moveAmount.trim()}
      >
        Bills → Reserved
      </button>
    </div>
  );
}

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
        className="icon-btn"
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.75rem',
          fontStyle: 'italic',
          fontWeight: 600,
        }}
      >
        i
      </button>
      {open ? (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            minWidth: 260,
            maxWidth: 320,
            width: 'max-content',
            padding: '12px 14px',
            background: 'var(--ui-modal-bg, var(--ui-card-bg, var(--surface)))',
            border: '1px solid var(--ui-border, var(--border))',
            borderRadius: 8,
            fontSize: '0.8rem',
            lineHeight: 1.4,
            color: 'var(--ui-primary-text, var(--text))',
            zIndex: 10001,
            boxShadow: 'var(--shadow-strong)',
            whiteSpace: 'pre-line'
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
  fvWithContrib: number;
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
      fvIfStopNow: pvDollars,
      fvWithContrib: pvDollars
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
      fvIfStopNow: pvDollars,
      fvWithContrib: pvDollars
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
      fvIfStopNow: pvDollars,
      fvWithContrib: pvDollars
    };
  }

  const fireNumber = annualSpending / swrDecimal;
  const realReturnWarning = realReturnDecimal <= 0;
  const C = monthlyContributionDollars * 12;
  const r = realReturnDecimal;

  // Unified model: same (1+r) compounding everywhere. Coast FIRE number = amount needed TODAY to grow to fireNumber with zero contributions.
  let coastFireNumber = 0;
  if (!realReturnWarning && realReturnDecimal > -1 && yearsToRetirement > 0) {
    coastFireNumber = fireNumber / Math.pow(1 + realReturnDecimal, yearsToRetirement);
  }

  const coastReached = !realReturnWarning && pvDollars >= coastFireNumber;
  const gap = !realReturnWarning && coastFireNumber > pvDollars ? coastFireNumber - pvDollars : 0;

  // A) Stop contributing today: year-by-year growth only (same model as coastFireNumber)
  let fvIfStopNow = pvDollars;
  if (yearsToRetirement > 0 && realReturnDecimal > -1) {
    let portfolio = pvDollars;
    for (let y = 0; y < yearsToRetirement; y++) {
      portfolio = portfolio * (1 + r);
    }
    fvIfStopNow = portfolio;
  }

  // B) Continue contributing: year-by-year growth + contribution (same model as projection)
  let fvWithContrib = pvDollars;
  if (yearsToRetirement > 0 && realReturnDecimal > -1) {
    let portfolio = pvDollars;
    for (let y = 0; y < yearsToRetirement; y++) {
      portfolio = portfolio * (1 + r);
      portfolio = portfolio + C;
    }
    fvWithContrib = portfolio;
  }

  // C) Coast FIRE age: simulate with contributions; at each age check if current portfolio would grow to fireNumber with ZERO further contributions
  let coastAge: number | null = null;
  if (!realReturnWarning && realReturnDecimal > 0 && yearsToRetirement > 0) {
    let portfolio = pvDollars;
    let age = currentAge;
    while (age < retirementAge) {
      const yearsLeft = retirementAge - age;
      if (portfolio * Math.pow(1 + r, yearsLeft) >= fireNumber) {
        coastAge = age;
        break;
      }
      portfolio = portfolio * (1 + r) + C;
      age += 1;
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
    fvIfStopNow,
    fvWithContrib
  };
}

function computeCoastFireAgeAndProjection(
  currentAge: number,
  retirementAge: number,
  currentInvestedAssets: number,
  monthlyContribution: number,
  inflationAdjustedReturnDecimal: number,
  fireNumber: number
): { coastFireAge: number | null; projection: { age: number; portfolio: number }[] } {
  const annualContribution = monthlyContribution * 12;
  const r = inflationAdjustedReturnDecimal;
  const projection: { age: number; portfolio: number }[] = [];
  let portfolio = currentInvestedAssets;
  let age = currentAge;
  let coastFireAge: number | null = null;

  while (age <= retirementAge) {
    projection.push({ age, portfolio });
    // Coast FIRE age: at this age, would this portfolio reach fireNumber by retirement with ZERO further contributions?
    if (age < retirementAge) {
      const yearsLeft = retirementAge - age;
      if (portfolio * Math.pow(1 + r, yearsLeft) >= fireNumber && coastFireAge === null) {
        coastFireAge = age;
      }
    }
    if (age < retirementAge) {
      portfolio = portfolio * (1 + r) + annualContribution;
    }
    age += 1;
  }

  return { coastFireAge, projection };
}

function CoastFireResultView({
  a,
  totals,
  detectedMonthlyRetirementDollars,
  coastFireTooltipId,
  setCoastFireTooltipId,
  onClose,
  onEditAssumptions
}: {
  a: CoastFireAssumptions;
  totals: { totalRoth: number; total401k: number; totalGeneral: number; totalHYSA: number };
  detectedMonthlyRetirementDollars: number;
  coastFireTooltipId: string | null;
  setCoastFireTooltipId: React.Dispatch<React.SetStateAction<string | null>>;
  onClose: () => void;
  onEditAssumptions: () => void;
}) {
  const pvDollars =
    (a.includeRoth ? totals.totalRoth / 100 : 0) +
    (a.include401k ? totals.total401k / 100 : 0) +
    (a.includeGeneral ? totals.totalGeneral / 100 : 0) +
    (a.includeHysa ? totals.totalHYSA / 100 : 0);
  const monthlyContrib =
    a.useDetectedContributions ? detectedMonthlyRetirementDollars : a.manualMonthlyContributionDollars;
  const result = computeCoastFire(a, pvDollars, monthlyContrib);

  const { coastFireAge, projection } = useMemo(() => {
    if (result.realReturnWarning || result.fireNumber <= 0 || a.retirementAge <= a.currentAge) {
      return { coastFireAge: null as number | null, projection: [] as { age: number; portfolio: number }[] };
    }
    const inflationAdjustedReturnDecimal = result.realReturnPercent / 100;
    return computeCoastFireAgeAndProjection(
      a.currentAge,
      a.retirementAge,
      pvDollars,
      monthlyContrib,
      inflationAdjustedReturnDecimal,
      result.fireNumber
    );
  }, [
    a.currentAge,
    a.retirementAge,
    pvDollars,
    monthlyContrib,
    result.realReturnWarning,
    result.realReturnPercent,
    result.fireNumber
  ]);

  const fmt = (x: number) => `$${Math.round(x).toLocaleString()}`;
  const toggleTooltip = (id: string) =>
    setCoastFireTooltipId((prev: string | null) => (id === '' ? null : prev === id ? null : id));

  return (
    <>
      {coastFireTooltipId ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'transparent'
          }}
          onClick={() => setCoastFireTooltipId(null)}
        />
      ) : null}
      <p style={{ color: 'var(--ui-primary-text, var(--text))', fontSize: '0.85rem', marginTop: 0 }}>
        Coast FIRE means you already have enough invested today that, even if you stop making new
        retirement contributions, your investments could still grow to your retirement target by
        retirement age. Values are in today&apos;s dollars.
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
        <div>
          <p
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              marginTop: 16,
              marginBottom: 8,
              color: result.coastReached ? 'var(--green)' : 'var(--red)'
            }}
          >
            {result.coastReached
              ? (result.coastAge != null ? `COAST FIRE AGE IS ${result.coastAge}` : 'You have reached Coast FIRE')
              : 'YOU HAVE NOT YET REACHED COAST FIRE'}
          </p>
          {!result.coastReached && coastFireAge != null ? (
            <p style={{ fontSize: '0.95rem', color: 'var(--ui-primary-text, var(--text))', marginTop: 0, marginBottom: 8 }}>
              Estimated Coast FIRE age: {coastFireAge}
            </p>
          ) : null}
        </div>
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
      </div>

      <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--ui-primary-text, var(--text))', marginTop: 20, marginBottom: 4 }}>
        If you continue contributing
      </p>
      <div className="summary-compact" style={{ marginTop: 4 }}>
        <div className="summary-kv" style={{ marginTop: 8 }}>
          <span className="k">
            Current Monthly Contributions
            <CoastFireInfoIcon
              id="monthlyContrib"
              content="The monthly retirement contribution amount currently used in this projection."
              activeId={coastFireTooltipId}
              onToggle={toggleTooltip}
            />
          </span>
          <span className="v amount-pos">{fmt(monthlyContrib)}</span>
        </div>
        <div className="summary-kv" style={{ marginTop: 8 }}>
          <span className="k">
            Projected value at retirement if you continue contributing
            <CoastFireInfoIcon
              id="fvWithContrib"
              content={(() => {
                const yearsToRetirement = a.retirementAge - a.currentAge;
                const annualContrib = monthlyContrib * 12;
                const rPct = result.realReturnPercent;
                const rDec = rPct / 100;
                const pvStr = fmt(result.pv);
                const monthlyStr = fmt(monthlyContrib);
                const annualStr = fmt(annualContrib);
                const fvStr = result.realReturnWarning ? '—' : fmt(result.fvWithContrib);
                return `This projection uses your current invested assets, your monthly contribution amount, and your inflation-adjusted return to estimate your portfolio value at retirement if you continue contributing at the same rate.\n\nFormula:\nFV = PV(1+r)^t + C × [((1+r)^t − 1) / r]\n\nWhere:\n• PV = current invested assets\n• r = inflation-adjusted annual return\n• t = years until retirement\n• C = annual contribution amount (monthly × 12)\n\nUsing your values:\n• PV = ${pvStr}\n• Monthly contribution = ${monthlyStr}\n• Annual contribution = ${annualStr}\n• r = ${rPct.toFixed(1)}%\n• t = ${yearsToRetirement} years\n\nProjected value = ${fvStr}`;
              })()}
              activeId={coastFireTooltipId}
              onToggle={toggleTooltip}
            />
          </span>
          <span className="v amount-pos">
            {result.realReturnWarning ? '—' : fmt(result.fvWithContrib)}
          </span>
        </div>
      </div>

      {!result.realReturnWarning && projection.length > 0 ? (
        <CoastFireProjectionChart
          projection={projection}
          coastFireNumber={result.coastFireNumber}
          fireNumber={result.fireNumber}
          coastFireAge={coastFireAge}
        />
      ) : null}

      <div className="btn-row" style={{ marginTop: 16 }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
        <button type="button" className="btn btn-secondary" onClick={onEditAssumptions}>
          Edit assumptions
        </button>
      </div>
    </>
  );
}

function CoastFireProjectionChart({
  projection,
  coastFireNumber,
  fireNumber,
  coastFireAge
}: {
  projection: { age: number; portfolio: number }[];
  coastFireNumber: number;
  fireNumber: number;
  coastFireAge: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || projection.length === 0) return;

    const existing: Chart | undefined = (canvas as any).__coastFireChart;
    if (existing) existing.destroy();

    const primaryTextColor = (() => {
      // Use CSS variable so "All other text" customization applies to chart labels.
      const v = getComputedStyle(document.documentElement).getPropertyValue('--ui-primary-text').trim();
      return v || '#94a3b8';
    })();

    const ages = projection.map((p) => p.age);
    const portfolios = projection.map((p) => p.portfolio);
    const coastLine = ages.map(() => coastFireNumber);
    const fireLine = ages.map(() => fireNumber);

    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: ages,
        datasets: [
          {
            label: 'Portfolio',
            data: portfolios,
            borderColor: '#22c55e',
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0,
            pointRadius: 0,
            pointHoverRadius: 4
          },
          {
            label: 'Coast FIRE',
            data: coastLine,
            borderColor: '#f97316',
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            borderDash: [4, 4],
            tension: 0,
            pointRadius: 0,
            pointHoverRadius: 0
          },
          {
            label: 'FIRE Number',
            data: fireLine,
            borderColor: '#3b82f6',
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            borderDash: [4, 4],
            tension: 0,
            pointRadius: 0,
            pointHoverRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 420 },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: primaryTextColor,
              font: { size: 11 },
              usePointStyle: true
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(51, 65, 85, 0.5)' },
            ticks: { color: primaryTextColor, maxTicksLimit: 8 }
          },
          y: {
            grid: { color: 'rgba(51, 65, 85, 0.5)' },
            ticks: {
              color: primaryTextColor,
              callback: (v) => (typeof v === 'number' ? `$${(v / 1000).toFixed(0)}k` : v)
            }
          }
        }
      }
    });

    (canvas as any).__coastFireChart = chart;
    return () => {
      chart.destroy();
      (canvas as any).__coastFireChart = undefined;
    };
  }, [projection, coastFireNumber, fireNumber]);

  return (
    <div style={{ marginTop: 20, marginBottom: 0 }}>
      <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--ui-primary-text, var(--text))', marginBottom: 8 }}>
        Portfolio projection
      </p>
      <div style={{ position: 'relative', width: '100%', height: 200, background: 'var(--surface)', borderRadius: 8, padding: 12 }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
        {coastFireAge != null ? (
          <span
            style={{
              position: 'absolute',
              fontSize: '0.75rem',
              color: '#f97316',
              fontWeight: 600,
              bottom: 8,
              left: '50%',
              transform: 'translateX(-50%)'
            }}
          >
            Coast FIRE age: {coastFireAge}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// Module-level refs to prevent re-triggering when component remounts (tab navigation)
let _lastProcessedTransferTrigger = 0;
let _lastProcessedHysaAllocTrigger = 0;

export function InvestingPage({ openTransferTrigger = 0, openHysaAllocTrigger = 0, openHysaAllocAccountId = null }: { openTransferTrigger?: number; openHysaAllocTrigger?: number; openHysaAllocAccountId?: string | null }) {
  const data = useLedgerStore((s) => s.data);
  const actions = useLedgerStore((s) => s.actions);
  const cfg = useMemo(() => loadCategoryConfig(), []);

  const [investing, setInvesting] = useState<InvestingState>(() => {
    const base = loadInvesting();
    const accrued = accrueHysaAccounts(base);
    if (accrued !== base) saveInvesting(accrued);
    return accrued;
  });
  // Keep HYSA balances in sync with other tabs/actions that persist changes to localStorage
  // (e.g. posting pending inbound/outbound affects HYSA).
  useEffect(() => {
    const base = loadInvesting();
    const accrued = accrueHysaAccounts(base);
    if (accrued !== base) saveInvesting(accrued);
    setInvesting(accrued);
  }, [data.pendingIn, data.pendingOut]);

  const dropdownState = useDropdownState();
  const getCollapsed = (key: 'hysa' | 'roth' | 'k401' | 'general') =>
    dropdownState.getDropdownCollapsed(`investing_${key}`, true);
  const setCollapsed = (key: 'hysa' | 'roth' | 'k401' | 'general', collapsed: boolean) =>
    dropdownState.setDropdownCollapsed(`investing_${key}`, collapsed);

  const liquidCollapsed = dropdownState.getDropdownCollapsed('investing_liquid', false);
  const setLiquidCollapsed = (v: boolean) => dropdownState.setDropdownCollapsed('investing_liquid', v);
  const longtermCollapsed = dropdownState.getDropdownCollapsed('investing_longterm', false);
  const setLongtermCollapsed = (v: boolean) => dropdownState.setDropdownCollapsed('investing_longterm', v);

  // Per-section carousel state
  const [hysaCarouselIdx, setHysaCarouselIdx] = useState(0);
  const [hysaCarouselHeight, setHysaCarouselHeight] = useState<number | undefined>(undefined);
  const hysaCarouselRef = useRef<HTMLDivElement>(null);
  const [generalCarouselIdx, setGeneralCarouselIdx] = useState(0);
  const [generalCarouselHeight, setGeneralCarouselHeight] = useState<number | undefined>(undefined);
  const generalCarouselRef = useRef<HTMLDivElement>(null);
  const [rothCarouselIdx, setRothCarouselIdx] = useState(0);
  const [rothCarouselHeight, setRothCarouselHeight] = useState<number | undefined>(undefined);
  const rothCarouselRef = useRef<HTMLDivElement>(null);
  const [k401CarouselIdx, setK401CarouselIdx] = useState(0);
  const [k401CarouselHeight, setK401CarouselHeight] = useState<number | undefined>(undefined);
  const k401CarouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      const initHeight = (ref: React.RefObject<HTMLDivElement>, set: (h: number | undefined) => void) => {
        const first = ref.current?.children[0] as HTMLElement | undefined;
        if (first) set(first.offsetHeight);
      };
      initHeight(hysaCarouselRef, setHysaCarouselHeight);
      initHeight(generalCarouselRef, setGeneralCarouselHeight);
      initHeight(rothCarouselRef, setRothCarouselHeight);
      initHeight(k401CarouselRef, setK401CarouselHeight);
    });
  }, []);

  // Dot-indicator index updates only when scroll fully snaps; ResizeObserver tracks current card height
  useEffect(() => {
    const pairs: [React.RefObject<HTMLDivElement>, (i: number) => void, (h: number | undefined) => void][] = [
      [hysaCarouselRef, setHysaCarouselIdx, setHysaCarouselHeight],
      [generalCarouselRef, setGeneralCarouselIdx, setGeneralCarouselHeight],
      [rothCarouselRef, setRothCarouselIdx, setRothCarouselHeight],
      [k401CarouselRef, setK401CarouselIdx, setK401CarouselHeight],
    ];
    const cleanups = pairs.map(([ref, setIdx, setHeight]) => {
      const el = ref.current;
      if (!el) return () => {};
      let ro: ResizeObserver | null = null;
      const observeCurrent = () => {
        ro?.disconnect();
        const idx = Math.round(el.scrollLeft / (el.clientWidth || 1));
        const item = el.children[idx] as HTMLElement | undefined;
        if (!item) return;
        ro = new ResizeObserver(() => setHeight((el.children[Math.round(el.scrollLeft / (el.clientWidth || 1))] as HTMLElement | undefined)?.offsetHeight));
        ro.observe(item);
      };
      const handler = () => {
        const idx = Math.round(el.scrollLeft / (el.clientWidth || 1));
        setIdx(idx);
        const item = el.children[idx] as HTMLElement | undefined;
        if (item) setHeight(item.offsetHeight);
        observeCurrent();
      };
      observeCurrent();
      el.addEventListener('scrollend', handler);
      return () => { el.removeEventListener('scrollend', handler); ro?.disconnect(); };
    });
    return () => cleanups.forEach((fn) => fn());
  }, []);

  const [showZeroHysa, setShowZeroHysa] = useState<boolean>(() =>
    loadBoolPref(INVESTING_SHOW_ZERO_HYSA_KEY, true)
  );
  const [transferOpen, setTransferOpen] = useState(false);
  useEffect(() => {
    if (openTransferTrigger > 0 && openTransferTrigger !== _lastProcessedTransferTrigger) {
      _lastProcessedTransferTrigger = openTransferTrigger;
      setTransferOpen(true);
    }
  }, [openTransferTrigger]);
  useEffect(() => {
    if (openHysaAllocTrigger > 0 && openHysaAllocTrigger !== _lastProcessedHysaAllocTrigger) {
      _lastProcessedHysaAllocTrigger = openHysaAllocTrigger;
      const hysaAccounts = investing.accounts.filter(a => a.type === 'hysa') as HysaAccount[];
      if (openHysaAllocAccountId) {
        const target = hysaAccounts.find(a => a.id === openHysaAllocAccountId);
        if (target) { openHysaAllocationModal(target); return; }
      }
      if (hysaAccounts.length === 1) {
        openHysaAllocationModal(hysaAccounts[0]);
      } else if (hysaAccounts.length > 1) {
        setHysaPickerOpen(true);
      }
    }
  }, [openHysaAllocTrigger, openHysaAllocAccountId]);
  const [transferFrom, setTransferFrom] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [transferError, setTransferError] = useState<string | null>(null);
  const [hysaAllocationAccount, setHysaAllocationAccount] = useState<HysaAccount | null>(null);
  const [hysaPickerOpen, setHysaPickerOpen] = useState(false);
  const [allocationReservedCents, setAllocationReservedCents] = useState(0);
  useEffect(() => {
    if (hysaAllocationAccount) {
      const h = hysaAllocationAccount;
      const total = Math.max(0, h.balanceCents || 0);
      const cur =
        typeof h.reservedSavingsCents === 'number' && h.reservedSavingsCents >= 0
          ? Math.min(h.reservedSavingsCents, total)
          : 0;
      setAllocationReservedCents(cur);
    }
  }, [hysaAllocationAccount]);
  const [transferHysaStep, setTransferHysaStep] = useState<{
    direction: 'in' | 'out';
    accountName: string;
    fromKind: string;
    fromId: string;
    toKind: string;
    toId: string;
    amountCents: number;
    useInstantSameBank: boolean;
    inv: { type: string; acc: InvestingAccount };
  } | null>(null);
  const [newAccount, setNewAccount] = useState<{
    id: string;
    type: 'hysa' | 'roth' | 'k401' | 'general';
    name: string;
    hysaStartingBalance: string;
    hysaRatePercent: string;
    hysaWhen: '1' | '2' | '3';
    hysaInterestThisMonth: string;
  } | null>(null);

  const [balanceModal, setBalanceModal] = useState<{
    acc: InvestingAccount;
    amount: string;
    useSet: boolean;
    hysaInterest: string;
  } | null>(null);

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
  const banksSortedByBalance = useMemo(
    () => [...(data.banks || [])].sort((a, b) => (b.balanceCents || 0) - (a.balanceCents || 0)),
    [data.banks]
  );
  const hysaAccountsSorted = useMemo(
    () => [...hysaAccounts].sort((a, b) => (b.balanceCents || 0) - (a.balanceCents || 0)),
    [hysaAccounts]
  );
  const generalAccountsSorted = useMemo(
    () => [...generalAccounts].sort((a, b) => (b.balanceCents || 0) - (a.balanceCents || 0)),
    [generalAccounts]
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
    let employerMatchCents = 0;
    let postTaxInvestCents = 0;
    let incomeMarkedCount = 0;

    recurring.forEach((r) => {
      if (!r || r.type !== 'income') return;
      if ((r as any).isActive === false) return;
      if (!r.isFullTimeJob && !r.countsForInvestingPct) return;
      incomeMarkedCount += 1;
      const base = normalizeAmount(r);
      grossIncomeCents += base;

      if (Array.isArray(r.preTaxDeductions)) {
        const itemGrossCents = base;
        r.preTaxDeductions.forEach((d: any) => {
          if (!d) return;
          const amt = typeof d.amountCents === 'number' ? d.amountCents : 0;
          if (amt <= 0) return;
          preTaxTotalCents += amt;
          const isRetirement =
          d.deductionType === 'retirement' || (!d.deductionType && d.countsAsInvesting);
          if (isRetirement) {
            preTaxInvestCents += amt;
            const contribType = d.employerContributionType ?? (typeof d.employerMatchPct === 'number' && d.employerMatchPct >= 0 ? 'pct_employee' : 'none');
            if (contribType === 'pct_employee') {
              const matchPct = typeof d.employerMatchPct === 'number' && d.employerMatchPct >= 0 ? d.employerMatchPct : 0;
              employerMatchCents += Math.round(amt * (matchPct / 100));
            } else if (contribType === 'pct_gross') {
              const matchPctGross = typeof d.employerMatchPctOfGross === 'number' && d.employerMatchPctOfGross >= 0 ? d.employerMatchPctOfGross : 0;
              employerMatchCents += Math.round(itemGrossCents * (matchPctGross / 100));
            }
          }
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
    const totalPreTaxRetirementCents = preTaxInvestCents + employerMatchCents;
    const totalInvestCents = totalPreTaxRetirementCents + postTaxInvestCents;

    return {
      incomeMarkedCount,
      grossIncomeCents,
      netIncomeCents,
      preTaxInvestCents,
      employerMatchCents,
      totalPreTaxRetirementCents,
      postTaxInvestCents,
      totalInvestCents,
      preTaxPctGross,
      postTaxPctNet
    };
  }, [data, cfg]);

  const accountContributionsFromRecurring = useMemo(() => {
    const map: Record<string, { employeeCents: number; employerMatchCents: number }> = {};
    const recurring = (data as any).recurring || [];
    const normalizeAmount = (r: any): number => {
      if (typeof r.expectedMinCents === 'number' && typeof r.expectedMaxCents === 'number') {
        return Math.round((r.expectedMinCents + r.expectedMaxCents) / 2);
      }
      if (typeof r.amountCents === 'number') return r.amountCents;
      return 0;
    };
    recurring.forEach((r: any) => {
      if (!r || r.type !== 'income' || !Array.isArray(r.preTaxDeductions)) return;
      if (r.isActive === false) return;
      const itemGrossCents = normalizeAmount(r);
      r.preTaxDeductions.forEach((d: any) => {
        if (!d || d.deductionType !== 'retirement' || !d.investingAccountId) return;
        const amt = typeof d.amountCents === 'number' ? d.amountCents : 0;
        if (amt <= 0) return;
        const contribType = d.employerContributionType ?? (typeof d.employerMatchPct === 'number' && d.employerMatchPct >= 0 ? 'pct_employee' : 'none');
        let matchCents = 0;
        if (contribType === 'pct_employee') {
          const matchPct = typeof d.employerMatchPct === 'number' && d.employerMatchPct >= 0 ? d.employerMatchPct : 0;
          matchCents = Math.round(amt * (matchPct / 100));
        } else if (contribType === 'pct_gross') {
          const matchPctGross = typeof d.employerMatchPctOfGross === 'number' && d.employerMatchPctOfGross >= 0 ? d.employerMatchPctOfGross : 0;
          matchCents = Math.round(itemGrossCents * (matchPctGross / 100));
        }
        if (!map[d.investingAccountId]) map[d.investingAccountId] = { employeeCents: 0, employerMatchCents: 0 };
        map[d.investingAccountId].employeeCents += amt;
        map[d.investingAccountId].employerMatchCents += matchCents;
      });
    });
    return map;
  }, [data]);

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

  function openInvestingBalanceModal(acc: InvestingAccount) {
    const state = accrueHysaAccounts(investing);
    if (state !== investing) persist(state);
    const freshAcc = state.accounts.find((x) => x.id === acc.id);
    if (!freshAcc) return;
    setBalanceModal({
      acc: freshAcc,
      amount: '',
      useSet: false,
      hysaInterest: '',
    });
  }

  function submitInvestingBalanceModal() {
    if (!balanceModal) return;
    const state = accrueHysaAccounts(investing);
    const raw = state.accounts.find((x) => x.id === balanceModal.acc.id);
    if (!raw) {
      setBalanceModal(null);
      return;
    }
    const { amount, useSet, hysaInterest } = balanceModal;
    const cents = parseCents(amount);
    const now = Date.now();
    if (useSet) {
      if (cents < 0) return;
      const intCents = hysaInterest.trim() !== '' ? parseCents(hysaInterest) : null;
      const accounts = state.accounts.map((a) => {
        if (a.id !== raw.id) return a;
        if (a.type === 'hysa') {
          let next: HysaAccount = {
            ...(recordHysaBalanceEvent(a as HysaAccount, now, cents) as HysaAccount),
            lastAccruedAt: now,
          };
          if (intCents != null && intCents >= 0) {
            next = {
              ...next,
              manualInterestBaselineThisMonth: intCents,
              manualInterestBaselineSetAt: now,
              manualInterestBaselineMonthKey: getMonthKeyFromTimestamp(now),
            };
          }
          return next;
        }
        return { ...a, balanceCents: cents };
      });
      persist({ ...state, accounts });
    } else {
      if (cents <= 0) return;
      const newBal = (raw.balanceCents || 0) + cents;
      const accounts = state.accounts.map((a) => {
        if (a.id !== raw.id) return a;
        if (a.type === 'hysa') {
          return {
            ...(recordHysaBalanceEvent(a as HysaAccount, now, newBal) as HysaAccount),
            lastAccruedAt: now,
          };
        }
        return { ...a, balanceCents: newBal };
      });
      persist({ ...state, accounts });
    }
    setBalanceModal(null);
  }

  function addAccount(type: 'hysa' | 'roth' | 'k401' | 'general') {
    setNewAccount({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      type,
      name: '',
      hysaStartingBalance: '',
      hysaRatePercent: '',
      hysaWhen: '1',
      hysaInterestThisMonth: '',
    });
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

  function editHysaInterest(acc: HysaAccount) {
    accrueNow();
    const { interestAccruedThisMonthCents, projectedInterestThisMonthCents } = computeHysaMonthlyInterest(
      acc,
      Date.now()
    );
    const currentAccruedStr = (interestAccruedThisMonthCents / 100).toFixed(2);
    const currentProjStr = (projectedInterestThisMonthCents / 100).toFixed(2);
    const interestVal = window.prompt('Interest this month so far ($)', currentAccruedStr);
    if (interestVal == null) return;
    const interestCents = parseCents(interestVal);
    if (interestCents < 0) return;
    const projectedVal = window.prompt('Projected month-end interest ($, optional - leave blank to use calculated)', currentProjStr);
    const now = Date.now();
    const monthKey = getMonthKeyFromTimestamp(now);
    const accounts = investing.accounts.map((a) => {
      if (a.id !== acc.id || a.type !== 'hysa') return a;
      const h = a as HysaAccount;
      let next: HysaAccount = {
        ...h,
        manualInterestBaselineThisMonth: interestCents,
        manualInterestBaselineSetAt: now,
        manualInterestBaselineMonthKey: monthKey
      };
      if (projectedVal != null && projectedVal.trim() !== '') {
        const projCents = parseCents(projectedVal);
        if (projCents >= 0) {
          next = {
            ...next,
            manualProjectedInterestThisMonthCents: projCents,
            manualProjectedInterestMonthKey: monthKey
          };
        }
      } else {
        next = { ...next, manualProjectedInterestThisMonthCents: undefined, manualProjectedInterestMonthKey: undefined };
      }
      return next;
    });
    persist({ ...investing, accounts });
  }

  function openHysaAllocationModal(acc: HysaAccount) {
    setHysaAllocationAccount(acc);
  }

  function saveHysaAllocation(reservedCents: number) {
    if (!hysaAllocationAccount) return;
    const acc = hysaAllocationAccount;
    const total = Math.max(0, acc.balanceCents || 0);
    const clamped = Math.max(0, Math.min(reservedCents, total));
    const now = Date.now();
    const accounts = investing.accounts.map((a) => {
      if (a.id !== acc.id || a.type !== 'hysa') return a;
      const h = a as HysaAccount;
      return {
        ...h,
        reservedSavingsCents: clamped,
        lastAccruedAt: typeof h.lastAccruedAt === 'number' ? h.lastAccruedAt : now
      };
    });
    persist({ ...investing, accounts });
    setHysaAllocationAccount(null);
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
    const wasCollapsed = getCollapsed('hysa');
    setCollapsed('hysa', !wasCollapsed);
    if (wasCollapsed) {
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

    function normalizeTokens(name: string): string[] {
      const lower = name
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .trim();
      if (!lower) return [];
      const stop = new Set([
        'bank',
        'checking',
        'savings',
        'account',
        'hysa',
        'ira',
        'roth',
        'brokerage',
        'investment',
        'investing',
        'cash'
      ]);
      return lower
        .split(/\s+/)
        .filter((t) => t && !stop.has(t));
    }

    function getAccountName(kind: string, id: string): string | null {
      if (!id) return null;
      if (kind === 'bank') {
        const bank = (data.banks || []).find((b) => b.id === id);
        return bank ? bank.name : null;
      }
      if (kind === 'hysa' || kind === 'general') {
        const acc = investing.accounts.find((a) => a.id === id && (a.type === 'hysa' || a.type === 'general'));
        return acc ? acc.name : null;
      }
      return null;
    }

    const fromName = getAccountName(fromKind, fromId);
    const toName = getAccountName(toKind, toId);
    let useInstantSameBank = false;
    if (fromName && toName) {
      const fromTokens = normalizeTokens(fromName);
      const toTokens = normalizeTokens(toName);
      const hasCommon =
        fromTokens.length > 0 &&
        toTokens.length > 0 &&
        fromTokens.some((t) => toTokens.includes(t));
      if (hasCommon) {
        const ok = window.confirm('This transfer will be instant. Continue?');
        useInstantSameBank = !!ok;
      }
    }

    // Disallow Roth/401k as transfer sources.
    if (fromKind === 'roth' || fromKind === 'k401') {
      setTransferError('Cannot transfer out of Roth IRA or Employer-Based Retirement.');
      return;
    }

    // Case 1: Bank -> HYSA/General
    if (fromKind === 'bank' && (toKind === 'hysa' || toKind === 'general')) {
      const inv = toInvest;
      if (!inv) {
        setTransferError('Invalid investing target.');
        return;
      }

      if (inv.type === 'hysa') {
        setTransferHysaStep({
          direction: 'in',
          accountName: inv.acc.name,
          fromKind,
          fromId,
          toKind,
          toId,
          amountCents,
          useInstantSameBank,
          inv
        });
        return;
      }

      if (useInstantSameBank) {
        actions.updateBankBalance(fromId, -amountCents, 'add');
        const nowTs = Date.now();
        const accounts = investing.accounts.map((a) => {
          if (a.id !== inv.acc.id) return a;
          return { ...a, balanceCents: (a.balanceCents || 0) + amountCents };
        });
        persist({ ...investing, accounts });
        setTransferOpen(false);
        return;
      }

      const label = `Transfer to Investing: ${inv.acc.name}`;
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

      if (inv.type === 'hysa') {
        setTransferHysaStep({
          direction: 'out',
          accountName: inv.acc.name,
          fromKind,
          fromId,
          toKind,
          toId,
          amountCents,
          useInstantSameBank,
          inv
        });
        return;
      }

      if (useInstantSameBank) {
        const nowTs = Date.now();
        const accounts = investing.accounts.map((a) => {
          if (a.id !== inv.acc.id) return a;
          return { ...a, balanceCents: Math.max(0, (a.balanceCents || 0) - amountCents) };
        });
        persist({ ...investing, accounts });
        actions.updateBankBalance(toId, amountCents, 'add');
        setTransferOpen(false);
        return;
      }

      const label = `Transfer from Investing: ${inv.acc.name}`;
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

  function commitHysaSubBucketChoice(subBucket: 'liquid' | 'reserved') {
    const step = transferHysaStep;
    if (!step) return;
    const { direction, accountName, fromId, toId, amountCents, useInstantSameBank, inv } = step;
    let invState = accrueHysaAccounts(loadInvesting());

    if (direction === 'in') {
      if (useInstantSameBank) {
        actions.updateBankBalance(fromId, -amountCents, 'add');
        const nowTs = Date.now();
        const accounts = invState.accounts.map((a) => {
          if (a.id !== inv.acc.id) return a;
          if (a.type === 'hysa') {
            const h = a as HysaAccount;
            const newBalanceCents = (h.balanceCents || 0) + amountCents;
            let updated = recordHysaBalanceEvent(h, nowTs, newBalanceCents);
            if (subBucket === 'reserved') {
              updated = { ...updated, reservedSavingsCents: (h.reservedSavingsCents || 0) + amountCents };
            }
            return { ...updated, lastAccruedAt: nowTs };
          }
          return { ...a, balanceCents: (a.balanceCents || 0) + amountCents };
        });
        persist({ ...invState, accounts });
        setInvesting({ ...invState, accounts });
      } else {
        actions.addPendingOutbound({
          label: `Transfer to HYSA: ${accountName}`,
          amountCents,
          outboundType: 'standard',
          meta: {
            kind: 'transfer',
            investingType: inv.type as 'hysa',
            investingAccountId: inv.acc.id,
            hysaSubBucket: subBucket
          }
        } as any);
      }
    } else {
      if (useInstantSameBank) {
        const nowTs = Date.now();
        const accounts = invState.accounts.map((a) => {
          if (a.id !== inv.acc.id) return a;
          if (a.type === 'hysa') {
            const h = a as HysaAccount;
            const newBalanceCents = Math.max(0, (h.balanceCents || 0) - amountCents);
            let updated = recordHysaBalanceEvent(h, nowTs, newBalanceCents);
            if (subBucket === 'reserved') {
              updated = { ...updated, reservedSavingsCents: Math.max(0, (h.reservedSavingsCents || 0) - amountCents) };
            }
            return { ...updated, lastAccruedAt: nowTs };
          }
          return { ...a, balanceCents: Math.max(0, (a.balanceCents || 0) - amountCents) };
        });
        persist({ ...invState, accounts });
        setInvesting({ ...invState, accounts });
        actions.updateBankBalance(toId, amountCents, 'add');
      } else {
        actions.addPendingInbound({
          label: `Transfer from HYSA: ${accountName}`,
          amountCents,
          targetBankId: toId,
          isRefund: false,
          depositTo: 'bank',
          meta: {
            kind: 'transfer',
            investingType: inv.type as 'hysa',
            investingAccountId: inv.acc.id,
            hysaSubBucket: subBucket
          }
        } as any);
      }
    }
    setTransferHysaStep(null);
    setTransferOpen(false);
  }

  function renderSection(
    label: string,
    type: 'hysa' | 'roth' | 'k401' | 'general',
    accounts: InvestingAccount[],
    carouselRef: React.RefObject<HTMLDivElement>,
    carouselIdx: number,
    setCarouselIdx: (i: number) => void,
    carouselHeight: number | undefined,
    setCarouselHeight: (h: number | undefined) => void
  ) {
    const sortedAccounts = [...accounts].sort((a, b) => (b.balanceCents || 0) - (a.balanceCents || 0));
    const visibleAccounts =
      type === 'hysa' && !showZeroHysa
        ? sortedAccounts.filter((a) => (a.balanceCents || 0) !== 0)
        : sortedAccounts;
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
          {type === 'hysa' && (
            <button
              type="button"
              className="snapshot-util-btn"
              onClick={() => {
                setShowZeroHysa(!showZeroHysa);
                saveBoolPref(INVESTING_SHOW_ZERO_HYSA_KEY, !showZeroHysa);
              }}
            >
              {showZeroHysa ? 'Hide $0' : 'Show $0'}
            </button>
          )}
          <button
            type="button"
            className="snapshot-add-btn"
            onClick={() => addAccount(type)}
          >
            <IconPlus /> Add
          </button>
        </div>
        <div style={carouselHeight != null ? { height: carouselHeight, overflow: 'hidden' } : {}}>
        <div
          ref={carouselRef}
          className="card-carousel"
          style={{ marginBottom: 0 }}
          onScroll={(e) => {
            const el = e.currentTarget;
            const rawIdx = el.scrollLeft / (el.clientWidth || 1);
            const leftIdx = Math.floor(rawIdx);
            const rightIdx = Math.min(leftIdx + 1, el.children.length - 1);
            const progress = rawIdx - leftIdx;
            const lh = (el.children[leftIdx] as HTMLElement | undefined)?.offsetHeight ?? 0;
            const rh = (el.children[rightIdx] as HTMLElement | undefined)?.offsetHeight ?? lh;
            setCarouselHeight(Math.round(lh + (rh - lh) * progress));
          }}
        >
        {visibleAccounts.map((a) => {
          return (
            <div className="card-carousel-item" key={a.id}><div className="card ll-account-card">
              <div className="row ll-account-row">
                <span className="name bank-card-name">{a.name}</span>
                <span className="amount amount-pos">{formatCents(a.balanceCents || 0)}</span>
              </div>
              {(a.type === 'roth' || a.type === 'k401') && accountContributionsFromRecurring[a.id] ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--ui-primary-text, var(--text))', marginTop: 4 }}>
                  <div>Employee contrib: {formatCents(accountContributionsFromRecurring[a.id].employeeCents)}</div>
                  {accountContributionsFromRecurring[a.id].employerMatchCents > 0 ? (
                    <div>Employer match: {formatCents(accountContributionsFromRecurring[a.id].employerMatchCents)}</div>
                  ) : null}
                </div>
              ) : null}
              {a.type === 'hysa' ? (
                (() => {
                  const h = a as HysaAccount;
                      const { interestAccruedThisMonthCents, projectedInterestThisMonthCents } =
                        computeHysaMonthlyInterest(h, Date.now());
                      const balance = typeof h.balanceCents === 'number' ? h.balanceCents : 0;
                      const reservedRaw =
                        typeof h.reservedSavingsCents === 'number' && h.reservedSavingsCents >= 0
                          ? h.reservedSavingsCents
                          : 0;
                      const reservedCents = Math.min(reservedRaw, balance);
                      const liquidCents = Math.max(0, balance - reservedCents);
                      const linkedBankName = h.linkedCheckingBankId
                        ? (data.banks || []).find((b) => b.id === h.linkedCheckingBankId)?.name || 'Linked'
                        : null;
                      return (
                        <div style={{ fontSize: '0.85rem', color: 'var(--ui-primary-text, var(--text))', marginTop: 4 }}>
                          <div>APY {h.interestRate.toFixed(2)}%</div>
                          <div>Projected month end interest: {formatCents(projectedInterestThisMonthCents)}</div>
                          <div style={{ marginTop: 4 }}>
                            <div>Reserved savings: {formatCents(reservedCents)}</div>
                            <div>Money in HYSA designated for bills: {formatCents(h.linkedCheckingBankId ? liquidCents : 0)}</div>
                          </div>
                        </div>
                      );
                    })()
                  ) : null}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    <button type="button" className="btn btn-secondary" style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset' }} onClick={() => openInvestingBalanceModal(a)}>
                      Add / Set
                    </button>
                    {a.type === 'hysa' ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset' }}
                          onClick={() => setHysaRate(a as HysaAccount)}
                        >
                          APY
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset' }}
                          onClick={() => openHysaAllocationModal(a as HysaAccount)}
                        >
                          Adjust Alloc
                        </button>
                        <select
                          className="btn btn-secondary"
                          style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset', cursor: 'pointer' }}
                          value={(a as HysaAccount).linkedCheckingBankId || ''}
                          onChange={(e) => {
                            const bankId = e.target.value || undefined;
                            const accounts = investing.accounts.map((acc) => {
                              if (acc.id !== a.id || acc.type !== 'hysa') return acc;
                              return { ...(acc as HysaAccount), linkedCheckingBankId: bankId || undefined };
                            });
                            persist({ ...investing, accounts });
                          }}
                        >
                          <option value="">Link Checking</option>
                          {(data.banks || [])
                            .filter((b) => b.type === 'bank')
                            .map((b) => (
                              <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset' }}
                      onClick={() => deleteAccount(a)}
                    >
                      Delete
                    </button>
                  </div>
              </div></div>
            );
          })}
          </div>
          </div>
          {visibleAccounts.length > 1 ? (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 6, marginBottom: 8 }}>
              {visibleAccounts.map((_, i) => (
                <span
                  key={i}
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: i === carouselIdx ? 'var(--accent)' : 'var(--border)',
                    transition: 'background 0.2s',
                    display: 'inline-block'
                  }}
                />
              ))}
            </div>
          ) : null}
      </>
    );
  }

  return (
    <div className="tab-panel active" id="investingContent">
      <p className="section-title page-title">Investing</p>

      <Modal open={balanceModal != null} title="Balance" onClose={() => setBalanceModal(null)}>
        {balanceModal ? (
          <>
            <div className="field">
              <label>Amount ($)</label>
              <input
                className="ll-control"
                value={balanceModal.amount}
                onChange={(e) => setBalanceModal({ ...balanceModal, amount: e.target.value })}
                inputMode="decimal"
                placeholder={balanceModal.useSet ? (balanceModal.acc.balanceCents / 100).toFixed(2) : '0.00'}
              />
            </div>
            <div className="toggle-row">
              <input
                type="checkbox"
                id="inv-balance-use-set"
                checked={balanceModal.useSet}
                onChange={(e) => setBalanceModal({ ...balanceModal, useSet: e.target.checked })}
              />
              <label htmlFor="inv-balance-use-set">Set (replace balance)</label>
            </div>
            {balanceModal.acc.type === 'hysa' && balanceModal.useSet ? (
              <div className="field">
                <label>Interest accrued this month ($, optional)</label>
                <input
                  className="ll-control"
                  value={balanceModal.hysaInterest}
                  onChange={(e) => setBalanceModal({ ...balanceModal, hysaInterest: e.target.value })}
                  inputMode="decimal"
                  placeholder="Leave blank to keep current"
                />
              </div>
            ) : null}
            <div className="btn-row">
              <button type="button" className="btn btn-secondary" onClick={() => setBalanceModal(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-secondary" onClick={submitInvestingBalanceModal}>
                OK
              </button>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        open={newAccount != null}
        title="Add account"
        onClose={() => setNewAccount(null)}
      >
        {newAccount ? (
          <>
            <div className="field">
              <label>Name</label>
              <input
                className="ll-control"
                value={newAccount.name}
                onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                placeholder="Account name"
              />
            </div>
            {newAccount.type === 'hysa' ? (
              <>
                <div className="field">
                  <label>Starting balance ($)</label>
                  <input
                    className="ll-control"
                    value={newAccount.hysaStartingBalance}
                    onChange={(e) => setNewAccount({ ...newAccount, hysaStartingBalance: e.target.value })}
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                </div>
                <div className="field">
                  <label>APR / interest rate (%)</label>
                  <input
                    className="ll-control"
                    value={newAccount.hysaRatePercent}
                    onChange={(e) => setNewAccount({ ...newAccount, hysaRatePercent: e.target.value })}
                    inputMode="decimal"
                    placeholder="e.g. 4"
                  />
                </div>
                <div className="field">
                  <label>When is this balance valid?</label>
                  <Select
                    value={newAccount.hysaWhen}
                    onChange={(e) =>
                      setNewAccount({
                        ...newAccount,
                        hysaWhen: (e.target.value as '1' | '2' | '3') || '1',
                      })
                    }
                    style={{ width: '100%' }}
                  >
                    <option value="1">Today (default)</option>
                    <option value="2">Start of this month</option>
                    <option value="3">Specific date…</option>
                  </Select>
                </div>
                {newAccount.hysaWhen === '3' ? (
                  <div className="field">
                    <label>Date (YYYY-MM-DD)</label>
                    <input
                      className="ll-control"
                      value={newAccount.hysaInterestThisMonth}
                      onChange={(e) => setNewAccount({ ...newAccount, hysaInterestThisMonth: e.target.value })}
                      placeholder={new Date().toISOString().slice(0, 10)}
                    />
                  </div>
                ) : null}
                <div className="field">
                  <label>Interest this month so far ($, optional)</label>
                  <input
                    className="ll-control"
                    value={newAccount.hysaInterestThisMonth}
                    onChange={(e) => setNewAccount({ ...newAccount, hysaInterestThisMonth: e.target.value })}
                    inputMode="decimal"
                    placeholder="Leave blank to skip"
                  />
                </div>
              </>
            ) : null}
            <div className="btn-row">
              <button type="button" className="btn btn-secondary" onClick={() => setNewAccount(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  if (!newAccount.name.trim()) {
                    return;
                  }
                  const id = newAccount.id;
                  if (newAccount.type === 'hysa') {
                    const now = Date.now();
                    const nowDate = new Date(now);
                    const monthStartMs = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).getTime();
                    let balanceCents = 0;
                    if (newAccount.hysaStartingBalance.trim() !== '') {
                      const parsed = parseCents(newAccount.hysaStartingBalance);
                      if (parsed >= 0) balanceCents = parsed;
                    }
                    let interestRate = 4;
                    if (newAccount.hysaRatePercent.trim() !== '') {
                      const parsed = parseFloat(newAccount.hysaRatePercent);
                      if (Number.isFinite(parsed) && parsed >= 0) interestRate = parsed;
                    }
                    let lastAccruedAt: number;
                    if (newAccount.hysaWhen === '3') {
                      const dateStr = newAccount.hysaInterestThisMonth || new Date().toISOString().slice(0, 10);
                      const d = new Date(dateStr + 'T12:00:00');
                      lastAccruedAt = Number.isFinite(d.getTime()) ? d.getTime() : now;
                    } else if (newAccount.hysaWhen === '2') {
                      lastAccruedAt = monthStartMs;
                    } else {
                      lastAccruedAt = now;
                    }
                    let interestThisMonth = 0;
                    let manualInterestBaselineThisMonth: number | undefined;
                    let manualInterestBaselineSetAt: number | undefined;
                    let manualInterestBaselineMonthKey: string | undefined;
                    if (newAccount.hysaInterestThisMonth.trim() !== '') {
                      const parsed = parseCents(newAccount.hysaInterestThisMonth);
                      if (parsed >= 0) {
                        interestThisMonth = parsed;
                        manualInterestBaselineThisMonth = parsed;
                        manualInterestBaselineSetAt = now;
                        manualInterestBaselineMonthKey = getMonthKeyFromTimestamp(now);
                      }
                    }
                    const monthKey = getMonthKeyFromTimestamp(now);
                    const monthlyBalanceEvents: { timestamp: number; balanceAfterCents: number }[] = [
                      { timestamp: getStartOfMonthMs(now), balanceAfterCents: balanceCents },
                    ];
                    const acc: InvestingAccount = {
                      id,
                      type: 'hysa',
                      name: newAccount.name.trim(),
                      balanceCents,
                      interestRate,
                      lastAccruedAt,
                      monthKey,
                      interestThisMonth,
                      monthlyBalanceEvents,
                      ...(manualInterestBaselineThisMonth !== undefined && {
                        manualInterestBaselineThisMonth,
                        manualInterestBaselineSetAt: manualInterestBaselineSetAt!,
                        manualInterestBaselineMonthKey: manualInterestBaselineMonthKey!,
                      }),
                    } as any as HysaAccount;
                    persist({ ...investing, accounts: [...investing.accounts, acc] });
                  } else {
                    const base: InvestingAccount = {
                      id,
                      type: newAccount.type,
                      name: newAccount.name.trim(),
                      balanceCents: 0,
                    } as any;
                    persist({ ...investing, accounts: [...investing.accounts, base] });
                  }
                  setNewAccount(null);
                }}
              >
                Add account
              </button>
            </div>
          </>
        ) : null}
      </Modal>

      {/* ── Liquid group ── */}
      <div
        className="section-header investing-section-header"
        style={{ marginTop: 24, padding: '10px 14px', borderRadius: 10 }}
        onClick={() => setLiquidCollapsed(!liquidCollapsed)}
      >
        <span className="section-header-left">Liquid</span>
        <span className="chevron">{liquidCollapsed ? '▸' : '▾'}</span>
      </div>
      {!liquidCollapsed ? (
        <>
          <div style={{ borderBottom: '1px solid var(--ui-border, var(--border))', marginBottom: 12, paddingBottom: 4 }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>HYSA</span>
          </div>
          {renderSection('HYSA', 'hysa', hysaAccounts, hysaCarouselRef, hysaCarouselIdx, setHysaCarouselIdx, hysaCarouselHeight, setHysaCarouselHeight)}
          <div style={{ borderBottom: '1px solid var(--ui-border, var(--border))', marginTop: 16, marginBottom: 12, paddingBottom: 4 }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>General Investing</span>
          </div>
          {renderSection('General Investing', 'general', generalAccounts, generalCarouselRef, generalCarouselIdx, setGeneralCarouselIdx, generalCarouselHeight, setGeneralCarouselHeight)}
        </>
      ) : null}

      {/* ── Long Term group ── */}
      <div
        className="section-header investing-section-header"
        style={{ marginTop: 24, padding: '10px 14px', borderRadius: 10 }}
        onClick={() => setLongtermCollapsed(!longtermCollapsed)}
      >
        <span className="section-header-left">Long Term</span>
        <span className="chevron">{longtermCollapsed ? '▸' : '▾'}</span>
      </div>
      {!longtermCollapsed ? (
        <>
          <div style={{ borderBottom: '1px solid var(--ui-border, var(--border))', marginBottom: 12, paddingBottom: 4 }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Roth IRA</span>
          </div>
          {renderSection('Roth IRA', 'roth', rothAccounts, rothCarouselRef, rothCarouselIdx, setRothCarouselIdx, rothCarouselHeight, setRothCarouselHeight)}
          <div style={{ borderBottom: '1px solid var(--ui-border, var(--border))', marginTop: 16, marginBottom: 12, paddingBottom: 4 }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Employer-Based Retirement Accounts</span>
          </div>
          {renderSection('Employer-Based Retirement Accounts', 'k401', k401Accounts, k401CarouselRef, k401CarouselIdx, setK401CarouselIdx, k401CarouselHeight, setK401CarouselHeight)}
        </>
      ) : null}

      <div
        className="card card-accent-strip"
        style={{
          marginTop: 24,
          background: 'var(--ui-surface-secondary, var(--surface))',
          borderColor: 'var(--ui-border, var(--border))',
        }}
      >
        <p className="section-title" style={{ marginTop: 0, marginBottom: 8, color: 'var(--ui-title-text, var(--text))' }}>
          Investing Summary
        </p>
        <div className="summary-compact">
          <div className="summary-kv">
            <span className="k" style={{ color: 'var(--ui-primary-text, var(--text))' }}>Total HYSA</span>
            <span className="v amount-pos">{formatCents(totals.totalHYSA)}</span>
          </div>
          <div className="summary-kv">
            <span className="k" style={{ color: 'var(--ui-primary-text, var(--text))' }}>Total Roth IRA</span>
            <span className="v amount-pos">{formatCents(totals.totalRoth)}</span>
          </div>
          <div className="summary-kv">
            <span className="k" style={{ color: 'var(--ui-primary-text, var(--text))' }}>Total Employer-Based Retirement</span>
            <span className="v amount-pos">{formatCents(totals.total401k)}</span>
          </div>
          <div className="summary-kv">
            <span className="k" style={{ color: 'var(--ui-primary-text, var(--text))' }}>Total General Investing</span>
            <span className="v amount-pos">{formatCents(totals.totalGeneral)}</span>
          </div>
          <div className="summary-kv">
            <span className="k" style={{ color: 'var(--ui-primary-text, var(--text))' }}>Total Investing</span>
            <span className="v amount-pos">{formatCents(totals.totalAll)}</span>
          </div>
        </div>
      </div>

      <div
        className="card"
        style={{
          marginTop: 16,
          background: 'var(--ui-surface-secondary, var(--surface))',
          borderColor: 'var(--ui-border, var(--border))',
        }}
      >
        <p className="section-title" style={{ marginTop: 0, marginBottom: 8, color: 'var(--ui-title-text, var(--text))' }}>
          Investing Contribution
        </p>
        {contribution.incomeMarkedCount === 0 || contribution.grossIncomeCents <= 0 ? (
          <p style={{ color: 'var(--ui-primary-text, var(--text))', fontSize: '0.9rem' }}>
            No full-time job income with pre-tax deductions. Add recurring income marked as Full-time job in the Recurring tab.
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
              <span className="k">Pre-tax employee contributions</span>
              <span className="v">
                {formatCents(contribution.preTaxInvestCents)}{' '}
                <span style={{ color: 'var(--ui-primary-text, var(--text))', fontSize: '0.85rem' }}>
                  ({contribution.preTaxPctGross.toFixed(1)}% of gross)
                </span>
              </span>
            </div>
            {contribution.employerMatchCents > 0 ? (
              <div className="summary-kv">
                <span className="k">Employer match contributions</span>
                <span className="v amount-pos">{formatCents(contribution.employerMatchCents)}</span>
              </div>
            ) : null}
            <div className="summary-kv">
              <span className="k">Total pre-tax retirement contributions</span>
              <span className="v">{formatCents(contribution.totalPreTaxRetirementCents)}</span>
            </div>
            <div className="summary-kv">
              <span className="k">Post-tax investing contributions</span>
              <span className="v">
                {formatCents(contribution.postTaxInvestCents)}{' '}
                <span style={{ color: 'var(--ui-primary-text, var(--text))', fontSize: '0.85rem' }}>
                  ({contribution.postTaxPctNet.toFixed(1)}% of net)
                </span>
              </span>
            </div>
            <div className="summary-kv">
              <span className="k">Total investing contributions</span>
              <span className="v">
                {formatCents(contribution.totalInvestCents)}{' '}
                <span style={{ color: 'var(--ui-primary-text, var(--text))', fontSize: '0.85rem', display: 'block' }}>
                  {(contribution.preTaxPctGross + contribution.postTaxPctNet).toFixed(1)}%
                </span>
              </span>
            </div>
          </div>
        )}
      </div>

      <div
        className="section-header"
        style={{ marginTop: 16 }}
        onClick={() => {
          const source = coastFireAssumptions || coastFireForm;
          setCoastFireForm({ ...source });
          setCoastFireFormStrings(coastFireAssumptionsToFormStrings(source));
          setCoastFireOpen(true);
        }}
      >
        <span className="section-header-left">See more: Coast FIRE</span>
        <span className="chevron">▸</span>
      </div>

      {coastFireOpen ? (
        <div className="modal-overlay" onClick={() => { setCoastFireTooltipId(null); setCoastFireOpen(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Coast FIRE</h3>
            {!coastFireAssumptions || coastFireEditForm ? (
              <>
                <p style={{ color: 'var(--ui-primary-text, var(--text))', fontSize: '0.85rem', marginTop: 0 }}>
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
                  <label style={{ color: 'var(--ui-primary-text, var(--text))', fontSize: '0.9rem' }}>Include in retirement portfolio</label>
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
                    <label htmlFor="cf401k">Employer-Based Retirement Accounts</label>
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
            ) : (
              <CoastFireResultView
                a={coastFireAssumptions}
                totals={totals}
                detectedMonthlyRetirementDollars={detectedMonthlyRetirementDollars}
                coastFireTooltipId={coastFireTooltipId}
                setCoastFireTooltipId={setCoastFireTooltipId}
                onClose={() => {
                  setCoastFireTooltipId(null);
                  setCoastFireOpen(false);
                }}
                onEditAssumptions={() => {
                  if (coastFireAssumptions) {
                    setCoastFireForm({ ...coastFireAssumptions });
                    setCoastFireFormStrings(coastFireAssumptionsToFormStrings(coastFireAssumptions));
                  }
                  setCoastFireEditForm(true);
                }}
              />
            )}
          </div>
        </div>
      ) : null}

      {transferOpen ? (
        <div className="modal-overlay">
          <div className="modal">
            {transferHysaStep ? (
              <>
                <h3>
                  {transferHysaStep.direction === 'in'
                    ? `Where should this transfer go inside ${transferHysaStep.accountName}?`
                    : `Which portion should this transfer come from?`}
                </h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--text))', marginBottom: 16 }}>
                  {transferHysaStep.direction === 'in'
                    ? 'Choose which portion of the HYSA this transfer is going into.'
                    : 'Choose which portion of the HYSA this transfer is being pulled from.'}
                </p>
                <div className="btn-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => commitHysaSubBucketChoice('liquid')}
                  >
                    Checking / liquid portion
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => commitHysaSubBucketChoice('reserved')}
                  >
                    Savings / reserved portion
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setTransferHysaStep(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3>Transfer between accounts</h3>
                <div className="field">
                  <label>From</label>
                <Select value={transferFrom} onChange={(e) => setTransferFrom(e.target.value)}>
                <option value="">Select...</option>
                {banksSortedByBalance.map((b) => (
                  <option key={b.id} value={`bank:${b.id}`}>
                    Bank — {b.name}
                  </option>
                ))}
                {hysaAccountsSorted.map((a) => (
                  <option key={a.id} value={`hysa:${a.id}`}>
                    HYSA — {a.name}
                  </option>
                ))}
                {generalAccountsSorted.map((a) => (
                  <option key={a.id} value={`general:${a.id}`}>
                    Investing — {a.name}
                  </option>
                ))}
              </Select>
                </div>
                <div className="field">
                  <label>To</label>
                <Select value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
                <option value="">Select...</option>
                {banksSortedByBalance.map((b) => (
                  <option key={b.id} value={`bank:${b.id}`}>
                    Bank — {b.name}
                  </option>
                ))}
                {hysaAccountsSorted.map((a) => (
                  <option key={a.id} value={`hysa:${a.id}`}>
                    HYSA — {a.name}
                  </option>
                ))}
                {generalAccountsSorted.map((a) => (
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
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setTransferOpen(false);
                      setTransferHysaStep(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={createTransfer}>
                    Create transfer
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      <Modal
        open={hysaPickerOpen}
        title="Select HYSA Account"
        onClose={() => setHysaPickerOpen(false)}
      >
        <p style={{ fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--text))', marginTop: 0 }}>
          Which HYSA would you like to adjust?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(investing.accounts.filter(a => a.type === 'hysa') as HysaAccount[]).map((acc) => (
            <button
              key={acc.id}
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={() => {
                setHysaPickerOpen(false);
                openHysaAllocationModal(acc);
              }}
            >
              {acc.name}
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        open={!!hysaAllocationAccount}
        title="Adjust HYSA Allocation"
        onClose={() => setHysaAllocationAccount(null)}
      >
        {hysaAllocationAccount ? (
          (() => {
            const h = hysaAllocationAccount;
            const totalCents = Math.max(0, h.balanceCents || 0);
            const reservedCents = Math.max(0, Math.min(allocationReservedCents, totalCents));
            const billsCents = totalCents - reservedCents;
            const reservedDollars = (reservedCents / 100).toFixed(2);
            const billsDollars = (billsCents / 100).toFixed(2);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--text))' }}>
                  Move money between reserved savings and money designated for bills. Total HYSA balance stays the same.
                </p>
                <div>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem' }}>Total HYSA balance</label>
                  <div style={{ fontWeight: 600 }}>{formatCents(totalCents)}</div>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem' }}>Reserved savings</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={reservedDollars}
                    onChange={(e) => {
                      const cents = parseCents(e.target.value);
                      const next = Number.isFinite(cents) ? Math.max(0, Math.min(cents, totalCents)) : allocationReservedCents;
                      setAllocationReservedCents(next);
                    }}
                    style={{ width: '100%', padding: '8px 10px', fontSize: '1rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: '0.85rem' }}>Money in HYSA Designated for Bills</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={billsDollars}
                    onChange={(e) => {
                      const cents = parseCents(e.target.value);
                      const bills = Number.isFinite(cents) ? Math.max(0, Math.min(cents, totalCents)) : billsCents;
                      setAllocationReservedCents(Math.max(0, totalCents - bills));
                    }}
                    style={{ width: '100%', padding: '8px 10px', fontSize: '1rem' }}
                  />
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <p style={{ margin: '0 0 8px', fontSize: '0.85rem' }}>Move amount between portions</p>
                  <HysaMoveRow
                    totalCents={totalCents}
                    reservedCents={reservedCents}
                    onReservedChange={setAllocationReservedCents}
                    parseCents={parseCents}
                    formatCents={formatCents}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setHysaAllocationAccount(null)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => saveHysaAllocation(allocationReservedCents)}
                  >
                    Save
                  </button>
                </div>
              </div>
            );
          })()
        ) : null}
      </Modal>
    </div>
  );
}

