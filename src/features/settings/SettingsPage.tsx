import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLedgerStore } from '../../state/store';
import {
  exportJSON,
  importJSON,
  loadCategoryConfig,
  saveCategoryConfig,
  loadBirthdateISO,
  saveBirthdateISO
} from '../../state/storage';
import { useTheme } from '../../theme/ThemeContext';
import { THEME_OPTIONS } from '../../theme/themes';
import { ManageCategoriesModal } from './ManageCategoriesModal';

function downloadJsonFile(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const THEME_ACCENT_COLORS: Record<string, string> = {
  blue: '#0ea5e9',
  green: '#22c55e',
  light: '#0369a1',
  purple: '#a855f7',
  amber: '#f59e0b',
  rose: '#f43f5e',
  teal: '#14b8a6',
};

export function SettingsPage() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const actions = useLedgerStore((s) => s.actions);
  const { theme, setTheme } = useTheme();
  const [manageOpen, setManageOpen] = useState(false);
  const [birthdate, setBirthdate] = useState<string>(() => loadBirthdateISO() || '');

  return (
    <div className="tab-panel active" id="settingsContent">
      <p className="section-title">Theme</p>
      <div className="settings-section">
        <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginTop: 0, marginBottom: 10 }}>
          Choose an accent color. The selected theme is saved and applied across the app.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {THEME_OPTIONS.map((opt) => {
            const isSelected = theme === opt.id;
            const accentColor = THEME_ACCENT_COLORS[opt.id] ?? 'var(--accent)';
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTheme(opt.id)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: isSelected ? `2px solid ${accentColor}` : '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  minWidth: 72,
                  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                  boxShadow: isSelected ? `0 0 0 1px ${accentColor}` : undefined,
                }}
              >
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: accentColor,
                  }}
                />
                <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="section-title" style={{ marginTop: 24 }}>Profile</p>
      <div className="settings-section">
        <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--muted)', marginBottom: 4 }}>
          Date of birth
        </label>
        <input
          type="date"
          value={birthdate}
          onChange={(e) => {
            const v = e.target.value;
            setBirthdate(v);
            saveBirthdateISO(v || null);
          }}
          style={{
            padding: '6px 8px',
            borderRadius: 4,
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text)',
            fontSize: '0.9rem'
          }}
        />
        <p style={{ marginTop: 6, fontSize: '0.8rem', color: 'var(--muted)' }}>
          Used for age-aware projections (e.g. loans, FIRE). Stored only on this device.
        </p>
      </div>

      <p className="section-title" style={{ marginTop: 24 }}>Privacy</p>
      <div className="settings-section">
        <Link to="/privacy" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
          Privacy Policy
        </Link>
      </div>

      <p className="section-title" style={{ marginTop: 24 }}>Backup</p>
      <div className="settings-section">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={async () => {
            const text = exportJSON();
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `iisauhwallet-backup-${ts}.json`;

            // Attempt share sheet first (best for iOS PWA).
            try {
              const nav: any = navigator as any;
              if (nav.share) {
                const file = new File([text], filename, { type: 'application/json' });
                await nav.share({ files: [file], title: 'Backup', text: 'iisauhwallet backup' });
                return;
              }
            } catch (_) {}

            // Fallback: new tab with JSON.
            try {
              const w = window.open('', '_blank');
              if (w) {
                w.document.open();
                w.document.write(
                  '<pre style="white-space:pre-wrap;word-break:break-word;font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; padding:16px;">' +
                    text.replace(/</g, '&lt;') +
                    '</pre>'
                );
                w.document.close();
                return;
              }
            } catch (_) {}

            // Last resort: download.
            downloadJsonFile(filename, text);
          }}
        >
          Export JSON
        </button>
        <button type="button" className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => fileRef.current?.click()}>
          Import JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files && e.target.files[0];
            if (!f) return;
            const r = new FileReader();
            r.onload = () => {
              try {
                importJSON(String(r.result || ''));
                actions.reload();
                alert('Import done.');
              } catch (_) {
                alert('Invalid JSON.');
              }
              e.target.value = '';
            };
            r.readAsText(f);
          }}
        />
      </div>

      <p className="section-title" style={{ marginTop: 24 }}>
        Categories
      </p>
      <div className="settings-section">
        <button type="button" className="btn btn-secondary" onClick={() => setManageOpen(true)}>
          Manage Categories
        </button>
      </div>
      <ManageCategoriesModal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        load={() => loadCategoryConfig()}
        save={(cfg) => saveCategoryConfig(cfg)}
      />

      <p className="section-title" style={{ marginTop: 24 }}>
        Danger zone
      </p>
      <div className="settings-section">
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            if (!confirm('Reset all data? This will clear localStorage for this site.')) return;
            // Explicit user action only.
            localStorage.clear();
            actions.reload();
          }}
        >
          Reset All Data
        </button>
      </div>
    </div>
  );
}

