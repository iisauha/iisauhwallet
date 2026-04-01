import { useEffect, type CSSProperties, type ReactNode } from 'react';

function IconX() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

export function Modal(props: {
  open: boolean;
  title?: string;
  children: ReactNode;
  onClose?: () => void;
  /** Optional styles for the title heading (e.g. match App Customization "All Other Text"). */
  titleStyle?: CSSProperties;
  /** Optional extra CSS class(es) applied to the .modal element. */
  className?: string;
  /** When true, modal fills the entire screen instead of floating card. */
  fullscreen?: boolean;
}) {
  const { open, title, children, onClose, titleStyle, className, fullscreen } = props;

  useEffect(() => {
    if (!open || !onClose) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;
  const overlayClass = fullscreen ? 'modal-overlay modal-overlay--fullscreen' : 'modal-overlay';
  return (
    <div
      className={overlayClass}
      role="dialog"
      aria-modal="true"
      onClick={onClose ? (e) => { if (e.target === e.currentTarget) onClose(); } : undefined}
    >
      <div
        className={className ? `modal ${className}` : 'modal'}
        onClick={onClose ? (e) => e.stopPropagation() : undefined}
      >
        <div
          className={fullscreen ? 'modal-header modal-header--sticky' : 'modal-header'}
        >
          {title ? (
            <h3 style={{ margin: 0, flex: 1, ...titleStyle }}>{title}</h3>
          ) : <span />}
          {onClose ? (
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              style={{
                flexShrink: 0,
                width: 34,
                height: 34,
                padding: 0,
                border: '1.5px solid var(--ui-border, var(--border))',
                borderRadius: 10,
                background: 'var(--ui-surface-secondary, var(--surface))',
                color: 'var(--ui-primary-text, var(--text))',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.15s ease',
                opacity: 0.85,
              }}
            >
              <IconX />
            </button>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}
