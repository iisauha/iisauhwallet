import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadAppTheme, saveAppTheme, loadAppAccentCustom, saveAppAccentCustom } from '../state/storage';
import { lightenHex } from './themeUtils';
import type { ThemeId } from './themes';

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
  customAccentHex: string;
  setCustomAccent: (hex: string) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyCustomAccent(hex: string) {
  document.documentElement.style.setProperty('--accent', hex);
  document.documentElement.style.setProperty('--accent-hover', lightenHex(hex, 1.25));
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => loadAppTheme() as ThemeId);
  const [customAccentHex, setCustomAccentHexState] = useState<string>(() => loadAppAccentCustom());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (theme === 'custom') {
      applyCustomAccent(customAccentHex);
    } else {
      document.documentElement.style.removeProperty('--accent');
      document.documentElement.style.removeProperty('--accent-hover');
    }
  }, [theme, customAccentHex]);

  const setTheme = useCallback((id: ThemeId) => {
    setThemeState(id);
    saveAppTheme(id);
    document.documentElement.dataset.theme = id;
    if (id === 'custom') applyCustomAccent(loadAppAccentCustom());
  }, []);

  const setCustomAccent = useCallback((hex: string) => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
    saveAppAccentCustom(hex);
    setCustomAccentHexState(hex);
    if (theme === 'custom') applyCustomAccent(hex);
  }, [theme]);

  const value = useMemo(
    () => ({ theme, setTheme, customAccentHex, setCustomAccent }),
    [theme, setTheme, customAccentHex, setCustomAccent]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
