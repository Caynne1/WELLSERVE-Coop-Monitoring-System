import { supabase } from './supabase';

const INVOICE_COLUMNS = [
  'invoice_no', 'date', 'due_date', 'payee', 'purpose',
  'amount', 'notes', 'status', 'created_by',
  'member_id',
  'payment_type',
  'ref_id',
  'account_id',
  'fund_added',
];

function sanitizeInvoicePayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([k, v]) => INVOICE_COLUMNS.includes(k) && v !== '' && v !== undefined && v !== null
    )
  );
}

async function generateInvoiceNo() {
  const year = new Date().getFullYear();

  const { data, error } = await supabase.rpc('next_invoice_no', {
    p_year: year,
  });

  if (error) throw error;
  if (!data) throw new Error('Failed to generate invoice number.');

  return data;
}

export async function getInvoices(filters = {}) {
  let query = supabase
    .from('invoices')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.from) query = query.gte('date', filters.from);
  if (filters.to) query = query.lte('date', filters.to);

  const { data: invoices, error } = await query;
  if (error) throw error;
  if (!invoices || invoices.length === 0) return [];

  const memberIds = [...new Set(invoices.map(inv => inv.member_id).filter(Boolean))];
  const accountIds = [...new Set(invoices.map(inv => inv.account_id).filter(Boolean))];

  let memberMap = {};
  let accountMap = {};

  if (memberIds.length > 0) {
    const { data: members, error: memberError } = await supabase
      .from('members')
      .select('id, first_name, last_name, member_no')
      .in('id', memberIds);

    if (memberError) throw memberError;
    memberMap = Object.fromEntries((members || []).map(m => [m.id, m]));
  }

  if (accountIds.length > 0) {
    const { data: accounts, error: accountError } = await supabase
      .from('accounts')
      .select('id, account_no, account_type, member_id')
      .in('id', accountIds);

    if (accountError) throw accountError;
    accountMap = Object.fromEntries((accounts || []).map(a => [a.id, a]));
  }

  return invoices.map(inv => ({
    ...inv,
    members: inv.member_id ? (memberMap[inv.member_id] || null) : null,
    accounts: inv.account_id ? (accountMap[inv.account_id] || null) : null,
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

export async function createInvoiceForPayment({
  payment_type,
  member_id,
  member_name,
  amount,
  purpose,
  ref_id = null,
  account_id = null,
  notes = null,
  created_by = null,
  date = null,
}) {
  if (!payment_type) throw new Error('payment_type is required for invoice creation.');
  if (!member_id && payment_type !== 'capital') {
    throw new Error('member_id is required for invoice creation.');
  }
  if (!member_name) throw new Error('member_name is required for invoice creation.');
  if (!amount || Number(amount) <= 0) throw new Error('amount must be greater than zero.');

  return createInvoice({
    date: date || new Date().toISOString().split('T')[0],
    payee: member_name,
    purpose: purpose || payment_type,
    amount: Number(amount),
    status: 'paid',
    member_id,
    payment_type,
    ref_id,
    account_id,
    notes,
    created_by,
  });
}

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