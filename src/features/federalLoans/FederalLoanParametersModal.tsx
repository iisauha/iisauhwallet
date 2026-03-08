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

export function FederalLoanParametersModal({
  open,
  onClose,
  onSave,
  detectedAgiCents
}: FederalLoanParametersModalProps) {
  const [params, setParams] = useState<FederalLoanParameters>(() =>
    loadFederalLoanParameters() ?? getDefaultFederalLoanParameters()
  );

  useEffect(() => {
    if (open) {
      setParams(loadFederalLoanParameters() ?? getDefaultFederalLoanParameters());
    }
  }, [open]);

  const update = (partial: Partial<FederalLoanParameters>) => {
    setParams((prev) => ({ ...prev, ...partial }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveFederalLoanParameters(params);
    onSave?.();
    onClose();
  };

  const agiDollars = (params.agiCents / 100).toFixed(2);

  return (
    <Modal open={open} title="Public Loan Parameters" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
          <legend style={{ fontSize: '0.9rem', fontWeight: 600 }}>Household</legend>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 2 }}>Household size</label>
            <input
              type="number"
              min={1}
              value={params.householdSize}
              onChange={(e) =>
                setParams({
                  ...params,
                  householdSize: Math.max(1, Number(e.target.value) || 1)
                })
              }
              style={{ width: 80, padding: '4px 8px' }}
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 2 }}>Number of dependents</label>
            <input
              type="number"
              min={0}
              value={params.dependents}
              onChange={(e) =>
                setParams({
                  ...params,
                  dependents: Math.max(0, Number(e.target.value) || 0)
                })
              }
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
                <option key={s || 'blank'} value={s}>{s || '—'}</option>
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
                type="number"
                min={0}
                step={100}
                value={agiDollars}
                onChange={(e) =>
                  setParams({
                    ...params,
                    agiCents: Math.round((Number(e.target.value) || 0) * 100)
                  })
                }
                style={{ width: 120, padding: '4px 8px' }}
              />
            </div>
          )}
          {params.useRecurringIncome && detectedAgiCents > 0 && (
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: 0 }}>
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
              type="number"
              min={0}
              step={100}
              value={params.povertyLevel}
              onChange={(e) =>
                setParams({
                  ...params,
                  povertyLevel: Math.max(0, Number(e.target.value) || 0)
                })
              }
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
          <button type="submit" className="btn btn-add">
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
