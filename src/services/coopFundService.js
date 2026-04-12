import { supabase } from './supabase';
import { createInvoice } from './invoiceService';

// ── Primary: reads from coop_fund + fund_transactions ────────────────────────

export async function getCoopFund() {
  const { data, error } = await supabase
    .from('coop_fund')
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return data || { balance: 0, cash_in: 0, cash_out: 0 };
}

export async function getFundTransactions(filters = {}) {
  let query = supabase
    .from('fund_transactions')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters.type) query = query.eq('type', filters.type);
  if (filters.from) query = query.gte('created_at', filters.from);
  if (filters.to) query = query.lte('created_at', filters.to);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ── Fallback: compute directly from invoices + vouchers ──────────────────────

export async function computeCoopSummaryFromInvoices() {
  const { data: paidInvoices, error: invErr } = await supabase
    .from('invoices')
    .select('id, invoice_no, date, payee, purpose, amount, payment_type, created_at')
    .eq('status', 'paid')
    .order('created_at', { ascending: false });

  if (invErr) throw invErr;

  const { data: approvedVouchers, error: vchErr } = await supabase
    .from('vouchers')
    .select('id, voucher_no, date, payee, purpose, amount, created_at')
    .eq('status', 'approved')
    .order('created_at', { ascending: false });

  if (vchErr) throw vchErr;

  const cashIn = (paidInvoices || []).reduce((s, r) => s + (r.amount || 0), 0);
  const cashOut = (approvedVouchers || []).reduce((s, r) => s + (r.amount || 0), 0);

  const cashInRows = (paidInvoices || []).map(inv => ({
    id: inv.id,
    type: 'cash_in',
    category: inv.payment_type || 'invoice',
    amount: inv.amount,
    description: inv.purpose || inv.payee,
    ref_no: inv.invoice_no,
    created_at: inv.created_at,
  }));

  const cashOutRows = (approvedVouchers || []).map(vch => ({
    id: vch.id,
    type: 'cash_out',
    category: 'voucher',
    amount: vch.amount,
    description: vch.purpose || vch.payee,
    ref_no: vch.voucher_no,
    created_at: vch.created_at,
  }));

  const allRows = [...cashInRows, ...cashOutRows].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );

  return {
    fund: { balance: cashIn - cashOut, cash_in: cashIn, cash_out: cashOut },
    transactions: allRows,
  };
}

// ── Manual Fund Deposit ──────────────────────────────────────────────────────

export async function recordManualFundDeposit({
  invoice_no,
  amount,
  date,
  description,
  created_by = null,
  payment_mode = null,
  payment_mode_note = null,
}) {
  const value = parseFloat(amount) || 0;

  if (!invoice_no || !String(invoice_no).trim()) {
    throw new Error('SI# is required.');
  }

  if (value <= 0) {
    throw new Error('Amount must be greater than zero.');
  }

  if (!date) {
    throw new Error('Date is required.');
  }

  return await createInvoice({
    invoice_no: String(invoice_no).trim(),
    date,
    payee: 'Cooperative Fund',
    purpose: description?.trim() || 'Manual Fund Deposit',
    amount: value,
    status: 'paid',
    payment_type: 'capital',
    created_by,
    member_id: null,
    ref_id: null,
    account_id: null,
    fund_added: false,
    payment_mode,
    payment_mode_note,
  });
}

// ── Category display helpers ─────────────────────────────────────────────────

export const CATEGORY_LABEL = {
  loan_payment: 'Loan Payment',
  cbu: 'CBU Deposit',
  savings: 'Savings Deposit',
  membership: 'Membership Fee',
  loan_release: 'Loan Release',
  expense: 'Expense',
  voucher: 'Voucher',
  invoice: 'Invoice',
  void_reversal: 'Void Reversal',
  capital: 'Capital / Fund Deposit',
};

export const CATEGORY_COLOR = {
  loan_payment: 'text-orange-700 bg-orange-50',
  cbu: 'text-green-700 bg-green-50',
  savings: 'text-blue-700 bg-blue-50',
  membership: 'text-purple-700 bg-purple-50',
  loan_release: 'text-red-700 bg-red-50',
  expense: 'text-red-700 bg-red-50',
  voucher: 'text-red-700 bg-red-50',
  invoice: 'text-gray-700 bg-gray-100',
  void_reversal: 'text-gray-500 bg-gray-100',
  capital: 'text-indigo-700 bg-indigo-50',
};