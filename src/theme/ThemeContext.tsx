import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  loadAppThemeColor,
  saveAppThemeColor,
  loadAppAccentColor,
  saveAppAccentColor,
} from '../state/storage';
import { getThemeColorsFromHex, getAccentColorsFromHex } from './themeUtils';

type ThemeContextValue = {
  themeColor: string;
  setThemeColor: (hex: string) => void;
  accentColor: string;
  setAccentColor: (hex: string) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyThemeColor(hex: string) {
  const colors = getThemeColorsFromHex(hex);
  const root = document.documentElement.style;
  root.setProperty('--bg', colors.bg);
  root.setProperty('--bg-secondary', colors.bgSecondary);
  root.setProperty('--surface', colors.surface);
  root.setProperty('--surface-hover', colors.surfaceHover);
  root.setProperty('--border', colors.border);
  root.setProperty('--border-subtle', colors.borderSubtle);
  root.setProperty('--text', colors.text);
  root.setProperty('--muted', colors.muted);
  root.setProperty('--shadow', colors.shadow);
  root.setProperty('--shadow-strong', colors.shadowStrong);
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
