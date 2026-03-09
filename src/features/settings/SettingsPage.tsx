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
import { normalizeHex } from '../../theme/themeUtils';
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

function ColorCustomize({
  value,
  onChange,
  inputValue,
  onInputChange,
}: {
  value: string;
  onChange: (hex: string) => void;
  inputValue: string;
  onInputChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <input
        type="color"
        value={value}
        onChange={(e) => {
          const hex = e.target.value;
          onChange(hex);
          onInputChange(hex);
        }}
        style={{ width: 44, height: 44, padding: 2, border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}
      />
      <input
        type="text"
        value={inputValue}
        onChange={(e) => onInputChange(e.target.value)}
        onBlur={() => {
          const normalized = normalizeHex(inputValue);
          if (normalized) onChange(normalized);
        }}
        placeholder="#000000"
        style={{
          flex: 1,
          minWidth: 100,
          padding: '8px 12px',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--bg)',
          color: 'var(--text)',
          fontSize: '0.9rem',
        }}
      />
    </div>
  );
}

export function SettingsPage() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const actions = useLedgerStore((s) => s.actions);
  const { themeColor, setThemeColor, accentColor, setAccentColor } = useTheme();
  const { fontFamily, fontScale, setFontFamily, setFontScale } = useAppearance();
  const [manageOpen, setManageOpen] = useState(false);
  const [birthdate, setBirthdate] = useState<string>(() => loadBirthdateISO() || '');
  const [themeCustomizeOpen, setThemeCustomizeOpen] = useState(false);
  const [accentCustomizeOpen, setAccentCustomizeOpen] = useState(false);
  const [themeHexInput, setThemeHexInput] = useState(themeColor);
  const [accentHexInput, setAccentHexInput] = useState(accentColor);
  useEffect(() => {
    setThemeHexInput(themeColor);
  }, [themeColor]);
  useEffect(() => {
    setAccentHexInput(accentColor);
  }, [accentColor]);

  return (
    <div className="tab-panel active" id="settingsContent">
      <p className="section-title">Appearance</p>

      <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginTop: 0, marginBottom: 8, fontWeight: 600 }}>
        Theme
      </p>
      <div className="settings-section" style={{ marginBottom: 20 }}>
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: 0, marginBottom: 10 }}>
          Backgrounds, surfaces, cards, borders.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: themeColor,
              border: '2px solid var(--border)',
            }}
          />
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '8px 14px', fontSize: '0.9rem' }}
            onClick={() => setThemeCustomizeOpen((o) => !o)}
          >
            {themeCustomizeOpen ? 'Done' : 'Customize'}
          </button>
        </div>
        {themeCustomizeOpen ? (
          <div style={{ marginTop: 12 }}>
            <ColorCustomize
              value={themeColor}
              onChange={(hex) => {
                setThemeColor(hex);
                setThemeHexInput(hex);
              }}
              inputValue={themeHexInput}
              onInputChange={(v) => {
                setThemeHexInput(v);
                const n = normalizeHex(v);
                if (n) setThemeColor(n);
              }}
            />
          </div>
        ) : null}
      </div>

      <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginTop: 0, marginBottom: 8, fontWeight: 600 }}>
        Accent
      </p>
      <div className="settings-section" style={{ marginBottom: 20 }}>
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: 0, marginBottom: 10 }}>
          Buttons, active tabs, highlights, icons.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: accentColor,
              border: '2px solid var(--border)',
            }}
          />
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '8px 14px', fontSize: '0.9rem' }}
            onClick={() => setAccentCustomizeOpen((o) => !o)}
          >
            {accentCustomizeOpen ? 'Done' : 'Customize'}
          </button>
        </div>
        {accentCustomizeOpen ? (
          <div style={{ marginTop: 12 }}>
            <ColorCustomize
              value={accentColor}
              onChange={(hex) => {
                setAccentColor(hex);
                setAccentHexInput(hex);
              }}
              inputValue={accentHexInput}
              onInputChange={(v) => {
                setAccentHexInput(v);
                const n = normalizeHex(v);
                if (n) setAccentColor(n);
              }}
            />
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

