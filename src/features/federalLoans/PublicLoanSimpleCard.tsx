import { useState, useEffect } from 'react';
import {
  type PublicLoanSummary,
  loadPublicLoanSummary,
  savePublicLoanSummary
} from './PublicLoanSummaryStore';
import { formatCents } from '../../state/calc';

const LOAN_SIMULATOR_URL = 'https://studentaid.gov/loan-simulator/';

const inputStyle = {
  width: '100%',
  maxWidth: 200,
  minHeight: 44,
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: '1rem'
} as const;

function toCents(s: string): number | null {
  const n = parseFloat(String(s).replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function toRate(s: string): number | null {
  const n = parseFloat(String(s).replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function PublicLoanSimpleCard(props: { onSave?: () => void }) {
  const { onSave } = props;
  const [summary, setSummary] = useState<PublicLoanSummary>(() => loadPublicLoanSummary());
  const [paymentInput, setPaymentInput] = useState('');
  const [firstPaymentDateInput, setFirstPaymentDateInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [balanceInput, setBalanceInput] = useState('');
  const [rateInput, setRateInput] = useState('');

  useEffect(() => {
    const s = loadPublicLoanSummary();
    setSummary(s);
    setPaymentInput(
      s.estimatedMonthlyPaymentCents != null && s.estimatedMonthlyPaymentCents > 0
        ? (s.estimatedMonthlyPaymentCents / 100).toFixed(2)
        : ''
    );
    setNotesInput(s.notesText);
    setBalanceInput(
      s.totalBalanceCents != null && s.totalBalanceCents > 0
        ? (s.totalBalanceCents / 100).toFixed(2)
        : ''
    );
    setRateInput(
      s.avgInterestRatePercent != null && s.avgInterestRatePercent > 0
        ? String(s.avgInterestRatePercent)
        : ''
    );
    setFirstPaymentDateInput(s.firstPaymentDate ?? '');
  }, []);

  const persist = (next: PublicLoanSummary) => {
    savePublicLoanSummary(next);
    setSummary(next);
    onSave?.();
  };

  const handleSavePayment = () => {
    const cents = toCents(paymentInput);
    persist({ ...summary, estimatedMonthlyPaymentCents: cents });
  };

  const handleSaveNotes = () => {
    persist({ ...summary, notesText: notesInput });
  };

  const handleSaveBalance = () => {
    const cents = toCents(balanceInput);
    persist({ ...summary, totalBalanceCents: cents ?? undefined });
  };

  const handleSaveRate = () => {
    const rate = toRate(rateInput);
    persist({ ...summary, avgInterestRatePercent: rate ?? undefined });
  };

  const handleUseAsCurrentPayment = () => {
    const cents = toCents(paymentInput);
    if (cents != null && cents > 0) {
      persist({ ...summary, currentPaymentCents: cents });
    }
  };

  const handleSaveFirstPaymentDate = () => {
    const v = firstPaymentDateInput.trim();
    persist({ ...summary, firstPaymentDate: v || undefined });
  };

  const estimatedCents = summary.estimatedMonthlyPaymentCents;
  const currentCents = summary.currentPaymentCents;

  return (
    <div className="card" style={{ marginBottom: 16, padding: '14px 16px' }}>
      <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>Public Loans</h4>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 14 }}>
        Use the official Federal Student Aid simulator to estimate your public loan payment, then enter your monthly amount here.
      </p>

      <a
        href={LOAN_SIMULATOR_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-add"
        style={{ display: 'inline-block', marginBottom: 16, textDecoration: 'none', color: 'inherit' }}
      >
        Estimate your public loan payment
      </a>

      <div className="field" style={{ marginBottom: 10 }}>
        <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--muted)', marginBottom: 4 }}>
          My estimated monthly public loan payment ($)
        </label>
        <input
          type="text"
          inputMode="decimal"
          className="ll-control"
          value={paymentInput}
          onChange={(e) => setPaymentInput(e.target.value)}
          onBlur={handleSavePayment}
          placeholder="0.00"
          style={inputStyle}
        />
      </div>

      <div className="field" style={{ marginBottom: 10 }}>
        <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--muted)', marginBottom: 4 }}>
          First payment date (optional)
        </label>
        <input
          type="date"
          className="ll-control"
          value={firstPaymentDateInput}
          onChange={(e) => setFirstPaymentDateInput(e.target.value)}
          onBlur={handleSaveFirstPaymentDate}
          style={inputStyle}
        />
        <p style={{ marginTop: 2, fontSize: '0.75rem', color: 'var(--muted)' }}>
          Before this date, the estimated payment does not count toward Payment(now). Leave blank to count it now.
        </p>
      </div>

      {estimatedCents != null && estimatedCents > 0 && (
        <div style={{ marginBottom: 14 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleUseAsCurrentPayment}
          >
            Use as current payment
          </button>
          {currentCents != null && currentCents > 0 && (
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 6, marginBottom: 0 }}>
              Current payment (now): {formatCents(currentCents)}/mo
            </p>
          )}
        </div>
      )}

      <div style={{ marginBottom: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 10 }}>
          Optional summary (for dashboard totals)
        </p>
        <div className="field" style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--muted)', marginBottom: 4 }}>
            Total public loan balance ($)
          </label>
          <input
            type="text"
            inputMode="decimal"
            className="ll-control"
            value={balanceInput}
            onChange={(e) => setBalanceInput(e.target.value)}
            onBlur={handleSaveBalance}
            placeholder="Optional"
            style={inputStyle}
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--muted)', marginBottom: 4 }}>
            Average public interest rate (%)
          </label>
          <input
            type="text"
            inputMode="decimal"
            className="ll-control"
            value={rateInput}
            onChange={(e) => setRateInput(e.target.value)}
            onBlur={handleSaveRate}
            placeholder="Optional"
            style={{ ...inputStyle, maxWidth: 140 }}
          />
        </div>
      </div>

      <div className="field" style={{ marginTop: 4 }}>
        <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--muted)', marginBottom: 4 }}>
          Notes
        </label>
        <textarea
          className="ll-control"
          value={notesInput}
          onChange={(e) => setNotesInput(e.target.value)}
          onBlur={handleSaveNotes}
          placeholder="Optional text notes..."
          rows={3}
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            fontSize: '0.95rem',
            resize: 'vertical',
            minHeight: 80
          }}
        />
      </div>
    </div>
  );
}
