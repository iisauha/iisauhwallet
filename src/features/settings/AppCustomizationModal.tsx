import { useTheme } from '../../theme/ThemeContext';
import { useAppearance } from '../../theme/AppearanceContext';
import { useAdvancedUIColors } from '../../theme/AdvancedUIColorsContext';
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
  { key: 'titleText', label: 'Title text' },
  { key: 'primaryText', label: 'Primary text' },
];

const SURFACE_COLOR_OPTIONS: { key: keyof AdvancedUIColors; label: string }[] = [
  { key: 'cardBg', label: 'Card background' },
  { key: 'surfaceSecondary', label: 'Padding / secondary surface blocks' },
  { key: 'sectionBg', label: 'Section background' },
  { key: 'modalBg', label: 'Popup card background' },
  { key: 'tabBarBg', label: 'Bottom Tab Bar background' },
  { key: 'border', label: 'Border color' },
  { key: 'outlineButton', label: 'Outline buttons (text + border)' },
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
      <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>{label}</span>
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

  if (!open) return null;

  return (
    <div className="modal-overlay modal-overlay-animate" onClick={onClose}>
      <div className="modal modal-animate" onClick={(e) => e.stopPropagation()}>
        <h3>App Customization</h3>

        <p className="section-title" style={{ marginTop: 16, marginBottom: 10 }}>
          Colors
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
          <ColorRow label="App background" value={themeColor} onChange={setThemeColor} />
          <ColorRow label="Accent color" value={accentColor} onChange={setAccentColor} />
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

        <p className="section-title" style={{ marginTop: 8 }}>Typography</p>

        <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)', marginTop: 12, marginBottom: 8 }}>
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

        <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)', marginTop: 0, marginBottom: 8 }}>
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
