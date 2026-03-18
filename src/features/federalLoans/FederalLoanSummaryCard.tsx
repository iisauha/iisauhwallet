import { formatCents } from '../../state/calc';
import type { RepaymentPlanOption } from './FederalLoanParametersStore';

interface FederalLoanSummaryCardProps {
  totalBalanceCents: number;
  repaymentPlan: RepaymentPlanOption;
  estimatedPaymentCents: number;
  numPublicLoans: number;
}

export function FederalLoanSummaryCard({
  totalBalanceCents,
  repaymentPlan,
  estimatedPaymentCents,
  numPublicLoans
}: FederalLoanSummaryCardProps) {
  const sharePerLoan =
    numPublicLoans > 0 ? Math.round(estimatedPaymentCents / numPublicLoans) : 0;

  return (
    <div className="card" style={{ marginBottom: 12, padding: '12px 14px' }}>
      <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>Federal Loan Summary</h4>
      <div className="summary-kv" style={{ marginTop: 0, marginBottom: 4 }}>
        <span className="k">Total federal balance</span>
        <span className="v" style={{ color: 'var(--red)', fontWeight: 600 }}>
          {formatCents(totalBalanceCents)}
        </span>
      </div>
      <div className="summary-kv" style={{ marginTop: 4, marginBottom: 4 }}>
        <span className="k">Plan</span>
        <span className="v">{repaymentPlan}</span>
      </div>
      <div className="summary-kv" style={{ marginTop: 4, marginBottom: 8 }}>
        <span className="k">Estimated monthly payment</span>
        <span className="v" style={{ color: 'var(--red)' }}>
          {formatCents(estimatedPaymentCents)}/month
        </span>
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--muted))', margin: '0 0 8px 0' }}>
        Federal payments apply to the entire loan portfolio, not individual loans.
      </p>
      {numPublicLoans > 0 && (
        <p style={{ fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--muted))', margin: 0 }}>
          Estimated share per loan: ~{formatCents(sharePerLoan)} (estimate only).
        </p>
      )}
    </div>
  );
}
