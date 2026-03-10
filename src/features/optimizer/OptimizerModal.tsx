import { useState, useCallback } from 'react';
import { Modal } from '../../ui/Modal';
import { OptimizerForm, DEFAULT_VALUES, type OptimizerFormValues } from './OptimizerForm';
import { OptimizerResults } from './OptimizerResults';
import { optimize_457b } from './optimize457b';
import type { OptimizerResult } from './optimize457b';

function parseMoney(s: string): number {
  const n = parseFloat(s.replace(/,/g, '').replace(/\$/g, '').trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

type OptimizerModalProps = {
  open: boolean;
  onClose: () => void;
};

export function OptimizerModal({ open, onClose }: OptimizerModalProps) {
  const [formValues, setFormValues] = useState<OptimizerFormValues>(DEFAULT_VALUES);
  const [result, setResult] = useState<OptimizerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setIsRunning(true);
      const gross_yearly = parseMoney(formValues.gross_yearly);
      if (gross_yearly <= 0) {
        setError('Please enter a positive gross yearly salary.');
        setIsRunning(false);
        return;
      }
      try {
        const r = optimize_457b(
          gross_yearly,
          parseMoney(formValues.rent_monthly),
          parseMoney(formValues.utilities_monthly),
          parseMoney(formValues.wifi_monthly),
          parseMoney(formValues.private_loans_monthly),
          parseMoney(formValues.groceries_monthly),
          parseMoney(formValues.fun_money_monthly),
          parseMoney(formValues.other_monthly)
        );
        setResult(r);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Optimization failed.');
      } finally {
        setIsRunning(false);
      }
    },
    [formValues]
  );

  const handleRunAgain = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return (
    <Modal open={open} title="Optimize Pre-Tax Contributions" onClose={onClose}>
      <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginTop: -4, marginBottom: 14 }}>
        This tool estimates the optimal 457(b) contribution and tax breakdown using your income and fixed expenses.
      </p>
      {result == null ? (
        <OptimizerForm
          values={formValues}
          onChange={setFormValues}
          onSubmit={handleSubmit}
          isRunning={isRunning}
          error={error}
        />
      ) : (
        <>
          <OptimizerResults result={result} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" className="btn btn-secondary" onClick={handleRunAgain}>
              Run again
            </button>
            <button type="button" className="btn btn-add" onClick={onClose}>
              Close
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
