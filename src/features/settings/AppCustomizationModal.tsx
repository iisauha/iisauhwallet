import { useState } from 'react';
import { useTheme } from '../../theme/ThemeContext';
import { useAppearance } from '../../theme/AppearanceContext';
import { useAdvancedUIColors } from '../../theme/AdvancedUIColorsContext';
import type { AdvancedUIColors } from '../../state/storage';
import { Select } from '../../ui/Select';

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

type PresetTheme = {
  id: string;
  name: string;
  themeColor: string;
  accentColor: string;
  advancedColors: AdvancedUIColors;
};

const PRESET_THEMES: PresetTheme[] = [
  {
    id: 'midnight',
    name: 'Midnight',
    themeColor: '#1a1a1a',
    accentColor: '#E8673A',
    advancedColors: {
      cardBg: '#252525',
      surfaceSecondary: '#202020',
      sectionBg: '#232323',
      modalBg: '#2d2d2d',
      tabBarBg: '#1e1e1e',
      border: '#3a3a3a',
      titleText: '#f0f0f0',
      primaryText: '#cccccc',
      outlineButton: '#cccccc',
      addButton: '#E8673A',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    themeColor: '#0f1a12',
    accentColor: '#22c55e',
    advancedColors: {
      cardBg: '#162219',
      surfaceSecondary: '#132116',
      sectionBg: '#152019',
      modalBg: '#1c2e20',
      tabBarBg: '#111c14',
      border: '#2a3f2e',
      titleText: '#e8f5e0',
      primaryText: '#c4dcc7',
      outlineButton: '#c4dcc7',
      addButton: '#22c55e',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    themeColor: '#0c1927',
    accentColor: '#0ea5e9',
    advancedColors: {
      cardBg: '#142233',
      surfaceSecondary: '#112030',
      sectionBg: '#132131',
      modalBg: '#1a2d3e',
      tabBarBg: '#0e1f2e',
      border: '#253d52',
      titleText: '#e0f0ff',
      primaryText: '#b8d4ee',
      outlineButton: '#b8d4ee',
      addButton: '#0ea5e9',
    },
  },
  {
    id: 'amber',
    name: 'Amber',
    themeColor: '#1a1200',
    accentColor: '#fbbf24',
    advancedColors: {
      cardBg: '#251a05',
      surfaceSecondary: '#201600',
      sectionBg: '#231803',
      modalBg: '#2e2108',
      tabBarBg: '#1e1600',
      border: '#3d2e0a',
      titleText: '#fff8e0',
      primaryText: '#d4c08a',
      outlineButton: '#d4c08a',
      addButton: '#fbbf24',
    },
  },
  {
    id: 'indigo',
    name: 'Indigo',
    themeColor: '#0f0e1a',
    accentColor: '#818cf8',
    advancedColors: {
      cardBg: '#1a1929',
      surfaceSecondary: '#181724',
      sectionBg: '#191827',
      modalBg: '#232232',
      tabBarBg: '#141320',
      border: '#322e50',
      titleText: '#f0eeff',
      primaryText: '#c4bfe8',
      outlineButton: '#c4bfe8',
      addButton: '#818cf8',
    },
  },
  {
    id: 'light',
    name: 'Light',
    themeColor: '#f4f4f0',
    accentColor: '#E8673A',
    advancedColors: {
      cardBg: '#ffffff',
      surfaceSecondary: '#eeeeea',
      sectionBg: '#f7f7f4',
      modalBg: '#ffffff',
      tabBarBg: '#f4f4f0',
      border: '#d0d0c8',
      titleText: '#111111',
      primaryText: '#333333',
      outlineButton: '#333333',
      addButton: '#E8673A',
    },
  },
];

export function AppCustomizationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { themeColor, setThemeColor, setAccentColor } = useTheme();
  const { fontFamily, fontScale, setFontFamily, setFontScale } = useAppearance();
  const advCtx = useAdvancedUIColors();
  const [activeId, setActiveId] = useState<string | null>(() => {
    const match = PRESET_THEMES.find((p) => p.themeColor === themeColor);
    return match?.id ?? null;
  });

  if (!open) return null;

  const handleApply = (preset: PresetTheme) => {
    setThemeColor(preset.themeColor);
    setAccentColor(preset.accentColor);
    if (!advCtx) return;
    const keys: (keyof AdvancedUIColors)[] = [
      'cardBg', 'surfaceSecondary', 'sectionBg', 'modalBg', 'tabBarBg',
      'border', 'titleText', 'primaryText', 'outlineButton', 'addButton',
    ];
    keys.forEach((k) => {
      const v = preset.advancedColors[k];
      if (v && v.trim() !== '') advCtx.setColor(k, v);
      else advCtx.clearColor(k);
    });
    setActiveId(preset.id);
  };

  return (
    <div className="modal-overlay modal-overlay-animate" onClick={onClose}>
      <div className="modal modal-animate" onClick={(e) => e.stopPropagation()}>
        <h3>App Customization</h3>

        <p className="section-title" style={{ marginTop: 16, marginBottom: 12 }}>Theme</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 24 }}>
          {PRESET_THEMES.map((preset) => {
            const isActive = activeId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApply(preset)}
                style={{
                  background: preset.themeColor,
                  border: isActive
                    ? `2px solid ${preset.accentColor}`
                    : '2px solid transparent',
                  borderRadius: 12,
                  padding: '12px 12px 10px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  textAlign: 'left',
                  boxShadow: isActive ? `0 0 0 1px ${preset.accentColor}` : 'none',
                }}
              >
                <div style={{
                  background: preset.advancedColors.cardBg,
                  borderRadius: 6,
                  height: 28,
                  width: '100%',
                  border: `1px solid ${preset.advancedColors.border}`,
                }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{
                    color: preset.advancedColors.primaryText ?? '#cccccc',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                  }}>
                    {preset.name}
                  </span>
                  <div style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: preset.accentColor,
                    flexShrink: 0,
                  }} />
                </div>
              </button>
            );
          })}
        </div>

        <p className="section-title" style={{ marginTop: 8 }}>Typography</p>

        <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--ui-primary-text, var(--text))', marginTop: 12, marginBottom: 8 }}>
          Font family
        </p>
        <div style={{ marginBottom: 16 }}>
          <Select
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
            style={{ width: '100%', maxWidth: 280, fontSize: '0.95rem' }}
          >
            {FONT_FAMILY_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </Select>
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
                    border: isSelected
                      ? '2px solid var(--ui-outline-btn, var(--accent))'
                      : '1px solid var(--ui-outline-btn, var(--border))',
                    background: 'var(--ui-modal-bg, var(--surface))',
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
