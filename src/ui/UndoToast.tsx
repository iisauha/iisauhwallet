import { useCallback, useEffect, useRef, useState } from 'react';
import { applyUndo, clearUndoSnapshot, getUndoSnapshot } from '../state/store';

export function UndoToast() {
  const [info, setInfo] = useState<{ label: string; durationMs: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    setVisible(false);
    setTimeout(() => { setInfo(null); clearUndoSnapshot(); }, 180);
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const label = detail?.label || 'Action';
      const durationMs = detail?.durationMs || 5000;
      setInfo({ label, durationMs });
      // Animate in on next frame
      requestAnimationFrame(() => setVisible(true));
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setVisible(false);
        setTimeout(() => { setInfo(null); clearUndoSnapshot(); }, 180);
      }, durationMs);
    };
    window.addEventListener('undo-available', handler);
    return () => { window.removeEventListener('undo-available', handler); if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const handleUndo = useCallback(() => {
    const snap = getUndoSnapshot();
    if (!snap) { dismiss(); return; }
    applyUndo();
    setVisible(false);
    setTimeout(() => setInfo(null), 180);
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, [dismiss]);

  if (!info) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'fixed',
        bottom: 80,
        right: 16,
        background: 'var(--ui-card-bg, var(--surface, #222))',
        border: '1px solid var(--ui-border, var(--border, #444))',
        borderRadius: 10,
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        zIndex: 9999,
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
        maxWidth: 260,
        fontSize: '0.82rem',
        color: 'var(--ui-primary-text, var(--text, #eee))',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 180ms ease, transform 180ms ease',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {info.label}
      </span>
      <button
        type="button"
        onClick={handleUndo}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--accent, #FE841B)',
          fontWeight: 700,
          fontSize: '0.82rem',
          cursor: 'pointer',
          padding: '2px 6px',
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
          opacity: 0.4,
          cursor: 'pointer',
          padding: '2px',
          fontSize: '0.9rem',
          lineHeight: 1,
        }}
      >
        &times;
      </button>
    </div>
  );
}
