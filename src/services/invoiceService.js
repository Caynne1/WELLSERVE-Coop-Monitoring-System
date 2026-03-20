import { supabase } from './supabase';

// ── Column whitelist ──────────────────────────────────────────────────────────
// Only these fields are ever written to the DB.
// Prevents accidental injection of joined/computed fields.

const INVOICE_COLUMNS = [
  'invoice_no', 'date', 'due_date', 'payee', 'purpose',
  'amount', 'notes', 'status', 'created_by',
  'member_id',    // optional link to members table (documentation only)
];

function sanitizeInvoicePayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([k, v]) => INVOICE_COLUMNS.includes(k) && v !== '' && v !== undefined && v !== null
    )
  );
}

// ── Invoice number generation ─────────────────────────────────────────────────
// Format: INV-YYYY-NNN
// Counts all invoices for the current year and increments by 1.
// Not guaranteed to be gap-free (voided records still count),
// which is correct behaviour for an audit trail.

async function generateInvoiceNo() {
  const year   = new Date().getFullYear();
  const prefix = `INV-${year}-`;

  const { count, error } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .like('invoice_no', `${prefix}%`);

  if (error) throw error;

  const next = String((count || 0) + 1).padStart(3, '0');
  return `${prefix}${next}`;
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getInvoices(filters = {}) {
  let query = supabase
    .from('invoices')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);

  const { data: invoices, error } = await query;
  if (error) throw error;
  if (!invoices || invoices.length === 0) return [];

  // ── Optional join: attach linked member for display in detail modal ───────
  const memberIds = [...new Set(invoices.map(inv => inv.member_id).filter(Boolean))];
  if (memberIds.length === 0) return invoices;

  const { data: members } = await supabase
    .from('members')
    .select('id, first_name, last_name, member_no')
    .in('id', memberIds);

  const memberMap = Object.fromEntries((members || []).map(m => [m.id, m]));
  return invoices.map(inv => ({
    ...inv,
    members: inv.member_id ? (memberMap[inv.member_id] || null) : null,
  }));
}

export async function getInvoiceById(id) {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

// ── Create ────────────────────────────────────────────────────────────────────
// invoice_no is always auto-generated — callers must not pass it in.

export async function createInvoice(payload) {
  const invoice_no = await generateInvoiceNo();
  const clean = sanitizeInvoicePayload({ ...payload, invoice_no });
  const { data, error } = await supabase
    .from('invoices')
    .insert(clean)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Update ────────────────────────────────────────────────────────────────────
// Only safe to call on unpaid invoices. The page enforces this.
// invoice_no and status are stripped so they can never be overwritten via edit.

export async function updateInvoice(id, payload) {
  const clean = sanitizeInvoicePayload(payload);
  delete clean.invoice_no;
  delete clean.status;

  const { data, error } = await supabase
    .from('invoices')
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

export async function markInvoicePaid(id) {
  const { data, error } = await supabase
    .from('invoices')
    .update({ status: 'paid' })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Soft delete — rows are never hard-deleted.
export async function voidInvoice(id) {
  const { data, error } = await supabase
    .from('invoices')
    .update({ status: 'voided' })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}