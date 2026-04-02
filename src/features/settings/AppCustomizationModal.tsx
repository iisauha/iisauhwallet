import { useState } from 'react';
import { useContentGuard } from '../../state/useContentGuard';
import { useTheme } from '../../theme/ThemeContext';
import { useAppearance } from '../../theme/AppearanceContext';
import { useAdvancedUIColors } from '../../theme/AdvancedUIColorsContext';
import type { AdvancedUIColors } from '../../state/storage';
import { loadThemePresets, saveThemePresets, type SavedThemePreset } from '../../state/storage';
import { lightenHexBlend, darkenHex } from '../../theme/themeUtils';
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

/** Derive all 10 advanced UI colors from just a background + accent color.
 *  Text lightness/darkness scales with how extreme the background is:
 *  darker bg → lighter text, lighter bg → darker text. */
function deriveAdvancedColors(bg: string, accent: string): AdvancedUIColors {
  const r = parseInt(bg.slice(1, 3), 16) || 0, g = parseInt(bg.slice(3, 5), 16) || 0, b = parseInt(bg.slice(5, 7), 16) || 0;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000; // 0 = black, 255 = white
  const isLight = brightness > 140;

  if (isLight) {
    // Lighter bg → need darker text. Scale: brightness 255 (white) needs max darken,
    // brightness 140 (threshold) needs less darken.
    const intensity = Math.min(1, (brightness - 140) / 115); // 0..1 where 1 = very light
    const titleDarken = 0.75 + intensity * 0.2;   // 0.75..0.95
    const textDarken = 0.6 + intensity * 0.2;     // 0.6..0.8
    const borderDarken = 0.1 + intensity * 0.1;   // 0.1..0.2
    return {
      cardBg: '#ffffff',
      surfaceSecondary: darkenHex(bg, 0.04),
      sectionBg: lightenHexBlend(bg, 0.3),
      modalBg: '#ffffff',
      tabBarBg: bg,
      border: darkenHex(bg, borderDarken),
      titleText: darkenHex(bg, titleDarken),
      primaryText: darkenHex(bg, textDarken),
      outlineButton: darkenHex(bg, textDarken),
      addButton: accent,
    };
  }

  // Darker bg → need lighter text. Scale: brightness 0 (black) needs max lighten,
  // brightness 140 (threshold) needs less lighten.
  const intensity = Math.min(1, (140 - brightness) / 140); // 0..1 where 1 = very dark
  const titleLighten = 0.8 + intensity * 0.18;   // 0.8..0.98
  const textLighten = 0.55 + intensity * 0.25;   // 0.55..0.80
  const borderLighten = 0.1 + intensity * 0.1;   // 0.1..0.2
  return {
    cardBg: lightenHexBlend(bg, 0.06 + intensity * 0.04),
    surfaceSecondary: lightenHexBlend(bg, 0.03 + intensity * 0.02),
    sectionBg: lightenHexBlend(bg, 0.04 + intensity * 0.03),
    modalBg: lightenHexBlend(bg, 0.08 + intensity * 0.06),
    tabBarBg: bg,
    border: lightenHexBlend(bg, borderLighten),
    titleText: lightenHexBlend(bg, titleLighten),
    primaryText: lightenHexBlend(bg, textLighten),
    outlineButton: lightenHexBlend(bg, textLighten),
    addButton: accent,
  };
}

const PRESET_THEMES: PresetTheme[] = [
  { id: 'royal',    name: 'Royal (Default)', themeColor: '#252526', accentColor: '#FE841B', advancedColors: deriveAdvancedColors('#252526', '#FE841B') },
  { id: 'cobalt',   name: 'Cobalt',          themeColor: '#080c16', accentColor: '#3b82f6', advancedColors: deriveAdvancedColors('#080c16', '#3b82f6') },
  { id: 'light',    name: 'Light',           themeColor: '#f4f4f0', accentColor: '#FE841B', advancedColors: deriveAdvancedColors('#f4f4f0', '#FE841B') },
  { id: 'frost',    name: 'Frost',           themeColor: '#eef2ff', accentColor: '#1d4ed8', advancedColors: deriveAdvancedColors('#eef2ff', '#1d4ed8') },
];

const FONT_GROUPS = ['Iconic', 'Modern', 'Classic', 'Serif', 'Mono'] as const;

