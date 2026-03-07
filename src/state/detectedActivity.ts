/**
 * Mock/prototype "Detected Activity" inbox only.
 * No Plaid or real API; UI-only for testing the feature.
 */

import { DETECTED_ACTIVITY_KEY } from './keys';

export type DetectedActivityStatus = 'new' | 'in_progress' | 'resolved' | 'ignored';

export type DetectedActivityItem = {
  id: string;
  title: string;
  amountCents: number;
  dateISO: string;
  accountName: string;
  accountType: string;
  pending: boolean;
  status: DetectedActivityStatus;
};

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function seedMockItems(): DetectedActivityItem[] {
  const today = new Date().toISOString().slice(0, 10);
  return [
    {
      id: uid(),
      title: 'Starbucks',
      amountCents: 862,
      dateISO: today,
      accountName: 'Amex Delta Gold',
      accountType: 'credit_card',
      pending: true,
      status: 'new'
    },
    {
      id: uid(),
      title: 'Venmo transfer',
      amountCents: 6000,
      dateISO: today,
      accountName: 'Chase Checking',
      accountType: 'checking',
      pending: true,
      status: 'new'
    },
    {
      id: uid(),
      title: 'Utilities',
      amountCents: 12431,
      dateISO: today,
      accountName: 'Chase Checking',
      accountType: 'checking',
      pending: false,
      status: 'new'
    },
    {
      id: uid(),
      title: 'Transfer to HYSA',
      amountCents: 50000,
      dateISO: today,
      accountName: 'Chase Checking',
      accountType: 'checking',
      pending: true,
      status: 'new'
    }
  ];
}

export function loadDetectedActivity(): DetectedActivityItem[] {
  try {
    const raw = localStorage.getItem(DETECTED_ACTIVITY_KEY);
    if (!raw) {
      const seeded = seedMockItems();
      saveDetectedActivity(seeded);
      return seeded;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return seedMockItems();
    return parsed as DetectedActivityItem[];
  } catch {
    return seedMockItems();
  }
}

export function saveDetectedActivity(items: DetectedActivityItem[]): void {
  try {
    localStorage.setItem(DETECTED_ACTIVITY_KEY, JSON.stringify(items));
  } catch (_) {}
}

export function getActiveDetectedCount(items: DetectedActivityItem[]): number {
  return items.filter((i) => i.status === 'new' || i.status === 'in_progress').length;
}
