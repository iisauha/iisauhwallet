import { useCallback, useEffect, useRef, useState } from 'react';
import { applyUndo, clearUndoSnapshot, getUndoSnapshot } from '../state/store';

export function UndoToast() {
  const [label, setLabel] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    setLabel(null);
    clearUndoSnapshot();
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setLabel(detail?.label || 'Action');
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setLabel(null);
        clearUndoSnapshot();
      }, 8000);
    };
    window.addEventListener('undo-available', handler);
    return () => { window.removeEventListener('undo-available', handler); if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const handleUndo = useCallback(() => {
    const snap = getUndoSnapshot();
    if (!snap) { dismiss(); return; }
    applyUndo();
    setLabel(null);
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, [dismiss]);

  if (!label) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--ui-modal-bg, var(--surface, #1a1a2e))',
        border: '1px solid var(--ui-border, var(--border, #333))',
        borderRadius: 12,
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        zIndex: 9999,
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        maxWidth: 'calc(100vw - 32px)',
        fontSize: '0.9rem',
        color: 'var(--ui-primary-text, var(--text, #eee))',
      }}
    >
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <button
        type="button"
        onClick={handleUndo}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--accent, #E8673A)',
          fontWeight: 700,
          fontSize: '0.9rem',
          cursor: 'pointer',
          padding: '4px 8px',
          whiteSpace: 'nowrap',
        }}
      >
        Undo
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--ui-primary-text, var(--text, #eee))',
          opacity: 0.5,
          cursor: 'pointer',
          padding: '4px',
          fontSize: '1rem',
          lineHeight: 1,
        }}
      >
        &times;
      </button>
    </div>
  );
}
