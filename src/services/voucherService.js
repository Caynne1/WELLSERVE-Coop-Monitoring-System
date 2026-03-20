import { supabase } from './supabase';

// ── Column whitelist ──────────────────────────────────────────────────────────
// Only these fields are ever written to the DB.
// Prevents accidental injection of joined/computed fields.

const VOUCHER_COLUMNS = [
  'voucher_no', 'date', 'payee', 'purpose',
  'amount', 'notes', 'status', 'created_by',
  'expense_id',   // optional link to expenses table (documentation only)
];

function sanitizeVoucherPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([k, v]) => VOUCHER_COLUMNS.includes(k) && v !== '' && v !== undefined && v !== null
    )
  );
}

// ── Voucher number generation ─────────────────────────────────────────────────
// Format: VCH-YYYY-NNN
// Counts all vouchers for the current year and increments by 1.
// Not guaranteed to be gap-free (voided records still count),
// which is correct behaviour for an audit trail.

async function generateVoucherNo() {
  const year = new Date().getFullYear();
  const prefix = `VCH-${year}-`;

  const { count, error } = await supabase
    .from('vouchers')
    .select('*', { count: 'exact', head: true })
    .like('voucher_no', `${prefix}%`);

  if (error) throw error;

  const next = String((count || 0) + 1).padStart(3, '0');
  return `${prefix}${next}`;
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getVouchers(filters = {}) {
  let query = supabase
    .from('vouchers')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);

  const { data: vouchers, error } = await query;
  if (error) throw error;
  if (!vouchers || vouchers.length === 0) return [];

  // ── Optional join: attach linked expense for display in detail modal ──────
  const expenseIds = [...new Set(vouchers.map(v => v.expense_id).filter(Boolean))];
  if (expenseIds.length === 0) return vouchers;

  const { data: expenses } = await supabase
    .from('expenses')
    .select('id, description, date, amount')
    .in('id', expenseIds);

  const expenseMap = Object.fromEntries((expenses || []).map(e => [e.id, e]));
  return vouchers.map(v => ({
    ...v,
    expenses: v.expense_id ? (expenseMap[v.expense_id] || null) : null,
  }));
}

export async function getVoucherById(id) {
  const { data, error } = await supabase
    .from('vouchers')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

// ── Create ────────────────────────────────────────────────────────────────────
// voucher_no is always auto-generated — callers must not pass it in.

export async function createVoucher(payload) {
  const voucher_no = await generateVoucherNo();
  const clean = sanitizeVoucherPayload({ ...payload, voucher_no });
  const { data, error } = await supabase
    .from('vouchers')
    .insert(clean)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Update ────────────────────────────────────────────────────────────────────
// Only safe to call on draft vouchers. The page enforces this;
// voucher_no is excluded from the whitelist so it can never be overwritten.

export async function updateVoucher(id, payload) {
  const clean = sanitizeVoucherPayload(payload);
  // Extra guard: never allow voucher_no or status to be changed via update
  delete clean.voucher_no;
  delete clean.status;

  const { data, error } = await supabase
    .from('vouchers')
    .update(clean)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Status transitions ────────────────────────────────────────────────────────
// Each function handles exactly one transition.
// The DB check constraint is the final guard.

export async function approveVoucher(id) {
  const { data, error } = await supabase
    .from('vouchers')
    .update({ status: 'approved' })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Soft delete — rows are never hard-deleted.
export async function voidVoucher(id) {
  const { data, error } = await supabase
    .from('vouchers')
    .update({ status: 'voided' })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}