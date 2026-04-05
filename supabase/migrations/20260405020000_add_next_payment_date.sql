-- Add next_payment_date to loans table for subsidized interest gate.
-- Subsidized loans skip interest accrual until next_payment_date is reached.
ALTER TABLE loans ADD COLUMN IF NOT EXISTS next_payment_date TEXT;