export function AppCustomizationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { themeColor, setThemeColor, setAccentColor } = useTheme();
  const { fontFamily, fontScale, setFontFamily, setFontScale } = useAppearance();
  const advCtx = useAdvancedUIColors();
  const contentGuard = useContentGuard();
  const [activeId, setActiveId] = useState<string | null>(() => {
    const match = PRESET_THEMES.find((p) => p.themeColor === themeColor);
    return match?.id ?? null;
  });
  const [customThemes, setCustomThemes] = useState<SavedThemePreset[]>(() => loadThemePresets());
  const [showCreateCustom, setShowCreateCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customBg, setCustomBg] = useState('#0a1020');
  const [customAccent, setCustomAccent] = useState('#FE841B');

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
    <div className="modal-overlay modal-overlay--fullscreen modal-overlay-animate" onClick={onClose}>
      <div className="modal modal-animate" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header modal-header--sticky">
          <h3 style={{ margin: 0, flex: 1 }}>App Customization</h3>
          <button type="button" aria-label="Close" onClick={onClose} className="modal-close-btn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg></button>
        </div>

        {/* ── Themes ───────────────────────────────────────── */}
        <p className="section-title" style={{ marginTop: 16, marginBottom: 10 }}>Theme</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
          {[...PRESET_THEMES, ...customThemes.map((ct) => ({
            id: `custom_${ct.id}`,
            name: ct.name,
            themeColor: ct.themeColor,
            accentColor: ct.accentColor,
            advancedColors: ct.advancedColors,
          }))].map((preset) => {
            const isActive = activeId === preset.id;
            const isCustom = preset.id.startsWith('custom_');
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
                  position: 'relative',
                }}
              >
                {isCustom && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const updated = customThemes.filter((ct) => `custom_${ct.id}` !== preset.id);
                      setCustomThemes(updated);
                      saveThemePresets(updated);
                      if (activeId === preset.id) {
                        // Revert to Royal (default)
                        handleApply(PRESET_THEMES[0]);
                      }
                    }}
                    style={{
                      position: 'absolute', top: -6, right: -6, zIndex: 10,
                      width: 20, height: 20, borderRadius: '50%',
                      background: 'rgba(220,38,38,0.7)', border: '1.5px solid var(--red, #ef4444)',
                      color: '#000', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    ✕
                  </button>
                )}
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

        {/* ── Create Custom Theme ─────────────────────────── */}
        {showCreateCustom ? (
          <div style={{
            background: 'var(--ui-card-bg, var(--surface))',
            border: '1px solid var(--ui-border, var(--border))',
            borderRadius: 12,
            padding: 14,
            marginBottom: 16,
          }}>
            <p style={{ margin: '0 0 10px', fontSize: '0.88rem', fontWeight: 600, color: 'var(--ui-primary-text, var(--text))' }}>
              Create your own theme
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--muted)', marginBottom: 4 }}>Theme name</label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => { const v = e.target.value; if (!contentGuard(v, () => setCustomName(''))) setCustomName(v); }}
                  placeholder="e.g. Ocean Night"
                  className="ll-control"
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--muted)', marginBottom: 4 }}>Background</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="color"
                      value={customBg}
                      onChange={(e) => setCustomBg(e.target.value)}
                      style={{ width: 36, height: 36, border: 'none', borderRadius: 8, cursor: 'pointer', padding: 0 }}
                    />
                    <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontFamily: 'monospace' }}>{customBg}</span>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--muted)', marginBottom: 4 }}>Accent</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="color"
                      value={customAccent}
                      onChange={(e) => setCustomAccent(e.target.value)}
                      style={{ width: 36, height: 36, border: 'none', borderRadius: 8, cursor: 'pointer', padding: 0 }}
                    />
                    <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontFamily: 'monospace' }}>{customAccent}</span>
                  </div>
                </div>
              </div>
              {/* Live preview */}
              <div style={{
                background: customBg,
                borderRadius: 10,
                padding: '10px 12px',
                border: `1px solid ${lightenHexBlend(customBg, 0.15)}`,
              }}>
                <div style={{
                  background: lightenHexBlend(customBg, 0.08),
                  borderRadius: 5,
                  height: 20,
                  border: `1px solid ${lightenHexBlend(customBg, 0.15)}`,
                  position: 'relative',
                  overflow: 'hidden',
                  marginBottom: 6,
                }}>
                  <div style={{ position: 'absolute', top: 5, left: 5, width: '40%', height: 3, borderRadius: 2, background: lightenHexBlend(customBg, 0.7), opacity: 0.5 }} />
                  <div style={{ position: 'absolute', top: 11, left: 5, width: '60%', height: 3, borderRadius: 2, background: customAccent, opacity: 0.7 }} />
                </div>
                <span style={{ fontSize: '0.72rem', color: lightenHexBlend(customBg, 0.7), fontWeight: 600 }}>
                  {customName || 'Preview'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1, fontSize: '0.82rem', padding: '8px 12px', minHeight: 'unset' }}
                  onClick={() => setShowCreateCustom(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ flex: 1, fontSize: '0.82rem', padding: '8px 12px', minHeight: 'unset' }}
                  disabled={!customName.trim()}
                  onClick={() => {
                    const id = `${Date.now()}`;
                    const advanced = deriveAdvancedColors(customBg, customAccent);
                    const newPreset: SavedThemePreset = {
                      id,
                      name: customName.trim(),
                      themeColor: customBg,
                      accentColor: customAccent,
                      advancedColors: advanced,
                    };
                    const updated = [...customThemes, newPreset];
                    setCustomThemes(updated);
                    saveThemePresets(updated);
                    handleApply({ ...newPreset, id: `custom_${id}` });
                    setShowCreateCustom(false);
                    setCustomName('');
                  }}
                >
                  Create Theme
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowCreateCustom(true)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '4px 0',
              marginBottom: 18,
            }}
          >
            + Create your own theme
          </button>
        )}

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
