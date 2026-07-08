import { supabase } from './supabase';
import {
  subMonths, format, startOfMonth, endOfMonth,
  startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfYear, endOfYear, subDays, subWeeks, subYears,
} from 'date-fns';

function isWithdrawalInvoice(inv) {
  return String(inv?.purpose || '').toLowerCase().includes('withdrawal');
}

// ── Time Period Filter helpers ────────────────────────────────────────────
// Supported periods: 'today' | 'week' | 'month' | 'year'
function getPeriodRange(period, now) {
  switch (period) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now), label: format(now, 'MMM d, yyyy') };
    case 'week': {
      const s = startOfWeek(now, { weekStartsOn: 1 });
      const e = endOfWeek(now, { weekStartsOn: 1 });
      return { start: s, end: e, label: `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}` };
    }
    case 'year':
      return { start: startOfYear(now), end: endOfYear(now), label: format(now, 'yyyy') };
    case 'month':
    default:
      return { start: startOfMonth(now), end: endOfMonth(now), label: format(now, 'MMMM yyyy') };
  }
}

function getPreviousPeriodRange(period, now) {
  switch (period) {
    case 'today': return getPeriodRange('today', subDays(now, 1));
    case 'week':  return getPeriodRange('week', subWeeks(now, 1));
    case 'year':  return getPeriodRange('year', subYears(now, 1));
    case 'month':
    default:      return getPeriodRange('month', subMonths(now, 1));
  }
}

function pctChange(curr, prev) {
  if (!prev) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
}

function recordDateMs(r) {
  const raw = r.transaction_date ? `${r.transaction_date}T12:00:00`
    : (r.date ? `${r.date}T12:00:00` : (r.created_at || r.due_date));
  return new Date(raw).getTime();
}

function inRange(arr, range) {
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();
  return arr.filter(r => {
    const ms = recordDateMs(r);
    return ms >= startMs && ms <= endMs;
  });
}

