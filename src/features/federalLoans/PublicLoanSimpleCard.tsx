import { useState, useEffect, useRef } from 'react';
import { formatCents } from '../../state/calc';
import {
  type PublicLoanSummary,
  loadPublicLoanSummary,
  savePublicLoanSummary
} from './PublicLoanSummaryStore';

const LOAN_SIMULATOR_URL = 'https://studentaid.gov/loan-simulator/';
const MAX_ATTACHMENT_BYTES = 350000; // ~260KB base64 to stay under localStorage limits

function toCents(s: string): number | null {
  const n = parseFloat(String(s).replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function PublicLoanSimpleCard(props: { onSave?: () => void }) {
  const { onSave } = props;
  const [summary, setSummary] = useState<PublicLoanSummary>(() => loadPublicLoanSummary());
  const [paymentInput, setPaymentInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
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
  }, []);

  const persist = (next: PublicLoanSummary) => {
    savePublicLoanSummary(next);
    setSummary(next);
    onSave?.();
  };

  const handleSavePayment = () => {
    const cents = toCents(paymentInput);
    persist({
      ...summary,
      estimatedMonthlyPaymentCents: cents
    });
  };

  const handleSaveNotes = () => {
    persist({
      ...summary,
      notesText: notesInput
    });
  };

  const handleAddImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (dataUrl.length > MAX_ATTACHMENT_BYTES) {
        return; // skip silently or could show "Image too large"
      }
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
  };

  const paymentCents = summary.estimatedMonthlyPaymentCents;

  return (
    <div className="card" style={{ marginBottom: 16, padding: '14px 16px' }}>
      <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>Public Loans</h4>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 12 }}>
        Use the official Federal Student Aid simulator to estimate your public loan payment, then enter your monthly amount here.
      </p>

      <a
        href={LOAN_SIMULATOR_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-add"
        style={{ display: 'inline-block', marginBottom: 14, textDecoration: 'none', color: 'inherit' }}
      >
        Estimate your public loan payment
      </a>

      <div className="field" style={{ marginBottom: 12 }}>
        <label>My estimated monthly public loan payment ($)</label>
        <input
          type="text"
          inputMode="decimal"
          value={paymentInput}
          onChange={(e) => setPaymentInput(e.target.value)}
          onBlur={handleSavePayment}
          placeholder="0.00"
          style={{ width: '100%', maxWidth: 160, padding: '6px 8px' }}
        />
      </div>

      {paymentCents != null && paymentCents > 0 && (
        <div className="summary-kv" style={{ marginBottom: 14 }}>
          <span className="k">After grace</span>
          <span className="v" style={{ color: 'var(--red)', fontWeight: 600 }}>
            {formatCents(paymentCents)}/mo
          </span>
        </div>
      )}

      <div className="field" style={{ marginTop: 12 }}>
        <label>Notes / screenshots</label>
        <textarea
          value={notesInput}
          onChange={(e) => setNotesInput(e.target.value)}
          onBlur={handleSaveNotes}
          placeholder="Text notes or paste details..."
          rows={3}
          style={{
            width: '100%',
            padding: '8px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text)',
            fontSize: '0.9rem',
            resize: 'vertical'
          }}
        />
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
          {(summary.attachments || []).map((dataUrl, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img
                src={dataUrl}
                alt={`Screenshot ${i + 1}`}
                style={{
                  width: 80,
                  height: 80,
                  objectFit: 'cover',
                  borderRadius: 6,
                  border: '1px solid var(--border)'
                }}
              />
              <button
                type="button"
                aria-label="Remove"
                onClick={() => removeAttachment(i)}
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  border: 'none',
                  background: 'var(--red)',
                  color: 'white',
                  fontSize: 12,
                  cursor: 'pointer',
                  lineHeight: 1,
                  padding: 0
                }}
              >
                ×
              </button>
            </div>
          ))}
          {(summary.attachments?.length ?? 0) < 6 && (
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
    </div>
  );
}
