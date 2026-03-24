import type { FormEvent } from 'react';

export type ExtraFixedExpense = { id: string; label: string; amountMonthly: string };

export type OptimizerFormValues = {
  gross_yearly: string;
  rent_monthly: string;
  utilities_monthly: string;
  wifi_monthly: string;
  private_loans_monthly: string;
  groceries_monthly: string;
  fun_money_monthly: string;
  other_monthly: string;
  public_loans_monthly_override: string;
  extraFixedExpenses: ExtraFixedExpense[];
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
  public_loans_monthly_override: '',
  extraFixedExpenses: [],
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
      <div className="field">
        <label>Public Loans (monthly override) — optional</label>
        <input
          type="text"
          inputMode="decimal"
          value={values.public_loans_monthly_override}
          onChange={(e) => update('public_loans_monthly_override', e.target.value)}
          placeholder="Leave blank to use calculated value"
        />
      </div>
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', margin: 0 }}>
        <legend style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-primary-text, var(--text))' }}>
          Additional fixed expenses (optional)
        </legend>
        <p style={{ fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))', margin: '0 0 10px 0' }}>
          Add any other monthly fixed expenses to include in the optimization.
        </p>
        {values.extraFixedExpenses.map((row) => (
          <div
            key={row.id}
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              marginBottom: 8,
              flexWrap: 'wrap',
            }}
          >
            <input
              type="text"
              placeholder="Label (e.g. Parking)"
              value={row.label}
              onChange={(e) =>
                onChange({
                  ...values,
                  extraFixedExpenses: values.extraFixedExpenses.map((r) =>
                    r.id === row.id ? { ...r, label: e.target.value } : r
                  ),
                })
              }
              style={{ flex: '1 1 120px', minWidth: 100, padding: '6px 8px' }}
            />
            <input
              type="text"
              inputMode="decimal"
              placeholder="Monthly $"
              value={row.amountMonthly}
              onChange={(e) =>
                onChange({
                  ...values,
                  extraFixedExpenses: values.extraFixedExpenses.map((r) =>
                    r.id === row.id ? { ...r, amountMonthly: e.target.value } : r
                  ),
                })
              }
              style={{ width: 90, padding: '6px 8px' }}
            />
            <button
              type="button"
              className="btn btn-danger"
              style={{ padding: '6px 10px', flexShrink: 0 }}
              onClick={() =>
                onChange({
                  ...values,
                  extraFixedExpenses: values.extraFixedExpenses.filter((r) => r.id !== row.id),
                })
              }
              aria-label="Remove"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginTop: 4 }}
          onClick={() =>
            onChange({
              ...values,
              extraFixedExpenses: [
                ...values.extraFixedExpenses,
                { id: Date.now().toString(36) + Math.random().toString(36).slice(2), label: '', amountMonthly: '' },
              ],
            })
          }
        >
          Add fixed expense
        </button>
      </fieldset>
      {error ? (
        <p style={{ color: 'var(--red)', fontSize: '0.85rem', margin: 0 }}>{error}</p>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
        <button type="submit" className="btn btn-secondary" disabled={isRunning}>
          {isRunning ? 'Running…' : 'Run Optimization'}
        </button>
      </div>
    </form>
  );
}

export { DEFAULT_VALUES };
