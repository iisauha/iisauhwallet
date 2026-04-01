import { Modal } from '../../ui/Modal';
import { OptimizerResults } from './OptimizerResults';
import { loadLastOptimizerResult } from './optimizerLastResult';

type ViewLastOptimizerModalProps = {
  open: boolean;
  onClose: () => void;
};

export function ViewLastOptimizerModal({ open, onClose }: ViewLastOptimizerModalProps) {
  const saved = open ? loadLastOptimizerResult() : null;

  return (
    <Modal open={open} fullscreen title="Last computed optimization" onClose={onClose}>
      {saved?.result ? (
        <>
          <OptimizerResults result={saved.result} showExpandedByDefault={false} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </>
      ) : (
        <>
          <p style={{ color: 'var(--ui-primary-text, var(--text))', marginBottom: 12 }}>
            No saved optimization result yet. Run the optimizer first to see your last computed values here.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
