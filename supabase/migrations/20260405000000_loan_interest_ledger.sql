-- Private loans: synced from the client for server-side nightly interest accrual.
-- This is NOT the encrypted blob — it stores only the fields the accrual job needs.
-- RLS ensures each user can only access their own rows.

CREATE TABLE IF NOT EXISTS private_loans (
  id         TEXT        NOT NULL,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL DEFAULT '',
  balance_cents                  BIGINT  NOT NULL DEFAULT 0,
  interest_rate_percent          NUMERIC(7,4) NOT NULL DEFAULT 0,
  is_active                      BOOLEAN NOT NULL DEFAULT true,
  current_interest_balance_cents BIGINT  NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE private_loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own private loans"
  ON private_loans FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Daily interest ledger written by the nightly accrual job.
-- One row per loan per day. The closing_balance_cents of the previous day
-- becomes the opening_balance_cents of the next.

CREATE TABLE IF NOT EXISTS loan_interest_ledger (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id               TEXT        NOT NULL,
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date                  DATE        NOT NULL,
  opening_balance_cents BIGINT      NOT NULL,
  daily_interest_cents  BIGINT      NOT NULL,
  closing_balance_cents BIGINT      NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, loan_id, date)
);

ALTER TABLE loan_interest_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own ledger rows"
  ON loan_interest_ledger FOR SELECT
  USING (auth.uid() = user_id);

-- Index for the most common client query: latest ledger row per loan
CREATE INDEX idx_ledger_user_loan_date
  ON loan_interest_ledger (user_id, loan_id, date DESC);

-- ============================================================
-- pg_cron: invoke the Edge Function at midnight UTC every day.
-- Uses pg_net (Supabase HTTP extension) to call the function.
-- The service_role key is stored as a Supabase vault secret.
-- ============================================================

-- To install, run once from the SQL editor with superuser privileges:
--
--   SELECT cron.schedule(
--     'nightly-interest-accrual',        -- job name
--     '0 0 * * *',                       -- midnight UTC daily
--     $$
--     SELECT net.http_post(
--       url    := current_setting('app.settings.supabase_url') || '/functions/v1/nightly-interest-accrual',
--       headers := jsonb_build_object(
--         'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
--         'Content-Type',  'application/json'
--       ),
--       body   := '{}'::jsonb
--     );
--     $$
--   );
--
-- If app.settings are not configured, replace with literal values:
--
--   SELECT cron.schedule(
--     'nightly-interest-accrual',
--     '0 0 * * *',
--     $$
--     SELECT net.http_post(
--       url     := 'https://npubqtjjhqfgpxfwfhej.supabase.co/functions/v1/nightly-interest-accrual',
--       headers := jsonb_build_object(
--         'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
--         'Content-Type',  'application/json'
--       ),
--       body    := '{}'::jsonb
--     );
--     $$
--   );
