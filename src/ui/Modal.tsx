import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

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
}) {
  const { open, title, children, onClose, titleStyle, className } = props;
  const modalRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!open || !onClose) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  // Auto-detect if modal content overflows the card-style max-height
  useEffect(() => {
    if (!open) { setFullscreen(false); return; }
    const el = modalRef.current;
    if (!el) return;
    const check = () => {
      // Card modal max-height is 88vh minus overlay padding (32px top+bottom)
      const availableHeight = window.innerHeight * 0.88;
      setFullscreen(el.scrollHeight > availableHeight);
    };
    // Check after render + a small delay for content to settle
    check();
    const raf = requestAnimationFrame(check);
    // Also re-check on resize
    window.addEventListener('resize', check);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', check);
    };
  }, [open, children]);


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
        ref={modalRef}
        className={className ? `modal ${className}` : 'modal'}
        onClick={onClose ? (e) => e.stopPropagation() : undefined}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: title ? 16 : 4,
            position: fullscreen ? 'sticky' : undefined,
            top: fullscreen ? 0 : undefined,
            zIndex: fullscreen ? 1 : undefined,
            background: fullscreen ? 'inherit' : undefined,
            paddingBottom: fullscreen ? 4 : undefined,
          }}
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
