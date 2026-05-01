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

  const [membersRes, loansRes, accountsRes, invoicesRes, vouchersRes, tdRes, recentTxRes] = await Promise.all([
    supabase.from('members').select('id, status, date_joined, created_at'),
    supabase.from('loans').select('id, status, amount, balance, due_date'),
    supabase.from('accounts').select('id, account_type, balance'),
    // Paid invoices are the authoritative cash-in (and sometimes cash-out) source
    supabase
      .from('invoices')
      .select('id, date, amount, purpose, payment_type, created_at')
      .eq('status', 'paid'),
    // Approved vouchers are the authoritative expense / withdrawal cash-out source
    supabase
      .from('vouchers')
      .select('id, date, amount, created_at')
      .eq('status', 'approved'),
    supabase.from('time_deposits').select('amount, status'),
    // Recent transactions for the activity feed only (no charts)
    supabase
      .from('transactions')
      .select('id, type, amount, created_at, transaction_date')
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  const memberData   = membersRes.data   || [];
  const loanData     = loansRes.data     || [];
  const accountData  = accountsRes.data  || [];
  const invoiceData  = invoicesRes.data  || [];
  const voucherData  = vouchersRes.data  || [];
  const tdData       = tdRes.data        || [];
  const recentTxData = recentTxRes.data  || [];

  const cbuAccounts     = accountData.filter(a => a.account_type === 'cbu');
  const savingsAccounts = accountData.filter(a => a.account_type === 'savings');
  const activeLoans     = loanData.filter(l => ['active', 'ongoing'].includes(l.status));
  const overdueLoans    = loanData.filter(l => {
    if (!['active', 'ongoing'].includes(l.status)) return false;
    if (!l.due_date) return false;
    return new Date(l.due_date) < now;
  });

  // Split invoices: cash in (deposits, fees) vs cash out (withdrawals)
  const cashInInvoices  = invoiceData.filter(inv => !isWithdrawalInvoice(inv));
  const cashOutInvoices = invoiceData.filter(inv =>  isWithdrawalInvoice(inv));

  const totalCashIn  = cashInInvoices.reduce((s, inv) => s + (inv.amount || 0), 0);
  const totalCashOut = cashOutInvoices.reduce((s, inv) => s + (inv.amount || 0), 0)
                     + voucherData.reduce((s, v) => s + (v.amount || 0), 0);

  // ── Loan Status Distribution ───────────────────────────────────────────────
  const loanStatusMap = {};
  loanData.forEach(l => {
    const s = l.status || 'unknown';
    loanStatusMap[s] = (loanStatusMap[s] || 0) + 1;
  });
  const loanStatusChart = Object.entries(loanStatusMap).map(([label, value]) => ({ label, value }));

  // ── Cash Flow per Month (last 6 months) ───────────────────────────────────
  // Uses invoices + vouchers — same source of truth as the Coop Fund page.
  // Timestamp comparison avoids UTC string-slice timezone errors.
  const cashFlowChart = months.map(({ label, start, end }) => {
    const startMs = new Date(start).getTime();
    const endMs   = new Date(end).getTime();

    const inWindow = arr =>
      arr.filter(r => {
        // invoices use `date` (YYYY-MM-DD); treat as local noon to stay in the right day
        const raw = r.date ? `${r.date}T12:00:00` : r.created_at;
        const ms  = new Date(raw).getTime();
        return ms >= startMs && ms <= endMs;
      });

    const cashIn  = inWindow(cashInInvoices).reduce((s, inv) => s + (inv.amount || 0), 0);
    const cashOut = inWindow(cashOutInvoices).reduce((s, inv) => s + (inv.amount || 0), 0)
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
