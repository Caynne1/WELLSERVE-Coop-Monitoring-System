-- ============================================================
-- WELLServe — Time Deposit Integration Migration
-- Run this in your Supabase SQL Editor (Settings → SQL Editor)
-- ============================================================

-- ── 1. invoices: add 'time_deposit' to the payment_type check constraint ──────

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_payment_type_check;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_payment_type_check
  CHECK (payment_type IN (
    'loan_payment',
    'cbu',
    'savings',
    'membership',
    'capital',
    'penalty',
    'others',
    'time_deposit'
  ));


-- ── 2. transactions: add 'time_deposit' to the category check constraint ──────
--
-- All existing categories used across the app are preserved.
-- 'time_deposit' is the only new value added.

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_category_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_category_check
  CHECK (category IN (
    'cbu',
    'savings',
    'loan',
    'membership',
    'penalty',
    'others',
    'time_deposit'
  ));


-- ── 3. transactions: make member_id nullable ──────────────────────────────────
--
-- Time deposits are registered by name (no linked member record).
-- CBU, Savings, and Loan transactions always supply a member_id — unaffected.

ALTER TABLE public.transactions
  ALTER COLUMN member_id DROP NOT NULL;


-- ── 4. Clean up duplicate records from failed test attempts ─────────────────
--
-- If you submitted the same application multiple times during testing,
-- run these to inspect and clean up. Adjust the SI# / name as needed.

-- See duplicate time_deposit records:
-- SELECT id, name, amount, date_applied, created_at
-- FROM public.time_deposits
-- ORDER BY name, created_at;

-- Delete duplicate time_deposit records (keep only the latest per name+date):
-- DELETE FROM public.time_deposits
-- WHERE id NOT IN (
--   SELECT DISTINCT ON (name, date_applied) id
--   FROM public.time_deposits
--   ORDER BY name, date_applied, created_at DESC
-- );

-- See all time_deposit invoices (to check for duplicates):
-- SELECT id, invoice_no, payee, amount, date, created_at
-- FROM public.invoices
-- WHERE payment_type = 'time_deposit'
-- ORDER BY created_at DESC;

-- Delete a specific duplicate invoice by SI# (replace 'TD-...' with actual SI#):
-- DELETE FROM public.invoices
-- WHERE invoice_no = 'TD-REPLACE-WITH-YOUR-SI'
--   AND payment_type = 'time_deposit'
--   AND id NOT IN (
--     SELECT MIN(id) FROM public.invoices
--     WHERE invoice_no = 'TD-REPLACE-WITH-YOUR-SI'
--   );


-- ── Done ─────────────────────────────────────────────────────────────────────
-- After running this, test:
--   1. Submit a New Time Deposit Application with a fresh SI# → check Invoice
--      page and Account Monitoring (Coop Fund) for the cash_in entry.
--   2. Record a Payment on an Active deposit with a fresh SI# → same checks.
--   3. Confirm Transactions page shows the entry as a green inflow (Deposit).