import { useEffect, type CSSProperties, type ReactNode } from 'react';

function IconX() {
  return (
    <svg width=”18” height=”18” viewBox=”0 0 24 24” fill=”none” stroke=”currentColor”
      strokeWidth={2} strokeLinecap=”round” strokeLinejoin=”round”>
      <path d=”M18 6L6 18M6 6l12 12” />
    </svg>
  );
}

export function Modal(props: {
  open: boolean;
  title?: string;
  children: ReactNode;
  onClose?: () => void;
  /** Optional styles for the title heading (e.g. match App Customization “All Other Text”). */
  titleStyle?: CSSProperties;
}) {
  const { open, title, children, onClose, titleStyle } = props;

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
      className=”modal-overlay”
      role=”dialog”
      aria-modal=”true”
      onClick={onClose ? (e) => { if (e.target === e.currentTarget) onClose(); } : undefined}
    >
      <div className=”modal” onClick={onClose ? (e) => e.stopPropagation() : undefined}>
        {(title || onClose) ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              marginBottom: title ? 20 : 8,
            }}
          >
            {title ? (
              <h3 style={{ margin: 0, flex: 1, ...titleStyle }}>{title}</h3>
            ) : <span />}
            {onClose ? (
              <button
                type=”button”
                aria-label=”Close”
                onClick={onClose}
                style={{
                  flexShrink: 0,
                  width: 32,
                  height: 32,
                  padding: 0,
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.06)',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.15s ease',
                }}
              >
                <IconX />
              </button>
            ) : null}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

