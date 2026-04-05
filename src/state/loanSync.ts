/**
 * Loan sync module — syncs private loan data to the `private_loans` table
 * so the nightly-interest-accrual Edge Function can compute daily interest.
 *
 * Also reads from `loan_interest_ledger` so the client can display
 * server-computed interest instead of the local accrual-anchor estimate.
 */

import { supabase } from './supabase';
import type { Loan } from './storage';

async function getAuthUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

// ─── Push: sync private loans to Supabase ────────────────────────

/**
 * Upsert all private loans to the `private_loans` table.
 * Called after every loan save so the nightly job has current data.
 * Only syncs the fields the accrual job needs — no sensitive notes/names leak beyond RLS.
 */
export async function syncPrivateLoansToSupabase(loans: Loan[]): Promise<void> {
  const userId = await getAuthUserId();
  if (!userId) return;

  const privateLoans = loans.filter((l) => l.category === 'private');

  // Upsert active loans
  if (privateLoans.length > 0) {
    const rows = privateLoans.map((l) => ({
      id: l.id,
      user_id: userId,
      name: l.name,
      balance_cents: l.balanceCents,
      interest_rate_percent: l.interestRatePercent,
      is_active: l.active !== false,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('private_loans')
      .upsert(rows, { onConflict: 'user_id,id' });

    if (error) console.error('[loanSync] upsert error:', error.message);
  }

  // Remove loans that no longer exist locally
  const localIds = new Set(privateLoans.map((l) => l.id));
  const { data: remote } = await supabase
    .from('private_loans')
    .select('id')
    .eq('user_id', userId);

  if (remote) {
    const toDelete = remote.filter((r) => !localIds.has(r.id)).map((r) => r.id);
    if (toDelete.length > 0) {
      await supabase
        .from('private_loans')
        .delete()
        .eq('user_id', userId)
        .in('id', toDelete);
    }
  }
}

// ─── Pull: read ledger data ──────────────────────────────────────

export type LedgerRow = {
  loan_id: string;
  date: string;
  opening_balance_cents: number;
  daily_interest_cents: number;
  closing_balance_cents: number;
};

/**
 * Fetch the most recent ledger row for each private loan belonging to this user.
 * Returns a map of loan_id → latest LedgerRow.
 */
export async function fetchLatestLedgerRows(): Promise<Record<string, LedgerRow>> {
  const userId = await getAuthUserId();
  if (!userId) return {};

  // Fetch the latest row per loan using distinct-on via order + limit pattern.
  // Supabase doesn't support DISTINCT ON directly, so we fetch recent rows
  // and deduplicate client-side (the index makes this fast).
  const { data, error } = await supabase
    .from('loan_interest_ledger')
    .select('loan_id, date, opening_balance_cents, daily_interest_cents, closing_balance_cents')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(200); // generous upper bound; one row per loan per day

  if (error || !data) {
    if (error) console.error('[loanSync] ledger fetch error:', error.message);
    return {};
  }

  // Keep only the latest row per loan_id
  const map: Record<string, LedgerRow> = {};
  for (const row of data) {
    if (!map[row.loan_id]) {
      map[row.loan_id] = row;
    }
  }
  return map;
}

/**
 * Fetch the full ledger history for a single loan (for charts / audit).
 */
export async function fetchLedgerForLoan(loanId: string): Promise<LedgerRow[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('loan_interest_ledger')
    .select('loan_id, date, opening_balance_cents, daily_interest_cents, closing_balance_cents')
    .eq('user_id', userId)
    .eq('loan_id', loanId)
    .order('date', { ascending: true });

  if (error) {
    console.error('[loanSync] ledger fetch error:', error.message);
    return [];
  }
  return data ?? [];
}
