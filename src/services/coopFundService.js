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

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function profileName(profile) {
  return profile?.full_name || profile?.email || null;
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
  'loan_deduction',     // release-time loan deductions
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
  'loan_release',
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
      .select('id, type, category, amount, transaction_date, created_at, notes, reference, member_id, loan_id, created_by')
      .order('transaction_date', { ascending: false }),
    // Only admin-level invoices not captured in transactions
    supabase
      .from('invoices')
      .select('id, invoice_no, date, payee, purpose, amount, payment_type, created_at, created_by')
      .eq('status', 'paid'),
    Promise.resolve({ data: [] }),
    Promise.resolve({ data: [] }),
  ]);

  const txList     = txRes.data     || [];
  const invList    = invRes.data    || [];
  const vchList    = vchRes.data    || [];
  const loansList  = loansRes.data  || [];
  const memberIds = [...new Set(txList.map(t => t.member_id).filter(Boolean))];
  const createdByIds = [...new Set([
    ...txList.map(t => t.created_by),
    ...invList.map(inv => inv.created_by),
    ...vchList.map(vch => vch.created_by),
  ].filter(isUuid))];
  const [membersRes, profilesRes] = await Promise.all([
    memberIds.length
      ? supabase.from('members').select('id, first_name, last_name, member_no').in('id', memberIds)
      : Promise.resolve({ data: [] }),
    createdByIds.length
      ? supabase.from('profiles').select('id, full_name, email').in('id', createdByIds)
      : Promise.resolve({ data: [] }),
  ]);
  const memberMap = Object.fromEntries((membersRes.data || []).map(m => [
    m.id,
    `${m.member_no ? `${m.member_no} - ` : ''}${[m.first_name, m.last_name].filter(Boolean).join(' ')}`.trim(),
  ]));
  const profileMap = Object.fromEntries((profilesRes.data || []).map(p => [p.id, profileName(p)]));

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
  // ── Totals ────────────────────────────────────────────────────────────────
  const totalCashIn =
    cashInTx.reduce((s, t) => s + (t.amount || 0), 0) +
    cashInInv.reduce((s, i) => s + (i.amount || 0), 0);

  const totalCashOut =
    cashOutTx.reduce((s, t) => s + (t.amount || 0), 0) +
    cashOutInv.reduce((s, i) => s + (i.amount || 0), 0);

  // ── Build unified transaction ledger rows for display ─────────────────────
  const txRows = cashInTx.map(t => ({
    id:          t.id,
    type:        'cash_in',
    category:    t.category || t.type,
    amount:      t.amount,
    description: t.notes || t.type,
    ref_no:      t.reference || null,
    member_name: memberMap[t.member_id] || null,
    loan_id:     t.loan_id || null,
    created_by:  profileMap[t.created_by] || t.created_by || 'System',
    created_at:  t.created_at || t.transaction_date,
  }));

  const cashOutTxRows = cashOutTx.map(t => ({
    id:          t.id,
    type:        'cash_out',
    category:    t.category || t.type,
    amount:      t.amount,
    description: t.notes || 'Withdrawal',
    ref_no:      t.reference || null,
    member_name: memberMap[t.member_id] || null,
    loan_id:     t.loan_id || null,
    created_by:  profileMap[t.created_by] || t.created_by || 'System',
    created_at:  t.created_at || t.transaction_date,
  }));

  const invRows = [...cashInInv, ...cashOutInv].map(inv => ({
    id:          inv.id,
    type:        INVOICE_ONLY_TYPES.has(inv.payment_type) ? 'cash_in' : 'cash_out',
    category:    inv.payment_type || 'invoice',
    amount:      inv.amount,
    description: inv.purpose || inv.payee,
    member_name: inv.payee || '—',
    ref_no:      inv.invoice_no,
    created_by:  profileMap[inv.created_by] || inv.created_by || 'System',
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

  const allRows = [...txRows, ...cashOutTxRows, ...invRows, ...vchRows]
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
  const hasDateFilter = Boolean(from || toEndOfDay);

  const inRange = (value) => {
    if (!value) return !from && !toEndOfDay;
    const d = new Date(value);
    if (from && d < new Date(from)) return false;
    if (toEndOfDay && d > new Date(toEndOfDay)) return false;
    return true;
  };

  const { data: loans = [], error: loanErr } = await supabase
    .from('loans')
    .select('id, preview_schedule_json');
  if (loanErr) throw loanErr;

  let loanInterest = 0;
  for (const loan of loans) {
    try {
      const schedule = typeof loan.preview_schedule_json === 'string'
        ? JSON.parse(loan.preview_schedule_json)
        : (loan.preview_schedule_json || []);

      if (Array.isArray(schedule)) {
        for (const row of schedule) {
          const paidDate = row.last_interest_paid_at || row.paid_at || row.last_partial_paid_at || null;
          if ((row.paid || row.partial_paid) && inRange(paidDate)) {
            const fullInterest = Number(row.interest || row.interest_amount || 0);
            const totalDue = Number(row.total_due || row.payment || ((row.principal || 0) + fullInterest));
            const proportionalInterest = totalDue > 0
              ? Math.min(fullInterest, fullInterest * (Number(row.paid_amount || 0) / totalDue))
              : fullInterest;
            loanInterest += Number(
              hasDateFilter && row.last_interest_paid_amount != null
                ? row.last_interest_paid_amount
                : row.interest_paid_amount != null
                  ? row.interest_paid_amount
                  : row.paid
                    ? fullInterest
                    : proportionalInterest
            );
          }
        }
      }
    } catch { /* skip malformed JSON */ }
  }

  let txQuery = supabase
    .from('transactions')
    .select('id, amount, notes, category, type, transaction_date');

  if (from) txQuery = txQuery.gte('transaction_date', from);
  if (toEndOfDay) txQuery = txQuery.lte('transaction_date', toEndOfDay);

  const { data: txList = [], error: txErr } = await txQuery;
  if (txErr) throw txErr;

  const buckets = {
    service_fee: 0,
    cbu_retention: 0,
    legal_fees: 0,
    clpi_insurance: 0,
    regular_savings: 0,
    penalty_due: 0,
    annual_dues: 0,
    cbu_completion: 0,
    petty_cash: 0,
    membership_fee: 0,
    vip_card: 0,
    admin_regulatory_fees: 0,
  };

  for (const tx of txList) {
    const note = String(tx.notes || '').toLowerCase();
    const txCategory = String(tx.category || '').toLowerCase();
    const bucketText = `${note} ${txCategory}`;
    const amount = Number(tx.amount || 0);

    if (tx.type === 'loan_deduction') {
      if (bucketText.includes('service')) buckets.service_fee += amount;
      else if (bucketText.includes('cbu completion')) buckets.cbu_completion += amount;
      else if (bucketText.includes('cbu') || bucketText.includes('share capital') || bucketText.includes('retention')) buckets.cbu_retention += amount;
      else if (bucketText.includes('legal') || bucketText.includes('notarial')) buckets.legal_fees += amount;
      else if (bucketText.includes('insurance') || bucketText.includes('clpp') || bucketText.includes('clpi') || bucketText.includes('protection')) buckets.clpi_insurance += amount;
      else if (bucketText.includes('regular savings') || bucketText.includes('initial savings') || bucketText.includes('saving')) buckets.regular_savings += amount;
      else if (bucketText.includes('penalty')) buckets.penalty_due += amount;
      else if (bucketText.includes('annual')) buckets.annual_dues += amount;
      else if (bucketText.includes('petty')) buckets.petty_cash += amount;
      else if (bucketText.includes('vip') || bucketText.includes('wellife')) buckets.vip_card += amount;
      else if (bucketText.includes('regulatory') || bucketText.includes('admin')) buckets.admin_regulatory_fees += amount;
      else if (bucketText.includes('membership')) buckets.membership_fee += amount;
    }

    if (tx.category === 'membership') {
      if (note.includes('vip') || note.includes('shirt') || note.includes('wellife')) {
        buckets.vip_card += amount;
      } else if (note.includes('regulatory') || note.includes('admin')) {
        buckets.admin_regulatory_fees += amount;
      } else {
        buckets.membership_fee += amount;
      }
    }
  }

  const totalIncome =
    loanInterest +
    buckets.service_fee +
    buckets.cbu_retention +
    buckets.legal_fees +
    buckets.clpi_insurance +
    buckets.regular_savings +
    buckets.penalty_due +
    buckets.annual_dues +
    buckets.cbu_completion +
    buckets.petty_cash +
    buckets.membership_fee +
    buckets.vip_card +
    buckets.admin_regulatory_fees;

  return {
    loan_interest: Math.round(loanInterest * 100) / 100,
    service_fee: Math.round(buckets.service_fee * 100) / 100,
    cbu_retention: Math.round(buckets.cbu_retention * 100) / 100,
    legal_fees: Math.round(buckets.legal_fees * 100) / 100,
    clpi_insurance: Math.round(buckets.clpi_insurance * 100) / 100,
    regular_savings: Math.round(buckets.regular_savings * 100) / 100,
    penalty_due: Math.round(buckets.penalty_due * 100) / 100,
    annual_dues: Math.round(buckets.annual_dues * 100) / 100,
    cbu_completion: Math.round(buckets.cbu_completion * 100) / 100,
    petty_cash: Math.round(buckets.petty_cash * 100) / 100,
    membership_fee: Math.round(buckets.membership_fee * 100) / 100,
    vip_card: Math.round(buckets.vip_card * 100) / 100,
    admin_regulatory_fees: Math.round(buckets.admin_regulatory_fees * 100) / 100,
    total_income: Math.round(totalIncome * 100) / 100,
    loan_count: loans.length,
    tx_count: txList.length,
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
