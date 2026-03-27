import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  loadAppThemeColor,
  saveAppThemeColor,
  loadAppAccentColor,
  saveAppAccentColor,
  DEFAULT_THEME_COLOR,
} from '../state/storage';
import { getThemeColorsFromHex, getAccentColorsFromHex } from './themeUtils';

type ThemeContextValue = {
  themeColor: string;
  setThemeColor: (hex: string) => void;
  accentColor: string;
  setAccentColor: (hex: string) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Returns true if the hex color is perceptually light (luminance > 0.5). */
function isLightHex(hex: string): boolean {
  try {
    const m = hex.slice(1).match(/.{2}/g);
    if (!m || m.length < 3) return false;
    const [r, g, b] = m.map((x) => parseInt(x, 16));
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
  } catch (_) { return false; }
}

/** App background only: --bg from user choice. All other theme vars from fixed default so surface colors stay independent. */
function applyThemeColor(appBackgroundHex: string) {
  const root = document.documentElement.style;
  const defaults = getThemeColorsFromHex(DEFAULT_THEME_COLOR);
  root.setProperty('--bg', appBackgroundHex);
  // Sync browser chrome / status bar color so there's no dark strip on iOS Safari refresh
  try {
    const mt = document.querySelector('meta[name="theme-color"]');
    if (mt) mt.setAttribute('content', appBackgroundHex);
  } catch (_) {}
  root.setProperty('--bg-secondary', defaults.bgSecondary);
  root.setProperty('--surface', defaults.surface);
  root.setProperty('--surface-hover', defaults.surfaceHover);
  root.setProperty('--border', defaults.border);
  root.setProperty('--border-subtle', defaults.borderSubtle);
  // For light backgrounds, use a dark text color so inputs/text remain readable
  root.setProperty('--text', isLightHex(appBackgroundHex) ? '#111111' : defaults.text);
  root.setProperty('--muted', defaults.muted);
  root.setProperty('--shadow', defaults.shadow);
  root.setProperty('--shadow-strong', defaults.shadowStrong);
}

function applyAccentColor(hex: string) {
  const colors = getAccentColorsFromHex(hex);
  document.documentElement.style.setProperty('--accent', colors.accent);
  document.documentElement.style.setProperty('--accent-hover', colors.accentHover);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeColor, setThemeColorState] = useState<string>(() => loadAppThemeColor());
  const [accentColor, setAccentColorState] = useState<string>(() => loadAppAccentColor());

  useEffect(() => {
    applyThemeColor(themeColor);
  }, [themeColor]);

  useEffect(() => {
    applyAccentColor(accentColor);
  }, [accentColor]);

  const setThemeColor = useCallback((hex: string) => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
    saveAppThemeColor(hex);
    setThemeColorState(hex);
    applyThemeColor(hex);
  }, []);

  const setAccentColor = useCallback((hex: string) => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
    saveAppAccentColor(hex);
    setAccentColorState(hex);
    applyAccentColor(hex);
  }, []);

  const value = useMemo(
    () => ({ themeColor, setThemeColor, accentColor, setAccentColor }),
    [themeColor, setThemeColor, accentColor, setAccentColor]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
