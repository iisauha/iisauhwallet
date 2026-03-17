import { useState, useEffect } from 'react';
import {
  type PublicLoanSummary,
  loadPublicLoanSummary,
  savePublicLoanSummary
} from './PublicLoanSummaryStore';
import { loadPublicPaymentNowAdded, savePublicPaymentNowAdded, loadPublicLoanShowPaymentActions, savePublicLoanShowPaymentActions } from '../../state/storage';
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

function todayISO(): string {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function PublicLoanSimpleCard(props: { onSave?: () => void; onAddToPaymentNow?: () => void }) {
  const { onSave, onAddToPaymentNow } = props;
  const [summary, setSummary] = useState<PublicLoanSummary>(() => loadPublicLoanSummary());
  const [paymentInput, setPaymentInput] = useState('');
  const [firstPaymentDateInput, setFirstPaymentDateInput] = useState('');
  const [showFirstPaymentDetails, setShowFirstPaymentDetails] = useState(false);
  const [notesInput, setNotesInput] = useState('');
  const [balanceInput, setBalanceInput] = useState('');
  const [rateInput, setRateInput] = useState('');
  const [showPaymentActions, setShowPaymentActions] = useState(true);

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
    setShowFirstPaymentDetails(s.paymentMode === 'first_payment_date');
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
      persist({ ...summary, paymentMode: 'current_payment', currentPaymentCents: cents });
    }
  };

  const handleSaveFirstPaymentDate = () => {
    const v = firstPaymentDateInput.trim();
    persist({ ...summary, firstPaymentDate: v || undefined });
  };

  const estimatedCents = summary.estimatedMonthlyPaymentCents;
  const currentCents = summary.currentPaymentCents;

  const publicEstimateCents =
    summary.paymentMode === 'first_payment_date'
      ? (summary.estimatedMonthlyPaymentCents ?? 0) > 0 && summary.firstPaymentDate && summary.firstPaymentDate <= todayISO()
        ? (summary.estimatedMonthlyPaymentCents ?? 0)
        : 0
      : (summary.currentPaymentCents != null && summary.currentPaymentCents > 0)
        ? summary.currentPaymentCents
        : (summary.estimatedMonthlyPaymentCents ?? 0);

  const handleAddToPaymentNow = () => {
    if (publicEstimateCents <= 0) return;
    const current = loadPublicPaymentNowAdded();
    savePublicPaymentNowAdded(current + publicEstimateCents);
    onAddToPaymentNow?.();
  };

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

      <div style={{ marginBottom: 14 }}>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginBottom: showPaymentActions ? 8 : 0, fontSize: '0.85rem', padding: '4px 10px' }}
          onClick={() => {
            setShowPaymentActions((v) => {
              const next = !v;
              savePublicLoanShowPaymentActions(next);
              return next;
            });
          }}
        >
          {showPaymentActions ? 'Hide payment actions' : 'Show payment actions'}
        </button>
        {showPaymentActions ? (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleAddToPaymentNow}
                disabled={publicEstimateCents <= 0}
              >
                Add to Payment(now)
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleUseAsCurrentPayment}
              >
                Use as current payment
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowFirstPaymentDetails((v) => !v);
                  if (!showFirstPaymentDetails) {
                    persist({ ...summary, paymentMode: 'first_payment_date' });
                  }
                }}
              >
                {showFirstPaymentDetails ? 'Hide first payment date' : 'Use first payment date'}
              </button>
            </div>
            {showFirstPaymentDetails && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
            <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--muted)', marginBottom: 4 }}>
              First payment date
            </label>
            <input
              type="date"
              className="ll-control"
              value={firstPaymentDateInput}
              onChange={(e) => setFirstPaymentDateInput(e.target.value)}
              onBlur={handleSaveFirstPaymentDate}
              style={inputStyle}
            />
            <p style={{ marginTop: 6, marginBottom: 8, fontSize: '0.8rem', color: 'var(--muted)' }}>
              When this date is reached, your estimated public loan payment can be automatically added to Payment(now).
            </p>
            <div className="toggle-row" style={{ alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>Auto-add when date reached:</span>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: '0.85rem' }}
                onClick={() => persist({ ...summary, firstPaymentDateAutoAddPaused: !summary.firstPaymentDateAutoAddPaused })}
              >
                {summary.firstPaymentDateAutoAddPaused ? 'Paused' : 'Active'}
              </button>
            </div>
            {summary.firstPaymentDateAutoAddPaused ? (
              <p style={{ marginTop: 6, marginBottom: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>
                Paused. Use &quot;Add to Payment(now)&quot; manually if you want to include public in Payment(now).
              </p>
            ) : null}
          </div>
        )}
        {summary.paymentMode === 'current_payment' && currentCents != null && currentCents > 0 ? (
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 6, marginBottom: 0 }}>
            Current payment (now): {formatCents(currentCents)}/mo
          </p>
        ) : null}
          </>
        ) : null}
      </div>

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
