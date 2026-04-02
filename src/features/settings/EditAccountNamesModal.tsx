import { useEffect, useMemo, useState } from 'react';
import { useLedgerStore } from '../../state/store';
import { loadInvesting, saveInvesting } from '../../state/storage';
import { useContentGuard } from '../../state/useContentGuard';

export function EditAccountNamesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useLedgerStore((s) => s.data);
  const actions = useLedgerStore((s) => s.actions);
  const investing = useMemo(() => loadInvesting(), [open]);

  const [bankNames, setBankNames] = useState<Record<string, string>>({});
  const [cardNames, setCardNames] = useState<Record<string, string>>({});
  const [investingNames, setInvestingNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setBankNames({});
      setCardNames({});
      setInvestingNames({});
    }
  }, [open]);

  if (!open) return null;

  const banks = data.banks || [];
  const cards = data.cards || [];
  const accounts = investing.accounts || [];

  const getBankName = (id: string, defaultName: string) => bankNames[id] ?? defaultName;
  const getCardName = (id: string, defaultName: string) => cardNames[id] ?? defaultName;
  const getInvestingName = (id: string, defaultName: string) => investingNames[id] ?? defaultName;

  const contentGuard = useContentGuard();
  const guardedSetName = (id: string, name: string, setter: (fn: (prev: Record<string, string>) => Record<string, string>) => void) => {
    if (contentGuard(name, () => setter((prev) => ({ ...prev, [id]: '' })))) return;
    setter((prev) => ({ ...prev, [id]: name }));
  };
  const setBankName = (id: string, name: string) => guardedSetName(id, name, setBankNames);
  const setCardName = (id: string, name: string) => guardedSetName(id, name, setCardNames);
  const setInvestingName = (id: string, name: string) => guardedSetName(id, name, setInvestingNames);

  const handleSave = () => {
    banks.forEach((b) => {
      const name = (bankNames[b.id] ?? b.name).trim() || 'Bank';
      if (name !== b.name) actions.updateBankName(b.id, name);
    });
    cards.forEach((c) => {
      const name = (cardNames[c.id] ?? c.name).trim() || 'Card';
      if (name !== c.name) actions.updateCardName(c.id, name);
    });
    let invChanged = false;
    const nextAccounts = accounts.map((a) => {
      const name = (investingNames[a.id] ?? a.name).trim() || a.name;
      if (name !== a.name) {
        invChanged = true;
        return { ...a, name };
      }
      return a;
    });
    if (invChanged) saveInvesting({ ...investing, accounts: nextAccounts });
    onClose();
  };

  return (
    <div className="modal-overlay modal-overlay--fullscreen modal-overlay-animate" onClick={onClose}>
      <div className="modal modal-animate" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header modal-header--sticky">
          <h3 style={{ margin: 0, flex: 1 }}>Edit Account Names</h3>
          <button type="button" aria-label="Close" onClick={onClose} className="modal-close-btn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg></button>
        </div>
        <p style={{ fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--text))', marginTop: 0, marginBottom: 16 }}>
          Change the display name for any account. Balances and logic are unchanged.
        </p>

        {banks.length > 0 ? (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-primary-text, var(--text))', marginBottom: 8 }}>Bank / checking accounts</p>
            {banks.map((b) => (
              <div key={b.id} style={{ marginBottom: 8 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))', display: 'block', marginBottom: 2 }}>
                  {b.type === 'physical_cash' ? 'Physical cash' : 'Bank'}
                </label>
                <input
                  value={getBankName(b.id, b.name)}
                  onChange={(e) => setBankName(b.id, e.target.value)}
                  placeholder="Account name"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--ui-outline-btn, var(--ui-border, var(--border)))',
                    background: 'var(--ui-modal-bg, var(--surface))',
                    color: 'var(--ui-primary-text, var(--text))',
                    fontSize: '0.95rem',
                  }}
                />
              </div>
            ))}
          </div>
        ) : null}

        {cards.length > 0 ? (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-primary-text, var(--text))', marginBottom: 8 }}>Credit cards</p>
            {cards.map((c) => (
              <div key={c.id} style={{ marginBottom: 8 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))', display: 'block', marginBottom: 2 }}>Card</label>
                <input
                  value={getCardName(c.id, c.name)}
                  onChange={(e) => setCardName(c.id, e.target.value)}
                  placeholder="Card name"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--ui-outline-btn, var(--ui-border, var(--border)))',
                    background: 'var(--ui-modal-bg, var(--surface))',
                    color: 'var(--ui-primary-text, var(--text))',
                    fontSize: '0.95rem',
                  }}
                />
              </div>
            ))}
          </div>
        ) : null}

        {accounts.length > 0 ? (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-primary-text, var(--text))', marginBottom: 8 }}>Investing accounts (HYSA, Roth IRA, etc.)</p>
            {accounts.map((a) => (
              <div key={a.id} style={{ marginBottom: 8 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))', display: 'block', marginBottom: 2 }}>
                  {a.type === 'hysa' ? 'HYSA' : a.type === 'roth' ? 'Roth IRA' : a.type === 'k401' ? '401(k)' : 'Investing'}
                </label>
                <input
                  value={getInvestingName(a.id, a.name)}
                  onChange={(e) => setInvestingName(a.id, e.target.value)}
                  placeholder="Account name"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--ui-outline-btn, var(--ui-border, var(--border)))',
                    background: 'var(--ui-modal-bg, var(--surface))',
                    color: 'var(--ui-primary-text, var(--text))',
                    fontSize: '0.95rem',
                  }}
                />
              </div>
            ))}
          </div>
        ) : null}

        <div className="btn-row" style={{ marginTop: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            style={{
              background: 'var(--ui-modal-bg, var(--surface))',
              color: 'var(--ui-primary-text, var(--text))',
              border: '1px solid var(--ui-outline-btn, var(--ui-border, var(--border)))'
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
