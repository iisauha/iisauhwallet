import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { loadDropdownState, saveDropdownState } from './storage';

const DEBUG = false;

export type DropdownState = Record<string, boolean>;

type DropdownStateContextValue = {
  getDropdownOpen: (id: string, defaultOpen: boolean) => boolean;
  setDropdownOpen: (id: string, open: boolean) => void;
  getDropdownCollapsed: (id: string, defaultCollapsed: boolean) => boolean;
  setDropdownCollapsed: (id: string, collapsed: boolean) => void;
};

const DropdownStateContext = createContext<DropdownStateContextValue | null>(null);

export function DropdownStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DropdownState>(() => {
    const loaded = loadDropdownState();
    if (DEBUG) console.log('[DropdownState] load on mount', loaded);
    return loaded;
  });

  const setDropdownOpen = useCallback((id: string, open: boolean) => {
    if (DEBUG) console.log('[DropdownState] setDropdownOpen', id, open);
    setState((prev) => {
      const next = { ...prev, [id]: open };
      saveDropdownState(id, open);
      return next;
    });
  }, []);

  const getDropdownOpen = useCallback(
    (id: string, defaultOpen: boolean): boolean => {
      const value = state[id] !== undefined ? state[id] : defaultOpen;
      if (DEBUG) console.log('[DropdownState] getDropdownOpen', id, 'default', defaultOpen, '->', value);
      return value;
    },
    [state]
  );

  const getDropdownCollapsed = useCallback(
    (id: string, defaultCollapsed: boolean): boolean => {
      const open = getDropdownOpen(id, !defaultCollapsed);
      return !open;
    },
    [getDropdownOpen]
  );

  const setDropdownCollapsed = useCallback(
    (id: string, collapsed: boolean) => {
      setDropdownOpen(id, !collapsed);
    },
    [setDropdownOpen]
  );

  const value = useMemo(
    () => ({
      getDropdownOpen,
      setDropdownOpen,
      getDropdownCollapsed,
      setDropdownCollapsed
    }),
    [getDropdownOpen, setDropdownOpen, getDropdownCollapsed, setDropdownCollapsed]
  );

  return (
    <DropdownStateContext.Provider value={value}>
      {children}
    </DropdownStateContext.Provider>
  );
}

export function useDropdownState() {
  const ctx = useContext(DropdownStateContext);
  if (!ctx) throw new Error('useDropdownState must be used within DropdownStateProvider');
  return ctx;
}

export function useDropdownCollapsed(id: string, defaultCollapsed: boolean): [boolean, (collapsed: boolean) => void] {
  const { getDropdownCollapsed, setDropdownCollapsed } = useDropdownState();
  const collapsed = getDropdownCollapsed(id, defaultCollapsed);
  const setCollapsed = useCallback(
    (val: boolean) => {
      setDropdownCollapsed(id, val);
    },
    [id, setDropdownCollapsed]
  );
  return [collapsed, setCollapsed];
}
