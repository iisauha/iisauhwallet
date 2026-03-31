import type { OptimizerAssumptions } from './optimizerAssumptions';

type Props = {
  assumptions: OptimizerAssumptions;
  onChange: (a: OptimizerAssumptions) => void;
  onConfirm: () => void;
};

function ScalarRow({
  label,
  value,
  onChange,
  format = 'number',
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  format?: 'number' | 'percent' | 'currency';
}) {
  const displayValue =
    format === 'percent' ? (value * 100).toFixed(2) : format === 'currency' ? value.toFixed(0) : String(value);
  const parse = (s: string) => {
    const n = parseFloat(s.replace(/,/g, '').replace(/%/g, '').trim());
    return Number.isFinite(n) ? (format === 'percent' ? n / 100 : n) : value;
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
      <label style={{ flex: '1 1 50%', fontSize: '0.9rem' }}>{label}</label>
      <input
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={(e) => onChange(parse(e.target.value))}
        style={{ width: 100, padding: '4px 8px' }}
      />
      {format === 'percent' ? <span style={{ fontSize: '0.85rem', color: 'var(--ui-primary-text, var(--text))' }}>%</span> : null}
      {format === 'currency' ? <span style={{ fontSize: '0.85rem', color: 'var(--ui-primary-text, var(--text))' }}>$</span> : null}
    </div>
  );
}

