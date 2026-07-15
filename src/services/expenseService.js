import { supabase } from './supabase';
import { getImportedHistoricalRows, mapHistoricalExpense } from './historicalMigrationRecordService';

// ── Column whitelist ──────────────────────────────────────────────────────────
// Only these fields are ever written to the DB.
// Prevents accidental injection of joined/computed fields.

const EXPENSE_COLUMNS = [
  'date', 'description', 'category', 'category_other', 'amount',
  'payee', 'notes', 'status', 'created_by',
  'approved_by', 'approved_at', 'voucher_id', 'voucher_no',
];

function sanitizeExpensePayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([k, v]) => EXPENSE_COLUMNS.includes(k) && v !== '' && v !== undefined && v !== null
    )
  );
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getExpenses(filters = {}) {
  let query = supabase
    .from('expenses')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters.category) query = query.eq('category', filters.category);
  if (filters.status)   query = query.eq('status',   filters.status);

  const { data, error } = await query;
  if (error) throw error;

  const expenses = data || [];
  if (filters.status && filters.status !== 'historical') return expenses;

  const historicalRows = await getImportedHistoricalRows('Expenses', { flowType: 'cash_out' });
  const historicalExpenses = historicalRows.map(mapHistoricalExpense);

  return [...expenses, ...historicalExpenses]
    .sort((a, b) => new Date(b.date || b.created_at || 0) - new Date(a.date || a.created_at || 0));
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createExpense(payload) {
  const clean = sanitizeExpensePayload(payload);
  const { data, error } = await supabase
    .from('expenses')
    .insert(clean)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateExpense(id, payload) {
  const clean = sanitizeExpensePayload(payload);
  const { data, error } = await supabase
    .from('expenses')
    .update(clean)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Soft delete (void) ────────────────────────────────────────────────────────
// Rows are never hard-deleted. Voiding sets status = 'voided'.
// The DB check constraint ensures only valid statuses are written.

export async function voidExpense(id) {
  const { data, error } = await supabase
    .from('expenses')
    .update({ status: 'voided' })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Approval workflow ─────────────────────────────────────────────────────────
// Expenses must go through 'pending' → 'approved' before a voucher can be
// created for them. approveExpense() only flips the status/audit fields;
// the caller (ExpensesPage) is responsible for creating the linked voucher
// and then calling linkExpenseVoucher() to stamp the reference back on.

export async function approveExpense(id, approvedBy) {
  const { data, error } = await supabase
    .from('expenses')
    .update({
      status: 'approved',
      approved_by: approvedBy ?? null,
      approved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Stamps the auto-created voucher's id/number back onto the expense row so
// the Expenses table can show a "Voucher" reference without an extra join.
export async function linkExpenseVoucher(id, voucherId, voucherNo) {
  const { data, error } = await supabase
    .from('expenses')
    .update({ voucher_id: voucherId, voucher_no: voucherNo })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
