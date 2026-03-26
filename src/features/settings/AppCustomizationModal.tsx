import { useState } from 'react';
import { useTheme } from '../../theme/ThemeContext';
import { useAppearance } from '../../theme/AppearanceContext';
import { useAdvancedUIColors } from '../../theme/AdvancedUIColorsContext';
import type { AdvancedUIColors } from '../../state/storage';
import { Select } from '../../ui/Select';

const FONT_FAMILY_OPTIONS = [
  // Iconic / brand-associated (~70% sans)
  { key: 'claude',        label: 'Claude  (Söhne)',      group: 'Iconic' },
  { key: 'system',        label: 'SF Pro / System',      group: 'Iconic' },
  { key: 'helveticaNeue', label: 'Helvetica Neue',      group: 'Iconic' },
  { key: 'roboto',        label: 'Roboto  (Google)',     group: 'Iconic' },
  { key: 'inter',         label: 'Inter  (Figma/Linear)',group: 'Iconic' },
  { key: 'montserrat',    label: 'Montserrat',           group: 'Iconic' },
  { key: 'opensans',      label: 'Open Sans  (Google)',  group: 'Iconic' },
  { key: 'lato',          label: 'Lato',                 group: 'Iconic' },
  { key: 'ibmPlexSans',   label: 'IBM Plex Sans  (IBM)', group: 'Iconic' },
  // Premium modern sans
  { key: 'dmsans',        label: 'DM Sans',              group: 'Modern' },
  { key: 'manrope',       label: 'Manrope',              group: 'Modern' },
  { key: 'outfit',        label: 'Outfit',               group: 'Modern' },
  { key: 'jakarta',       label: 'Plus Jakarta Sans',    group: 'Modern' },
  { key: 'spaceGrotesk',  label: 'Space Grotesk',        group: 'Modern' },
  { key: 'nunito',        label: 'Nunito',               group: 'Modern' },
  { key: 'raleway',       label: 'Raleway',              group: 'Modern' },
  { key: 'figtree',       label: 'Figtree',              group: 'Modern' },
  { key: 'workSans',      label: 'Work Sans',            group: 'Modern' },
  { key: 'sourceSans',    label: 'Source Sans 3  (Adobe)',group: 'Modern'},
  { key: 'poppins',       label: 'Poppins',              group: 'Modern' },
  // Classic sans
  { key: 'helvetica',     label: 'Helvetica',            group: 'Classic' },
  { key: 'arial',         label: 'Arial',                group: 'Classic' },
  { key: 'verdana',       label: 'Verdana',              group: 'Classic' },
  { key: 'calibri',       label: 'Calibri',              group: 'Classic' },
  { key: 'trebuchet',     label: 'Trebuchet MS',         group: 'Classic' },
  // Serif / editorial (~30%)
  { key: 'playfair',      label: 'Playfair Display',     group: 'Serif' },
  { key: 'merriweather',  label: 'Merriweather',         group: 'Serif' },
  { key: 'georgia',       label: 'Georgia',              group: 'Serif' },
  { key: 'garamond',      label: 'Garamond',             group: 'Serif' },
  { key: 'times',         label: 'Times New Roman',      group: 'Serif' },
  // Mono
  { key: 'firaCode',      label: 'Fira Code',            group: 'Mono' },
  { key: 'courier',       label: 'Courier New',          group: 'Mono' },
];

