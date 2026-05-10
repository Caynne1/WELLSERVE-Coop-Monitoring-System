import { supabase } from './supabase';
import { subMonths, format, startOfMonth, endOfMonth } from 'date-fns';

function isWithdrawalInvoice(inv) {
  return String(inv?.purpose || '').toLowerCase().includes('withdrawal');
}

export async function getDashboardStats() {
  const now = new Date();

  // Build 6-month range for trend data
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(now, 5 - i);
    return {
      label: format(d, 'MMM'),
      start: startOfMonth(d).toISOString(),
      end: endOfMonth(d).toISOString(),
    };
  });

  const [membersRes, loansRes, accountsRes, invoicesRes, vouchersRes, tdRes, allTxRes] = await Promise.all([
    supabase.from('members').select('id, status, membership_type, date_joined, created_at'),
    supabase.from('loans').select('id, status, amount, balance, due_date, preview_deductions_json, release_date, created_at'),
    supabase.from('accounts').select('id, account_type, balance'),
    // Only admin-level invoices NOT already captured in transactions table
    supabase
      .from('invoices')
      .select('id, date, amount, purpose, payment_type, created_at')
      .eq('status', 'paid')
      .in('payment_type', ['capital', 'loan_interest', 'service_fee', 'clpp', 'annual_dues']),
    // Approved vouchers = Cash Out (expenses)
    supabase
      .from('vouchers')
      .select('id, date, amount, created_at')
      .eq('status', 'approved'),
    supabase.from('time_deposits').select('amount, status'),
    // All transactions = primary source for member-level cash flows
    supabase
      .from('transactions')
      .select('id, type, category, amount, created_at, transaction_date')
      .order('created_at', { ascending: false }),
  ]);

  const memberData   = membersRes.data   || [];
  const loanData     = loansRes.data     || [];
  const accountData  = accountsRes.data  || [];
  const invoiceData  = invoicesRes.data  || [];   // admin-only types
  const voucherData  = vouchersRes.data  || [];
  const tdData       = tdRes.data        || [];
  const allTxData    = allTxRes.data     || [];

  // ── Transaction-based cash flow (primary source) ───────────────────────────
  const CASH_IN_TYPES  = new Set(['loan_payment','deposit','membership_payment','penalty_payment','other_payment','cbu','savings','membership','time_deposit']);
  const CASH_OUT_TYPES = new Set(['withdrawal','cbu_withdrawal','savings_withdrawal']);

  const cashInTx  = allTxData.filter(t => !CASH_OUT_TYPES.has((t.type||'').toLowerCase()) && (CASH_IN_TYPES.has((t.type||'').toLowerCase()) || CASH_IN_TYPES.has((t.category||'').toLowerCase())));
  const cashOutTx = allTxData.filter(t => CASH_OUT_TYPES.has((t.type||'').toLowerCase()));

  // ── Net proceeds released to members (Cash Out — loan disbursements) ───────
  let netProceedsTotal = 0;
  for (const loan of loanData) {
    try {
      const d = typeof loan.preview_deductions_json === 'string'
        ? JSON.parse(loan.preview_deductions_json) : (loan.preview_deductions_json || {});
      netProceedsTotal += Number(d.net_proceeds || 0);
    } catch { /* skip */ }
  }

  const totalCashIn  = cashInTx.reduce((s, t) => s + (t.amount || 0), 0)
                     + invoiceData.reduce((s, i) => s + (i.amount || 0), 0);

  const totalCashOut = cashOutTx.reduce((s, t) => s + (t.amount || 0), 0)
                     + voucherData.reduce((s, v) => s + (v.amount || 0), 0)
                     + netProceedsTotal;

  // Recent transactions for activity feed
  const recentTxData = allTxData.slice(0, 8);

  const cbuAccounts     = accountData.filter(a => a.account_type === 'cbu');
  const savingsAccounts = accountData.filter(a => a.account_type === 'savings');
  const activeLoans     = loanData.filter(l => ['active', 'ongoing'].includes(l.status));
  const overdueLoans    = loanData.filter(l => {
    if (!['active', 'ongoing'].includes(l.status)) return false;
    if (!l.due_date) return false;
    return new Date(l.due_date) < now;
  });

  // ── Loan Status Distribution ───────────────────────────────────────────────
  const loanStatusMap = {};
  loanData.forEach(l => {
    const s = l.status || 'unknown';
    loanStatusMap[s] = (loanStatusMap[s] || 0) + 1;
  });
  const loanStatusChart = Object.entries(loanStatusMap).map(([label, value]) => ({ label, value }));

  // ── Cash Flow per Month (last 6 months) — transaction-based ──────────────
  const cashFlowChart = months.map(({ label, start, end }) => {
    const startMs = new Date(start).getTime();
    const endMs   = new Date(end).getTime();

    const inWindow = arr =>
      arr.filter(r => {
        const raw = r.transaction_date ? `${r.transaction_date}T12:00:00` : (r.date ? `${r.date}T12:00:00` : r.created_at);
        const ms  = new Date(raw).getTime();
        return ms >= startMs && ms <= endMs;
      });

    const cashIn  = inWindow(cashInTx).reduce((s, t) => s + (t.amount || 0), 0)
                  + inWindow(invoiceData).reduce((s, i) => s + (i.amount || 0), 0);
    const cashOut = inWindow(cashOutTx).reduce((s, t) => s + (t.amount || 0), 0)
                  + inWindow(voucherData).reduce((s, v) => s + (v.amount || 0), 0);

    return { label, cashIn, cashOut };
  });

  // ── Member Growth per Month (last 6 months) ───────────────────────────────
  // Uses created_at (always set by DB) to avoid null / historical date_joined values.
  // Timestamp comparison avoids UTC string-slice timezone errors.
  const memberGrowthChart = months.map(({ label, start, end }) => {
    const startMs = new Date(start).getTime();
    const endMs   = new Date(end).getTime();
    const count = memberData.filter(m => {
      if (!m.created_at) return false;
      const ms = new Date(m.created_at).getTime();
      return ms >= startMs && ms <= endMs;
    }).length;
    return { label, count };
  });

  return {
    totalMembers:         memberData.length,
    activeMembers:        memberData.filter(m => m.status === 'active').length,
    regularMembers:       memberData.filter(m => m.membership_type === 'regular').length,
    associateMembers:     memberData.filter(m => m.membership_type === 'associate').length,
    activeLoans:          activeLoans.length,
    totalLoanOutstanding: activeLoans.reduce((s, l) => s + (l.balance ?? l.amount ?? 0), 0),
    overduePayments:      overdueLoans.length,
    totalCashIn,
    totalCashOut,
    totalIncome:          totalCashIn,
    totalCBU:             cbuAccounts.reduce((s, a) => s + (a.balance || 0), 0),
    totalSavings:         savingsAccounts.reduce((s, a) => s + (a.balance || 0), 0),
    totalTimeDeposit:     tdData.filter(td => td.status === 'active').reduce((s, td) => s + (td.amount || 0), 0),
    timeDepositCount:     tdData.filter(td => td.status === 'active').length,

    loanStatusChart,
    cashFlowChart,
    memberGrowthChart,

    recentTransactions: recentTxData,
  };
}