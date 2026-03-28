import { supabase } from './supabase';

// ── Column whitelist ──────────────────────────────────────────────────────────
// Only these fields are ever written to the DB.
// payment_type, ref_id, account_id, fund_added added to support auto-invoice
// creation from payment flows (loan, cbu, savings, membership).

const INVOICE_COLUMNS = [
  'invoice_no', 'date', 'due_date', 'payee', 'purpose',
  'amount', 'notes', 'status', 'created_by',
  'member_id',
  'payment_type',   // 'loan_payment' | 'cbu' | 'savings' | 'membership'
  'ref_id',         // loan.id | account.id | membership.id (depends on payment_type)
  'account_id',     // account.id for cbu / savings deposits
  'fund_added',     // optional flag used by reporting
];

function sanitizeInvoicePayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([k, v]) => INVOICE_COLUMNS.includes(k) && v !== '' && v !== undefined && v !== null
    )
  );
}

// ── Invoice number generation ─────────────────────────────────────────────────
// Format: SI-YYYY-NNN
// Counts all invoices for the current year and increments by 1.
// Not guaranteed to be gap-free (voided records still count),
// which is correct behaviour for an audit trail.

async function generateInvoiceNo() {
  const year   = new Date().getFullYear();
  const prefix = `SI-${year}-`;

  const { count, error } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .like('invoice_no', `${prefix}%`);

  if (error) throw error;

  const next = String((count || 0) + 1).padStart(4, '0');
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

// ── createInvoiceForPayment ───────────────────────────────────────────────────
// Convenience wrapper called by every payment flow.
// Creates an invoice that is immediately marked 'paid' because the money
// has already been received at the time the payment is posted.
//
// payment_type values:
//   'loan_payment'  — loan repayment
//   'cbu'           — CBU / capital build-up deposit
//   'savings'       — savings deposit
//   'membership'    — membership fee payment
//
// ref_id should be:
//   loan_payment → loan.id
//   cbu          → account.id  (also pass account_id)
//   savings      → account.id  (also pass account_id)
//   membership   → member_membership.id

export async function createInvoiceForPayment({
  payment_type,
  member_id,
  member_name,    // full display name used as payee (e.g. "Juan Dela Cruz")
  amount,
  purpose,        // human-readable description of what the payment is for
  ref_id = null,  // foreign-key reference (loan id, account id, membership id)
  account_id = null,
  notes = null,
  created_by = null,
  date = null,
}) {
  if (!payment_type) throw new Error('payment_type is required for invoice creation.');
  if (!member_id)    throw new Error('member_id is required for invoice creation.');
  if (!member_name)  throw new Error('member_name is required for invoice creation.');
  if (!amount || Number(amount) <= 0) throw new Error('amount must be greater than zero.');

  return createInvoice({
    date:         date || new Date().toISOString().split('T')[0],
    payee:        member_name,
    purpose:      purpose || payment_type,
    amount:       Number(amount),
    status:       'paid',   // money already received — invoice is immediately paid
    member_id,
    payment_type,
    ref_id,
    account_id,
    notes,
    created_by,
  });
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