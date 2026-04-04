import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  loadAppFontFamily,
  saveAppFontFamily,
  loadAppFontScale,
  saveAppFontScale,
} from '../state/storage';
import { getFontFamilyStack } from './fontStacks';

type AppearanceContextValue = {
  fontFamily: string;
  fontScale: number;
  setFontFamily: (key: string) => void;
  setFontScale: (value: number) => void;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const [fontFamily, setFontFamilyState] = useState<string>(() => loadAppFontFamily());
  const [fontScale, setFontScaleState] = useState<number>(() => loadAppFontScale());

  useEffect(() => {
    document.documentElement.style.setProperty('--app-font-family', getFontFamilyStack(fontFamily));
    document.documentElement.style.setProperty('--app-font-scale', String(fontScale));
  }, [fontFamily, fontScale]);

  const setFontFamily = useCallback((key: string) => {
    saveAppFontFamily(key);
    setFontFamilyState(key);
    document.documentElement.style.setProperty('--app-font-family', getFontFamilyStack(key));
  }, []);

  const setFontScale = useCallback((value: number) => {
    saveAppFontScale(value);
    setFontScaleState(value);
    document.documentElement.style.setProperty('--app-font-scale', String(value));
  }, []);

  // Listen for remote theme sync — re-read font settings from localStorage
  useEffect(() => {
    const handler = () => {
      const newFamily = loadAppFontFamily();
      const newScale = loadAppFontScale();
      if (newFamily !== fontFamily) {
        setFontFamilyState(newFamily);
        document.documentElement.style.setProperty('--app-font-family', getFontFamilyStack(newFamily));
      }
      if (newScale !== fontScale) {
        setFontScaleState(newScale);
        document.documentElement.style.setProperty('--app-font-scale', String(newScale));
      }
    };
    window.addEventListener('theme-sync', handler);
    return () => window.removeEventListener('theme-sync', handler);
  }, [fontFamily, fontScale]);

  const value = useMemo(
    () => ({ fontFamily, fontScale, setFontFamily, setFontScale }),
    [fontFamily, fontScale, setFontFamily, setFontScale]
  );

  return (
    <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error('useAppearance must be used within AppearanceProvider');
  return ctx;
}
