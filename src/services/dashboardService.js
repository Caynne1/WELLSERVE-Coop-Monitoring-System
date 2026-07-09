// dashboardService.js - Updated with 'overall' support

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
function parseCustomPeriod(period) {
  if (typeof period === 'string' && period.startsWith('custom:')) {
    const raw = period.slice('custom:'.length);
    const d = new Date(`${raw}T12:00:00`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function getPeriodRange(period, now) {
  const customDate = parseCustomPeriod(period);
  if (customDate) {
    return { start: startOfDay(customDate), end: endOfDay(customDate), label: format(customDate, 'MMM d, yyyy') };
  }
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
  const customDate = parseCustomPeriod(period);
  if (customDate) {
    return getPeriodRange('today', subDays(customDate, 1));
  }
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
  if (!range || !range.start || !range.end) return arr;
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();
  return arr.filter(r => {
    const ms = recordDateMs(r);
    return ms >= startMs && ms <= endMs;
  });
}

// ── Member registration date — single source of truth ─────────────────────
// IMPORTANT: All member counts use `date_joined` as the definitive
// registration date. This matches the Members page which uses date_joined
// for filtering and display. Excel imports populate date_joined directly.
// Fallback to created_at only when date_joined is missing (legacy data).
function memberRegistrationMs(member) {
  // Use date_joined if available (this is what Excel imports populate)
  if (member.date_joined) {
    const raw = String(member.date_joined).includes('T') 
      ? member.date_joined 
      : `${member.date_joined}T12:00:00`;
    return new Date(raw).getTime();
  }
  // Fallback to created_at for legacy records without date_joined
  if (member.created_at) {
    return new Date(member.created_at).getTime();
  }
  return NaN;
}

function inRangeMembers(members, range) {
  if (!range || !range.start || !range.end) return members;
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();
  return members.filter(m => {
    const ms = memberRegistrationMs(m);
    return !Number.isNaN(ms) && ms >= startMs && ms <= endMs;
  });
}

// ── Bucket generation for period-scoped charts ────────────────────────────
function buildPeriodBuckets(period, range) {
  const isCustomOrToday = period === 'today' || (typeof period === 'string' && period.startsWith('custom:'));

  if (isCustomOrToday) {
    const buckets = [];
    for (let h = 0; h < 24; h += 4) {
      const s = new Date(range.start); s.setHours(h, 0, 0, 0);
      const e = new Date(range.start); e.setHours(Math.min(h + 3, 23), 59, 59, 999);
      buckets.push({ start: s, end: e, label: format(s, 'ha').toLowerCase() });
    }
    return buckets;
  }

  if (period === 'week') {
    const buckets = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(range.start);
      d.setDate(d.getDate() + i);
      buckets.push({ start: startOfDay(d), end: endOfDay(d), label: format(d, 'EEE') });
    }
    return buckets;
  }

  if (period === 'year') {
    const buckets = [];
    const y = range.start.getFullYear();
    for (let m = 0; m < 12; m++) {
      const s = new Date(y, m, 1);
      buckets.push({ start: s, end: endOfMonth(s), label: format(s, 'MMM') });
    }
    return buckets;
  }

  // 'month' (default): one bucket per day in the range
  const buckets = [];
  const dayCount = Math.round((range.end.getTime() - range.start.getTime()) / 86400000) + 1;
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(range.start);
    d.setDate(d.getDate() + i);
    buckets.push({ start: startOfDay(d), end: endOfDay(d), label: format(d, 'd') });
  }
  return buckets;
}

// ── Helper to get member display name ─────────────────────────────────────
function getMemberDisplayName(member) {
  if (member.full_name) return member.full_name;
  if (member.first_name && member.last_name) {
    return `${member.first_name} ${member.last_name}`.trim();
  }
  if (member.first_name) return member.first_name;
  if (member.last_name) return member.last_name;
  return 'Unknown Member';
}

// ── Helper to format date for display ────────────────────────────────────
function formatDateDisplay(dateStr) {
  if (!dateStr) return null;
  try {
    const raw = String(dateStr).includes('T') ? dateStr : `${dateStr}T12:00:00`;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    return format(date, 'MMMM d, yyyy');
  } catch {
    return null;
  }
}

export async function getDashboardStats(period = 'month') {
  const now = new Date();

  // ── Handle 'overall' period - return all-time totals ─────────────────────
  if (period === 'overall') {
    // Fetch all data without date filtering
    const [membersRes, loansRes, accountsRes, invoicesRes, vouchersRes, tdRes, allTxRes, kiddySavingsRes, savingsBoosterRes] = await Promise.all([
      supabase.from('members').select('id, status, membership_type, date_joined, created_at, first_name, last_name, email'),
      supabase.from('loans').select('id, status, amount, balance, due_date, preview_deductions_json, release_date, created_at'),
      supabase.from('accounts').select('id, account_type, balance'),
      supabase
        .from('invoices')
        .select('id, date, amount, purpose, payment_type, created_at')
        .eq('status', 'paid')
        .in('payment_type', ['capital', 'loan_interest', 'service_fee', 'clpp', 'annual_dues']),
      supabase
        .from('vouchers')
        .select('id, date, amount, created_at')
        .eq('status', 'approved'),
      supabase.from('time_deposits').select('amount, status'),
      supabase
        .from('transactions')
        .select('id, type, category, amount, created_at, transaction_date, member_id')
        .order('created_at', { ascending: false }),
      supabase
        .from('accounts')
        .select('id, account_type, balance')
        .eq('account_type', 'kiddy_savings'),
      supabase
        .from('accounts')
        .select('id, account_type, balance')
        .eq('account_type', 'savings_booster'),
    ]);

    const memberData = membersRes.data || [];
    const loanData = loansRes.data || [];
    const accountData = accountsRes.data || [];
    const invoiceData = invoicesRes.data || [];
    const voucherData = vouchersRes.data || [];
    const tdData = tdRes.data || [];
    const allTxData = allTxRes.data || [];
    const kiddySavingsData = kiddySavingsRes.data || [];
    const savingsBoosterData = savingsBoosterRes.data || [];

    const kiddyMembers = memberData.filter(m => String(m.membership_type || '').trim().toLowerCase() === 'kiddy');
    const nonKiddyMembers = memberData.filter(m => String(m.membership_type || '').trim().toLowerCase() !== 'kiddy');

    const CASH_IN_TYPES = new Set(['loan_payment','deposit','membership_payment','penalty_payment','other_payment','cbu','savings','membership','time_deposit']);
    const CASH_OUT_TYPES = new Set(['withdrawal','cbu_withdrawal','savings_withdrawal']);

    const cashInTx = allTxData.filter(t => !CASH_OUT_TYPES.has((t.type||'').toLowerCase()) && (CASH_IN_TYPES.has((t.type||'').toLowerCase()) || CASH_IN_TYPES.has((t.category||'').toLowerCase())));
    const cashOutTx = allTxData.filter(t => CASH_OUT_TYPES.has((t.type||'').toLowerCase()));

    let netProceedsTotal = 0;
    for (const loan of loanData) {
      try {
        const d = typeof loan.preview_deductions_json === 'string'
          ? JSON.parse(loan.preview_deductions_json) : (loan.preview_deductions_json || {});
        netProceedsTotal += Number(d.net_proceeds || 0);
      } catch { /* skip */ }
    }

    const totalCashIn = cashInTx.reduce((s, t) => s + (t.amount || 0), 0) + invoiceData.reduce((s, i) => s + (i.amount || 0), 0);
    const totalCashOut = cashOutTx.reduce((s, t) => s + (t.amount || 0), 0) + voucherData.reduce((s, v) => s + (v.amount || 0), 0) + netProceedsTotal;

    const recentTxData = allTxData.slice(0, 8);
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

    const cbuAccounts = accountData.filter(a => a.account_type === 'cbu');
    const savingsAccounts = accountData.filter(a => a.account_type === 'savings');
    const activeLoans = loanData.filter(l => ['active', 'ongoing'].includes(l.status));
    const overdueLoans = loanData.filter(l => {
      if (!['active', 'ongoing'].includes(l.status)) return false;
      if (!l.due_date) return false;
      return new Date(l.due_date) < now;
    });

    const loanStatusMap = {};
    loanData.forEach(l => {
      const s = l.status || 'unknown';
      loanStatusMap[s] = (loanStatusMap[s] || 0) + 1;
    });
    const loanStatusChart = Object.entries(loanStatusMap).map(([label, value]) => ({ label, value }));

    // Build 6-month chart data
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(now, 5 - i);
      return {
        label: format(d, 'MMM'),
        start: startOfMonth(d).toISOString(),
        end: endOfMonth(d).toISOString(),
      };
    });

    const cashFlowChart = months.map(({ label, start, end }) => {
      const startMs = new Date(start).getTime();
      const endMs = new Date(end).getTime();
      const inWindow = arr => arr.filter(r => {
        const ms = recordDateMs(r);
        return ms >= startMs && ms <= endMs;
      });
      const cashIn = inWindow(cashInTx).reduce((s, t) => s + (t.amount || 0), 0) + inWindow(invoiceData).reduce((s, i) => s + (i.amount || 0), 0);
      const cashOut = inWindow(cashOutTx).reduce((s, t) => s + (t.amount || 0), 0) + inWindow(voucherData).reduce((s, v) => s + (v.amount || 0), 0);
      return { label, cashIn, cashOut };
    });

    const monthlyMembers = {};
    const memberGrowthChart = months.map(({ label, start, end }) => {
      const startMs = new Date(start).getTime();
      const endMs = new Date(end).getTime();
      const membersInBucket = nonKiddyMembers.filter(m => {
        const ms = memberRegistrationMs(m);
        return !Number.isNaN(ms) && ms >= startMs && ms <= endMs;
      });
      monthlyMembers[label] = membersInBucket.map(m => ({
        id: m.id,
        full_name: getMemberDisplayName(m),
        first_name: m.first_name,
        last_name: m.last_name,
        membership_type: m.membership_type,
        status: m.status,
        email: m.email || '',
        created_at: m.date_joined || m.created_at,
        date_joined_formatted: formatDateDisplay(m.date_joined || m.created_at),
      }));
      return { label, count: membersInBucket.length };
    });

    return {
      // ── Member totals (all-time) ──────────────────────────────────────────
      totalMembers: nonKiddyMembers.length,
      activeMembers: nonKiddyMembers.filter(m => String(m.status || '').trim().toLowerCase() === 'active').length,
      regularMembers: nonKiddyMembers.filter(m => String(m.membership_type || '').trim().toLowerCase() === 'regular').length,
      associateMembers: nonKiddyMembers.filter(m => String(m.membership_type || '').trim().toLowerCase() === 'associate').length,
      kiddyMembers: kiddyMembers.length,
      activeKiddyMembers: kiddyMembers.filter(m => String(m.status || '').trim().toLowerCase() === 'active').length,
      
      // ── Loan metrics ────────────────────────────────────────────────────────
      activeLoans: activeLoans.length,
      totalLoanOutstanding: activeLoans.reduce((s, l) => s + (l.balance ?? l.amount ?? 0), 0),
      overduePayments: overdueLoans.length,

      // ── Cash flow ────────────────────────────────────────────────────────────
      totalCashIn,
      totalCashOut,
      totalIncome: totalCashIn,

      // ── Product balances ────────────────────────────────────────────────────
      totalCBU: cbuAccounts.reduce((s, a) => s + (a.balance || 0), 0),
      totalSavings: savingsAccounts.reduce((s, a) => s + (a.balance || 0), 0),
      totalTimeDeposit: tdData.filter(td => td.status === 'active').reduce((s, td) => s + (td.amount || 0), 0),
      timeDepositCount: tdData.filter(td => td.status === 'active').length,
      totalKiddySavings: kiddySavingsData.reduce((s, a) => s + (a.balance || 0), 0),
      kiddySavingsCount: kiddySavingsData.length,
      totalSavingsBooster: savingsBoosterData.reduce((s, a) => s + (a.balance || 0), 0),
      savingsBoosterCount: savingsBoosterData.length,

      // ── Charts ──────────────────────────────────────────────────────────────
      loanStatusChart,
      cashFlowChart,
      memberGrowthChart,
      monthlyMembers,

      // ── Recent transactions ─────────────────────────────────────────────────
      recentTransactions: recentTransactionsWithNames,

      // ── Period metadata ─────────────────────────────────────────────────────
      periodFilter: 'overall',
      periodLabel: 'All Time',
      periodStart: null,
      periodEnd: null,
      periodTransactions: allTxData.length,

      // ── Period-scoped metrics (set to totals for overall) ─────────────────
      periodNewMembers: nonKiddyMembers.length,
      periodRegularMembers: nonKiddyMembers.filter(m => String(m.membership_type || '').trim().toLowerCase() === 'regular').length,
      periodAssociateMembers: nonKiddyMembers.filter(m => String(m.membership_type || '').trim().toLowerCase() === 'associate').length,
      periodNewKiddyMembers: kiddyMembers.length,
      periodNewLoans: loanData.length,
      periodLoanAmount: loanData.reduce((s, l) => s + (l.amount || 0), 0),
      periodOverdue: overdueLoans.length,
      periodIncome: totalCashIn,
      periodExpense: totalCashOut,
      
      // ── Period product flow (set to 0 for overall) ────────────────────────
      periodCBUNet: 0,
      periodCBUInflow: 0,
      periodCBUOutflow: 0,
      periodSavingsNet: 0,
      periodSavingsInflow: 0,
      periodSavingsOutflow: 0,
      periodTimeDepositNet: 0,
      periodKiddySavingsNet: 0,
      periodSavingsBoosterNet: 0,

      // ── Trends (none for overall) ──────────────────────────────────────────
      trends: {},
    };
  }

  // ── Period Filter ──────────────────────────────────────────────────────────
  const range         = getPeriodRange(period, now);
  const prevRange     = getPreviousPeriodRange(period, now);
  const periodBuckets = buildPeriodBuckets(period, range);

  // ── Fetch all data ────────────────────────────────────────────────────────
  const [membersRes, loansRes, accountsRes, invoicesRes, vouchersRes, tdRes, allTxRes, kiddySavingsRes, savingsBoosterRes] = await Promise.all([
    supabase.from('members').select('id, status, membership_type, date_joined, created_at, first_name, last_name, email'),
    supabase.from('loans').select('id, status, amount, balance, due_date, preview_deductions_json, release_date, created_at'),
    supabase.from('accounts').select('id, account_type, balance'),
    supabase
      .from('invoices')
      .select('id, date, amount, purpose, payment_type, created_at')
      .eq('status', 'paid')
      .in('payment_type', ['capital', 'loan_interest', 'service_fee', 'clpp', 'annual_dues']),
    supabase
      .from('vouchers')
      .select('id, date, amount, created_at')
      .eq('status', 'approved'),
    supabase.from('time_deposits').select('amount, status'),
    supabase
      .from('transactions')
      .select('id, type, category, amount, created_at, transaction_date, member_id')
      .order('created_at', { ascending: false }),
    supabase
      .from('accounts')
      .select('id, account_type, balance')
      .eq('account_type', 'kiddy_savings'),
    supabase
      .from('accounts')
      .select('id, account_type, balance')
      .eq('account_type', 'savings_booster'),
  ]);

  const memberData        = membersRes.data        || [];
  const loanData          = loansRes.data          || [];
  const accountData       = accountsRes.data       || [];
  const invoiceData       = invoicesRes.data       || [];
  const voucherData       = vouchersRes.data       || [];
  const tdData            = tdRes.data             || [];
  const allTxData         = allTxRes.data          || [];
  const kiddySavingsData  = kiddySavingsRes.data   || [];
  const savingsBoosterData = savingsBoosterRes.data || [];

  // ── Member segmentation ──────────────────────────────────────────────────
  const kiddyMembers    = memberData.filter(m => String(m.membership_type || '').trim().toLowerCase() === 'kiddy');
  const nonKiddyMembers = memberData.filter(m => String(m.membership_type || '').trim().toLowerCase() !== 'kiddy');

  // ── Transaction-based cash flow ──────────────────────────────────────────
  const CASH_IN_TYPES  = new Set(['loan_payment','deposit','membership_payment','penalty_payment','other_payment','cbu','savings','membership','time_deposit']);
  const CASH_OUT_TYPES = new Set(['withdrawal','cbu_withdrawal','savings_withdrawal']);

  const cashInTx  = allTxData.filter(t => !CASH_OUT_TYPES.has((t.type||'').toLowerCase()) && (CASH_IN_TYPES.has((t.type||'').toLowerCase()) || CASH_IN_TYPES.has((t.category||'').toLowerCase())));
  const cashOutTx = allTxData.filter(t => CASH_OUT_TYPES.has((t.type||'').toLowerCase()));

  // ── Net proceeds released to members ──────────────────────────────────────
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

  // ── Recent transactions — scoped to selected period ──────────────────────
  const recentTxData = inRange(allTxData, range)
    .sort((a, b) => recordDateMs(b) - recordDateMs(a))
    .slice(0, 8);

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

  // ── Loan Status Distribution (current snapshot) ─────────────────────────
  const loanStatusMap = {};
  loanData.forEach(l => {
    const s = l.status || 'unknown';
    loanStatusMap[s] = (loanStatusMap[s] || 0) + 1;
  });
  const loanStatusChart = Object.entries(loanStatusMap).map(([label, value]) => ({ label, value }));

  // ── Cash Flow — bucketed across selected period ──────────────────────────
  const cashFlowChart = periodBuckets.map(({ label, start, end }) => {
    const startMs = start.getTime();
    const endMs   = end.getTime();

    const inWindow = arr =>
      arr.filter(r => {
        const ms = recordDateMs(r);
        return ms >= startMs && ms <= endMs;
      });

    const cashIn  = inWindow(cashInTx).reduce((s, t) => s + (t.amount || 0), 0)
                  + inWindow(invoiceData).reduce((s, i) => s + (i.amount || 0), 0);
    const cashOut = inWindow(cashOutTx).reduce((s, t) => s + (t.amount || 0), 0)
                  + inWindow(voucherData).reduce((s, v) => s + (v.amount || 0), 0);

    return { label, cashIn, cashOut };
  });

  // ── Member Growth — bucketed across selected period ─────────────────────
  // CRITICAL: Uses date_joined (populated by Excel imports) as the definitive
  // registration date. This ensures dashboard counts match the Members page.
  const monthlyMembers = {};

  const memberGrowthChart = periodBuckets.map(({ start, end, label }) => {
    // Count members whose date_joined falls in this bucket
    // date_joined is the primary field - this is what Excel imports populate
    const membersInBucket = inRangeMembers(nonKiddyMembers, { start, end });

    // Store members for this bucket with full details
    monthlyMembers[label] = membersInBucket.map(m => {
      const registrationRaw = m.date_joined || m.created_at;
      return {
        id: m.id,
        full_name: getMemberDisplayName(m),
        first_name: m.first_name,
        last_name: m.last_name,
        membership_type: m.membership_type,
        status: m.status,
        email: m.email || '',
        created_at: registrationRaw,
        date_joined_formatted: formatDateDisplay(registrationRaw),
      };
    });

    return { label, count: membersInBucket.length };
  });

  // ── Period-scoped metrics ────────────────────────────────────────────────
  // These use date_joined for member counts, matching the Members page
  const periodIncome = inRange(cashInTx, range).reduce((s, t) => s + (t.amount || 0), 0)
                      + inRange(invoiceData, range).reduce((s, i) => s + (i.amount || 0), 0);
  const prevPeriodIncome = inRange(cashInTx, prevRange).reduce((s, t) => s + (t.amount || 0), 0)
                      + inRange(invoiceData, prevRange).reduce((s, i) => s + (i.amount || 0), 0);

  const periodExpense = inRange(cashOutTx, range).reduce((s, t) => s + (t.amount || 0), 0)
                      + inRange(voucherData, range).reduce((s, v) => s + (v.amount || 0), 0);
  const prevPeriodExpense = inRange(cashOutTx, prevRange).reduce((s, t) => s + (t.amount || 0), 0)
                      + inRange(voucherData, prevRange).reduce((s, v) => s + (v.amount || 0), 0);

  // MEMBER COUNTS - Using date_joined for accurate filtering
  // This is the source of truth that matches the Members page
  const periodNewMembers     = inRangeMembers(nonKiddyMembers, range).length;
  const prevPeriodNewMembers = inRangeMembers(nonKiddyMembers, prevRange).length;
  const periodRegularMembers    = inRangeMembers(nonKiddyMembers, range).filter(m => String(m.membership_type || '').trim().toLowerCase() === 'regular').length;
  const periodAssociateMembers  = inRangeMembers(nonKiddyMembers, range).filter(m => String(m.membership_type || '').trim().toLowerCase() === 'associate').length;
  const periodNewKiddyMembers   = inRangeMembers(kiddyMembers, range).length;

  const periodNewLoans     = inRange(loanData, range).length;
  const prevPeriodNewLoans = inRange(loanData, prevRange).length;
  const periodLoanAmount   = inRange(loanData, range).reduce((s, l) => s + (l.amount || 0), 0);

  const periodOverdue     = inRange(overdueLoans, range).length;
  const prevPeriodOverdue = inRange(overdueLoans, prevRange).length;

  const periodTransactions = inRange(allTxData, range).length;

  // ── Product Balances ──────────────────────────────────────────────────────
  function productFlow(inTypes, outTypes) {
    const matches = (t, set) => set.has((t.type || '').toLowerCase()) || set.has((t.category || '').toLowerCase());
    const inflow  = inRange(allTxData.filter(t => matches(t, inTypes)), range).reduce((s, t) => s + (t.amount || 0), 0);
    const outflow = inRange(allTxData.filter(t => matches(t, outTypes)), range).reduce((s, t) => s + (t.amount || 0), 0);
    return { inflow, outflow, net: inflow - outflow };
  }

  const periodCBU            = productFlow(new Set(['cbu']), new Set(['cbu_withdrawal']));
  const periodSavings        = productFlow(new Set(['savings']), new Set(['savings_withdrawal']));
  const periodTimeDeposit    = productFlow(new Set(['time_deposit']), new Set(['time_deposit_withdrawal']));
  const periodKiddySavings   = productFlow(new Set(['kiddy_savings', 'kiddy']), new Set(['kiddy_savings_withdrawal', 'kiddy_withdrawal']));
  const periodSavingsBooster = productFlow(new Set(['savings_booster']), new Set(['savings_booster_withdrawal']));

  return {
    // ── Member totals (all-time, for reference) ────────────────────────────
    totalMembers:         nonKiddyMembers.length,
    activeMembers:        nonKiddyMembers.filter(m => String(m.status || '').trim().toLowerCase() === 'active').length,
    regularMembers:       nonKiddyMembers.filter(m => String(m.membership_type || '').trim().toLowerCase() === 'regular').length,
    associateMembers:     nonKiddyMembers.filter(m => String(m.membership_type || '').trim().toLowerCase() === 'associate').length,
    kiddyMembers:         kiddyMembers.length,
    activeKiddyMembers:   kiddyMembers.filter(m => String(m.status || '').trim().toLowerCase() === 'active').length,
    
    // ── Period-scoped member counts (matches Members page) ─────────────────
    periodNewMembers,
    periodRegularMembers,
    periodAssociateMembers,
    periodNewKiddyMembers,
    
    // ── Loan metrics ────────────────────────────────────────────────────────
    activeLoans:          activeLoans.length,
    totalLoanOutstanding: activeLoans.reduce((s, l) => s + (l.balance ?? l.amount ?? 0), 0),
    overduePayments:      overdueLoans.length,
    periodNewLoans,
    periodLoanAmount,
    periodOverdue,

    // ── Cash flow ────────────────────────────────────────────────────────────
    totalCashIn,
    totalCashOut,
    totalIncome:          totalCashIn,
    periodIncome,
    periodExpense,

    // ── Product balances ────────────────────────────────────────────────────
    totalCBU:             cbuAccounts.reduce((s, a) => s + (a.balance || 0), 0),
    totalSavings:         savingsAccounts.reduce((s, a) => s + (a.balance || 0), 0),
    totalTimeDeposit:     tdData.filter(td => td.status === 'active').reduce((s, td) => s + (td.amount || 0), 0),
    timeDepositCount:     tdData.filter(td => td.status === 'active').length,
    totalKiddySavings:    kiddySavingsData.reduce((s, a) => s + (a.balance || 0), 0),
    kiddySavingsCount:    kiddySavingsData.length,
    totalSavingsBooster:  savingsBoosterData.reduce((s, a) => s + (a.balance || 0), 0),
    savingsBoosterCount:  savingsBoosterData.length,

    // ── Period product flow ──────────────────────────────────────────────────
    periodCBUNet:            periodCBU.net,
    periodCBUInflow:         periodCBU.inflow,
    periodCBUOutflow:        periodCBU.outflow,
    periodSavingsNet:        periodSavings.net,
    periodSavingsInflow:     periodSavings.inflow,
    periodSavingsOutflow:    periodSavings.outflow,
    periodTimeDepositNet:    periodTimeDeposit.net,
    periodKiddySavingsNet:   periodKiddySavings.net,
    periodSavingsBoosterNet: periodSavingsBooster.net,

    // ── Charts ──────────────────────────────────────────────────────────────
    loanStatusChart,
    cashFlowChart,
    memberGrowthChart,
    monthlyMembers,

    // ── Recent transactions ─────────────────────────────────────────────────
    recentTransactions: recentTransactionsWithNames,

    // ── Period metadata ─────────────────────────────────────────────────────
    periodFilter:      period,
    periodLabel:       range.label,
    periodStart:       range.start.toISOString(),
    periodEnd:         range.end.toISOString(),
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