import { supabase } from './supabase';
import { releaseLoanFromCheck } from './loanWorkflowService';

// ── Column whitelist ──────────────────────────────────────────────────────────
// Only these fields are ever written to the DB.
// Prevents accidental injection of joined/computed fields.

const CHECKBOOK_COLUMNS = [
  'check_no', 'date', 'payee', 'amount',
  'purpose', 'bank', 'notes', 'status', 'created_by',
  'voucher_id',   // optional link to vouchers table (documentation only)
];

function sanitizeCheckbookPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([k, v]) => CHECKBOOK_COLUMNS.includes(k) && v !== '' && v !== undefined && v !== null
    )
  );
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getCheckbookEntries(filters = {}) {
  let query = supabase
    .from('checkbook')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.bank)   query = query.eq('bank',   filters.bank);

  const { data: entries, error } = await query;
  if (error) throw error;
  if (!entries || entries.length === 0) return [];

  // ── Optional join: attach linked voucher for display in detail modal ──────
  const voucherIds = [...new Set(entries.map(e => e.voucher_id).filter(Boolean))];
  if (voucherIds.length === 0) return entries;

  const { data: vouchers } = await supabase
    .from('vouchers')
    .select('id, voucher_no, payee, amount, status')
    .in('id', voucherIds);

  const voucherMap = Object.fromEntries((vouchers || []).map(v => [v.id, v]));
  return entries.map(e => ({
    ...e,
    vouchers: e.voucher_id ? (voucherMap[e.voucher_id] || null) : null,
  }));
}

export async function getCheckbookEntryById(id) {
  const { data, error } = await supabase
    .from('checkbook')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

// ── Create ────────────────────────────────────────────────────────────────────
// check_no is user-supplied — it comes from the physical bank checkbook.
// The DB UNIQUE constraint is the guard against duplicates.

export async function createCheckbookEntry(payload) {
  const clean = sanitizeCheckbookPayload(payload);
  const { data, error } = await supabase
    .from('checkbook')
    .insert(clean)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Update ────────────────────────────────────────────────────────────────────
// Only safe to call on issued entries. The page enforces this.
// check_no and status are stripped so they can never be overwritten via edit.

export async function updateCheckbookEntry(id, payload) {
  const clean = sanitizeCheckbookPayload(payload);
  delete clean.check_no;
  delete clean.status;

  const { data, error } = await supabase
    .from('checkbook')
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

export async function clearCheck(id) {
  const { data, error } = await supabase
    .from('checkbook')
    .update({ status: 'waiting_release' })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function releaseCheck(id, userId) {
  const check = await getCheckbookEntryById(id);
  await releaseLoanFromCheck(check, userId);

  const { data, error } = await supabase
    .from('checkbook')
    .update({ status: 'released' })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Soft delete — rows are never hard-deleted.
export async function voidCheck(id) {
  const { data, error } = await supabase
    .from('checkbook')
    .update({ status: 'voided' })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
