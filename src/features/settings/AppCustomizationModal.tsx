import { useEffect, useState } from 'react';
import { useTheme } from '../../theme/ThemeContext';
import { useAppearance } from '../../theme/AppearanceContext';
import { useAdvancedUIColors } from '../../theme/AdvancedUIColorsContext';
import { normalizeHex } from '../../theme/themeUtils';
import type { AdvancedUIColors } from '../../state/storage';

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

const SURFACE_COLOR_OPTIONS: { key: keyof AdvancedUIColors; label: string; helper: string }[] = [
  { key: 'cardBg', label: 'Card background', helper: 'Only changes cards.' },
  { key: 'surfaceSecondary', label: 'Padding / secondary surface blocks', helper: 'Only changes summary and secondary blocks.' },
  { key: 'sectionBg', label: 'Section background', helper: 'Only changes section headers.' },
  { key: 'modalBg', label: 'Modal background', helper: 'Only changes modal surfaces.' },
  { key: 'dropdownBg', label: 'Dropdown background', helper: 'Only changes dropdowns and selects.' },
  { key: 'tabBarBg', label: 'Bottom Tab Bar background', helper: 'The navigation bar at the bottom (Spending, Recurring, etc.).' },
  { key: 'border', label: 'Border color', helper: 'Only changes borders.' },
  { key: 'muted', label: 'Muted text / secondary text', helper: 'Only changes muted labels and secondary text.' },
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

function SurfaceColorsSection() {
  const ctx = useAdvancedUIColors();
  if (!ctx) return null;
  const { colors, setColor, clearColor } = ctx;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {SURFACE_COLOR_OPTIONS.map(({ key, label, helper }) => {
        const value = colors[key] ?? '';
        return (
          <div key={key}>
            <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)', margin: '0 0 2px 0' }}>
              {label}
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0 0 8px 0' }}>
              {helper}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <input
                type="color"
                value={value || '#1e293b'}
                onChange={(e) => setColor(key, e.target.value)}
                style={{ width: 44, height: 44, padding: 2, border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}
                aria-label={label}
              />
              <input
                type="text"
                key={`${key}-${value}`}
                defaultValue={value}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  const n = normalizeHex(v);
                  if (n) setColor(key, n);
                  else if (v === '') clearColor(key);
                }}
                placeholder="#000000"
                style={{
                  flex: 1,
                  minWidth: 100,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  fontSize: '0.9rem',
                }}
              />
              {value ? (
                <button type="button" className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '0.85rem' }} onClick={() => clearColor(key)}>
                  Clear
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AppCustomizationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { themeColor, setThemeColor, accentColor, setAccentColor } = useTheme();
  const { fontFamily, fontScale, setFontFamily, setFontScale } = useAppearance();
  const [themeHexInput, setThemeHexInput] = useState(themeColor);
  const [accentHexInput, setAccentHexInput] = useState(accentColor);

  useEffect(() => {
    setThemeHexInput(themeColor);
  }, [themeColor]);
  useEffect(() => {
    setAccentHexInput(accentColor);
  }, [accentColor]);

  if (!open) return null;

  return (
    <div className="modal-overlay modal-overlay-animate" onClick={onClose}>
      <div className="modal modal-animate" onClick={(e) => e.stopPropagation()}>
        <h3>App Customization</h3>

        <p className="section-title" style={{ marginTop: 16, marginBottom: 8 }}>Colors</p>

        <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)', marginTop: 0, marginBottom: 2 }}>
          App background
        </p>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 0, marginBottom: 8 }}>
          Only changes the main page background.
        </p>
        <div style={{ marginBottom: 20 }}>
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

        <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)', marginTop: 0, marginBottom: 2 }}>
          Accent color
        </p>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 0, marginBottom: 8 }}>
          Buttons, active tabs, highlights, icons.
        </p>
        <div style={{ marginBottom: 20 }}>
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

        <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)', marginTop: 0, marginBottom: 4 }}>
          Surface colors / advanced
        </p>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 0, marginBottom: 10 }}>
          Each control affects one UI surface only. Leave empty to use defaults.
        </p>
        <div style={{ marginBottom: 24 }}>
          <SurfaceColorsSection />
        </div>

        <p className="section-title" style={{ marginTop: 8 }}>Typography</p>

        <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)', marginTop: 0, marginBottom: 2 }}>
          Font family
        </p>
        <div style={{ marginBottom: 16 }}>
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

        <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)', marginTop: 0, marginBottom: 2 }}>
          Font size
        </p>
        <div style={{ marginBottom: 8 }}>
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

        <div className="btn-row" style={{ marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
