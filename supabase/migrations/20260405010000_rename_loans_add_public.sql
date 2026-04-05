-- Rename private_loans to loans and add columns for public loan support.
-- Public loans are now individual records (not a single summary) matching private loan structure.

ALTER TABLE private_loans RENAME TO loans;

-- Add category so the table can hold both public and private loans
ALTER TABLE loans ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'private';

-- Public-specific fields
ALTER TABLE loans ADD COLUMN IF NOT EXISTS subsidy_type TEXT;       -- 'subsidized' | 'unsubsidized'
ALTER TABLE loans ADD COLUMN IF NOT EXISTS disbursements JSONB;     -- [{ date, amountCents }] for per-disbursement interest

-- Update RLS policy name to reflect the renamed table
ALTER POLICY "Users can manage their own private loans" ON loans RENAME TO "Users can manage their own loans";
