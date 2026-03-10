import type { FormEvent } from 'react';

export type OptimizerFormValues = {
  gross_yearly: string;
  rent_monthly: string;
  utilities_monthly: string;
  wifi_monthly: string;
  private_loans_monthly: string;
  groceries_monthly: string;
  fun_money_monthly: string;
  other_monthly: string;
};

const DEFAULT_VALUES: OptimizerFormValues = {
  gross_yearly: '',
  rent_monthly: '',
  utilities_monthly: '',
  wifi_monthly: '',
  private_loans_monthly: '',
  groceries_monthly: '',
  fun_money_monthly: '',
  other_monthly: '',
};

type OptimizerFormProps = {
  values: OptimizerFormValues;
  onChange: (values: OptimizerFormValues) => void;
  onSubmit: (e: FormEvent) => void;
  isRunning?: boolean;
  error?: string | null;
};

export function OptimizerForm({ values, onChange, onSubmit, isRunning, error }: OptimizerFormProps) {
  const update = (key: keyof OptimizerFormValues, value: string) => {
    onChange({ ...values, [key]: value });
  };

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="field">
        <label>Gross yearly salary ($)</label>
        <input
          type="text"
          inputMode="decimal"
          value={values.gross_yearly}
          onChange={(e) => update('gross_yearly', e.target.value)}
          placeholder="e.g. 85000"
        />
      </div>
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', margin: 0 }}>
        <legend style={{ fontSize: '0.85rem', fontWeight: 600 }}>Monthly expenses ($)</legend>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Rent</label>
            <input
              type="text"
              inputMode="decimal"
              value={values.rent_monthly}
              onChange={(e) => update('rent_monthly', e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Utilities</label>
            <input
              type="text"
              inputMode="decimal"
              value={values.utilities_monthly}
              onChange={(e) => update('utilities_monthly', e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>WiFi</label>
            <input
              type="text"
              inputMode="decimal"
              value={values.wifi_monthly}
              onChange={(e) => update('wifi_monthly', e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Private Loans</label>
            <input
              type="text"
              inputMode="decimal"
              value={values.private_loans_monthly}
              onChange={(e) => update('private_loans_monthly', e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Groceries</label>
            <input
              type="text"
              inputMode="decimal"
              value={values.groceries_monthly}
              onChange={(e) => update('groceries_monthly', e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Fun Money</label>
            <input
              type="text"
              inputMode="decimal"
              value={values.fun_money_monthly}
              onChange={(e) => update('fun_money_monthly', e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Other</label>
            <input
              type="text"
              inputMode="decimal"
              value={values.other_monthly}
              onChange={(e) => update('other_monthly', e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
      </fieldset>
      {error ? (
        <p style={{ color: 'var(--red)', fontSize: '0.85rem', margin: 0 }}>{error}</p>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
        <button type="submit" className="btn btn-add" disabled={isRunning}>
          {isRunning ? 'Running…' : 'Run Optimization'}
        </button>
      </div>
    </form>
  );
}

export { DEFAULT_VALUES };