const FONT_SCALE_OPTIONS = [
  { value: 0.94, label: 'Small' },
  { value: 1,    label: 'Medium' },
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
      cardBg: '#252525', surfaceSecondary: '#202020', sectionBg: '#232323',
      modalBg: '#2d2d2d', tabBarBg: '#1e1e1e', border: '#3a3a3a',
      titleText: '#f0f0f0', primaryText: '#cccccc', outlineButton: '#cccccc', addButton: '#E8673A',
    },
  },
  {
    id: 'carbon',
    name: 'Carbon',
    themeColor: '#080808',
    accentColor: '#a3e635',
    advancedColors: {
      cardBg: '#131313', surfaceSecondary: '#0f0f0f', sectionBg: '#111111',
      modalBg: '#1a1a1a', tabBarBg: '#0c0c0c', border: '#282828',
      titleText: '#f5f5f5', primaryText: '#c8c8c8', outlineButton: '#c8c8c8', addButton: '#a3e635',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    themeColor: '#0c1927',
    accentColor: '#38bdf8',
    advancedColors: {
      cardBg: '#142233', surfaceSecondary: '#112030', sectionBg: '#132131',
      modalBg: '#1a2d3e', tabBarBg: '#0e1f2e', border: '#253d52',
      titleText: '#e0f0ff', primaryText: '#b8d4ee', outlineButton: '#b8d4ee', addButton: '#38bdf8',
    },
  },
  {
    id: 'arctic',
    name: 'Arctic',
    themeColor: '#eef4f8',
    accentColor: '#0ea5e9',
    advancedColors: {
      cardBg: '#ffffff', surfaceSecondary: '#e4edf4', sectionBg: '#f0f6fa',
      modalBg: '#ffffff', tabBarBg: '#e8f0f6', border: '#c2d8e8',
      titleText: '#0a1929', primaryText: '#1e3a52', outlineButton: '#1e3a52', addButton: '#0ea5e9',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    themeColor: '#0f1a12',
    accentColor: '#22c55e',
    advancedColors: {
      cardBg: '#162219', surfaceSecondary: '#132116', sectionBg: '#152019',
      modalBg: '#1c2e20', tabBarBg: '#111c14', border: '#2a3f2e',
      titleText: '#e8f5e0', primaryText: '#c4dcc7', outlineButton: '#c4dcc7', addButton: '#22c55e',
    },
  },
  {
    id: 'olive',
    name: 'Olive',
    themeColor: '#131510',
    accentColor: '#84cc16',
    advancedColors: {
      cardBg: '#1c2018', surfaceSecondary: '#181b14', sectionBg: '#1a1e16',
      modalBg: '#242920', tabBarBg: '#161914', border: '#2e3428',
      titleText: '#edf2e0', primaryText: '#c8d4a8', outlineButton: '#c8d4a8', addButton: '#84cc16',
    },
  },
  {
    id: 'indigo',
    name: 'Indigo',
    themeColor: '#0f0e1a',
    accentColor: '#818cf8',
    advancedColors: {
      cardBg: '#1a1929', surfaceSecondary: '#181724', sectionBg: '#191827',
      modalBg: '#232232', tabBarBg: '#141320', border: '#322e50',
      titleText: '#f0eeff', primaryText: '#c4bfe8', outlineButton: '#c4bfe8', addButton: '#818cf8',
    },
  },
  {
    id: 'rose',
    name: 'Rose Gold',
    themeColor: '#1a0e14',
    accentColor: '#f472b6',
    advancedColors: {
      cardBg: '#251520', surfaceSecondary: '#20121c', sectionBg: '#22131e',
      modalBg: '#2e1a28', tabBarBg: '#1e1018', border: '#42253a',
      titleText: '#fce7f3', primaryText: '#e8b4d0', outlineButton: '#e8b4d0', addButton: '#f472b6',
    },
  },
  {
    id: 'volcanic',
    name: 'Volcanic',
    themeColor: '#170800',
    accentColor: '#fb923c',
    advancedColors: {
      cardBg: '#231005', surfaceSecondary: '#1e0c02', sectionBg: '#200e03',
      modalBg: '#2e1608', tabBarBg: '#1c0a01', border: '#3d1f08',
      titleText: '#fff0e0', primaryText: '#e8c4a0', outlineButton: '#e8c4a0', addButton: '#fb923c',
    },
  },
  {
    id: 'amber',
    name: 'Amber',
    themeColor: '#1a1200',
    accentColor: '#fbbf24',
    advancedColors: {
      cardBg: '#251a05', surfaceSecondary: '#201600', sectionBg: '#231803',
      modalBg: '#2e2108', tabBarBg: '#1e1600', border: '#3d2e0a',
      titleText: '#fff8e0', primaryText: '#d4c08a', outlineButton: '#d4c08a', addButton: '#fbbf24',
    },
  },
  {
    id: 'slate',
    name: 'Slate',
    themeColor: '#0d1117',
    accentColor: '#94a3b8',
    advancedColors: {
      cardBg: '#161b22', surfaceSecondary: '#131820', sectionBg: '#141a21',
      modalBg: '#1e242d', tabBarBg: '#0f151c', border: '#2a333e',
      titleText: '#e6edf3', primaryText: '#b1bac4', outlineButton: '#b1bac4', addButton: '#94a3b8',
    },
  },
  {
    id: 'neon',
    name: 'Neon',
    themeColor: '#060810',
    accentColor: '#00ff88',
    advancedColors: {
      cardBg: '#0e1220', surfaceSecondary: '#0b0f1c', sectionBg: '#0c101e',
      modalBg: '#141828', tabBarBg: '#080c18', border: '#1e2840',
      titleText: '#e0ffe8', primaryText: '#a0f0c0', outlineButton: '#a0f0c0', addButton: '#00ff88',
    },
  },
  {
    id: 'sakura',
    name: 'Sakura',
    themeColor: '#f8f0f4',
    accentColor: '#ec4899',
    advancedColors: {
      cardBg: '#ffffff', surfaceSecondary: '#f0e6ec', sectionBg: '#f5edf2',
      modalBg: '#ffffff', tabBarBg: '#f2e8f0', border: '#e0c8d8',
      titleText: '#3a0a22', primaryText: '#6b2042', outlineButton: '#6b2042', addButton: '#ec4899',
    },
  },
  {
    id: 'light',
    name: 'Light',
    themeColor: '#f4f4f0',
    accentColor: '#E8673A',
    advancedColors: {
      cardBg: '#ffffff', surfaceSecondary: '#eeeeea', sectionBg: '#f7f7f4',
      modalBg: '#ffffff', tabBarBg: '#f4f4f0', border: '#d0d0c8',
      titleText: '#111111', primaryText: '#333333', outlineButton: '#333333', addButton: '#E8673A',
    },
  },
  // ── High-contrast dark themes ──
  {
    id: 'cobalt',
    name: 'Cobalt',
    themeColor: '#080c16',
    accentColor: '#3b82f6',
    advancedColors: {
      cardBg: '#111828', surfaceSecondary: '#0e1524', sectionBg: '#101726',
      modalBg: '#182030', tabBarBg: '#0a1020', border: '#1e2e48',
      titleText: '#e8f0ff', primaryText: '#a8c0e8', outlineButton: '#a8c0e8', addButton: '#3b82f6',
    },
  },
  {
    id: 'berry',
    name: 'Berry',
    themeColor: '#0e0814',
    accentColor: '#d946ef',
    advancedColors: {
      cardBg: '#1a1024', surfaceSecondary: '#160d20', sectionBg: '#180f22',
      modalBg: '#22162e', tabBarBg: '#120a1c', border: '#321848',
      titleText: '#f5e8ff', primaryText: '#d4a8e8', outlineButton: '#d4a8e8', addButton: '#d946ef',
    },
  },
  {
    id: 'teal',
    name: 'Deep Teal',
    themeColor: '#060f0e',
    accentColor: '#0d9488',
    advancedColors: {
      cardBg: '#0e1e1c', surfaceSecondary: '#0b1918', sectionBg: '#0d1c1a',
      modalBg: '#142826', tabBarBg: '#081614', border: '#183028',
      titleText: '#e0f5f2', primaryText: '#a0d4cc', outlineButton: '#a0d4cc', addButton: '#0d9488',
    },
  },
  {
    id: 'crimson',
    name: 'Crimson',
    themeColor: '#120606',
    accentColor: '#ef4444',
    advancedColors: {
      cardBg: '#1e0e0e', surfaceSecondary: '#190b0b', sectionBg: '#1c0d0d',
      modalBg: '#281414', tabBarBg: '#160808', border: '#3a1414',
      titleText: '#fff0f0', primaryText: '#e8b8b8', outlineButton: '#e8b8b8', addButton: '#ef4444',
    },
  },
  {
    id: 'royal',
    name: 'Royal',
    themeColor: '#040812',
    accentColor: '#d97706',
    advancedColors: {
      cardBg: '#0c1428', surfaceSecondary: '#091022', sectionBg: '#0a1224',
      modalBg: '#101a30', tabBarBg: '#060c1c', border: '#182040',
      titleText: '#fff8e8', primaryText: '#d4b87a', outlineButton: '#d4b87a', addButton: '#d97706',
    },
  },
  {
    id: 'copper',
    name: 'Copper',
    themeColor: '#110a04',
    accentColor: '#ea580c',
    advancedColors: {
      cardBg: '#1c1008', surfaceSecondary: '#180d06', sectionBg: '#1a0f07',
      modalBg: '#26180c', tabBarBg: '#140c04', border: '#381a0c',
      titleText: '#fff4ec', primaryText: '#e0bca0', outlineButton: '#e0bca0', addButton: '#ea580c',
    },
  },
  {
    id: 'aurora',
    name: 'Aurora',
    themeColor: '#060c10',
    accentColor: '#06b6d4',
    advancedColors: {
      cardBg: '#0e1c22', surfaceSecondary: '#0b181e', sectionBg: '#0d1a20',
      modalBg: '#14242c', tabBarBg: '#08141a', border: '#16303a',
      titleText: '#e0f8ff', primaryText: '#90d0e0', outlineButton: '#90d0e0', addButton: '#06b6d4',
    },
  },
  // ── Light themes ──
  {
    id: 'frost',
    name: 'Frost',
    themeColor: '#eef2ff',
    accentColor: '#1d4ed8',
    advancedColors: {
      cardBg: '#ffffff', surfaceSecondary: '#e4e8f8', sectionBg: '#f0f3fc',
      modalBg: '#ffffff', tabBarBg: '#e8ecf8', border: '#c0c8e8',
      titleText: '#0a0e2a', primaryText: '#1e2a5a', outlineButton: '#1e2a5a', addButton: '#1d4ed8',
    },
  },
  {
    id: 'mono',
    name: 'Mono',
    themeColor: '#f8f8f8',
    accentColor: '#18181b',
    advancedColors: {
      cardBg: '#ffffff', surfaceSecondary: '#efefef', sectionBg: '#f4f4f4',
      modalBg: '#ffffff', tabBarBg: '#f0f0f0', border: '#d4d4d8',
      titleText: '#09090b', primaryText: '#27272a', outlineButton: '#27272a', addButton: '#18181b',
    },
  },
];

const FONT_GROUPS = ['Iconic', 'Modern', 'Classic', 'Serif', 'Mono'] as const;

export function AppCustomizationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { themeColor, setThemeColor, setAccentColor } = useTheme();
  const { fontFamily, fontScale, setFontFamily, setFontScale } = useAppearance();
  const advCtx = useAdvancedUIColors();
  const [activeId, setActiveId] = useState<string | null>(() => {
    const match = PRESET_THEMES.find((p) => p.themeColor === themeColor);
    return match?.id ?? null;
  });
  const [showAllThemes, setShowAllThemes] = useState(false);

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
      <div className="modal modal-animate" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <h3>App Customization</h3>

        {/* ── Themes ───────────────────────────────────────── */}
        <p className="section-title" style={{ marginTop: 16, marginBottom: 10 }}>Theme</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
          {(showAllThemes ? PRESET_THEMES : PRESET_THEMES.slice(0, 6)).map((preset) => {
            const isActive = activeId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApply(preset)}
                style={{
                  background: preset.themeColor,
                  border: isActive ? `2px solid ${preset.accentColor}` : '2px solid transparent',
                  borderRadius: 12,
                  padding: '10px 8px 8px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  textAlign: 'left',
                  boxShadow: isActive
                    ? `0 0 0 1px ${preset.accentColor}, 0 4px 16px rgba(0,0,0,0.3)`
                    : '0 2px 8px rgba(0,0,0,0.2)',
                  transition: 'box-shadow 0.2s ease, border-color 0.2s ease, transform 0.15s ease',
                  transform: isActive ? 'scale(1.03)' : 'scale(1)',
                }}
              >
                {/* Mini card preview */}
                <div style={{
                  background: preset.advancedColors.cardBg,
                  borderRadius: 5,
                  height: 22,
                  width: '100%',
                  border: `1px solid ${preset.advancedColors.border}`,
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    position: 'absolute',
                    top: 5, left: 5,
                    width: '40%', height: 3,
                    borderRadius: 2,
                    background: preset.advancedColors.primaryText ?? '#ccc',
                    opacity: 0.5,
                  }} />
                  <div style={{
                    position: 'absolute',
                    top: 11, left: 5,
                    width: '60%', height: 3,
                    borderRadius: 2,
                    background: preset.accentColor,
                    opacity: 0.7,
                  }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                  <span style={{
                    color: preset.advancedColors.primaryText ?? '#ccc',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    lineHeight: 1.2,
                  }}>
                    {preset.name}
                  </span>
                  <div style={{
                    width: 10, height: 10,
                    borderRadius: '50%',
                    background: preset.accentColor,
                    flexShrink: 0,
                  }} />
                </div>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setShowAllThemes((v) => !v)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent)',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '4px 0',
            marginBottom: 18,
            letterSpacing: '0.01em',
          }}
        >
          {showAllThemes ? '↑ Show fewer themes' : `+ See more themes (${PRESET_THEMES.length - 6} more)`}
        </button>

        {/* ── Typography ───────────────────────────────────── */}
        <p className="section-title" style={{ marginTop: 4, marginBottom: 10 }}>Typography</p>

        <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-primary-text, var(--text))', marginBottom: 8 }}>
          Font family
        </p>
        <div style={{ marginBottom: 16 }}>
          <Select
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
            style={{ width: '100%', fontSize: '0.92rem' }}
          >
            {FONT_GROUPS.map((group) => (
              <optgroup key={group} label={group}>
                {FONT_FAMILY_OPTIONS.filter((o) => o.group === group).map((opt) => (
                  <option key={opt.key} value={opt.key}>{opt.label}</option>
                ))}
              </optgroup>
            ))}
          </Select>
        </div>

        <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-primary-text, var(--text))', marginBottom: 8 }}>
          Font size
        </p>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {FONT_SCALE_OPTIONS.map((opt) => {
            const isSelected = fontScale === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFontScale(opt.value)}
                style={{
                  flex: 1,
                  padding: '8px 4px',
                  borderRadius: 8,
                  border: isSelected
                    ? '2px solid var(--ui-add-btn, var(--accent))'
                    : '1px solid var(--ui-border, var(--border))',
                  background: isSelected
                    ? 'color-mix(in srgb, var(--ui-add-btn, var(--accent)) 12%, var(--ui-modal-bg, var(--surface)))'
                    : 'var(--ui-modal-bg, var(--surface))',
                  color: isSelected ? 'var(--ui-add-btn, var(--accent))' : 'var(--ui-primary-text, var(--text))',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="btn-row" style={{ marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
