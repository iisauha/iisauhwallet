import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  loadAdvancedUIColors,
  saveAdvancedUIColors,
  type AdvancedUIColors,
} from '../state/storage';

const UI_VAR_KEYS: Record<keyof AdvancedUIColors, string> = {
  cardBg: '--ui-card-bg',
  surfaceSecondary: '--ui-surface-secondary',
  sectionBg: '--ui-section-bg',
  modalBg: '--ui-modal-bg',
  dropdownBg: '--ui-dropdown-bg',
  tabBarBg: '--ui-tabbar-bg',
  border: '--ui-border',
  muted: '--ui-muted',
};

type AdvancedUIColorsContextValue = {
  colors: AdvancedUIColors;
  setColor: (key: keyof AdvancedUIColors, value: string) => void;
  clearColor: (key: keyof AdvancedUIColors) => void;
};

const AdvancedUIColorsContext = createContext<AdvancedUIColorsContextValue | null>(null);

function applyAdvancedUIColors(colors: AdvancedUIColors) {
  const root = document.documentElement.style;
  (Object.keys(UI_VAR_KEYS) as (keyof AdvancedUIColors)[]).forEach((key) => {
    const varName = UI_VAR_KEYS[key];
    const value = colors[key];
    if (value != null && value.trim() !== '') {
      root.setProperty(varName, value.trim());
    } else {
      root.removeProperty(varName);
    }
  });
}

export function AdvancedUIColorsProvider({ children }: { children: ReactNode }) {
  const [colors, setColorsState] = useState<AdvancedUIColors>(() => loadAdvancedUIColors());

  useEffect(() => {
    applyAdvancedUIColors(colors);
  }, [colors]);

  const setColor = useCallback((key: keyof AdvancedUIColors, value: string) => {
    const hex = value.trim();
    if (!hex) {
      setColorsState((prev) => {
        const next = { ...prev };
        delete next[key];
        saveAdvancedUIColors(next);
        return next;
      });
      return;
    }
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
    setColorsState((prev) => {
      const next = { ...prev, [key]: hex };
      saveAdvancedUIColors(next);
      return next;
    });
  }, []);

  const clearColor = useCallback((key: keyof AdvancedUIColors) => {
    setColorsState((prev) => {
      const next = { ...prev };
      delete next[key];
      saveAdvancedUIColors(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ colors, setColor, clearColor }),
    [colors, setColor, clearColor]
  );

  return (
    <AdvancedUIColorsContext.Provider value={value}>
      {children}
    </AdvancedUIColorsContext.Provider>
  );
}

export function useAdvancedUIColors(): AdvancedUIColorsContextValue | null {
  return useContext(AdvancedUIColorsContext);
}
