import { useState, useCallback, useEffect } from 'react';
import { Modal } from '../../ui/Modal';
import { OptimizerForm, DEFAULT_VALUES, type OptimizerFormValues } from './OptimizerForm';
import { OptimizerResults } from './OptimizerResults';
import { optimize_457b_with_assumptions, applyPublicLoanOverride } from './optimize457b';
import type { OptimizerResult } from './optimize457b';
import type { OptimizerAssumptions } from './optimizerAssumptions';
import { loadOptimizerAssumptions, saveOptimizerAssumptions } from './optimizerAssumptions';
import { saveLastOptimizerResult } from './optimizerLastResult';
import { OptimizerAssumptionsScreen } from './OptimizerAssumptionsScreen';
import { getOptimizerAutofillFromRecurring } from './optimizerAutofill';
import type { RecurringItem } from '../../state/models';

function parseMoney(s: string): number {
  const n = parseFloat(s.replace(/,/g, '').replace(/\$/g, '').trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

type Step = 'assumptions' | 'form' | 'results';

type OptimizerModalProps = {
  open: boolean;
  onClose: () => void;
  recurring?: RecurringItem[];
};

export function OptimizerModal({ open, onClose, recurring = [] }: OptimizerModalProps) {
  const [step, setStep] = useState<Step>('assumptions');
  const [assumptions, setAssumptions] = useState<OptimizerAssumptions | null>(null);
  const [formValues, setFormValues] = useState<OptimizerFormValues>(DEFAULT_VALUES);
  const [result, setResult] = useState<OptimizerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const assumptionsState = assumptions ?? loadOptimizerAssumptions();

  useEffect(() => {
    if (open) {
      setStep('assumptions');
      setAssumptions(loadOptimizerAssumptions());
      setFormValues(DEFAULT_VALUES);
      setResult(null);
      setError(null);
    }
  }, [open]);

  const handleConfirmAssumptions = useCallback(() => {
    const a = assumptions ?? loadOptimizerAssumptions();
    saveOptimizerAssumptions(a);
    setAssumptions(a);
    const autofill = getOptimizerAutofillFromRecurring(recurring);
    setFormValues((prev) => ({
      ...prev,
      rent_monthly: autofill.rent_monthly || prev.rent_monthly,
      utilities_monthly: autofill.utilities_monthly || prev.utilities_monthly,
      wifi_monthly: autofill.wifi_monthly || prev.wifi_monthly,
      private_loans_monthly: autofill.private_loans_monthly || prev.private_loans_monthly,
      public_loans_monthly_override: prev.public_loans_monthly_override,
      extraFixedExpenses: prev.extraFixedExpenses,
    }));
    setStep('form');
  }, [assumptions, recurring]);

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
      const a = assumptions ?? loadOptimizerAssumptions();
      const extraFixedMonthly = (formValues.extraFixedExpenses || []).reduce(
        (sum, row) => sum + parseMoney(row.amountMonthly),
        0
      );
      try {
        let r = optimize_457b_with_assumptions(
          gross_yearly,
          parseMoney(formValues.rent_monthly),
          parseMoney(formValues.utilities_monthly),
          parseMoney(formValues.wifi_monthly),
          parseMoney(formValues.private_loans_monthly),
          parseMoney(formValues.groceries_monthly),
          parseMoney(formValues.fun_money_monthly),
          parseMoney(formValues.other_monthly),
          a,
          extraFixedMonthly
        );
        const override = parseMoney(formValues.public_loans_monthly_override);
        if (override > 0) {
          r = applyPublicLoanOverride(r, override);
        }
        setResult(r);
        setStep('results');
        saveLastOptimizerResult({ result: r, assumptions: a });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Optimization failed.');
      } finally {
        setIsRunning(false);
      }
    },
    [formValues, assumptions]
  );

  const handleRunAgain = useCallback(() => {
    setStep('form');
    setResult(null);
    setError(null);
  }, []);

  return (
    <Modal open={open} fullscreen title="Optimize Pre-Tax Contributions" onClose={onClose}>
      {step === 'assumptions' && (
        <OptimizerAssumptionsScreen
          assumptions={assumptionsState}
          onChange={setAssumptions}
          onConfirm={handleConfirmAssumptions}
        />
      )}

      {step === 'form' && (
        <>
          <div style={{ fontSize: '0.88rem', color: 'var(--ui-primary-text, var(--text))', marginTop: -4, marginBottom: 14 }}>
            <p style={{ margin: '0 0 8px 0' }}>
              This tool estimates your most optimal contribution to your employer-based retirement account (401k, 457b, or equivalent), factoring in FSA/HSA deductions, commuter benefits, other pre-tax parameters, possible pension plans, and most importantly your fixed monthly expenses entered below.
            </p>
            <p style={{ margin: 0, fontStyle: 'italic', fontSize: '0.82rem', opacity: 0.85 }}>
              Note: This does not account for your employer&apos;s match. The goal is to find how much YOU should contribute each month based on your expenses and pre-tax deductions, not to maximize match. Results are an estimation, not exact.
            </p>
          </div>
          <OptimizerForm
            values={formValues}
            onChange={setFormValues}
            onSubmit={handleSubmit}
            isRunning={isRunning}
            error={error}
          />
        </>
      )}

      {step === 'results' && result && (
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
