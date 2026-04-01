import { useMemo, useState } from 'react';
import type { CategoryConfig } from '../../state/models';

export function ManageCategoriesModal(props: {
  open: boolean;
  onClose: () => void;
  load: () => CategoryConfig;
  save: (cfg: CategoryConfig) => void;
}) {
  const initial = useMemo(() => props.load(), [props]);
  const [cfg, setCfg] = useState<CategoryConfig>(initial);
  const [newCatName, setNewCatName] = useState('');
  const [addSubOpen, setAddSubOpen] = useState<Record<string, boolean>>({});
  const [addSubText, setAddSubText] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<
    | null
    | { kind: 'category'; catId: string; label: string }
    | { kind: 'subcategory'; catId: string; sub: string; label: string }
  >(null);

  if (!props.open) return null;

  function commit(next: CategoryConfig) {
    setCfg(next);
    props.save(next);
  }

  function findCategoryIdByName(name: string) {
    const target = (name || '').trim().toLowerCase();
    if (!target) return null;
    for (const id of Object.keys(cfg)) {
      const n = (cfg[id]?.name || '').trim().toLowerCase();
      if (n === target) return id;
    }
    return null;
  }

  function addCategoryByName(name: string) {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    const existingId = findCategoryIdByName(trimmed);
    if (existingId) return;
    let baseId = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'cat';
    let id = baseId;
    let counter = 1;
    while (cfg[id]) id = baseId + '_' + counter++;
    commit({ ...cfg, [id]: { name: trimmed, sub: [] } });
  }

  function addSubcategory(catId: string) {
    const trimmed = (addSubText[catId] || '').trim();
    if (!trimmed) return;
    const entry = cfg[catId];
    const exists = (entry.sub || []).some((x) => (x || '').trim().toLowerCase() === trimmed.toLowerCase());
    if (exists) return;
    const next = { ...cfg, [catId]: { ...entry, sub: [...(entry.sub || []), trimmed] } };
    commit(next);
    setAddSubText((prev) => ({ ...prev, [catId]: '' }));
    setAddSubOpen((prev) => ({ ...prev, [catId]: false }));
  }

  return (
    <div className="modal-overlay modal-overlay--fullscreen">
      <div className="modal">
        <div className="modal-header modal-header--sticky">
          <h3 style={{ margin: 0, flex: 1 }}>Manage Categories</h3>
          <button type="button" aria-label="Close" onClick={props.onClose} className="modal-close-btn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg></button>
        </div>

        <div className="field">
          <label>Add category</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { addCategoryByName(newCatName); setNewCatName(''); } }}
              placeholder="Category name"
              style={{ flex: 1, minWidth: 180 }}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                addCategoryByName(newCatName);
                setNewCatName('');
              }}
            >
              Add
            </button>
          </div>
        </div>

        <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
          {Object.keys(cfg)
            .sort((a, b) => (cfg[a]?.name || a).localeCompare(cfg[b]?.name || b))
            .map((id) => (
              <div className="card" key={id}>
                <div className="row">
                  <span className="name">{cfg[id]?.name || id}</span>
                  <button
                    type="button"
                    className="btn-delete"
                    onClick={() => setConfirmDelete({ kind: 'category', catId: id, label: cfg[id]?.name || id })}
                  >
                    Delete
                  </button>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={{ color: 'var(--ui-primary-text, var(--text))', fontSize: '0.9rem', fontWeight: 600 }}>Subcategories</div>
                  {(cfg[id]?.sub || []).length ? (
                    <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                      {(cfg[id]?.sub || []).map((s) => (
                        <div key={s} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                          <span style={{ color: 'var(--ui-primary-text, var(--text))', flex: 1 }}>{s}</span>
                          <button
                            type="button"
                            className="btn-delete"
                            onClick={() =>
                              setConfirmDelete({
                                kind: 'subcategory',
                                catId: id,
                                sub: s,
                                label: `${cfg[id]?.name || id} → ${s}`
                              })
                            }
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: 'var(--ui-primary-text, var(--text))', fontSize: '0.9rem', marginTop: 6 }}>No subcategories.</div>
                  )}
                </div>
                <div style={{ marginTop: 10 }}>
                  {addSubOpen[id] ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input
                        value={addSubText[id] || ''}
                        onChange={(e) => setAddSubText((prev) => ({ ...prev, [id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') addSubcategory(id); }}
                        placeholder="Subcategory name"
                        style={{ flex: 1, minWidth: 160 }}
                        autoFocus
                      />
                      <button type="button" className="btn btn-secondary" onClick={() => addSubcategory(id)}>Add</button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => { setAddSubOpen((prev) => ({ ...prev, [id]: false })); setAddSubText((prev) => ({ ...prev, [id]: '' })); }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setAddSubOpen((prev) => ({ ...prev, [id]: true }))}
                    >
                      Add subcategory
                    </button>
                  )}
                </div>
              </div>
            ))}
        </div>

        <div className="btn-row">
          <button type="button" className="btn btn-secondary" onClick={props.onClose}>
            Close
          </button>
        </div>
      </div>

      {confirmDelete ? (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Are you sure you want to delete this?</h3>
            <p style={{ color: 'var(--ui-primary-text, var(--text))', marginTop: 0 }}>{confirmDelete.label}</p>
            <div className="btn-row">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  if (confirmDelete.kind === 'category') {
                    const next = { ...cfg };
                    delete (next as any)[confirmDelete.catId];
                    commit(next);
                  } else {
                    const id = confirmDelete.catId;
                    const s = confirmDelete.sub;
                    const next = { ...cfg, [id]: { ...cfg[id], sub: (cfg[id].sub || []).filter((x) => x !== s) } };
                    commit(next);
                  }
                  setConfirmDelete(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


