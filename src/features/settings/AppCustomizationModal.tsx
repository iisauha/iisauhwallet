import { useState } from 'react';
import { useTheme } from '../../theme/ThemeContext';
import { useAppearance } from '../../theme/AppearanceContext';
import { useAdvancedUIColors } from '../../theme/AdvancedUIColorsContext';
import { loadThemePresets, saveThemePresets, type AdvancedUIColors, type SavedThemePreset, uid } from '../../state/storage';

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

const COLOR_SWATCH_STYLE = {
  width: 44,
  height: 44,
  padding: 2,
  border: '1px solid var(--border)',
  borderRadius: 8,
  cursor: 'pointer' as const,
  flexShrink: 0 as const,
};

const TEXT_COLOR_OPTIONS: { key: keyof AdvancedUIColors; label: string }[] = [
  { key: 'titleText', label: 'Titles / Headings' },
  { key: 'primaryText', label: 'All Other Text' },
];

const SURFACE_COLOR_OPTIONS: { key: keyof AdvancedUIColors; label: string }[] = [
  { key: 'cardBg', label: 'Main Cards' },
  { key: 'surfaceSecondary', label: 'Summary Cards' },
  { key: 'sectionBg', label: 'Dropdowns Card Color' },
  { key: 'modalBg', label: 'Popup card background' },
  { key: 'tabBarBg', label: 'Bottom Tab Bar background' },
  { key: 'border', label: 'Border of Summary + Popups Cards' },
  { key: 'outlineButton', label: 'Buttons (Text + Border)' },
];

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--ui-primary-text, var(--text))' }}>{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={COLOR_SWATCH_STYLE} aria-label={label} />
    </div>
  );
}

function TextColorsSection() {
  const ctx = useAdvancedUIColors();
  if (!ctx) return null;
  const { colors, setColor } = ctx;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {TEXT_COLOR_OPTIONS.map(({ key, label }) => {
        const value = colors[key] ?? '';
        return (
          <ColorRow
            key={key}
            label={label}
            value={value || '#f1f5f9'}
            onChange={(hex) => setColor(key, hex)}
          />
        );
      })}
    </div>
  );
}

function SurfaceColorsSection() {
  const ctx = useAdvancedUIColors();
  if (!ctx) return null;
  const { colors, setColor } = ctx;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {SURFACE_COLOR_OPTIONS.map(({ key, label }) => {
        const value = colors[key] ?? '';
        const pickerFallback = key === 'outlineButton' ? '#64748b' : '#1e293b';
        return (
          <ColorRow
            key={key}
            label={label}
            value={value || pickerFallback}
            onChange={(hex) => setColor(key, hex)}
          />
        );
      })}
    </div>
  );
}

export function AppCustomizationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { themeColor, setThemeColor, accentColor, setAccentColor } = useTheme();
  const { fontFamily, fontScale, setFontFamily, setFontScale } = useAppearance();
  const advCtx = useAdvancedUIColors();
  const [themePresets, setThemePresets] = useState<SavedThemePreset[]>(() => loadThemePresets());
  const [newThemeName, setNewThemeName] = useState('');

  if (!open) return null;

  const handleSaveTheme = () => {
    if (!advCtx) return;
    const name = (newThemeName || '').trim() || 'Custom theme';
    const preset: SavedThemePreset = {
      id: uid(),
      name,
      themeColor,
      accentColor,
      advancedColors: advCtx.colors,
    };
    const next = [
      ...themePresets.filter((p: SavedThemePreset) => p.name.toLowerCase() !== name.toLowerCase()),
      preset,
    ];
    setThemePresets(next);
    saveThemePresets(next);
  };

  const handleApplyTheme = (preset: SavedThemePreset) => {
    setThemeColor(preset.themeColor);
    setAccentColor(preset.accentColor);
    if (!advCtx) return;
    const keys: (keyof AdvancedUIColors)[] = [
      'cardBg',
      'surfaceSecondary',
      'sectionBg',
      'modalBg',
      'tabBarBg',
      'border',
      'titleText',
      'primaryText',
      'outlineButton',
    ];
    const nextColors = preset.advancedColors || {};
    keys.forEach((k) => {
      const v = nextColors[k];
      if (v && v.trim() !== '') advCtx.setColor(k, v);
      else advCtx.clearColor(k);
    });
  };

  return (
    <div className="modal-overlay modal-overlay-animate" onClick={onClose}>
      <div className="modal modal-animate" onClick={(e) => e.stopPropagation()}>
        <h3>App Customization</h3>

        <p className="section-title" style={{ marginTop: 16, marginBottom: 10 }}>
          Colors
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
          <ColorRow label="App background" value={themeColor} onChange={setThemeColor} />
          <ColorRow label="Navigation Buttons" value={accentColor} onChange={setAccentColor} />
        </div>

        <p className="section-title" style={{ marginTop: 16, marginBottom: 10 }}>
          Text colors
        </p>
        <div style={{ marginBottom: 20 }}>
          <TextColorsSection />
        </div>

        <p className="section-title" style={{ marginTop: 8, marginBottom: 10 }}>
          Surface colors / advanced
        </p>
        <div style={{ marginBottom: 24 }}>
          <SurfaceColorsSection />
        </div>

        <p className="section-title" style={{ marginTop: 8, marginBottom: 10 }}>
          Saved themes
        </p>
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="ll-control"
              style={{ flex: 1, minWidth: 140, maxWidth: 260 }}
              placeholder="Theme name (e.g. Forest)"
              value={newThemeName}
              onChange={(e) => setNewThemeName(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleSaveTheme}
              style={{ flexShrink: 0 }}
            >
              Save theme
            </button>
          </div>
          {themePresets.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              {themePresets.map((p: SavedThemePreset) => (
                <button
                  key={p.id}
                  type="button"
                  className="btn btn-secondary"
                  style={{ justifyContent: 'space-between', display: 'flex' }}
                  onClick={() => handleApplyTheme(p)}
                >
                  <span>{p.name}</span>
                  <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Apply</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <p className="section-title" style={{ marginTop: 8 }}>Typography</p>

        <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--ui-primary-text, var(--text))', marginTop: 12, marginBottom: 8 }}>
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
              color: 'var(--ui-primary-text, var(--text))',
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

        <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--ui-primary-text, var(--text))', marginTop: 0, marginBottom: 8 }}>
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
                    color: 'var(--ui-primary-text, var(--text))',
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
