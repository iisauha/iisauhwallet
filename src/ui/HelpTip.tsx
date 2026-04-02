import { useEffect, useRef, useState } from 'react';
import { IconInfoCircle } from './icons';

export function HelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) { setVisible(false); return; }
    // Trigger entrance animation on next frame
    requestAnimationFrame(() => setVisible(true));
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
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: visible ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0.9)',
            opacity: visible ? 1 : 0,
            transition: 'opacity 180ms ease-out, transform 180ms ease-out',
            background: 'var(--ui-modal-bg, var(--surface, #1a1a2e))',
            border: '1px solid var(--ui-border, var(--border, #333))',
            borderRadius: 12,
            padding: '12px 16px',
            fontSize: '0.84rem',
            lineHeight: 1.5,
            color: 'var(--ui-primary-text, var(--text, #eee))',
            maxWidth: 280,
            minWidth: 200,
            zIndex: 10000,
            whiteSpace: 'pre-wrap',
            boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
            textAlign: 'left',
            textTransform: 'none',
            letterSpacing: 'normal',
            fontWeight: 400,
          }}
        >
          {text}
        </div>
      )}
    </span>
  );
}
