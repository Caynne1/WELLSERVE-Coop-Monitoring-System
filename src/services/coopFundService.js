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

// ── Unified Coop Fund Summary ────────────────────────────────────────────────

/**
 * Transaction categories / types that count as Cash IN to the cooperative.
 * These come from the `transactions` table.
 */
const CASH_IN_TX_TYPES = new Set([
  'loan_payment',       // loan repayments
  'deposit',            // CBU / savings / time-deposit deposits
  'membership_payment', // membership fees
  'penalty_payment',    // penalty income
  'other_payment',      // miscellaneous income
  'cbu',                // legacy type
  'savings',            // legacy type
  'membership',         // legacy type
]);

/**
 * Transaction types that count as Cash OUT (withdrawals).
 */
const CASH_OUT_TX_TYPES = new Set([
  'withdrawal',
  'cbu_withdrawal',
  'savings_withdrawal',
]);

/**
 * Invoice payment_types that are NOT already captured in the transactions table.
 * We only include these to avoid double-counting.
 *   - 'capital'       = manual fund deposits by admin
 *   - 'loan_interest' = auto-recorded coop income from imported paid loans
 *   - 'service_fee'   = same
 *   - 'clpp'          = same
 *   - 'annual_dues'   = same
 */
const INVOICE_ONLY_TYPES = new Set([
  'capital',
  'loan_interest',
  'service_fee',
  'clpp',
  'annual_dues',
]);

