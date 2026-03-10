import { useState } from 'react';
import type { OptimizerResult } from './optimize457b';

function fmt(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type RowProps = { label: string; value: number };

function Row({ label, value }: RowProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '4px 0', fontSize: '0.9rem' }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(value)}</span>
    </div>
  );
}

type OptimizerResultsProps = {
  result: OptimizerResult;
  showExpandedByDefault?: boolean;
};

/** Summary card only (main view): compact order — Gross, AGI, Total Taxes, Pre-Tax Contributions, Fixed Bills Sum, After Expenses. */
export function OptimizerResultsSummary({ result }: { result: OptimizerResult }) {
  const totalTaxesMonthly =
    result.federal_tax_monthly +
    result.ny_state_tax_monthly +
    result.nyc_tax_monthly +
    result.fica_monthly +
    result.ny_sdi_monthly +
    result.ny_fli_monthly;
  const totalFixedBillsMonthly =
    result.rent_monthly +
    result.utilities_monthly +
    result.wifi_monthly +
    result.private_loans_monthly +
    result.public_loans_monthly +
    result.groceries_monthly +
    result.fun_money_monthly +
    result.other_monthly;

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 12, color: 'var(--muted)' }}>Summary</div>
      <Row label="Monthly Gross" value={result.gross_monthly} />
      <Row label="Monthly Taxable Income (AGI)" value={result.agi_monthly} />
      <div style={{ marginTop: 8, marginBottom: 4, fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted)' }}>
        Pre-Tax Contributions
      </div>
      <Row label="Pension" value={result.pension_monthly} />
      <Row label="HCFSA" value={result.hcfsa_monthly} />
      <Row label="Commuter" value={result.commuter_monthly} />
      <Row label="457b" value={result.contrib_457b_monthly} />
      <Row label="Total Taxes" value={totalTaxesMonthly} />
      <Row label="Fixed Bills (total)" value={totalFixedBillsMonthly} />
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        <Row label="Monthly After Expenses" value={result.after_expenses_monthly} />
      </div>
    </div>
  );
}

/** Full results: summary first, then optional "See expanded list" for detailed breakdown. */
export function OptimizerResults({ result, showExpandedByDefault = false }: OptimizerResultsProps) {
  const [showExpanded, setShowExpanded] = useState(showExpandedByDefault);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <OptimizerResultsSummary result={result} />

      {!showExpanded ? (
        <button
          type="button"
          className="btn btn-secondary"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => setShowExpanded(true)}
        >
          See expanded list
        </button>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-secondary)' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: '0.9rem', fontWeight: 600 }}>
            Detailed monthly breakdown
          </div>
          <div style={{ padding: 12, maxHeight: 360, overflowY: 'auto' }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Gross</div>
              <Row label="Monthly Gross" value={result.gross_monthly} />
              <Row label="Monthly Taxable Income (AGI)" value={result.agi_monthly} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Pre-Tax Contributions</div>
              <Row label="Pension" value={result.pension_monthly} />
              <Row label="HCFSA" value={result.hcfsa_monthly} />
              <Row label="Commuter" value={result.commuter_monthly} />
              <Row label="457b" value={result.contrib_457b_monthly} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Taxes</div>
              <Row label="Social Security" value={result.social_security_monthly} />
              <Row label="Medicare" value={result.medicare_monthly} />
              <Row label="Federal Tax" value={result.federal_tax_monthly} />
              <Row label="NY State" value={result.ny_state_tax_monthly} />
              <Row label="NYC Tax" value={result.nyc_tax_monthly} />
              <Row label="NY SDI" value={result.ny_sdi_monthly} />
              <Row label="NY FLI" value={result.ny_fli_monthly} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Fixed Bills</div>
              <Row label="Rent" value={result.rent_monthly} />
              <Row label="Utilities" value={result.utilities_monthly} />
              <Row label="Wifi" value={result.wifi_monthly} />
              <Row label="Private Loans" value={result.private_loans_monthly} />
              <Row label="Public Loans" value={result.public_loans_monthly} />
              <Row label="Groceries" value={result.groceries_monthly} />
              <Row label="Fun Money" value={result.fun_money_monthly} />
              <Row label="Other" value={result.other_monthly} />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Monthly After Expenses</div>
              <Row label="Monthly After Expenses" value={result.after_expenses_monthly} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
