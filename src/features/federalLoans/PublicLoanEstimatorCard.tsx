import { useState, useEffect } from 'react';
import { formatCents } from '../../state/calc';
import {
  type PublicLoanEstimatorState,
  loadPublicLoanEstimator,
  savePublicLoanEstimator,
  computePlanEstimates
} from './PublicLoanEstimatorStore';
import { Select } from '../../ui/Select';

const STATE_OPTIONS = [
  '',
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
];

function toNum(s: string): number {
  const n = parseFloat(String(s).replace(/,/g, '').trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function toInt(s: string, min: number): number {
  const n = parseInt(String(s).trim(), 10);
  return Number.isFinite(n) && n >= min ? n : min;
}

export function PublicLoanEstimatorCard() {
  const [saved, setSaved] = useState<PublicLoanEstimatorState>(() => loadPublicLoanEstimator());
  const [totalBalance, setTotalBalance] = useState('');
  const [avgRate, setAvgRate] = useState('');
  const [agi, setAgi] = useState('');
  const [householdSize, setHouseholdSize] = useState('');
  const [stateOfResidency, setStateOfResidency] = useState('');
  const [dependents, setDependents] = useState('');
  const [povertyLevel, setPovertyLevel] = useState('');
  const [actualOverride, setActualOverride] = useState('');

  useEffect(() => {
    const s = loadPublicLoanEstimator();
    setSaved(s);
    setTotalBalance(s.totalBalanceCents ? (s.totalBalanceCents / 100).toFixed(2) : '');
    setAvgRate(s.avgInterestRatePercent ? String(s.avgInterestRatePercent) : '');
    setAgi(s.agiCents ? (s.agiCents / 100).toFixed(2) : '');
    setHouseholdSize(s.householdSize ? String(s.householdSize) : '');
    setStateOfResidency(s.state);
    setDependents(s.dependents ? String(s.dependents) : '');
    setPovertyLevel(s.povertyLevelDollars ? String(s.povertyLevelDollars) : '');
    setActualOverride(s.actualPaymentOverrideCents != null ? (s.actualPaymentOverrideCents / 100).toFixed(2) : '');
  }, []);

  const save = () => {
    const balanceDollars = toNum(totalBalance);
    const agiDollars = toNum(agi);
    const overrideDollars = toNum(actualOverride);
    const next: PublicLoanEstimatorState = {
      totalBalanceCents: Math.round(balanceDollars * 100),
      avgInterestRatePercent: toNum(avgRate),
      agiCents: Math.round(agiDollars * 100),
      householdSize: Math.max(1, Math.min(10, toInt(householdSize, 1))),
      state: stateOfResidency,
      dependents: Math.max(0, toInt(dependents, 0)),
      povertyLevelDollars: toNum(povertyLevel),
      actualPaymentOverrideCents: overrideDollars > 0 ? Math.round(overrideDollars * 100) : null
    };
    savePublicLoanEstimator(next);
    setSaved(next);
  };

  const balanceCents = Math.round(toNum(totalBalance) * 100);
  const agiCents = Math.round(toNum(agi) * 100);
  const povertyDollars = toNum(povertyLevel);
  const stateForCalc: PublicLoanEstimatorState = {
    ...saved,
    totalBalanceCents: balanceCents,
    avgInterestRatePercent: toNum(avgRate),
    agiCents,
    householdSize: Math.max(1, Math.min(10, toInt(householdSize, 1))),
    state: stateOfResidency,
    dependents: Math.max(0, toInt(dependents, 0)),
    povertyLevelDollars: povertyDollars,
    actualPaymentOverrideCents: toNum(actualOverride) > 0 ? Math.round(toNum(actualOverride) * 100) : null
  };
  const { ibr, paye, icr, lowestCents } = computePlanEstimates(stateForCalc);
  const overrideCents = stateForCalc.actualPaymentOverrideCents;

  return (
    <div className="card" style={{ marginBottom: 16, padding: '14px 16px' }}>
      <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem' }}>Public Loan Estimator</h4>
      <p style={{ fontSize: '0.85rem', color: 'var(--ui-primary-text, var(--text))', marginBottom: 12 }}>
        These are consolidated federal loan estimates based on your total public loan balance.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="field">
          <label>Total Public Loan Balance ($)</label>
          <input
            type="text"
            className="ll-control"
            inputMode="decimal"
            value={totalBalance}
            onChange={(e) => setTotalBalance(e.target.value)}
            placeholder="0.00"
            style={{ width: '100%', maxWidth: 160, padding: '6px 8px' }}
          />
        </div>
        <div className="field">
          <label>Current Average Interest Rate (%)</label>
          <input
            type="text"
            className="ll-control"
            inputMode="decimal"
            value={avgRate}
            onChange={(e) => setAvgRate(e.target.value)}
            placeholder="e.g. 5.5"
            style={{ width: '100%', maxWidth: 120, padding: '6px 8px' }}
          />
        </div>
        <div className="field">
          <label>Adjusted Gross Income (AGI) ($)</label>
          <input
            type="text"
            className="ll-control"
            inputMode="decimal"
            value={agi}
            onChange={(e) => setAgi(e.target.value)}
            placeholder="0.00"
            style={{ width: '100%', maxWidth: 160, padding: '6px 8px' }}
          />
        </div>
        <div className="field">
          <label>Household Size</label>
          <Select
            value={householdSize}
            onChange={(e) => setHouseholdSize(e.target.value)}
            style={{ padding: '6px 8px', minWidth: 100 }}
          >
            <option value="">Select</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={String(n)}>{n}</option>
            ))}
          </Select>
          <p style={{ marginTop: 2, fontSize: '0.75rem', color: 'var(--ui-primary-text, var(--text))' }}>
            Include yourself, dependents, spouse (if filing jointly), and others you support.
          </p>
        </div>
        <div className="field">
          <label>State of Residency</label>
          <Select
            value={stateOfResidency}
            onChange={(e) => setStateOfResidency(e.target.value)}
            style={{ padding: '6px 8px', minWidth: 120 }}
          >
            {STATE_OPTIONS.map((s) => (
              <option key={s || 'blank'} value={s}>{s || '-'}</option>
            ))}
          </Select>
        </div>
        <div className="field">
          <label>Number of Dependents</label>
          <input
            type="text"
            className="ll-control"
            inputMode="numeric"
            value={dependents}
            onChange={(e) => setDependents(e.target.value)}
            placeholder="0"
            style={{ width: 100, padding: '6px 8px' }}
          />
        </div>
        <div className="field">
          <label>Poverty Level for Current Year ($)</label>
          <input
            type="text"
            className="ll-control"
            inputMode="decimal"
            value={povertyLevel}
            onChange={(e) => setPovertyLevel(e.target.value)}
            placeholder="e.g. 15650"
            style={{ width: '100%', maxWidth: 140, padding: '6px 8px' }}
          />
        </div>
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <div className="summary-kv" style={{ marginBottom: 6 }}>
          <span className="k">Estimated total monthly payment</span>
          <span className="v" style={{ color: 'var(--red)', fontWeight: 600 }}>{formatCents(lowestCents ?? 0)}/mo</span>
        </div>
        <div className="summary-kv" style={{ marginBottom: 4 }}>
          <span className="k">IBR (from formula)</span>
          <span className="v" style={{ color: 'var(--red)' }}>{formatCents(ibr.monthlyPaymentCents)}/mo</span>
        </div>
        <div className="summary-kv" style={{ marginBottom: 4 }}>
          <span className="k">PAYE (from formula)</span>
          <span className="v" style={{ color: 'var(--red)' }}>{formatCents(paye.monthlyPaymentCents)}/mo</span>
        </div>
        <div className="summary-kv" style={{ marginBottom: 8 }}>
          <span className="k">ICR (from formula)</span>
          <span className="v" style={{ color: 'var(--red)' }}>{formatCents(icr.monthlyPaymentCents)}/mo</span>
        </div>
        {overrideCents != null && overrideCents > 0 && (
          <div className="summary-kv" style={{ marginBottom: 4 }}>
            <span className="k">Actual total monthly payment override</span>
            <span className="v" style={{ color: 'var(--red)', fontWeight: 600 }}>{formatCents(overrideCents)}/mo</span>
          </div>
        )}
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label>Actual Total Monthly Payment Override ($) - optional</label>
        <input
          type="text"
          className="ll-control"
          inputMode="decimal"
          value={actualOverride}
          onChange={(e) => setActualOverride(e.target.value)}
          placeholder="Leave blank to use estimates only"
          style={{ width: '100%', maxWidth: 160, padding: '6px 8px' }}
        />
        {overrideCents != null && overrideCents > 0 && (
          <p style={{ marginTop: 4, fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))' }}>
            When set, the actual override is shown above; the estimated payment from the formula remains for comparison.
          </p>
        )}
      </div>

      <button type="button" className="btn btn-secondary" style={{ marginTop: 12 }} onClick={save}>
        Save
      </button>
    </div>
  );
}
