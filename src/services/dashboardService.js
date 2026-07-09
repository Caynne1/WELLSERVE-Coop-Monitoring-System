// dashboardService.js - Updated with monthlyMembers data

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
// Supported periods: 'today' | 'week' | 'month' | 'year' | 'custom:YYYY-MM-DD'
// The 'custom:' form is produced by the dashboard's date-picker and selects
// a single specific day, regardless of the current date.
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

// ── Bucket generation for period-scoped charts ────────────────────────────
// Builds the set of sub-buckets (with their own date ranges + labels) that
// the trend charts (cash flow / member growth / loan status) should use for
// a given period selection, so every visual — not just the summary cards —
// reflects the selected date range.
function buildPeriodBuckets(period, range) {
  const isCustomOrToday = period === 'today' || (typeof period === 'string' && period.startsWith('custom:'));

  if (isCustomOrToday) {
    // 6 buckets of 4 hours across the selected day
    const buckets = [];
    for (let h = 0; h < 24; h += 4) {
      const s = new Date(range.start); s.setHours(h, 0, 0, 0);
      const e = new Date(range.start); e.setHours(h + 3, 59, 59, 999);
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

// ── Member registration date — single source of truth ─────────────────────
// The Members page and Member Details treat `date_joined` as the record of
// registration. Some rows (manually added or Excel-imported) may not have it
// set, in which case we fall back to `created_at` — but `date_joined` always
// wins when present. Date-only values are normalized to noon to avoid a
// UTC-midnight parse rolling the date back a day in some timezones.
function memberRegistrationMs(member) {
  const raw = member.date_joined
    ? (String(member.date_joined).includes('T') ? member.date_joined : `${member.date_joined}T12:00:00`)
    : member.created_at;
  if (!raw) return NaN;
  return new Date(raw).getTime();
}

function inRangeMembers(members, range) {
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();
  return members.filter(m => {
    const ms = memberRegistrationMs(m);
    return !Number.isNaN(ms) && ms >= startMs && ms <= endMs;
  });
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

// ── Helper to format date for display (full month name for readability) ───
function formatDateDisplay(dateStr) {
  if (!dateStr) return null;
  try {
    // Date-only values (e.g. "2026-07-09") parse as UTC midnight, which can
    // roll back to the previous calendar day once converted to local time.
    // Normalize to noon first so the displayed date always matches exactly
    // what's stored, the same way every other date parse in this file does.
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

  // ── Period Filter (Today / Week / Month / Year / Custom) ─────────────────
  // Computed up-front so every chart, table, and metric below can be scoped
  // to the same selected date range.
  const range         = getPeriodRange(period, now);
  const prevRange     = getPreviousPeriodRange(period, now);
  const periodBuckets = buildPeriodBuckets(period, range);

  const [membersRes, loansRes, accountsRes, invoicesRes, vouchersRes, tdRes, allTxRes, kiddySavingsRes, savingsBoosterRes] = await Promise.all([
    supabase.from('members').select('id, status, membership_type, date_joined, created_at, first_name, last_name, email'),
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
  const kiddyMembers    = memberData.filter(m => String(m.membership_type || '').trim().toLowerCase() === 'kiddy');
  const nonKiddyMembers = memberData.filter(m => String(m.membership_type || '').trim().toLowerCase() !== 'kiddy');

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

  // Recent transactions for activity feed — scoped to the selected period
  const recentTxData = inRange(allTxData, range)
    .sort((a, b) => recordDateMs(b) - recordDateMs(a))
    .slice(0, 8);

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
  // This is a current-state snapshot (how existing loans are distributed by
  // status right now), not "loans opened in the period" — filtering it down
  // to just-created loans would make it empty on any day with no new loans.
  const loanStatusMap = {};
  loanData.forEach(l => {
    const s = l.status || 'unknown';
    loanStatusMap[s] = (loanStatusMap[s] || 0) + 1;
  });
  const loanStatusChart = Object.entries(loanStatusMap).map(([label, value]) => ({ label, value }));

  // ── Cash Flow — bucketed across the selected period ───────────────────────
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

  // ── Member Growth — bucketed across the selected period ───────────────────
  // Groups members by their actual registration date (date_joined). Falls back
  // to created_at only when date_joined is missing (e.g. legacy/imported rows).
  // Date-only values are normalized to noon before parsing to avoid UTC
  // string-slice timezone errors shifting a member into the wrong bucket.

  // Create per-bucket members data for drill-down modal
  const monthlyMembers = {};

  const memberGrowthChart = periodBuckets.map(({ start, end, label }) => {
    // Find members who joined in this bucket — uses the same
    // memberRegistrationMs/date_joined logic as the summary cards above,
    // so the chart, the cards, and the Members page always agree.
    const membersInBucket = inRangeMembers(nonKiddyMembers, { start, end });

    // Store members for this bucket (keyed by the same label the chart uses)
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

  const periodIncome = inRange(cashInTx, range).reduce((s, t) => s + (t.amount || 0), 0)
                      + inRange(invoiceData, range).reduce((s, i) => s + (i.amount || 0), 0);
  const prevPeriodIncome = inRange(cashInTx, prevRange).reduce((s, t) => s + (t.amount || 0), 0)
                      + inRange(invoiceData, prevRange).reduce((s, i) => s + (i.amount || 0), 0);

  const periodExpense = inRange(cashOutTx, range).reduce((s, t) => s + (t.amount || 0), 0)
                      + inRange(voucherData, range).reduce((s, v) => s + (v.amount || 0), 0);
  const prevPeriodExpense = inRange(cashOutTx, prevRange).reduce((s, t) => s + (t.amount || 0), 0)
                      + inRange(voucherData, prevRange).reduce((s, v) => s + (v.amount || 0), 0);

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

  // ── Product Balances — net movement within the selected period ────────────
  // Account balances (totalCBU, totalSavings, etc.) are running totals and
  // can't be "as of" a past date without a full ledger, so each product also
  // gets a period-scoped net flow (deposits minus withdrawals) so the
  // Product Balances cards move with the date filter too.
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
    totalMembers:         nonKiddyMembers.length,
    activeMembers:        nonKiddyMembers.filter(m => String(m.status || '').trim().toLowerCase() === 'active').length,
    regularMembers:       nonKiddyMembers.filter(m => String(m.membership_type || '').trim().toLowerCase() === 'regular').length,
    associateMembers:     nonKiddyMembers.filter(m => String(m.membership_type || '').trim().toLowerCase() === 'associate').length,
    kiddyMembers:         kiddyMembers.length,
    activeKiddyMembers:   kiddyMembers.filter(m => String(m.status || '').trim().toLowerCase() === 'active').length,
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
    monthlyMembers, // Added: members grouped by month for drill-down

    recentTransactions: recentTransactionsWithNames,

    // ── Period Filter data (Today / Week / Month / Year) ──────────────────
    periodFilter:      period,
    periodLabel:       range.label,
    periodStart:       range.start.toISOString(),
    periodEnd:         range.end.toISOString(),
    periodIncome,
    periodExpense,
    periodNewMembers,
    periodRegularMembers,
    periodAssociateMembers,
    periodNewKiddyMembers,
    periodNewLoans,
    periodLoanAmount,
    periodOverdue,
    periodTransactions,
    periodCBUNet:            periodCBU.net,
    periodCBUInflow:         periodCBU.inflow,
    periodCBUOutflow:        periodCBU.outflow,
    periodSavingsNet:        periodSavings.net,
    periodSavingsInflow:     periodSavings.inflow,
    periodSavingsOutflow:    periodSavings.outflow,
    periodTimeDepositNet:    periodTimeDeposit.net,
    periodKiddySavingsNet:   periodKiddySavings.net,
    periodSavingsBoosterNet: periodSavingsBooster.net,
    trends: {
      income:  pctChange(periodIncome, prevPeriodIncome),
      expense: pctChange(periodExpense, prevPeriodExpense),
      members: pctChange(periodNewMembers, prevPeriodNewMembers),
      loans:   pctChange(periodNewLoans, prevPeriodNewLoans),
      overdue: pctChange(periodOverdue, prevPeriodOverdue),
    },
  };
}