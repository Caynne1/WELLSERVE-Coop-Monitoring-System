-- ============================================================
-- WELLServe — Transactions Fix (Final)
-- Run ALL of this at once in Supabase SQL Editor
-- ============================================================

-- 1. Drop the old category constraint (still has old values without 'time_deposit')
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_category_check;

-- 2. Recreate it with all existing values + 'time_deposit'
--    Existing data: cbu, loan, membership, penalty, savings — all included below.
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

-- 3. Drop the NOT NULL on member_id
--    (column-level attribute — does not appear as a named constraint)
--    Time deposits have no member record so member_id will be NULL.
ALTER TABLE public.transactions
  ALTER COLUMN member_id DROP NOT NULL;

-- 4. Verify — both fixes should now show
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM   pg_constraint
WHERE  conrelid = 'public.transactions'::regclass
ORDER  BY conname;

-- Also confirm member_id is now nullable
SELECT column_name, is_nullable, data_type
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'transactions'
  AND  column_name  = 'member_id';