export async function computeCoopSummaryFromInvoices() {
  const [txRes, invRes, vchRes, loansRes] = await Promise.all([
    // All transactions
    supabase
      .from('transactions')
      .select('id, type, category, amount, transaction_date, created_at, notes')
      .order('transaction_date', { ascending: false }),
    // Only admin-level invoices not captured in transactions
    supabase
      .from('invoices')
      .select('id, invoice_no, date, payee, purpose, amount, payment_type, created_at')
      .eq('status', 'paid'),
    // Approved vouchers = Cash Out (expenses)
    supabase
      .from('vouchers')
      .select('id, voucher_no, date, payee, purpose, amount, created_at')
      .eq('status', 'approved'),
    // Loans: compute net proceeds (Cash Out = money released to members)
    supabase
      .from('loans')
      .select('id, amount, preview_deductions_json, release_date, created_at'),
  ]);

  const txList     = txRes.data     || [];
  const invList    = invRes.data    || [];
  const vchList    = vchRes.data    || [];
  const loansList  = loansRes.data  || [];

  // ── Cash In from transactions ─────────────────────────────────────────────
  const cashInTx = txList.filter(t => {
    const type = (t.type || '').toLowerCase();
    const cat  = (t.category || '').toLowerCase();
    if (CASH_OUT_TX_TYPES.has(type)) return false;
    return CASH_IN_TX_TYPES.has(type) || CASH_IN_TX_TYPES.has(cat);
  });

  // ── Cash Out from transactions (withdrawals) ──────────────────────────────
  const cashOutTx = txList.filter(t => {
    const type = (t.type || '').toLowerCase();
    return CASH_OUT_TX_TYPES.has(type);
  });

  // ── Cash In from invoices (admin-only types, no transaction equivalent) ───
  const cashInInv = invList.filter(inv => {
    if (INVOICE_ONLY_TYPES.has(inv.payment_type)) return true;
    // Fallback: include withdrawal-purpose invoices as cash-out (handled below)
    return false;
  });

  // Invoice-based withdrawals (legacy: some systems record withdrawals via invoices)
  const cashOutInv = invList.filter(inv =>
    !INVOICE_ONLY_TYPES.has(inv.payment_type) &&
    String(inv.purpose || '').toLowerCase().includes('withdrawal')
  );

  // ── Cash Out: net proceeds released to members (loan disbursements) ───────
  let totalNetProceeds = 0;
  const netProceedsRows = [];
  for (const loan of loansList) {
    try {
      const d = typeof loan.preview_deductions_json === 'string'
        ? JSON.parse(loan.preview_deductions_json)
        : (loan.preview_deductions_json || {});
      const np = Number(d.net_proceeds || 0);
      if (np > 0) {
        totalNetProceeds += np;
        netProceedsRows.push({
          id:          `loan-np-${loan.id}`,
          type:        'cash_out',
          category:    'loan_release',
          amount:      np,
          description: `Loan disbursement (net proceeds)`,
          ref_no:      null,
          created_at:  loan.release_date || loan.created_at,
        });
      }
    } catch { /* skip malformed JSON */ }
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalCashIn =
    cashInTx.reduce((s, t) => s + (t.amount || 0), 0) +
    cashInInv.reduce((s, i) => s + (i.amount || 0), 0);

  const totalCashOut =
    cashOutTx.reduce((s, t) => s + (t.amount || 0), 0) +
    cashOutInv.reduce((s, i) => s + (i.amount || 0), 0) +
    vchList.reduce((s, v) => s + (v.amount || 0), 0) +
    totalNetProceeds;

  // ── Build unified transaction ledger rows for display ─────────────────────
  const txRows = cashInTx.map(t => ({
    id:          t.id,
    type:        'cash_in',
    category:    t.category || t.type,
    amount:      t.amount,
    description: t.notes || t.type,
    ref_no:      null,
    created_at:  t.transaction_date || t.created_at,
  }));

  const cashOutTxRows = cashOutTx.map(t => ({
    id:          t.id,
    type:        'cash_out',
    category:    t.category || t.type,
    amount:      t.amount,
    description: t.notes || 'Withdrawal',
    ref_no:      null,
    created_at:  t.transaction_date || t.created_at,
  }));

  const invRows = [...cashInInv, ...cashOutInv].map(inv => ({
    id:          inv.id,
    type:        INVOICE_ONLY_TYPES.has(inv.payment_type) ? 'cash_in' : 'cash_out',
    category:    inv.payment_type || 'invoice',
    amount:      inv.amount,
    description: inv.purpose || inv.payee,
    member_name: inv.payee || '—',
    ref_no:      inv.invoice_no,
    created_at:  inv.created_at,
  }));

  const vchRows = vchList.map(vch => ({
    id:          vch.id,
    type:        'cash_out',
    category:    'voucher',
    amount:      vch.amount,
    description: vch.purpose || vch.payee,
    ref_no:      vch.voucher_no,
    created_at:  vch.created_at,
  }));

  const allRows = [...txRows, ...cashOutTxRows, ...invRows, ...vchRows, ...netProceedsRows]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return {
    fund: {
      balance:  Math.round((totalCashIn - totalCashOut) * 100) / 100,
      cash_in:  Math.round(totalCashIn * 100) / 100,
      cash_out: Math.round(totalCashOut * 100) / 100,
    },
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

// ── Income Breakdown for Monitoring ─────────────────────────────────────────

/**
 * Compute the coop income breakdown for a given date range.
 * Data sources:
 *   - loans table  → loan_interest, service_fee, clpp, annual_dues, loan_principal, net_proceeds
 *   - transactions → membership_fee, vip_card (t-shirts/membership items)
 *
 * @param {{ from: string|null, to: string|null }} dateRange  ISO date strings, null = no filter
 */
export async function getIncomeBreakdown({ from = null, to = null } = {}) {
  const toEndOfDay = to ? `${to}T23:59:59` : null;

  // ── Loans ────────────────────────────────────────────────────────────────
  let loanQuery = supabase
    .from('loans')
    .select('id, amount, service_fee, loan_insurance, annual_dues, release_date, preview_summary_json, preview_deductions_json');

  if (from)        loanQuery = loanQuery.gte('release_date', from);
  if (toEndOfDay)  loanQuery = loanQuery.lte('release_date', toEndOfDay);

  const { data: loans = [], error: loanErr } = await loanQuery;
  if (loanErr) throw loanErr;

  let loanInterest    = 0;
  let loanPrincipal   = 0;
  let serviceFee      = 0;
  let clpp            = 0;
  let annualDues      = 0;
  let netProceeds     = 0;

  for (const loan of loans) {
    loanPrincipal += Number(loan.amount || 0);
    serviceFee    += Number(loan.service_fee || 0);
    clpp          += Number(loan.loan_insurance || 0);
    annualDues    += Number(loan.annual_dues || 0);

    // Parse interest + net proceeds from JSON columns
    try {
      const summary    = typeof loan.preview_summary_json === 'string'
        ? JSON.parse(loan.preview_summary_json) : (loan.preview_summary_json || {});
      loanInterest += Number(summary.total_interest_earned || 0);
    } catch { /* skip malformed JSON */ }

    try {
      const deductions = typeof loan.preview_deductions_json === 'string'
        ? JSON.parse(loan.preview_deductions_json) : (loan.preview_deductions_json || {});
      netProceeds += Number(deductions.net_proceeds || 0);
    } catch { /* skip */ }
  }

  // ── Membership transactions ───────────────────────────────────────────────
  let txQuery = supabase
    .from('transactions')
    .select('id, amount, notes, category, type, transaction_date')
    .eq('category', 'membership');

  if (from)       txQuery = txQuery.gte('transaction_date', from);
  if (toEndOfDay) txQuery = txQuery.lte('transaction_date', toEndOfDay);

  const { data: membershipTx = [], error: txErr } = await txQuery;
  if (txErr) throw txErr;

  let membershipFee = 0;
  let vipCardIncome = 0; // WELLife VIP Card / T-shirt

  for (const tx of membershipTx) {
    const note = String(tx.notes || '').toLowerCase();
    const isVipCard = note.includes('vip') || note.includes('shirt') || note.includes('wellife');
    if (isVipCard) {
      vipCardIncome += Number(tx.amount || 0);
    } else {
      membershipFee += Number(tx.amount || 0);
    }
  }

  return {
    loan_interest:   Math.round(loanInterest  * 100) / 100,
    loan_principal:  Math.round(loanPrincipal * 100) / 100,
    service_fee:     Math.round(serviceFee    * 100) / 100,
    clpp:            Math.round(clpp          * 100) / 100,
    annual_dues:     Math.round(annualDues    * 100) / 100,
    net_proceeds:    Math.round(netProceeds   * 100) / 100,
    membership_fee:  Math.round(membershipFee * 100) / 100,
    vip_card:        Math.round(vipCardIncome * 100) / 100,
    total_income:    Math.round(
      (loanInterest + serviceFee + clpp + annualDues + membershipFee + vipCardIncome) * 100
    ) / 100,
    loan_count:  loans.length,
    tx_count:    membershipTx.length,
  };
}



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