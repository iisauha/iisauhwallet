import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  loadAppThemeColor,
  saveAppThemeColor,
  loadAppAccentColor,
  saveAppAccentColor,
} from '../state/storage';
import { getThemeColorsFromHex, getAccentColorsFromHex, isLightHex } from './themeUtils';

type ThemeContextValue = {
  themeColor: string;
  setThemeColor: (hex: string) => void;
  accentColor: string;
  setAccentColor: (hex: string) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Derive all theme CSS variables from the user's chosen background color. */
function applyThemeColor(appBackgroundHex: string) {
  const root = document.documentElement.style;
  const derived = getThemeColorsFromHex(appBackgroundHex);
  root.setProperty('--bg', appBackgroundHex);
  // Sync browser chrome / status bar color so there's no dark strip on iOS Safari refresh
  try {
    const mt = document.querySelector('meta[name="theme-color"]');
    if (mt) mt.setAttribute('content', appBackgroundHex);
  } catch (_) {}
  root.setProperty('--bg-secondary', derived.bgSecondary);
  root.setProperty('--surface', derived.surface);
  root.setProperty('--surface-hover', derived.surfaceHover);
  root.setProperty('--border', derived.border);
  root.setProperty('--border-subtle', derived.borderSubtle);
  // For light backgrounds, use dark text/muted colors so inputs/text remain readable
  const isLight = isLightHex(appBackgroundHex);
  root.setProperty('--text', isLight ? '#111111' : derived.text);
  root.setProperty('--muted', isLight ? '#555555' : derived.muted);
  root.setProperty('--shadow', derived.shadow);
  root.setProperty('--shadow-strong', derived.shadowStrong);
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

  // Listen for remote theme sync — re-read from localStorage and update React state + CSS
  useEffect(() => {
    const handler = () => {
      const newTheme = loadAppThemeColor();
      const newAccent = loadAppAccentColor();
      if (newTheme !== themeColor) {
        setThemeColorState(newTheme);
        applyThemeColor(newTheme);
      }
      if (newAccent !== accentColor) {
        setAccentColorState(newAccent);
        applyAccentColor(newAccent);
      }
    };
    window.addEventListener('theme-sync', handler);
    return () => window.removeEventListener('theme-sync', handler);
  }, [themeColor, accentColor]);

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