function BracketTable({
  title,
  rows,
  columns,
  onChange,
}: {
  title: string;
  rows: { key: string; values: number[] }[];
  columns: string[];
  onChange: (rowIndex: number, colIndex: number, value: number) => void;
}) {
  return (
    <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 12 }}>
      <legend style={{ fontSize: '0.9rem', fontWeight: 600 }}>{title}</legend>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} style={{ textAlign: 'left', padding: '4px 6px', borderBottom: '1px solid var(--border)' }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={row.key}>
                {row.values.map((v, ci) => (
                  <td key={ci} style={{ padding: '2px 4px' }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={v}
                      onChange={(e) => {
                        const n = parseFloat(e.target.value.replace(/,/g, '').trim());
                        if (Number.isFinite(n)) onChange(ri, ci, n);
                      }}
                      style={{ width: 72, padding: '2px 4px', boxSizing: 'border-box' }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </fieldset>
  );
}

export function OptimizerAssumptionsScreen({ assumptions, onChange, onConfirm }: Props) {
  const a = assumptions;

  const update = (partial: Partial<OptimizerAssumptions>) => onChange({ ...a, ...partial });
  const updateArray = (
    key: keyof Pick<
      OptimizerAssumptions,
      'fedBrackets' | 'fedRates' | 'nyLowerBounds' | 'nyBaseTaxes' | 'nyRates' | 'nycBounds' | 'nycRates'
    >,
    index: number,
    value: number
  ) => {
    const arr = [...a[key]];
    if (index >= 0 && index < arr.length) {
      arr[index] = value;
      update({ [key]: arr });
    }
  };

  const fedRows = [
    ...a.fedBrackets.map((b, i) => ({ key: `fed-${i}`, values: [b, (a.fedRates[i] ?? 0) * 100] })),
    { key: 'fed-top', values: [a.fedBrackets[5] ?? 0, (a.fedRates[6] ?? 0) * 100] },
  ];
  const fedColumns = ['Upper bound ($)', 'Rate (%)'];
  const nyRows = a.nyLowerBounds.map((lb, i) => ({
    key: `ny-${i}`,
    values: [lb, a.nyBaseTaxes[i] ?? 0, (a.nyRates[i] ?? 0) * 100],
  }));
  const nyColumns = ['Lower bound ($)', 'Base tax ($)', 'Rate (%)'];
  const nycRows = a.nycBounds.map((b, i) => ({ key: `nyc-${i}`, values: [b, (a.nycRates[i] ?? 0) * 100] }));
  const nycColumns = ['Upper bound ($)', 'Rate (%)'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: '0.88rem', color: 'var(--ui-primary-text, var(--text))', margin: '0 0 12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ margin: 0 }}>
          This tool helps you optimize your pre-tax contributions — such as your employer-based retirement account (401k, 457b), FSA/HSA, and commuter benefits — to lower your Adjusted Gross Income (AGI) as much as possible while still being able to cover your monthly fixed expenses. Lowering your AGI is especially useful if you are on an income-driven repayment (IDR) plan for federal student loans, since your monthly payment is calculated based on your AGI. It also helps you understand how much you can realistically contribute to retirement given your actual bills.
        </p>
        <p style={{ margin: 0 }}>
          This tool currently reflects tax parameters for New York State and New York City residents for the 2026 tax year. All values were sourced from the IRS, NYS, and NYC tax authority websites. This tool accounts for federal, state, and city taxes. It is intended for future expansion to support other states — for now, if you are not an NYC resident, parameters would need to be manually adjusted. We apologize for the inconvenience.
        </p>
        <p style={{ margin: 0, fontStyle: 'italic' }}>
          This is an estimation tool. Results are not exact and should not be treated as financial or tax advice.
        </p>
        <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.7 }}>
          Default 2026 assumptions (editable). Edit values if needed for a different year.
        </p>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 10, color: 'var(--ui-primary-text, var(--text))' }}>
          Scalar values
        </div>
        <ScalarRow
          label="Pension rate"
          value={a.pensionRate}
          onChange={(v) => update({ pensionRate: v })}
          format="percent"
        />
        <ScalarRow
          label="Standard deduction ($)"
          value={a.fedStandardDeduction}
          onChange={(v) => update({ fedStandardDeduction: v })}
          format="currency"
        />
        <ScalarRow
          label="Poverty guideline ($)"
          value={a.povertyGuideline}
          onChange={(v) => update({ povertyGuideline: v })}
          format="currency"
        />
        <ScalarRow
          label="FSA/HSA Deduction (yearly $)"
          value={a.hcfsaDeductionYearly}
          onChange={(v) => update({ hcfsaDeductionYearly: v })}
          format="currency"
        />
        <ScalarRow
          label="Commuter deduction (yearly $)"
          value={a.commuterDeductionYearly}
          onChange={(v) => update({ commuterDeductionYearly: v })}
          format="currency"
        />
        <ScalarRow
          label="Social Security rate"
          value={a.socialSecurityRate}
          onChange={(v) => update({ socialSecurityRate: v })}
          format="percent"
        />
        <ScalarRow
          label="Medicare rate"
          value={a.medicareRate}
          onChange={(v) => update({ medicareRate: v })}
          format="percent"
        />
        <ScalarRow label="NY SDI (yearly $)" value={a.nySdiYearly} onChange={(v) => update({ nySdiYearly: v })} />
        <ScalarRow
          label="NY FLI rate"
          value={a.nyFliRate}
          onChange={(v) => update({ nyFliRate: v })}
          format="percent"
        />
        <ScalarRow
          label="NY State deduction ($)"
          value={a.nyStateDeduction}
          onChange={(v) => update({ nyStateDeduction: v })}
          format="currency"
        />
        <ScalarRow
          label="NYC deduction ($)"
          value={a.nycDeduction}
          onChange={(v) => update({ nycDeduction: v })}
          format="currency"
        />
        <ScalarRow label="457b max ($)" value={a.max457b} onChange={(v) => update({ max457b: v })} />
        <ScalarRow label="457b min ($)" value={a.min457b} onChange={(v) => update({ min457b: v })} />
      </div>

      <BracketTable
        title="Federal tax brackets"
        columns={fedColumns}
        rows={fedRows}
        onChange={(ri, ci, val) => {
          if (ci === 0) {
            if (ri < 6) updateArray('fedBrackets', ri, val);
          } else {
            updateArray('fedRates', ri, val / 100);
          }
        }}
      />
      <BracketTable
        title="NY State tax table"
        columns={nyColumns}
        rows={nyRows}
        onChange={(ri, ci, val) => {
          if (ci === 0) updateArray('nyLowerBounds', ri, val);
          else if (ci === 1) updateArray('nyBaseTaxes', ri, val);
          else updateArray('nyRates', ri, val / 100);
        }}
      />
      <BracketTable
        title="NYC resident tax"
        columns={nycColumns}
        rows={nycRows}
        onChange={(ri, ci, val) => {
          if (ci === 0) updateArray('nycBounds', ri, val);
          else updateArray('nycRates', ri, val / 100);
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button type="button" className="btn btn-add" onClick={onConfirm}>
          Confirm assumptions
        </button>
      </div>
    </div>
  );
}
