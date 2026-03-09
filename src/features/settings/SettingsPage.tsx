import { useEffect, useRef, useState } from 'react';
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
import { useAppearance } from '../../theme/AppearanceContext';
import { THEME_OPTIONS } from '../../theme/themes';
import { ManageCategoriesModal } from './ManageCategoriesModal';

/** Returns export filename: Month_Day_Year.json (full month name, underscores, day no leading zero, 4-digit year). */
function getExportFileName(): string {
  const d = new Date();
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const month = months[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  return `${month}_${day}_${year}.json`;
}

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
  teal: '#14b8a6',
  cyan: '#06b6d4',
  emerald: '#10b981',
  purple: '#a855f7',
  indigo: '#6366f1',
  amber: '#f59e0b',
  orange: '#f97316',
  rose: '#f43f5e',
  red: '#ef4444',
  slate: '#64748b',
  light: '#0369a1',
  custom: '#0ea5e9',
};

const FONT_FAMILY_OPTIONS = [
  { key: 'system', label: 'System default' },
  { key: 'inter', label: 'Inter' },
  { key: 'arial', label: 'Arial' },
  { key: 'helvetica', label: 'Helvetica' },
  { key: 'calibri', label: 'Calibri' },
  { key: 'times', label: 'Times New Roman' },
  { key: 'georgia', label: 'Georgia' },
  { key: 'verdana', label: 'Verdana' },
  { key: 'trebuchet', label: 'Trebuchet MS' },
  { key: 'garamond', label: 'Garamond' },
  { key: 'courier', label: 'Courier New' },
  { key: 'roboto', label: 'Roboto' },
  { key: 'poppins', label: 'Poppins' },
];

const FONT_SCALE_OPTIONS = [
  { value: 0.94, label: 'Small' },
  { value: 1, label: 'Medium' },
  { value: 1.06, label: 'Large' },
];

export function SettingsPage() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const actions = useLedgerStore((s) => s.actions);
  const { theme, setTheme, customAccentHex, setCustomAccent } = useTheme();
  const { fontFamily, fontScale, setFontFamily, setFontScale } = useAppearance();
  const [manageOpen, setManageOpen] = useState(false);
  const [birthdate, setBirthdate] = useState<string>(() => loadBirthdateISO() || '');
  const [customAccentInput, setCustomAccentInput] = useState(customAccentHex);
  useEffect(() => {
    setCustomAccentInput(customAccentHex);
  }, [theme, customAccentHex]);

  return (
    <div className="tab-panel active" id="settingsContent">
      <p className="section-title">Appearance</p>

      <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginTop: 0, marginBottom: 8, fontWeight: 600 }}>
        Theme / accent color
      </p>
      <div className="settings-section" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {THEME_OPTIONS.map((opt) => {
            const isSelected = theme === opt.id;
            const accentColor = opt.id === 'custom' ? customAccentHex : (THEME_ACCENT_COLORS[opt.id] ?? 'var(--accent)');
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
        {theme === 'custom' ? (
          <div style={{ marginTop: 12 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 6 }}>
              Custom accent color
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="color"
                value={customAccentHex}
                onChange={(e) => setCustomAccent(e.target.value)}
                style={{ width: 44, height: 44, padding: 2, border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}
              />
              <input
                type="text"
                value={customAccentInput}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  setCustomAccentInput(v);
                  if (/^#[0-9A-Fa-f]{6}$/.test(v)) setCustomAccent(v);
                }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: '0.9rem',
                }}
              />
            </div>
          </div>
        ) : null}
      </div>

      <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginTop: 0, marginBottom: 8, fontWeight: 600 }}>
        Font family
      </p>
      <div className="settings-section" style={{ marginBottom: 20 }}>
        <select
          value={fontFamily}
          onChange={(e) => setFontFamily(e.target.value)}
          style={{
            width: '100%',
            maxWidth: 280,
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            fontSize: '0.95rem',
          }}
        >
          {FONT_FAMILY_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginTop: 0, marginBottom: 8, fontWeight: 600 }}>
        Font size
      </p>
      <div className="settings-section" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {FONT_SCALE_OPTIONS.map((opt) => {
            const isSelected = fontScale === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFontScale(opt.value)}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: isSelected ? 'var(--surface-hover)' : 'var(--surface)',
                  color: 'var(--text)',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <p style={{ marginTop: 6, fontSize: '0.8rem', color: 'var(--muted)' }}>
          Keeps layout safe on mobile. Income/expense colors stay green/red.
        </p>
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
            const fileName = getExportFileName();

            // Attempt share sheet first (best for iOS PWA).
            try {
              const nav: any = navigator as any;
              if (nav.share) {
                const file = new File([text], fileName, { type: 'application/json' });
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

            // Last resort: download single JSON file.
            downloadJsonFile(fileName, text);
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

