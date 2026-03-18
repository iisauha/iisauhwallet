import { useEffect, type ReactNode } from 'react';

export function Modal(props: { open: boolean; title?: string; children: ReactNode; onClose?: () => void }) {
  const { open, title, children, onClose } = props;

  useEffect(() => {
    if (!open || !onClose) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onClose ? (e) => { if (e.target === e.currentTarget) onClose(); } : undefined}
    >
      <div className="modal" onClick={onClose ? (e) => e.stopPropagation() : undefined}>
        {(title || onClose) ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 8,
              marginBottom: title ? 16 : 8,
              minHeight: title ? 36 : undefined,
            }}
          >
            {title ? <h3 style={{ margin: 0, flex: 1, paddingRight: 4 }}>{title}</h3> : null}
            {onClose ? (
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                style={{
                  flexShrink: 0,
                  width: 28,
                  height: 28,
                  padding: 0,
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  fontSize: '1.1rem',
                  lineHeight: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  alignSelf: 'flex-start',
                  marginTop: -6,
                }}
              >
                ×
              </button>
            ) : null}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

