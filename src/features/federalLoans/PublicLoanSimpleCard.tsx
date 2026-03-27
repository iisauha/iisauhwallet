import { useState, useEffect, useRef } from 'react';
import {
  type PublicLoanSummary,
  loadPublicLoanSummary,
  savePublicLoanSummary
} from './PublicLoanSummaryStore';
import { loadPublicPaymentNowAdded, savePublicPaymentNowAdded } from '../../state/storage';
import { formatCents } from '../../state/calc';
import { Modal } from '../../ui/Modal';

const LOAN_SIMULATOR_URL = 'https://studentaid.gov/loan-simulator/';

const inputStyle = {
  width: '100%',
  maxWidth: 200,
  minHeight: 44,
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid var(--ui-outline-btn, var(--ui-border, var(--border)))',
  background: 'var(--ui-card-bg, var(--surface))',
  color: 'var(--ui-primary-text, var(--text))',
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
  const [showPaymentActionsModal, setShowPaymentActionsModal] = useState(false);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [publicCarouselHeight, setPublicCarouselHeight] = useState<number | undefined>(undefined);
  const carouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      const firstItem = carouselRef.current?.children[0] as HTMLElement | undefined;
      if (firstItem) setPublicCarouselHeight(firstItem.offsetHeight);
    });
  }, []);

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
    <div style={{ marginBottom: 16 }}>
      <div style={publicCarouselHeight != null ? { height: publicCarouselHeight, overflow: 'hidden', transition: 'height 0.2s ease' } : { overflow: 'hidden' }}>
      <div
        ref={carouselRef}
        className="card-carousel"
        style={{ marginBottom: 0 }}
        onScroll={(e) => {
          const el = e.currentTarget;
          const idx = Math.round(el.scrollLeft / (el.clientWidth || 1));
          setCarouselIdx(idx);
          const item = el.children[idx] as HTMLElement | undefined;
          if (item) setPublicCarouselHeight(item.offsetHeight);
        }}
      >
        {/* Card 1: FSA link, payment entry, payment actions */}
        <div className="card-carousel-item">
          <div className="card" style={{ marginBottom: 0, padding: '14px 16px' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>Public Loans</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--ui-primary-text, var(--text))', marginBottom: 14 }}>
              If you are not sure what your monthly payment will be, use the Federal Student Aid simulator to get an estimate, then enter the amount below.
            </p>

            <a
              href={LOAN_SIMULATOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              style={{ display: 'inline-block', marginBottom: 16, textDecoration: 'none', fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset' }}
            >
              Estimate Payment
            </a>

            <div className="field" style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--text))', marginBottom: 4 }}>
                My estimated monthly payment ($)
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

            <div style={{ marginBottom: 4 }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset' }}
                onClick={() => setShowPaymentActionsModal(true)}
              >
                Payment Actions
              </button>
              {summary.paymentMode === 'current_payment' && currentCents != null && currentCents > 0 ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))', marginTop: 6, marginBottom: 0 }}>
                  Current payment (now): {formatCents(currentCents)}/mo
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {/* Card 2: Optional summary fields and notes */}
        <div className="card-carousel-item">
          <div className="card" style={{ marginBottom: 0, padding: '14px 16px' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>Public Loan Details</h4>

            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))', marginBottom: 10 }}>
                Optional summary (for dashboard totals)
              </p>
              <div className="field" style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--text))', marginBottom: 4 }}>
                  Total balance ($)
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
                <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--text))', marginBottom: 4 }}>
                  Avg interest rate (%)
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
              <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--text))', marginBottom: 4 }}>
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
                  border: '1px solid var(--ui-outline-btn, var(--ui-border, var(--border)))',
                  background: 'var(--ui-card-bg, var(--surface))',
                  color: 'var(--ui-primary-text, var(--text))',
                  fontSize: '0.95rem',
                  resize: 'vertical',
                  minHeight: 80
                }}
              />
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Page dot indicators */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 4 }}>
        {[0, 1].map((i) => (
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

      <Modal
        open={showPaymentActionsModal}
        title="Payment Actions"
        onClose={() => setShowPaymentActionsModal(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset' }}
              onClick={() => { handleAddToPaymentNow(); setShowPaymentActionsModal(false); }}
              disabled={publicEstimateCents <= 0}
            >
              Add to monthly total
            </button>
            <p style={{ marginTop: 4, marginBottom: 0, fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))' }}>
              Adds your estimated public loan payment to your monthly payment total.
            </p>
          </div>
          <div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset' }}
              onClick={() => { handleUseAsCurrentPayment(); setShowPaymentActionsModal(false); }}
            >
              Set as current
            </button>
            <p style={{ marginTop: 4, marginBottom: 0, fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))' }}>
              Sets this estimate as your current active payment amount.
            </p>
          </div>
          <div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset' }}
              onClick={() => {
                setShowFirstPaymentDetails((v) => !v);
                if (!showFirstPaymentDetails) {
                  persist({ ...summary, paymentMode: 'first_payment_date' });
                }
              }}
            >
              {showFirstPaymentDetails ? 'Hide start date' : 'Set start date'}
            </button>
            <p style={{ marginTop: 4, marginBottom: 0, fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))' }}>
              Set a date when payments will automatically begin.
            </p>
          </div>
          {showFirstPaymentDetails && (
            <div style={{ padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--text))', marginBottom: 4 }}>
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
              <p style={{ marginTop: 6, marginBottom: 8, fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))' }}>
                When this date is reached, your estimated payment will automatically be added to your monthly total.
              </p>
              <div className="toggle-row" style={{ alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--text))' }}>Auto-add when date reached:</span>
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
                <p style={{ marginTop: 6, marginBottom: 0, fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))' }}>
                  Paused. Tap "Add to monthly total" manually to include this loan.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
