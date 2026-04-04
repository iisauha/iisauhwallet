import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

function IconX() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

const MODAL_TITLE_ID = 'modal-title';
const EXIT_DURATION = 280;

export function Modal(props: {
  open: boolean;
  title?: string;
  children: ReactNode;
  onClose?: () => void;
  titleStyle?: CSSProperties;
  className?: string;
  fullscreen?: boolean;
}) {
  const { open, title, children, onClose, titleStyle, className, fullscreen } = props;
  const modalRef = useRef<HTMLDivElement>(null);
  const [shouldRender, setShouldRender] = useState(open);
  const [isClosing, setIsClosing] = useState(false);

  // Handle open/close transitions
  useEffect(() => {
    if (open) {
      setShouldRender(true);
      setIsClosing(false);
    } else if (shouldRender) {
      // Fullscreen modals skip exit animation (they overlay in-place)
      if (fullscreen) {
        setShouldRender(false);
        return;
      }
      setIsClosing(true);
      const timer = setTimeout(() => {
        setIsClosing(false);
        setShouldRender(false);
      }, EXIT_DURATION);
      return () => clearTimeout(timer);
    }
  }, [open, fullscreen]);

  // Esc to close
  useEffect(() => {
    if (!open || !onClose) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  // Auto-focus modal on open
  useEffect(() => {
    if (open && modalRef.current) {
      modalRef.current.focus();
    }
  }, [open]);

  // Focus trap: Tab cycles within modal
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !modalRef.current) return;
    const focusable = modalRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, []);

  if (!shouldRender) return null;
  const overlayClass = [
    'modal-overlay',
    fullscreen ? 'modal-overlay--fullscreen' : '',
    isClosing ? 'closing' : '',
  ].filter(Boolean).join(' ');
  return (
    <div
      className={overlayClass}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? MODAL_TITLE_ID : undefined}
      onClick={onClose ? (e) => { if (e.target === e.currentTarget) onClose(); } : undefined}
    >
      <div
        ref={modalRef}
        className={className ? `modal ${className}` : 'modal'}
        tabIndex={-1}
        onClick={onClose ? (e) => e.stopPropagation() : undefined}
        onKeyDown={handleKeyDown}
      >
        <div
          className={fullscreen ? 'modal-header modal-header--sticky' : 'modal-header'}
        >
          {title ? (
            <h3 id={MODAL_TITLE_ID} style={{ margin: 0, flex: 1, ...titleStyle }}>{title}</h3>
          ) : <span />}
          {onClose ? (
            <button type="button" aria-label="Close" onClick={onClose} className="modal-close-btn">
              <IconX />
            </button>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}
