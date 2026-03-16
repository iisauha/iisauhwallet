import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { uid } from './storage';

export type ReminderFrequency = 'once' | 'daily' | 'weekly' | 'monthly' | 'every_x_days';

export type ReminderTarget =
  | { kind: 'tab'; tab: import('../App').TabKey }
  | { kind: 'card'; cardId: string; tab?: import('../App').TabKey }
  | { kind: 'custom'; href: string };

export type ReminderStatus = 'open' | 'resolved' | 'paused' | 'ignored';

export interface Reminder {
  id: string;
  title: string;
  notes?: string;
  status: ReminderStatus;
  startDate?: string; // YYYY-MM-DD
  frequency: ReminderFrequency;
  everyXDays?: number;
  cardId?: string;
  type?: 'general' | 'statement' | 'min_payment' | 'due_date' | 'balance_check';
  target?: ReminderTarget;
}

type ReminderContextValue = {
  reminders: Reminder[];
  setReminders: (next: Reminder[]) => void;
  addReminder: (r: Omit<Reminder, 'id' | 'status'>) => void;
  updateReminder: (id: string, updates: Partial<Reminder>) => void;
  deleteReminder: (id: string) => void;
};

const ReminderContext = createContext<ReminderContextValue | null>(null);

export function ReminderProvider({ children }: { children: React.ReactNode }) {
  const [reminders, setReminders] = useState<Reminder[]>([]);

  const addReminder = useCallback((r: Omit<Reminder, 'id' | 'status'>) => {
    setReminders((prev) => [...prev, { ...r, id: uid(), status: 'open' }]);
  }, []);

  const updateReminder = useCallback((id: string, updates: Partial<Reminder>) => {
    setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  }, []);

  const deleteReminder = useCallback((id: string) => {
    setReminders((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const value = useMemo(
    () => ({ reminders, setReminders, addReminder, updateReminder, deleteReminder }),
    [reminders, addReminder, updateReminder, deleteReminder]
  );

  return <ReminderContext.Provider value={value}>{children}</ReminderContext.Provider>;
}

export function useReminders(): ReminderContextValue {
  const ctx = useContext(ReminderContext);
  if (!ctx) throw new Error('useReminders must be used within ReminderProvider');
  return ctx;
}

