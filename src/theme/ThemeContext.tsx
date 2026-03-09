import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadAppTheme, saveAppTheme } from '../state/storage';
import type { ThemeId } from './themes';

type ThemeContextValue = { theme: ThemeId; setTheme: (id: ThemeId) => void };

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => loadAppTheme() as ThemeId);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = useCallback((id: ThemeId) => {
    setThemeState(id);
    saveAppTheme(id);
    document.documentElement.dataset.theme = id;
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
