import { useState, useEffect, useRef } from 'react';
import { formatCents } from '../../state/calc';
import {
  type PublicLoanSummary,
  loadPublicLoanSummary,
  savePublicLoanSummary
} from './PublicLoanSummaryStore';
import { Modal } from '../../ui/Modal';

const LOAN_SIMULATOR_URL = 'https://studentaid.gov/loan-simulator/';
const MAX_ATTACHMENT_BYTES = 350000;

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
  const [notesInput, setNotesInput] = useState('');
  const [balanceInput, setBalanceInput] = useState('');
  const [rateInput, setRateInput] = useState('');
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleAddImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (dataUrl.length > MAX_ATTACHMENT_BYTES) return;
      const attachments = [...(summary.attachments || []), dataUrl].slice(0, 6);
      persist({ ...summary, attachments });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeAttachment = (index: number) => {
    const attachments = [...(summary.attachments || [])];
    attachments.splice(index, 1);
    persist({ ...summary, attachments });
    setPreviewIndex(null);
  };

  const paymentCents = summary.estimatedMonthlyPaymentCents;
  const attachments = summary.attachments || [];
  const previewUrl = previewIndex != null ? attachments[previewIndex] : null;

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

      <div className="field" style={{ marginBottom: 14 }}>
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

      {paymentCents != null && paymentCents > 0 && (
        <div className="summary-kv" style={{ marginBottom: 16 }}>
          <span className="k">After grace</span>
          <span className="v" style={{ color: 'var(--red)', fontWeight: 600 }}>
            {formatCents(paymentCents)}/mo
          </span>
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
          Notes / screenshots
        </label>
        <textarea
          className="ll-control"
          value={notesInput}
          onChange={(e) => setNotesInput(e.target.value)}
          onBlur={handleSaveNotes}
          placeholder="Text notes or paste details..."
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
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          {attachments.map((dataUrl, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPreviewIndex(i)}
              style={{
                padding: 0,
                border: '1px solid var(--border)',
                borderRadius: 10,
                overflow: 'hidden',
                background: 'var(--bg-secondary)',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <img
                src={dataUrl}
                alt={`Screenshot ${i + 1}`}
                style={{
                  width: 72,
                  height: 72,
                  objectFit: 'cover',
                  display: 'block'
                }}
              />
            </button>
          ))}
          {attachments.length < 6 && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAddImage}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.85rem' }}
                onClick={() => fileInputRef.current?.click()}
              >
                Add screenshot
              </button>
            </>
          )}
        </div>
      </div>

      <Modal
        open={previewIndex !== null}
        title="Screenshot"
        onClose={() => setPreviewIndex(null)}
      >
        {previewUrl && previewIndex !== null ? (
          <div>
            <img
              src={previewUrl}
              alt="Preview"
              style={{
                width: '100%',
                maxHeight: '60vh',
                objectFit: 'contain',
                borderRadius: 8,
                marginBottom: 16
              }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setPreviewIndex(null)}>
                Close
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => removeAttachment(previewIndex)}
              >
                Delete
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
