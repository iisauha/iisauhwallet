import type { ReactNode } from 'react';

export function Modal(props: { open: boolean; title?: string; children: ReactNode; onClose?: () => void }) {
  if (!props.open) return null;
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal">
        {props.title ? <h3>{props.title}</h3> : null}
        {props.children}
      </div>
    </div>
  );
}

