import { useEffect, useRef, useState } from 'react';
import { IconInfoCircle } from './icons';

export function HelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler); };
  }, [open]);

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle', marginLeft: 4 }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Help"
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--ui-primary-text, var(--text))', opacity: 0.45, display: 'inline-flex', alignItems: 'center' }}
      >
        <IconInfoCircle style={{ width: 15, height: 15 }} />
      </button>
      {open && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: 6,
            background: 'var(--ui-modal-bg, var(--surface, #1a1a2e))',
            border: '1px solid var(--ui-border, var(--border, #333))',
            borderRadius: 10,
            padding: '8px 12px',
            fontSize: '0.82rem',
            lineHeight: 1.45,
            color: 'var(--ui-primary-text, var(--text, #eee))',
            maxWidth: 260,
            minWidth: 180,
            zIndex: 1000,
            whiteSpace: 'pre-wrap',
            boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
          }}
        >
          {text}
        </div>
      )}
    </span>
  );
}
