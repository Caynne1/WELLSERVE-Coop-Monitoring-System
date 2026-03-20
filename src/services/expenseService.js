import { supabase } from './supabase';

// ── Column whitelist ──────────────────────────────────────────────────────────
// Only these fields are ever written to the DB.
// Prevents accidental injection of joined/computed fields.

const EXPENSE_COLUMNS = [
  'date', 'description', 'category', 'amount',
  'payee', 'notes', 'status', 'created_by',
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
  return data || [];
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