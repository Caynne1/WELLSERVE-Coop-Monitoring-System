import { notifyCashIn, notifyCashOut } from './notificationService';
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function isWithdrawalInvoice(inv) {
  const purpose = String(inv?.purpose || '').toLowerCase();
  return purpose.includes('withdrawal');
}

function getInvoiceFlow(inv) {
  if (isWithdrawalInvoice(inv)) {
    return 'cash_out';
  }
  return 'cash_in';
}

function getInvoiceCategory(inv) {
  if (inv.payment_type === 'cbu' && isWithdrawalInvoice(inv)) return 'cbu_withdrawal';
  if (inv.payment_type === 'savings' && isWithdrawalInvoice(inv)) return 'savings_withdrawal';
  return inv.payment_type || 'invoice';
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

  const invoiceCashIn = (paidInvoices || [])
    .filter(inv => getInvoiceFlow(inv) === 'cash_in')
    .reduce((s, r) => s + (r.amount || 0), 0);

  const invoiceCashOut = (paidInvoices || [])
    .filter(inv => getInvoiceFlow(inv) === 'cash_out')
    .reduce((s, r) => s + (r.amount || 0), 0);

  const voucherCashOut = (approvedVouchers || []).reduce((s, r) => s + (r.amount || 0), 0);

  const cashIn = invoiceCashIn;
  const cashOut = invoiceCashOut + voucherCashOut;

  const invoiceRows = (paidInvoices || []).map(inv => ({
    id: inv.id,
    type: getInvoiceFlow(inv),
    category: getInvoiceCategory(inv),
    amount: inv.amount,
    description: inv.purpose || inv.payee,
    member_name: inv.payee || '—',
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

  const allRows = [...invoiceRows, ...cashOutRows].sort(
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

  const result = await createInvoice({
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

  // Fire cash-in notification (non-blocking)
  try {
    const amt = value.toLocaleString('en-PH', { minimumFractionDigits: 2 });
    const purpose = description?.trim() || 'Manual Fund Deposit';
    notifyCashIn({
      message: `Cash In: ₱${amt} — ${purpose}`,
      reference_id: result?.id || null,
    }).catch(() => {});
  } catch (_) {}

  return result;
}

// ── Category display helpers ─────────────────────────────────────────────────

export const CATEGORY_LABEL = {
  loan_payment: 'Loan Payment',
  cbu: 'CBU Deposit',
  cbu_withdrawal: 'CBU Withdrawal',
  savings: 'Savings Deposit',
  savings_withdrawal: 'Savings Withdrawal',
  membership: 'Membership Fee',
  penalty: 'Penalty Payment',
  others: 'Other Payment',
  loan_release: 'Loan Release',
  expense: 'Expense',
  voucher: 'Voucher',
  invoice: 'Invoice',
  void_reversal: 'Void Reversal',
  capital: 'Capital / Fund Deposit',
  time_deposit: 'Time Deposit Payment',   // ← NEW
};

export const CATEGORY_COLOR = {
  loan_payment: 'text-orange-700 bg-orange-50',
  cbu: 'text-green-700 bg-green-50',
  cbu_withdrawal: 'text-red-700 bg-red-50',
  savings: 'text-blue-700 bg-blue-50',
  savings_withdrawal: 'text-red-700 bg-red-50',
  membership: 'text-purple-700 bg-purple-50',
  penalty: 'text-red-700 bg-red-50',
  others: 'text-gray-700 bg-gray-100',
  loan_release: 'text-red-700 bg-red-50',
  expense: 'text-red-700 bg-red-50',
  voucher: 'text-red-700 bg-red-50',
  invoice: 'text-gray-700 bg-gray-100',
  void_reversal: 'text-gray-500 bg-gray-100',
  capital: 'text-indigo-700 bg-indigo-50',
  time_deposit: 'text-violet-700 bg-violet-50',  // ← NEW
};