/**
 * Nightly interest accrual Edge Function.
 *
 * Runs once per day (midnight UTC via pg_cron). For every active private loan:
 *   1. Reads the current balance from private_loans
 *   2. Computes daily_interest_cents = Math.floor(balance × rate / 100 / 365)
 *   3. Writes a new loan_interest_ledger row
 *   4. Updates private_loans.balance_cents += daily_interest_cents
 *
 * Uses the service role key so it bypasses RLS and can process all users.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  // Only allow POST (from pg_cron) or manual invocation with service role
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.includes(SERVICE_ROLE_KEY)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // 1. Fetch all active private loans across all users
  const { data: loans, error: fetchErr } = await supabase
    .from('private_loans')
    .select('id, user_id, balance_cents, interest_rate_percent')
    .eq('is_active', true)
    .gt('balance_cents', 0);

  if (fetchErr) {
    return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 });
  }
  if (!loans || loans.length === 0) {
    return new Response(JSON.stringify({ processed: 0, message: 'No active loans' }));
  }

  // 2. Process each loan
  const ledgerRows: Array<{
    loan_id: string;
    user_id: string;
    date: string;
    opening_balance_cents: number;
    daily_interest_cents: number;
    closing_balance_cents: number;
  }> = [];
  const balanceUpdates: Array<{ user_id: string; id: string; new_balance: number }> = [];

  for (const loan of loans) {
    const openingBalance = loan.balance_cents;
    const rate = Number(loan.interest_rate_percent);

    // Match the client formula: Math.floor(balance × rate / 100 / 365)
    const dailyInterest = Math.floor(openingBalance * (rate / 100) / 365);
    const closingBalance = openingBalance + dailyInterest;

    ledgerRows.push({
      loan_id: loan.id,
      user_id: loan.user_id,
      date: today,
      opening_balance_cents: openingBalance,
      daily_interest_cents: dailyInterest,
      closing_balance_cents: closingBalance,
    });

    balanceUpdates.push({
      user_id: loan.user_id,
      id: loan.id,
      new_balance: closingBalance,
    });
  }

  // 3. Batch-insert ledger rows (skip duplicates if re-run on same day)
  const { error: ledgerErr } = await supabase
    .from('loan_interest_ledger')
    .upsert(ledgerRows, { onConflict: 'user_id,loan_id,date' });

  if (ledgerErr) {
    return new Response(JSON.stringify({ error: `Ledger insert: ${ledgerErr.message}` }), { status: 500 });
  }

  // 4. Update each loan's balance
  let updateErrors = 0;
  for (const upd of balanceUpdates) {
    const { error } = await supabase
      .from('private_loans')
      .update({ balance_cents: upd.new_balance, updated_at: new Date().toISOString() })
      .eq('user_id', upd.user_id)
      .eq('id', upd.id);
    if (error) updateErrors++;
  }

  return new Response(
    JSON.stringify({
      processed: ledgerRows.length,
      update_errors: updateErrors,
      date: today,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
