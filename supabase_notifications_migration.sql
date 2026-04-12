-- ============================================================
-- WELLSERVE Notification System — Supabase Migration
-- Run this in your Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT        NOT NULL,
  message         TEXT        NOT NULL,
  type            TEXT        NOT NULL DEFAULT 'info'
                    CHECK (type IN ('info', 'warning', 'error', 'success')),
  category        TEXT        NOT NULL DEFAULT 'general'
                    CHECK (category IN ('payment', 'loan', 'cash_flow', 'due_date', 'missed_payment', 'general')),
  reference_id    UUID,
  reference_type  TEXT,        -- 'loan' | 'transaction' | 'fund_transaction'
  is_read         BOOLEAN     NOT NULL DEFAULT FALSE,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast unread queries
CREATE INDEX IF NOT EXISTS notifications_is_read_idx
  ON public.notifications (is_read);

-- Index for reference lookups (de-dup daily alerts)
CREATE INDEX IF NOT EXISTS notifications_reference_idx
  ON public.notifications (reference_id, category);

-- Index for date ordering
CREATE INDEX IF NOT EXISTS notifications_created_at_idx
  ON public.notifications (created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policy: allow authenticated users to read all notifications
CREATE POLICY "Allow authenticated read"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (TRUE);

-- Policy: allow authenticated users to insert notifications
CREATE POLICY "Allow authenticated insert"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (TRUE);

-- Policy: allow authenticated users to update notifications (mark read/unread)
CREATE POLICY "Allow authenticated update"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (TRUE);

-- Policy: allow authenticated users to delete their notifications
CREATE POLICY "Allow authenticated delete"
  ON public.notifications
  FOR DELETE
  TO authenticated
  USING (TRUE);

-- Enable Realtime for live push updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
