import { supabase } from './supabase';
import { subMonths, format, startOfMonth, endOfMonth } from 'date-fns';

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

  const [membersRes, loansRes, accountsRes, txRes] = await Promise.all([
    supabase.from('members').select('id, status, date_joined, created_at'),
    supabase.from('loans').select('id, status, amount, balance, due_date, created_at'),
    supabase.from('accounts').select('id, account_type, balance'),
    supabase
      .from('transactions')
      .select('id, type, amount, created_at, transaction_date')
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  const memberData = membersRes.data || [];
  const loanData = loansRes.data || [];
  const accountData = accountsRes.data || [];
  const txData = txRes.data || [];

  const cbuAccounts = accountData.filter(a => a.account_type === 'cbu');
  const savingsAccounts = accountData.filter(a => a.account_type === 'savings');
  const activeLoans = loanData.filter(l => ['active', 'ongoing'].includes(l.status));
  const overdueLoans = loanData.filter(l => {
    if (!['active', 'ongoing'].includes(l.status)) return false;
    if (!l.due_date) return false;
    return new Date(l.due_date) < now;
  });

  const INFLOW_TYPES = ['deposit', 'loan_release', 'payment', 'interest'];
  const OUTFLOW_TYPES = ['withdrawal', 'expense', 'disbursement'];

  const totalCashIn = txData
    .filter(t => INFLOW_TYPES.includes(t.type))
    .reduce((s, t) => s + (t.amount || 0), 0);
  const totalCashOut = txData
    .filter(t => OUTFLOW_TYPES.includes(t.type))
    .reduce((s, t) => s + (t.amount || 0), 0);

  // Loan Status Distribution
  const loanStatusMap = {};
  loanData.forEach(l => {
    const s = l.status || 'unknown';
    loanStatusMap[s] = (loanStatusMap[s] || 0) + 1;
  });
  const loanStatusChart = Object.entries(loanStatusMap).map(([label, value]) => ({
    label,
    value,
  }));

  // Cash Flow per Month (last 6 months)
  const cashFlowChart = months.map(({ label, start, end }) => {
    const periodTx = txData.filter(t => {
      const d = t.transaction_date || t.created_at;
      return d >= start && d <= end;
    });
    const cashIn = periodTx
      .filter(t => INFLOW_TYPES.includes(t.type))
      .reduce((s, t) => s + (t.amount || 0), 0);
    const cashOut = periodTx
      .filter(t => OUTFLOW_TYPES.includes(t.type))
      .reduce((s, t) => s + (t.amount || 0), 0);
    return { label, cashIn, cashOut };
  });

  // Member Growth per Month (last 6 months)
  const memberGrowthChart = months.map(({ label, start, end }) => {
    const count = memberData.filter(m => {
      const d = m.date_joined || m.created_at;
      return d >= start && d <= end;
    }).length;
    return { label, count };
  });

  return {
    totalMembers: memberData.length,
    activeMembers: memberData.filter(m => m.status === 'active').length,
    activeLoans: activeLoans.length,
    totalLoanOutstanding: activeLoans.reduce((s, l) => s + (l.balance ?? l.amount ?? 0), 0),
    overduePayments: overdueLoans.length,
    totalCashIn,
    totalCashOut,
    totalIncome: totalCashIn,
    totalCBU: cbuAccounts.reduce((s, a) => s + (a.balance || 0), 0),
    totalSavings: savingsAccounts.reduce((s, a) => s + (a.balance || 0), 0),

    loanStatusChart,
    cashFlowChart,
    memberGrowthChart,

    recentTransactions: txData.slice(0, 8),
  };
}