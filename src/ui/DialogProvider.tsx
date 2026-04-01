import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Modal } from './Modal';

type DialogState =
  | null
  | { type: 'alert'; message: string; resolve: () => void }
  | { type: 'confirm'; message: string; resolve: (ok: boolean) => void };

interface DialogAPI {
  showAlert: (message: string) => Promise<void>;
  showConfirm: (message: string) => Promise<boolean>;
}

const DialogContext = createContext<DialogAPI>({
  showAlert: async () => {},
  showConfirm: async () => false,
});

export function useDialog() {
  return useContext(DialogContext);
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState>(null);

  const showAlert = useCallback((message: string) => {
    return new Promise<void>((resolve) => {
      setDialog({ type: 'alert', message, resolve });
    });
  }, []);

  const showConfirm = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      setDialog({ type: 'confirm', message, resolve });
    });
  }, []);

  const close = useCallback((result?: boolean) => {
    if (!dialog) return;
    if (dialog.type === 'alert') {
      dialog.resolve();
    } else {
      dialog.resolve(result ?? false);
    }
    setDialog(null);
  }, [dialog]);

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {dialog ? (
        <Modal
          open
          onClose={() => close(false)}
        >
          <p style={{ margin: '0 0 16px', fontSize: '0.92rem', color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.5 }}>
            {dialog.message}
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {dialog.type === 'confirm' ? (
              <>
                <button type="button" className="btn btn-secondary" style={{ minWidth: 72 }} onClick={() => close(false)}>Cancel</button>
                <button type="button" className="btn btn-primary" style={{ minWidth: 72 }} onClick={() => close(true)}>Confirm</button>
              </>
            ) : (
              <button type="button" className="btn btn-primary" style={{ minWidth: 72 }} onClick={() => close()}>OK</button>
            )}
          </div>
        </Modal>
      ) : null}
    </DialogContext.Provider>
  );
}