export async function getDashboardStats(period = 'month') {
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

  const [membersRes, loansRes, accountsRes, invoicesRes, vouchersRes, tdRes, allTxRes, kiddySavingsRes, savingsBoosterRes] = await Promise.all([
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
      .select('id, type, category, amount, created_at, transaction_date, member_id')
      .order('created_at', { ascending: false }),
    // Kiddy savings accounts
    supabase
      .from('accounts')
      .select('id, account_type, balance')
      .eq('account_type', 'kiddy_savings'),
    // Savings booster accounts
    supabase
      .from('accounts')
      .select('id, account_type, balance')
      .eq('account_type', 'savings_booster'),
  ]);

  const memberData        = membersRes.data        || [];
  const loanData          = loansRes.data          || [];
  const accountData       = accountsRes.data       || [];
  const invoiceData       = invoicesRes.data       || [];   // admin-only types
  const voucherData       = vouchersRes.data       || [];
  const tdData            = tdRes.data             || [];
  const allTxData         = allTxRes.data          || [];
  const kiddySavingsData  = kiddySavingsRes.data   || [];
  const savingsBoosterData = savingsBoosterRes.data || [];

  // ── Member segmentation ────────────────────────────────────────────────────
  const kiddyMembers    = memberData.filter(m => m.membership_type === 'kiddy');
  const nonKiddyMembers = memberData.filter(m => m.membership_type !== 'kiddy');

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

  // Attach member display names (small lookup, only for the recent feed)
  const recentMemberIds = [...new Set(recentTxData.map(t => t.member_id).filter(Boolean))];
  let recentMemberMap = {};
  if (recentMemberIds.length > 0) {
    const { data: recentMembersData } = await supabase
      .from('members')
      .select('id, first_name, last_name')
      .in('id', recentMemberIds);
    recentMemberMap = Object.fromEntries(
      (recentMembersData || []).map(m => [m.id, `${m.first_name || ''} ${m.last_name || ''}`.trim()])
    );
  }
  const recentTransactionsWithNames = recentTxData.map(t => ({
    ...t,
    member_name: t.member_id ? (recentMemberMap[t.member_id] || 'Member') : 'Cooperative',
  }));

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
  // Groups members by their actual registration date (date_joined). Falls back
  // to created_at only when date_joined is missing (e.g. legacy/imported rows).
  // Date-only values are normalized to noon before parsing to avoid UTC
  // string-slice timezone errors shifting a member into the wrong month.
  const memberGrowthChart = months.map(({ start, end }) => {
    const startMs = new Date(start).getTime();
    const endMs   = new Date(end).getTime();
    const count = nonKiddyMembers.filter(m => {
      const raw = m.date_joined
        ? (String(m.date_joined).includes('T') ? m.date_joined : `${m.date_joined}T12:00:00`)
        : m.created_at;
      if (!raw) return false;
      const ms = new Date(raw).getTime();
      return ms >= startMs && ms <= endMs;
    }).length;
    return { label: format(new Date(start), 'MMM yyyy'), count };
  });

  // ── Period Filter (Today / Week / Month / Year) ───────────────────────────
  // Purely additive — does not alter any of the existing overall totals above.
  const range     = getPeriodRange(period, now);
  const prevRange = getPreviousPeriodRange(period, now);

  const periodIncome = inRange(cashInTx, range).reduce((s, t) => s + (t.amount || 0), 0)
                      + inRange(invoiceData, range).reduce((s, i) => s + (i.amount || 0), 0);
  const prevPeriodIncome = inRange(cashInTx, prevRange).reduce((s, t) => s + (t.amount || 0), 0)
                      + inRange(invoiceData, prevRange).reduce((s, i) => s + (i.amount || 0), 0);

  const periodExpense = inRange(cashOutTx, range).reduce((s, t) => s + (t.amount || 0), 0)
                      + inRange(voucherData, range).reduce((s, v) => s + (v.amount || 0), 0);
  const prevPeriodExpense = inRange(cashOutTx, prevRange).reduce((s, t) => s + (t.amount || 0), 0)
                      + inRange(voucherData, prevRange).reduce((s, v) => s + (v.amount || 0), 0);

  const periodNewMembers     = inRange(nonKiddyMembers, range).length;
  const prevPeriodNewMembers = inRange(nonKiddyMembers, prevRange).length;

  const periodNewLoans     = inRange(loanData, range).length;
  const prevPeriodNewLoans = inRange(loanData, prevRange).length;

  const periodOverdue     = inRange(overdueLoans, range).length;
  const prevPeriodOverdue = inRange(overdueLoans, prevRange).length;

  const periodTransactions = inRange(allTxData, range).length;

  return {
    totalMembers:         nonKiddyMembers.length,
    activeMembers:        nonKiddyMembers.filter(m => m.status === 'active').length,
    regularMembers:       nonKiddyMembers.filter(m => m.membership_type === 'regular').length,
    associateMembers:     nonKiddyMembers.filter(m => m.membership_type === 'associate').length,
    kiddyMembers:         kiddyMembers.length,
    activeKiddyMembers:   kiddyMembers.filter(m => m.status === 'active').length,
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
    totalKiddySavings:    kiddySavingsData.reduce((s, a) => s + (a.balance || 0), 0),
    kiddySavingsCount:    kiddySavingsData.length,
    totalSavingsBooster:  savingsBoosterData.reduce((s, a) => s + (a.balance || 0), 0),
    savingsBoosterCount:  savingsBoosterData.length,

    loanStatusChart,
    cashFlowChart,
    memberGrowthChart,

    recentTransactions: recentTransactionsWithNames,

    // ── Period Filter data (Today / Week / Month / Year) ──────────────────
    periodFilter:      period,
    periodLabel:       range.label,
    periodStart:       range.start.toISOString(),
    periodEnd:         range.end.toISOString(),
    periodIncome,
    periodExpense,
    periodNewMembers,
    periodNewLoans,
    periodOverdue,
    periodTransactions,
    trends: {
      income:  pctChange(periodIncome, prevPeriodIncome),
      expense: pctChange(periodExpense, prevPeriodExpense),
      members: pctChange(periodNewMembers, prevPeriodNewMembers),
      loans:   pctChange(periodNewLoans, prevPeriodNewLoans),
      overdue: pctChange(periodOverdue, prevPeriodOverdue),
    },
  };
}