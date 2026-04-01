import { useState, useEffect } from 'react';
import { Modal } from '../../ui/Modal';
import { Select } from '../../ui/Select';
import {
  type FederalLoanParameters,
  type FilingStatus,
  type RepaymentPlanOption,
  type FederalStatusOption,
  loadFederalLoanParameters,
  saveFederalLoanParameters,
  getDefaultFederalLoanParameters
} from './FederalLoanParametersStore';

const FILING_OPTIONS: { value: FilingStatus; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'mfj', label: 'Married filing jointly' },
  { value: 'mfs', label: 'Married filing separately' }
];

const PLAN_OPTIONS: { value: RepaymentPlanOption; label: string }[] = [
  { value: 'IBR', label: 'IBR' },
  { value: 'PAYE', label: 'PAYE' },
  { value: 'ICR', label: 'ICR' }
];

const STATUS_OPTIONS: FederalStatusOption[] = [
  'In School',
  'Grace',
  'Repayment',
  'Deferment',
  'Forbearance'
];

const STATE_OPTIONS = [
  '',
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
];

interface FederalLoanParametersModalProps {
  open: boolean;
  onClose: () => void;
  onSave?: () => void;
  detectedAgiCents: number;
}

function toPovertyLevel(value: string): number {
  const n = parseFloat(value.replace(/,/g, '').trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function toAgiCents(value: string): number {
  const n = parseFloat(value.replace(/,/g, '').trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
}

function toDependents(value: string): number {
  const n = parseInt(value.trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function FederalLoanParametersModal({
  open,
  onClose,
  onSave,
  detectedAgiCents
}: FederalLoanParametersModalProps) {
  const [params, setParams] = useState<FederalLoanParameters>(() =>
    loadFederalLoanParameters() ?? getDefaultFederalLoanParameters()
  );
  const [povertyInput, setPovertyInput] = useState('');
  const [agiInput, setAgiInput] = useState('');
  const [dependentsInput, setDependentsInput] = useState('');

  useEffect(() => {
    if (open) {
      const loaded = loadFederalLoanParameters() ?? getDefaultFederalLoanParameters();
      setParams(loaded);
      setPovertyInput(loaded.povertyLevel ? String(loaded.povertyLevel) : '');
      setAgiInput(loaded.agiCents ? (loaded.agiCents / 100).toFixed(2) : '');
      setDependentsInput(loaded.dependents ? String(loaded.dependents) : '');
    }
  }, [open]);

  const update = (partial: Partial<FederalLoanParameters>) => {
    setParams((prev) => ({ ...prev, ...partial }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const saved: FederalLoanParameters = {
      ...params,
      povertyLevel: toPovertyLevel(povertyInput),
      agiCents: toAgiCents(agiInput),
      dependents: toDependents(dependentsInput)
    };
    saveFederalLoanParameters(saved);
    onSave?.();
    onClose();
  };

  return (
    <Modal open={open} fullscreen title="Public Loan Parameters" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
          <legend style={{ fontSize: '0.9rem', fontWeight: 600 }}>Household</legend>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 2 }}>Household size</label>
            <select
              value={params.householdSize >= 1 && params.householdSize <= 6 ? params.householdSize : 1}
              onChange={(e) =>
                update({ householdSize: Math.max(1, Math.min(6, Number(e.target.value) || 1)) })
              }
              style={{ padding: '4px 8px', minWidth: 80 }}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={5}>5</option>
              <option value={6}>6</option>
            </select>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 2 }}>Number of dependents</label>
            <input
              type="text"
              inputMode="numeric"
              value={dependentsInput}
              onChange={(e) => setDependentsInput(e.target.value)}
              placeholder="0"
              style={{ width: 80, padding: '4px 8px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 2 }}>Filing status</label>
            <Select
              value={params.filingStatus}
              onChange={(e) => update({ filingStatus: e.target.value as FilingStatus })}
              style={{ padding: '4px 8px', minWidth: 180 }}
            >
              {FILING_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </div>
        </fieldset>

        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
          <legend style={{ fontSize: '0.9rem', fontWeight: 600 }}>Location</legend>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 2 }}>State of residence</label>
            <Select
              value={params.state}
              onChange={(e) => update({ state: e.target.value })}
              style={{ padding: '4px 8px', minWidth: 120 }}
            >
              {STATE_OPTIONS.map((s) => (
                <option key={s || 'blank'} value={s}>{s || '-'}</option>
              ))}
            </Select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
            <input
              type="checkbox"
              checked={params.nycResident}
              onChange={(e) => update({ nycResident: e.target.checked })}
            />
            NYC resident
          </label>
        </fieldset>

        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
          <legend style={{ fontSize: '0.9rem', fontWeight: 600 }}>Income</legend>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: '0.9rem' }}>
            <input
              type="checkbox"
              checked={params.useRecurringIncome}
              onChange={(e) => update({ useRecurringIncome: e.target.checked })}
            />
            Use recurring income (full-time job)
          </label>
          {!params.useRecurringIncome && (
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 2 }}>AGI (manual, $)</label>
              <input
                type="text"
                inputMode="decimal"
                value={agiInput}
                onChange={(e) => setAgiInput(e.target.value)}
                placeholder="0.00"
                style={{ width: 120, padding: '4px 8px' }}
              />
            </div>
          )}
          {params.useRecurringIncome && detectedAgiCents > 0 && (
            <p style={{ fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))', margin: 0 }}>
              AGI from recurring: ${(detectedAgiCents / 100).toLocaleString()}
            </p>
          )}
        </fieldset>

        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
          <legend style={{ fontSize: '0.9rem', fontWeight: 600 }}>Loan Repayment</legend>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 2 }}>Repayment plan</label>
            <Select
              value={params.repaymentPlan}
              onChange={(e) => update({ repaymentPlan: e.target.value as RepaymentPlanOption })}
              style={{ padding: '4px 8px', minWidth: 120 }}
            >
              {PLAN_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 2 }}>
              Poverty level for current year ($)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={povertyInput}
              onChange={(e) => setPovertyInput(e.target.value)}
              placeholder="e.g. 15650"
              style={{ width: 120, padding: '4px 8px' }}
            />
          </div>
        </fieldset>

        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
          <legend style={{ fontSize: '0.9rem', fontWeight: 600 }}>Timing</legend>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 2 }}>Next payment date</label>
            <input
              type="text"
              placeholder="YYYY-MM-DD"
              value={params.nextPaymentDate}
              onChange={(e) => update({ nextPaymentDate: e.target.value })}
              style={{ width: 140, padding: '4px 8px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 2 }}>Current status</label>
            <Select
              value={params.status}
              onChange={(e) => update({ status: e.target.value as FederalStatusOption })}
              style={{ padding: '4px 8px', minWidth: 140 }}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </div>
        </fieldset>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-secondary">
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
