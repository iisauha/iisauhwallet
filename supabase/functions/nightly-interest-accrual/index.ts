/**
 * Nightly interest accrual Edge Function.
 *
 * Runs once per day (midnight UTC via pg_cron). Processes all active loans:
 *
 * Private loans:
 *   dailyInterest = Math.round(balance × rate / 100 / 365)
 *   balance += dailyInterest
 *   currentInterestBalance += dailyInterest
 *
 * Public unsubsidized loans:
 *   Per-disbursement: dailyInterest = sum(Math.round(d.amountCents × rate / 100 / 365))
 *   balance unchanged (principal stays fixed until capitalization at repayment start)
 *   currentInterestBalance += dailyInterest
 *
 * Public subsidized loans:
 *   Skipped entirely while in school (government covers interest)
 *
 * Uses the service role key so it bypasses RLS and can process all users.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.includes(SERVICE_ROLE_KEY)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const today = new Date().toISOString().slice(0, 10);

  // 1. Fetch all active loans across all users
  const { data: loans, error: fetchErr } = await supabase
    .from('loans')
    .select('id, user_id, balance_cents, interest_rate_percent, current_interest_balance_cents, category, subsidy_type, disbursements, next_payment_date')
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
  const updates: Array<{ user_id: string; id: string; new_balance: number; new_interest: number }> = [];

  for (const loan of loans) {
    const balance = loan.balance_cents;
    const rate = Number(loan.interest_rate_percent);
    const currentInterest = loan.current_interest_balance_cents ?? 0;
    const category = loan.category ?? 'private';
    const subsidyType = loan.subsidy_type;

    // Public subsidized: skip while pre-repayment (government covers interest in school/grace).
    // Once nextPaymentDate is reached, subsidized loans accrue interest normally.
    if (category === 'public' && subsidyType === 'subsidized') {
      const nextPayment = loan.next_payment_date;
      if (!nextPayment || today < nextPayment) continue; // still in school/grace
    }

    let dailyInterest: number;

    if (category === 'public' && subsidyType === 'unsubsidized') {
      // Public unsubsidized: per-disbursement accrual
      const disbursements: Array<{ date: string; amountCents: number }> =
        typeof loan.disbursements === 'string' ? JSON.parse(loan.disbursements) : (loan.disbursements ?? []);
      dailyInterest = 0;
      for (const d of disbursements) {
        dailyInterest += Math.round(d.amountCents * (rate / 100) / 365);
      }
    } else {
      // Private: whole-balance accrual (AES nightly convention: Math.round)
      dailyInterest = Math.round(balance * (rate / 100) / 365);
    }

    if (dailyInterest <= 0) continue;

    // For private: interest adds to balance (interest capitalizes daily)
    // For public unsub: interest adds to outstanding interest only (principal stays fixed)
    const newBalance = category === 'private' ? balance + dailyInterest : balance;
    const newInterest = currentInterest + dailyInterest;

    ledgerRows.push({
      loan_id: loan.id,
      user_id: loan.user_id,
      date: today,
      opening_balance_cents: balance,
      daily_interest_cents: dailyInterest,
      closing_balance_cents: newBalance,
    });

    updates.push({ user_id: loan.user_id, id: loan.id, new_balance: newBalance, new_interest: newInterest });
  }

  // 3. Batch-insert ledger rows (skip duplicates if re-run on same day)
  if (ledgerRows.length > 0) {
    const { error: ledgerErr } = await supabase
      .from('loan_interest_ledger')
      .upsert(ledgerRows, { onConflict: 'user_id,loan_id,date' });

    if (ledgerErr) {
      return new Response(JSON.stringify({ error: `Ledger insert: ${ledgerErr.message}` }), { status: 500 });
    }
  }

  // 4. Update each loan
  let updateErrors = 0;
  for (const upd of updates) {
    const { error } = await supabase
      .from('loans')
      .update({
        balance_cents: upd.new_balance,
        current_interest_balance_cents: upd.new_interest,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', upd.user_id)
      .eq('id', upd.id);
    if (error) updateErrors++;
  }

  return new Response(
    JSON.stringify({ processed: ledgerRows.length, update_errors: updateErrors, date: today }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
