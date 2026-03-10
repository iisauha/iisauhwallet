import { useState } from 'react';
import type { OptimizerResult } from './optimize457b';

function fmt(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type ExpandableSectionProps = {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
};

function ExpandableSection({ title, children, defaultOpen = false }: ExpandableSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg)',
          border: 'none',
          color: 'var(--text)',
          cursor: 'pointer',
          fontSize: '0.95rem',
          fontWeight: 600,
          textAlign: 'left',
        }}
      >
        {title}
        <span style={{ fontSize: '0.8rem' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open ? (
        <div style={{ padding: '8px 12px 12px', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
          {children}
        </div>
      ) : null}
    </div>
  );
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
};

export function OptimizerResults({ result }: OptimizerResultsProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Summary card */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 12, color: 'var(--muted)' }}>Summary</div>
        <Row label="Monthly Gross" value={result.gross_monthly} />
        <div style={{ marginTop: 8, marginBottom: 4, fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted)' }}>Retirement Contributions</div>
        <Row label="Pension" value={result.pension_monthly} />
        <Row label="HCFSA" value={result.hcfsa_monthly} />
        <Row label="Commuter" value={result.commuter_monthly} />
        <Row label="457b" value={result.contrib_457b_monthly} />
        <Row label="Monthly AGI" value={result.agi_monthly} />
        <div style={{ marginTop: 8, marginBottom: 4, fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted)' }}>Total Taxes</div>
        <Row label="Federal" value={result.federal_tax_monthly} />
        <Row label="NY State" value={result.ny_state_tax_monthly} />
        <Row label="NYC" value={result.nyc_tax_monthly} />
        <Row label="FICA" value={result.fica_monthly} />
        <Row label="NY SDI" value={result.ny_sdi_monthly} />
        <Row label="NY FLI" value={result.ny_fli_monthly} />
        <div style={{ marginTop: 8, marginBottom: 4, fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted)' }}>Total Fixed Bills</div>
        <Row label="Rent" value={result.rent_monthly} />
        <Row label="Utilities" value={result.utilities_monthly} />
        <Row label="WiFi" value={result.wifi_monthly} />
        <Row label="Private Loans" value={result.private_loans_monthly} />
        <Row label="Public Loans" value={result.public_loans_monthly} />
        <Row label="Groceries" value={result.groceries_monthly} />
        <Row label="Fun Money" value={result.fun_money_monthly} />
        <Row label="Other" value={result.other_monthly} />
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <Row label="Monthly After Expenses" value={result.after_expenses_monthly} />
        </div>
      </div>

      {/* Expandable breakdown */}
      <ExpandableSection title="Income" defaultOpen={false}>
        <Row label="Monthly Gross" value={result.gross_monthly} />
        <Row label="Monthly Taxable Income (AGI)" value={result.agi_monthly} />
      </ExpandableSection>

      <ExpandableSection title="Taxes" defaultOpen={false}>
        <Row label="Social Security" value={result.social_security_monthly} />
        <Row label="Medicare" value={result.medicare_monthly} />
        <Row label="Federal Tax" value={result.federal_tax_monthly} />
        <Row label="NY State" value={result.ny_state_tax_monthly} />
        <Row label="NYC Tax" value={result.nyc_tax_monthly} />
        <Row label="NY SDI" value={result.ny_sdi_monthly} />
        <Row label="NY FLI" value={result.ny_fli_monthly} />
      </ExpandableSection>

      <ExpandableSection title="Retirement Contributions" defaultOpen={false}>
        <Row label="Pension" value={result.pension_monthly} />
        <Row label="HCFSA" value={result.hcfsa_monthly} />
        <Row label="Commuter" value={result.commuter_monthly} />
        <Row label="457b" value={result.contrib_457b_monthly} />
      </ExpandableSection>

      <ExpandableSection title="Fixed Bills" defaultOpen={false}>
        <Row label="Rent" value={result.rent_monthly} />
        <Row label="Utilities" value={result.utilities_monthly} />
        <Row label="Wifi" value={result.wifi_monthly} />
        <Row label="Private Loans" value={result.private_loans_monthly} />
        <Row label="Public Loans" value={result.public_loans_monthly} />
        <Row label="Groceries" value={result.groceries_monthly} />
        <Row label="Fun Money" value={result.fun_money_monthly} />
        <Row label="Other" value={result.other_monthly} />
      </ExpandableSection>

      <ExpandableSection title="Final Result" defaultOpen={false}>
        <Row label="Monthly After Expenses" value={result.after_expenses_monthly} />
      </ExpandableSection>
    </div>
  );
}
