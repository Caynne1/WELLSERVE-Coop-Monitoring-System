import { useState, useEffect, useMemo } from 'react';
import {
  Users, CreditCard, PiggyBank, Wallet,
  TrendingUp, TrendingDown, Download,
  Calendar, Printer,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import {
  startOfMonth, endOfMonth, startOfYear, endOfYear,
  format, parseISO, eachWeekOfInterval,
  eachMonthOfInterval, eachYearOfInterval, addDays, isValid,
} from 'date-fns';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import { getMemberStats } from '../../services/memberService';
import { getLoans, getLoanStats } from '../../services/loanService';
import { getAccountStats } from '../../services/accountService';
import { computeCoopSummaryFromInvoices, getIncomeBreakdown } from '../../services/coopFundService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { exportToCSV } from '../../utils/csvExport';
import { recordedOtherCharge } from '../../utils/otherCharges';
import { printHtmlDocument, wrapWithLetterhead } from '../../utils/print';

// â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const REPORT_START_YEAR = 2023;
const ALL_HISTORY_START = new Date(REPORT_START_YEAR, 0, 1);

const CHART_COLORS = {
  loans:   { stroke: '#f97316' },
  savings: { stroke: '#2563eb' },
  cbu:     { stroke: '#059669' },
  income:  { stroke: '#10b981' },
  expense: { stroke: '#ef4444' },
};

const EARNED_INCOME_CATEGORIES = new Set([
  'loan_interest',
  'penalty_payment',
  'penalty',
  'penalty_due',
  'membership',
  'membership_fee',
  'vip_card',
  'service_fee',
  'legal_fees',
  'annual_dues',
  'petty_cash',
  'admin_regulatory_fees',
  'others',
  'other_payment',
]);

const BREAKDOWN_INCOME_KEYS = [
  'other_charges',
  'loan_interest',
  'service_fee',
  'legal_fees',
  'penalty_due',
  'annual_dues',
  'petty_cash',
  'membership_fee',
  'vip_card',
  'admin_regulatory_fees',
];

function earnedIncomeFromBreakdown(breakdown) {
  return BREAKDOWN_INCOME_KEYS.reduce(
    (sum, key) => sum + Number(breakdown?.[key] || 0),
    0,
  );
}

function ledgerDate(tx) {
  return tx?.transaction_date || tx?.created_at || null;
}

function normalized(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function isCountedLedgerRow(tx) {
  return !tx?.display_only && normalized(tx?.category) !== 'voucher';
}

function isLoanRelease(tx) {
  const category = normalized(tx.category);
  return tx.type === 'cash_out' && (
    category === 'loan_release' ||
    category === 'loan_net_proceeds' ||
    category === 'capital'
  );
}

function isFundExpense(tx) {
  const category = normalized(tx.category);
  return tx.type === 'cash_out' &&
    !isLoanRelease(tx) &&
    !category.includes('withdrawal');
}

function isLoanPayment(tx) {
  const text = normalized(`${tx.description || ''} ${tx.note || ''}`);
  return tx.type === 'cash_in' && (
    normalized(tx.category) === 'loan_payment' ||
    normalized(tx.raw_type) === 'loan_payment' ||
    (normalized(tx.category) === 'loan' && !text.includes('interest'))
  );
}

function isCbuContribution(tx) {
  return tx.type === 'cash_in' && [
    'cbu', 'membership_cbu', 'cbu_retention', 'cbu_completion',
  ].includes(normalized(tx.category));
}

function isSavingsContribution(tx) {
  return tx.type === 'cash_in' && [
    'savings', 'membership_savings', 'regular_savings',
  ].includes(normalized(tx.category));
}

function isLoanDeduction(tx) {
  const category = normalized(tx.category);
  const rawType = normalized(tx.raw_type);
  return tx.type === 'cash_in' && (
    rawType === 'loan_deduction' ||
    [
      'service_fee',
      'cbu_retention',
      'legal_fees',
      'insurance',
      'clpi_insurance',
      'regular_savings',
      'penalty_due',
      'annual_dues',
      'cbu_completion',
      'petty_cash',
      'admin_regulatory_fees',
      'membership_fee',
      'vip_card',
    ].includes(category)
  );
}

function isReportIncome(tx) {
  if (tx.type !== 'cash_in') return false;
  const explicit = recordedOtherCharge(tx.notes || tx.note || tx.description);
  if (explicit) return BREAKDOWN_INCOME_KEYS.includes(explicit.value);
  const category = normalized(tx.category);
  const rawType = normalized(tx.raw_type);
  return EARNED_INCOME_CATEGORIES.has(category) || EARNED_INCOME_CATEGORIES.has(rawType);
}

// â”€â”€ Date helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function buildTimeSeries(transactions, from, to, preset) {
  let intervals = [];
  const opts = { weekStartsOn: 1 };

  if (preset === 'monthly') {
    intervals = eachWeekOfInterval({ start: from, end: to }, opts);
  } else if (preset === 'all') {
    const recordedDates = transactions
      .map(transaction => ledgerDate(transaction))
      .map(value => value ? parseISO(value) : null)
      .filter(date => date && isValid(date));
    const firstRecordedDate = recordedDates.reduce(
      (earliest, date) => !earliest || date < earliest ? date : earliest,
      null,
    ) || to;
    intervals = eachYearOfInterval({ start: startOfYear(firstRecordedDate), end: to });
  } else {
    intervals = eachMonthOfInterval({ start: from, end: to });
  }

  return intervals.map((periodStart, i) => {
    const periodEnd = i < intervals.length - 1
      ? addDays(intervals[i + 1], -1)
      : to;

    const inPeriod = transactions.filter(tx => {
      const dateValue = ledgerDate(tx);
      const d = dateValue ? parseISO(dateValue) : null;
      if (!d || !isValid(d)) return false;
      return d >= periodStart && d <= periodEnd;
    });

    return {
      label: preset === 'monthly'
          ? `W${i + 1}`
          : format(periodStart, preset === 'annual' ? 'MMM' : preset === 'all' ? 'yyyy' : 'MMM yy'),
      loans:   inPeriod.filter(t => isCountedLedgerRow(t) && isLoanRelease(t)).reduce((s, t) => s + Number(t.amount || 0), 0),
      savings: inPeriod.filter(isSavingsContribution).reduce((s, t) => s + Number(t.amount || 0), 0),
      cbu:     inPeriod.filter(isCbuContribution).reduce((s, t) => s + Number(t.amount || 0), 0),
      income:  inPeriod.filter(t => isCountedLedgerRow(t) && isReportIncome(t)).reduce((s, t) => s + Number(t.amount || 0), 0),
      expense: inPeriod.filter(t => isCountedLedgerRow(t) && isFundExpense(t)).reduce((s, t) => s + Number(t.amount || 0), 0),
    };
  });
}

// â”€â”€ SVG Trend Chart â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function TrendChart({ title, current, color, labels }) {
  const values = current.map(value => Number(value || 0));
  const max = Math.max(...values, 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  const average = values.length > 0 ? total / values.length : 0;
  const peakIndex = values.indexOf(max);
  const magnitude = max > 0 ? 10 ** Math.floor(Math.log10(max)) : 1;
  const axisMax = max > 0 ? Math.ceil(max / magnitude) * magnitude : 1;
  const compact = value => Number(value || 0).toLocaleString('en-PH', {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  const minimumWidth = Math.max(520, labels.length * 58);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">{title}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{formatCurrency(total)}</p>
          <p className="mt-0.5 text-xs text-gray-400">Total for selected period</p>
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <p className="text-[10px] font-semibold uppercase text-gray-400">Average</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-gray-700">{formatCurrency(average)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase text-gray-400">Peak period</p>
            <p className="mt-1 text-sm font-semibold text-gray-700">{labels[peakIndex] || '-'}</p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto px-4 pb-4 pt-5">
        <div className="flex gap-3" style={{ minWidth: minimumWidth }}>
          <div className="flex h-56 w-14 flex-shrink-0 flex-col justify-between pb-7 text-right text-[10px] tabular-nums text-gray-400">
            {[1, 0.75, 0.5, 0.25, 0].map(ratio => (
              <span key={ratio}>{compact(axisMax * ratio)}</span>
            ))}
          </div>
          <div className="relative h-56 flex-1">
            <div className="absolute inset-x-0 top-0 bottom-7 flex flex-col justify-between" aria-hidden="true">
              {[0, 1, 2, 3, 4].map(line => <div key={line} className="border-t border-gray-100" />)}
            </div>
            <div className="absolute inset-x-0 top-0 bottom-0 flex items-end gap-2">
              {labels.map((label, index) => {
                const value = values[index] || 0;
                const height = max > 0 ? Math.max(value > 0 ? 3 : 0, (value / axisMax) * 100) : 0;
                return (
                  <div key={`${label}-${index}`} className="flex h-full min-w-[42px] flex-1 flex-col items-center justify-end">
                    <div className="relative flex w-full flex-1 items-end justify-center pb-1">
                      <div
                        className="group relative w-[62%] max-w-12 rounded-t-sm transition-opacity hover:opacity-80"
                        style={{ height: `${height}%`, backgroundColor: color.stroke }}
                        title={`${label}: ${formatCurrency(value)}`}
                      >
                        {labels.length <= 6 && value > 0 && (
                          <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-semibold tabular-nums text-gray-500">
                            {compact(value)}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`h-6 text-[10px] font-medium ${index === peakIndex && max > 0 ? 'text-gray-800' : 'text-gray-400'}`}>
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// â”€â”€ Stat Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function StatCard({ icon, label, value, sub, iconBg, iconColor, trend, trendLabel }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        <span style={{ color: iconColor }}>{icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5 tabular-nums">{value}</p>
        <div className="flex items-center gap-2 mt-1">
          {sub && <p className="text-xs text-gray-400">{sub}</p>}
          {trend !== undefined && trend !== null && (
            <span className={`flex items-center gap-0.5 text-xs font-semibold ${
              trend > 0 ? 'text-emerald-600' : trend < 0 ? 'text-red-500' : 'text-gray-400'
            }`}>
              {trend > 0 ? <ArrowUpRight size={11} /> : trend < 0 ? <ArrowDownRight size={11} /> : <Minus size={11} />}
              {Math.abs(trend).toFixed(1)}%
              {trendLabel && <span className="text-gray-400 font-normal ml-0.5">{trendLabel}</span>}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// â”€â”€ Membership Breakdown Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Renders a horizontal stacked bar showing the proportion of each member type
// alongside per-type counts. Inactive members shown as a separate row.

function MembershipBreakdownCard({ memberStats }) {
  const regular   = memberStats?.regular   ?? 0;
  const associate = memberStats?.associate ?? 0;
  const kiddy     = memberStats?.kiddy     ?? 0;
  const inactive  = memberStats?.inactive  ?? 0;
  const active    = memberStats?.active    ?? 0;

  // Total for the stacked bar is all typed members (excl. inactive which cross-cuts)
  const total = regular + associate + kiddy;

  const segments = [
    { label: 'Regular',   count: regular,   color: '#7C3AED', bg: 'bg-violet-500',  light: 'bg-violet-50',  text: 'text-violet-700'  },
    { label: 'Associate', count: associate, color: '#D97706', bg: 'bg-amber-400',   light: 'bg-amber-50',   text: 'text-amber-700'   },
    { label: 'Kiddy',     count: kiddy,     color: '#0D9488', bg: 'bg-teal-500',    light: 'bg-teal-50',    text: 'text-teal-700'    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 col-span-2 sm:col-span-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">
        Membership Breakdown
      </p>

      {/* Stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden gap-px mb-5">
        {segments.map(({ label, count, color }) => {
          const pct = total > 0 ? (count / total) * 100 : 0;
          return pct > 0 ? (
            <div
              key={label}
              style={{ width: `${pct}%`, background: color }}
              title={`${label}: ${count}`}
            />
          ) : null;
        })}
        {total === 0 && <div className="flex-1 bg-gray-100" />}
      </div>

      {/* Per-type rows */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {segments.map(({ label, count, color, light, text }) => {
          const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
          return (
            <div key={label} className={`rounded-xl p-3 ${light}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                <span className={`text-xs font-semibold ${text}`}>{label}</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{count}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{pct}% of members</p>
            </div>
          );
        })}

        {/* Inactive â€” cross-cutting status, shown separately */}
        <div className="rounded-xl p-3 bg-gray-50 border border-gray-100">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-2 h-2 rounded-full bg-gray-400 flex-shrink-0" />
            <span className="text-xs font-semibold text-gray-500">Inactive</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{inactive}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {total + inactive > 0 ? (((inactive / (total + inactive)) * 100).toFixed(1)) : '0.0'}% of all members
          </p>
        </div>
      </div>

      {/* Active / inactive summary strip */}
      <div className="mt-4 flex items-center gap-4 pt-4 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-xs text-gray-500">Active</span>
          <span className="text-xs font-bold text-gray-800 tabular-nums">{active}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-gray-300" />
          <span className="text-xs text-gray-500">Inactive</span>
          <span className="text-xs font-bold text-gray-800 tabular-nums">{inactive}</span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-gray-400">Total</span>
          <span className="text-xs font-bold text-gray-900 tabular-nums">{(memberStats?.total ?? 0)}</span>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-3 mt-8">
      {children}
    </h2>
  );
}

// â”€â”€ Date Range Picker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ReportPeriodFilter({ selectedYear, selectedMonth, years, onYearChange, onMonthChange }) {
  const months = Array.from({ length: 12 }, (_, index) => ({
    value: String(index + 1).padStart(2, '0'),
    label: format(new Date(2000, index, 1), 'MMMM'),
  }));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Report year"
        value={selectedYear}
        onChange={event => onYearChange(event.target.value)}
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition-colors focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
      >
        <option value="all">All Years</option>
        {years.map(year => <option key={year} value={String(year)}>{year}</option>)}
      </select>
      <select
        aria-label="Custom report month"
        value={selectedMonth}
        onChange={event => onMonthChange(event.target.value)}
        className={`rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 ${
          selectedMonth ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-700'
        }`}
      >
        <option value="">Month</option>
        {months.map(month => <option key={month.value} value={month.value}>{month.label}</option>)}
      </select>
    </div>
  );
}

// â”€â”€ Print helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Build a self-contained HTML string for the report,
 * ready to be wrapped in the WELLSERVE letterhead and sent to print.
 */
function buildReportHtml({
  periodLabel, memberStats, loanStats, accountStats,
  totalDeposited, totalWithdrawn, totalRepaid, totalReleased,
  totalIncome, totalExpense, loanInterest, penaltyCollected, membershipCollections,
  loanDeductions, totalCBUBalance, totalSavingsBalance, netCashFlow,
  openingCashBalance, closingCashBalance, collectionPerformance, customCharges = [],
}) {
  const fmt = (n) =>
    'PHP ' + Number(n ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num = (n) => Number(n ?? 0).toLocaleString();
  const escapeLabel = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const now = new Date();
  const generated = now.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    + ' at ' + now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });

  const reportHtml = `
    <h1 class="report-title">Financial Report</h1>
    <div class="report-meta">
      <strong>Period:</strong> ${periodLabel} &nbsp;|&nbsp;
      <strong>Generated:</strong> ${generated} &nbsp;|&nbsp;
      <span style="color:#b91c1c;font-weight:600">CONFIDENTIAL - AUTHORIZED USE ONLY</span>
    </div>

    <div class="section-heading">Current Membership Snapshot</div>
    <div class="stats-grid">
      <div class="stat-box"><div class="stat-label">Total Members</div><div class="stat-value">${num(memberStats?.total)}</div><div class="stat-sub">${num(memberStats?.active)} active</div></div>
      <div class="stat-box"><div class="stat-label">Regular</div><div class="stat-value">${num(memberStats?.regular)}</div></div>
      <div class="stat-box"><div class="stat-label">Associate</div><div class="stat-value">${num(memberStats?.associate)}</div></div>
      <div class="stat-box"><div class="stat-label">Kiddy</div><div class="stat-value">${num(memberStats?.kiddy)}</div></div>
      <div class="stat-box"><div class="stat-label">Active</div><div class="stat-value">${num(memberStats?.active)}</div></div>
      <div class="stat-box"><div class="stat-label">Inactive</div><div class="stat-value">${num(memberStats?.inactive)}</div></div>
      <div class="stat-box"><div class="stat-label">Closed Accounts</div><div class="stat-value">${num(memberStats?.closed)}</div></div>
    </div>

    <div class="section-heading">Current Loan Portfolio Snapshot</div>
    <div class="stats-grid">
      <div class="stat-box"><div class="stat-label">Total Loans</div><div class="stat-value">${num(loanStats?.total)}</div><div class="stat-sub">${num(loanStats?.active)} active</div></div>
      <div class="stat-box"><div class="stat-label">Pending Loan Amount</div><div class="stat-value" style="font-size:10pt">${fmt(loanStats?.pendingAmount)}</div></div>
      <div class="stat-box"><div class="stat-label">Approved Loan Amount</div><div class="stat-value" style="font-size:10pt">${fmt(loanStats?.approvedAmount)}</div></div>
      <div class="stat-box"><div class="stat-label">Cumulative Released Amount</div><div class="stat-value" style="font-size:10pt">${fmt(loanStats?.totalReleased)}</div></div>
      <div class="stat-box"><div class="stat-label">Outstanding Payable</div><div class="stat-value" style="font-size:10pt">${fmt(loanStats?.totalOutstanding)}</div></div>
    </div>

    <div class="section-heading">Current Member Account Balances</div>
    <div class="stats-grid">
      <div class="stat-box"><div class="stat-label">Total CBU Balance</div><div class="stat-value" style="font-size:10pt">${fmt(totalCBUBalance)}</div><div class="stat-sub">${num(accountStats?.cbuCount)} accounts</div></div>
      <div class="stat-box"><div class="stat-label">Total Savings Balance</div><div class="stat-value" style="font-size:10pt">${fmt(totalSavingsBalance)}</div><div class="stat-sub">${num(accountStats?.savingsCount)} accounts</div></div>
    </div>

    ${customCharges.length ? '<div class="section-heading">Custom Charges Breakdown</div><div class="stats-grid">' + customCharges.map(charge => '<div class="stat-box"><div class="stat-label">' + escapeLabel(charge.label) + '</div><div class="stat-value">' + fmt(charge.amount) + '</div></div>').join('') + '</div>' : ''}
    <div class="section-heading">Selected Period Activity</div>
    <div class="stats-grid">
      <div class="stat-box"><div class="stat-label">Cash In (Period)</div><div class="stat-value" style="font-size:10pt">${fmt(totalDeposited)}</div></div>
      <div class="stat-box"><div class="stat-label">Cash Out (Period)</div><div class="stat-value" style="font-size:10pt">${fmt(totalWithdrawn)}</div></div>
      <div class="stat-box"><div class="stat-label">Net Cash Flow</div><div class="stat-value" style="font-size:10pt">${fmt(netCashFlow)}</div></div>
      <div class="stat-box"><div class="stat-label">Cooperative Income</div><div class="stat-value" style="font-size:10pt">${fmt(totalIncome)}</div></div>
      <div class="stat-box"><div class="stat-label">Operating Expenses</div><div class="stat-value" style="font-size:10pt">${fmt(totalExpense)}</div></div>
      <div class="stat-box"><div class="stat-label">Principal Collected</div><div class="stat-value" style="font-size:10pt">${fmt(totalRepaid)}</div></div>
      <div class="stat-box"><div class="stat-label">Loan Interest Collected</div><div class="stat-value" style="font-size:10pt">${fmt(loanInterest)}</div></div>
      <div class="stat-box"><div class="stat-label">Penalty Collected</div><div class="stat-value" style="font-size:10pt">${fmt(penaltyCollected)}</div></div>
      <div class="stat-box"><div class="stat-label">Loan Releases</div><div class="stat-value" style="font-size:10pt">${fmt(totalReleased)}</div></div>
      <div class="stat-box"><div class="stat-label">Membership/Admin Fees</div><div class="stat-value" style="font-size:10pt">${fmt(membershipCollections)}</div></div>
      <div class="stat-box"><div class="stat-label">Loan Deductions</div><div class="stat-value" style="font-size:10pt">${fmt(loanDeductions)}</div></div>
    </div>

    <div class="section-heading">Cash Reconciliation</div>
    <div class="stats-grid">
      <div class="stat-box"><div class="stat-label">Opening Cash</div><div class="stat-value" style="font-size:10pt">${fmt(openingCashBalance)}</div></div>
      <div class="stat-box"><div class="stat-label">Cash In</div><div class="stat-value" style="font-size:10pt">${fmt(totalDeposited)}</div></div>
      <div class="stat-box"><div class="stat-label">Cash Out</div><div class="stat-value" style="font-size:10pt">${fmt(totalWithdrawn)}</div></div>
      <div class="stat-box"><div class="stat-label">Closing Cash</div><div class="stat-value" style="font-size:10pt">${fmt(closingCashBalance)}</div></div>
    </div>

    <div class="section-heading">Loan Collection Performance</div>
    <div class="stats-grid">
      <div class="stat-box"><div class="stat-label">Scheduled Due</div><div class="stat-value" style="font-size:10pt">${fmt(collectionPerformance?.scheduledDue)}</div></div>
      <div class="stat-box"><div class="stat-label">Total Collected</div><div class="stat-value" style="font-size:10pt">${fmt(collectionPerformance?.totalCollected)}</div></div>
      <div class="stat-box"><div class="stat-label">Collection Rate</div><div class="stat-value">${Number(collectionPerformance?.collectionRate || 0).toFixed(1)}%</div></div>
      <div class="stat-box"><div class="stat-label">Missed / Partial</div><div class="stat-value">${num(collectionPerformance?.missed)} / ${num(collectionPerformance?.partial)}</div></div>
    </div>

    <div class="confidential">
      WELLSERVE Cooperative Monitoring System - This report is for authorized personnel only.
    </div>
  `;
  // Convert the shared summary values into a document table rather than UI cards.
  const doc = new DOMParser().parseFromString(reportHtml, 'text/html');
  doc.querySelectorAll('.stats-grid').forEach(grid => {
    const heading = grid.previousElementSibling;
    const table = doc.createElement('table');
    table.className = 'report-statement';
    const thead = table.createTHead();
    const header = thead.insertRow();
    for (const label of [heading?.textContent || 'Summary', 'Amount / Count']) {
      const cell = doc.createElement('th');
      cell.scope = 'col';
      cell.textContent = label;
      header.appendChild(cell);
    }
    const body = table.createTBody();
    grid.querySelectorAll('.stat-box').forEach(box => {
      const row = body.insertRow();
      const label = row.insertCell();
      label.textContent = box.querySelector('.stat-label')?.textContent || '';
      const note = box.querySelector('.stat-sub')?.textContent;
      if (note) {
        const detail = doc.createElement('span');
        detail.className = 'report-note';
        detail.textContent = ' (' + note + ')';
        label.appendChild(detail);
      }
      row.insertCell().textContent = box.querySelector('.stat-value')?.textContent || '';
      if (['Net Cash Flow', 'Closing Cash', 'Outstanding Payable'].includes(label.textContent)) {
        row.className = 'report-total';
      }
    });
    if (heading?.textContent === 'Selected Period Activity') table.classList.add('period-start');
    heading?.remove();
    grid.replaceWith(table);
  });
  return '<div class="financial-print">' + doc.body.innerHTML + '</div>';
}

// â”€â”€ Main â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function ReportsPage() {
  const [memberStats, setMemberStats]       = useState(null);
  const [loanStats, setLoanStats]           = useState(null);
  const [loans, setLoans]                   = useState([]);
  const [accountStats, setAccountStats]     = useState(null);
  const [allTransactions, setAllTransactions] = useState([]);
  const [incomeBreakdown, setIncomeBreakdown] = useState(null);
  const [loading, setLoading]               = useState(true);

  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState('');

  // Active date range
  const { from, to, seriesMode } = useMemo(() => {
    if (selectedMonth) {
      const yearValue = selectedYear === 'all' ? new Date().getFullYear() : Number(selectedYear);
      const month = new Date(yearValue, Number(selectedMonth) - 1, 1);
      return { from: startOfMonth(month), to: endOfMonth(month), seriesMode: 'monthly' };
    }
    if (selectedYear !== 'all') {
      const year = new Date(Number(selectedYear), 0, 1);
      return { from: startOfYear(year), to: endOfYear(year), seriesMode: 'annual' };
    }
    return { from: ALL_HISTORY_START, to: endOfYear(new Date()), seriesMode: 'all' };
  }, [selectedYear, selectedMonth]);

  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = new Set();
    for (let year = REPORT_START_YEAR; year <= currentYear + 10; year += 1) years.add(year);
    allTransactions.forEach(transaction => {
      const value = ledgerDate(transaction);
      const date = value ? parseISO(value) : null;
      const year = date && isValid(date) ? date.getFullYear() : null;
      if (year && year >= REPORT_START_YEAR && year <= currentYear + 20) years.add(year);
    });
    return [...years].sort((a, b) => b - a);
  }, [allTransactions]);

  async function fetchAll() {
    setLoading(true);
    try {
      const rangeArgs = {
        from: format(from, 'yyyy-MM-dd'),
        to: format(to, 'yyyy-MM-dd'),
      };
      const [ms, ls, loanRows, as, fundSummary, incomeSummary] = await Promise.all([
        getMemberStats(),
        getLoanStats(),
        getLoans(),
        getAccountStats(),
        computeCoopSummaryFromInvoices(),
        getIncomeBreakdown(rangeArgs),
      ]);
      setMemberStats(ms);
      setLoanStats(ls);
      setLoans(loanRows || []);
      setAccountStats(as);
      setAllTransactions(fundSummary?.transactions || []);
      setIncomeBreakdown(incomeSummary);
    } catch {
      toast.error(
        (t) => (
          <span className="flex items-center gap-3 text-sm">
            Failed to load report data.
            <button
              className="flex-shrink-0 text-xs font-bold underline"
              onClick={() => { toast.dismiss(t.id); fetchAll(); }}
            >
              Retry
            </button>
          </span>
        ),
        { duration: 6000 }
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAll(); }, [from, to]);

  // Filter by period
  const filterByRange = (txs, rangeFrom, rangeTo) => txs.filter(tx => {
    const dateValue = ledgerDate(tx);
    const d = dateValue ? parseISO(dateValue) : null;
    if (!d || !isValid(d)) return false;
    return d >= rangeFrom && d <= rangeTo;
  });

  const transactions     = useMemo(() => filterByRange(allTransactions, from, to), [allTransactions, from, to]);
  const countedTransactions = useMemo(() => transactions.filter(isCountedLedgerRow), [transactions]);

  // Derived
  const sum = (arr, pred) => arr.filter(pred).reduce((s, t) => s + Number(t.amount || 0), 0);

  const totalDeposited  = sum(countedTransactions, t => t.type === 'cash_in');
  const totalWithdrawn  = sum(countedTransactions, t => t.type === 'cash_out');
  const totalRepaid     = sum(countedTransactions, isLoanPayment);
  const totalReleased   = sum(countedTransactions, isLoanRelease);
  const totalExpense    = sum(countedTransactions, isFundExpense);
  const totalIncome     = earnedIncomeFromBreakdown(incomeBreakdown);
  const loanInterest    = Number(incomeBreakdown?.loan_interest || 0);
  const penaltyCollected = Number(incomeBreakdown?.penalty_due || 0);
  const membershipCollections = Number(incomeBreakdown?.membership_fee || 0) +
    Number(incomeBreakdown?.admin_regulatory_fees || 0);
  const loanDeductions = sum(countedTransactions, isLoanDeduction);
  const totalCBUBalance = Number(accountStats?.totalCBU || 0);
  const totalSavingsBalance = Number(accountStats?.totalSavings || 0);
  const netCashFlow = totalDeposited - totalWithdrawn;

  const validLedgerRows = useMemo(() => {
    const latestAllowedYear = new Date().getFullYear() + 20;
    return allTransactions.filter(transaction => {
      const value = ledgerDate(transaction);
      const date = value ? parseISO(value) : null;
      return date && isValid(date) && date.getFullYear() >= REPORT_START_YEAR && date.getFullYear() <= latestAllowedYear;
    });
  }, [allTransactions]);
  const invalidDateCount = allTransactions.length - validLedgerRows.length;
  const openingRows = validLedgerRows.filter(transaction => {
    const date = parseISO(ledgerDate(transaction));
    return date < from && isCountedLedgerRow(transaction);
  });
  const openingCashBalance = sum(openingRows, transaction => transaction.type === 'cash_in')
    - sum(openingRows, transaction => transaction.type === 'cash_out');
  const closingCashBalance = openingCashBalance + netCashFlow;

  const collectionPerformance = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rows = loans.flatMap(loan => {
      try {
        const schedule = typeof loan.preview_schedule_json === 'string'
          ? JSON.parse(loan.preview_schedule_json)
          : loan.preview_schedule_json;
        return Array.isArray(schedule) ? schedule : [];
      } catch {
        return [];
      }
    }).filter(row => {
      if (!row?.due_date) return false;
      const dueDate = parseISO(String(row.due_date).slice(0, 10));
      return isValid(dueDate) && dueDate >= from && dueDate <= to;
    });
    const scheduledDue = rows.reduce((sumValue, row) => sumValue + Number(
      row.total_due ?? row.payment ?? ((row.principal || 0) + (row.interest || row.interest_amount || 0)),
    ), 0);
    const missed = rows.filter(row => {
      const dueDate = parseISO(String(row.due_date).slice(0, 10));
      const actual = Number(row.actual_payment ?? row.paid_amount ?? 0);
      return dueDate < today && actual <= 0;
    }).length;
    const partial = rows.filter(row => {
      const scheduled = Number(row.total_due ?? row.payment ?? 0);
      const actual = Number(row.actual_payment ?? row.paid_amount ?? 0);
      return actual > 0 && scheduled > 0 && actual < scheduled;
    }).length;
    const totalCollected = totalRepaid + loanInterest;
    return {
      scheduledDue,
      totalCollected,
      collectionRate: scheduledDue > 0 ? (totalCollected / scheduledDue) * 100 : 0,
      scheduledCount: rows.length,
      missed,
      partial,
    };
  }, [loans, from, to, totalRepaid, loanInterest]);

  const incomeDetails = [
    ['Loan Interest', incomeBreakdown?.loan_interest],
    ['Service Fees', incomeBreakdown?.service_fee],
    ['Legal Fees', incomeBreakdown?.legal_fees],
    ['Penalty Collected', penaltyCollected],
    ['Annual Dues', incomeBreakdown?.annual_dues],
    ['Membership Fees', incomeBreakdown?.membership_fee],
    ['VIP Card', incomeBreakdown?.vip_card],
    ['Admin and Regulatory Fees', incomeBreakdown?.admin_regulatory_fees],
    ['Other Earned Income', incomeBreakdown?.petty_cash],
    ...(incomeBreakdown?.custom_charges || []).map(charge => [charge.label, charge.amount]),
  ].map(([label, value]) => ({ label, value: Number(value || 0) }));

  // Time series
  const currSeries = useMemo(() => buildTimeSeries(transactions, from, to, seriesMode), [transactions, from, to, seriesMode]);

  const labels = currSeries.map(s => s.label);
  const chartData = {
    loans:   currSeries.map(s => s.loans),
    savings: currSeries.map(s => s.savings),
    cbu:     currSeries.map(s => s.cbu),
    income:  currSeries.map(s => s.income),
    expense: currSeries.map(s => s.expense),
  };

  // Exports
  function handleExportSummary() {
    const rows = [
      { Metric: 'Report Period',                  Value: `${formatDate(from.toISOString())} - ${formatDate(to.toISOString())}` },
      { Metric: 'Snapshot: Total Members',                  Value: memberStats?.total ?? 0 },
      { Metric: 'Snapshot: Active Members',                 Value: memberStats?.active ?? 0 },
      { Metric: 'Snapshot: Inactive Members',               Value: memberStats?.inactive ?? 0 },
      { Metric: 'Snapshot: Closed Accounts',                Value: memberStats?.closed ?? 0 },
      { Metric: 'Snapshot: Regular Members',                Value: memberStats?.regular ?? 0 },
      { Metric: 'Snapshot: Associate Members',              Value: memberStats?.associate ?? 0 },
      { Metric: 'Snapshot: Kiddy Members',                  Value: memberStats?.kiddy ?? 0 },
      { Metric: 'Snapshot: Total CBU Balance (PHP)',         Value: totalCBUBalance },
      { Metric: 'Snapshot: Total Savings Balance (PHP)',     Value: totalSavingsBalance },
      { Metric: 'Snapshot: Total Loans',                    Value: loanStats?.total ?? 0 },
      { Metric: 'Snapshot: Active Loans',                   Value: loanStats?.active ?? 0 },
      { Metric: 'Snapshot: Pending Loan Amount (PHP)',      Value: loanStats?.pendingAmount ?? 0 },
      { Metric: 'Snapshot: Approved Loan Amount (PHP)',     Value: loanStats?.approvedAmount ?? 0 },
      { Metric: 'Snapshot: Cumulative Released Amount (PHP)', Value: loanStats?.totalReleased ?? 0 },
      { Metric: 'Snapshot: Outstanding Payable Balance (PHP)', Value: loanStats?.totalOutstanding ?? 0 },
      { Metric: 'Period: Loan Repayments (PHP)',  Value: totalRepaid },
      { Metric: 'Period: Cooperative Income (PHP)', Value: totalIncome },
      { Metric: 'Period: Membership/Admin & Regulatory Fees (PHP)', Value: membershipCollections },
      { Metric: 'Period: Loan Deductions (PHP)', Value: loanDeductions },
      { Metric: 'Period: Loan Interest (PHP)',    Value: loanInterest },
      { Metric: 'Period: Penalty Collected (PHP)', Value: penaltyCollected },
      ...(incomeBreakdown?.custom_charges || []).map(charge => ({ Metric: 'Custom Charge: ' + charge.label + ' (PHP)', Value: charge.amount })),
      { Metric: 'Period: Cash In (PHP)',          Value: totalDeposited },
      { Metric: 'Period: Cash Out (PHP)',         Value: totalWithdrawn },
      { Metric: 'Period: Net Cash Flow (PHP)',     Value: netCashFlow },
      { Metric: 'Period: Operating Expenses (PHP)', Value: totalExpense },
      { Metric: 'Period: Opening Cash Balance (PHP)', Value: openingCashBalance },
      { Metric: 'Period: Closing Cash Balance (PHP)', Value: closingCashBalance },
      { Metric: 'Period: Scheduled Loan Due (PHP)', Value: collectionPerformance.scheduledDue },
      { Metric: 'Period: Total Loan Collected (PHP)', Value: collectionPerformance.totalCollected },
      { Metric: 'Period: Loan Collection Rate (%)', Value: collectionPerformance.collectionRate.toFixed(1) },
      { Metric: 'Period: Missed Scheduled Payments', Value: collectionPerformance.missed },
      { Metric: 'Period: Partial Scheduled Payments', Value: collectionPerformance.partial },
      { Metric: 'Excluded Records With Invalid Dates', Value: invalidDateCount },
      { Metric: 'Report Generated',               Value: format(new Date(), 'MMM d, yyyy h:mm a') },
    ];
    exportToCSV('wellserve_summary_report', rows);
    toast.success('Summary report exported.');
  }

  function handlePrint() {
    const contentHtml = buildReportHtml({
      customCharges: incomeBreakdown?.custom_charges || [],
      periodLabel,
      memberStats,
      loanStats,
      accountStats,
      totalDeposited,
      totalWithdrawn,
      totalRepaid,
      totalReleased,
      totalIncome,
      totalExpense,
      loanInterest,
      penaltyCollected,
      membershipCollections,
      loanDeductions,
      totalCBUBalance,
      totalSavingsBalance,
      netCashFlow,
      openingCashBalance,
      closingCashBalance,
      collectionPerformance,
    });

    const fullHtml = wrapWithLetterhead(contentHtml, {
      title: `WELLSERVE Report - ${periodLabel}`,
      extraCss: `
        .lh-header { padding: 4mm 12mm; border-bottom: 0.6pt solid #9ca3af; }
        .lh-header img { height: 11mm; }
        .lh-content { padding: 6mm 12mm 8mm; }
        .lh-wrap > tbody > tr { break-inside: auto; page-break-inside: auto; }
        .financial-print { width: 100%; max-width: 155mm; margin: 0 auto; font-family: Arial, sans-serif; color: #20252b; }
        .financial-print .report-title { color: #20252b; font-size: 18pt; }
        .financial-print .report-meta { border-bottom: 0.6pt solid #9ca3af; font-size: 8pt; line-height: 1.6; }
        .financial-print .report-meta span { color: #666 !important; font-weight: normal !important; }
        .financial-print .report-statement { table-layout: fixed; margin-bottom: 3mm; font-size: 9pt; }
        .financial-print .report-statement th { background: #f1f3f4; color: #20252b; padding: 6pt 7pt; border-bottom: 0.7pt solid #9ca3af; }
        .financial-print .report-statement th:first-child { width: 60%; }
        .financial-print .report-statement td { background: white; padding: 4pt 7pt; border-bottom: 0.4pt solid #e5e7eb; }
        .financial-print .report-statement th:last-child,
        .financial-print .report-statement td:last-child { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .financial-print .report-note { color: #6b7280; font-size: 8pt; }
        .financial-print .report-total td { font-weight: 700; border-top: 0.7pt solid #6b7280; border-bottom: 1pt double #6b7280; }
        .financial-print .confidential { border-top: 0.5pt solid #9ca3af; padding-top: 3mm; font-style: normal; font-size: 7.5pt; }
        @media print {
          @page { margin: 10mm 0; }
          .financial-print .report-statement { break-inside: avoid; }
          .financial-print .period-start { break-before: page; page-break-before: always; }
          .financial-print thead { display: table-header-group; }
        }
      `,
    });

    const win = printHtmlDocument(fullHtml, {
      width: 900,
      height: 1100,
      delay: 900,
      onBlocked: () => toast.error('Pop-up blocked. Please allow pop-ups for this site and try again.'),
    });

    if (!win) return;
    toast.success('Print dialog opened.');
  }

  const periodLabel = selectedMonth
    ? format(from, 'MMMM yyyy')
    : selectedYear !== 'all'
      ? `Year ${selectedYear}`
      : 'All recorded years';

  return (
    <div className="p-4 sm:p-6" id="wellserve-report-root">

      {/* Header */}
      <PageHeader
        title="Reports"
        subtitle="Cooperative financial and membership analytics"
        action={
          <div className="flex flex-wrap items-center gap-2 no-print">
            <ReportPeriodFilter
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              years={availableYears}
              onYearChange={year => {
                setSelectedYear(year);
                setSelectedMonth('');
              }}
              onMonthChange={month => {
                setSelectedMonth(month);
                if (month && selectedYear === 'all') setSelectedYear(String(new Date().getFullYear()));
              }}
            />
            <Button variant="outline" icon={<Download size={14} />} onClick={handleExportSummary} disabled={loading}>CSV</Button>
            <Button variant="outline" icon={<Printer size={14} />} onClick={handlePrint} disabled={loading}>Print / PDF</Button>
          </div>
        }
      />

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <>
          {/* Period banner */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-100 text-xs font-semibold text-emerald-700">
                <Calendar size={11} />
                {periodLabel}
              </span>
            </div>
            <p className="text-xs text-gray-400">
              {countedTransactions.length} transaction{countedTransactions.length !== 1 ? 's' : ''} in period
            </p>
          </div>
          {invalidDateCount > 0 && (
            <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {invalidDateCount} record{invalidDateCount !== 1 ? 's have' : ' has'} an invalid or unsupported year and {invalidDateCount !== 1 ? 'were' : 'was'} excluded from this report.
            </div>
          )}

          <SectionTitle>Selected Period Activity</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard icon={<ArrowUpRight size={20} />} label="Cash In" value={formatCurrency(totalDeposited)} sub="All recorded inflows" iconBg="bg-emerald-50" iconColor="#059669" />
            <StatCard icon={<ArrowDownRight size={20} />} label="Cash Out" value={formatCurrency(totalWithdrawn)} sub="All recorded outflows" iconBg="bg-rose-50" iconColor="#E11D48" />
            <StatCard icon={<Wallet size={20} />} label="Net Cash Flow" value={formatCurrency(netCashFlow)} sub="Cash in less cash out" iconBg="bg-blue-50" iconColor="#2563EB" />
            <StatCard icon={<TrendingUp size={20} />} label="Cooperative Income" value={formatCurrency(totalIncome)} sub="Interest, penalties and earned fees" iconBg="bg-teal-50" iconColor="#0D9488" />
            <StatCard icon={<TrendingDown size={20} />} label="Operating Expenses" value={formatCurrency(totalExpense)} sub="Excludes releases and withdrawals" iconBg="bg-red-50" iconColor="#DC2626" />
            <StatCard icon={<CreditCard size={20} />} label="Principal Collected" value={formatCurrency(totalRepaid)} sub="Loan principal payments" iconBg="bg-orange-50" iconColor="#EA580C" />
            <StatCard icon={<TrendingUp size={20} />} label="Loan Interest Collected" value={formatCurrency(loanInterest)} sub="Interest transactions" iconBg="bg-green-50" iconColor="#16A34A" />
            <StatCard icon={<CreditCard size={20} />} label="Loan Releases" value={formatCurrency(totalReleased)} sub="Released to members" iconBg="bg-amber-50" iconColor="#D97706" />
            <StatCard icon={<PiggyBank size={20} />} label="Membership/Admin Fees" value={formatCurrency(membershipCollections)} sub="Collected fees only" iconBg="bg-purple-50" iconColor="#7C3AED" />
          </div>

          <SectionTitle>Cash Reconciliation</SectionTitle>
          <div className="grid overflow-hidden rounded-lg border border-gray-200 bg-white sm:grid-cols-4">
            {[
              ['Opening Cash', openingCashBalance, 'Balance before selected period'],
              ['Cash In', totalDeposited, 'Added during period'],
              ['Cash Out', totalWithdrawn, 'Released or spent during period'],
              ['Closing Cash', closingCashBalance, 'Opening plus net movement'],
            ].map(([label, value, note], index) => (
              <div key={label} className={`px-5 py-4 ${index > 0 ? 'border-t border-gray-100 sm:border-l sm:border-t-0' : ''}`}>
                <p className="text-xs font-semibold uppercase text-gray-400">{label}</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{formatCurrency(value)}</p>
                <p className="mt-1 text-xs text-gray-400">{note}</p>
              </div>
            ))}
          </div>

          <SectionTitle>Loan Collection Performance</SectionTitle>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={<Calendar size={20} />} label="Scheduled Due" value={formatCurrency(collectionPerformance.scheduledDue)} sub={`${collectionPerformance.scheduledCount} scheduled payments`} iconBg="bg-blue-50" iconColor="#2563EB" />
            <StatCard icon={<Wallet size={20} />} label="Total Collected" value={formatCurrency(collectionPerformance.totalCollected)} sub="Principal plus interest" iconBg="bg-emerald-50" iconColor="#059669" />
            <StatCard icon={<TrendingUp size={20} />} label="Collection Rate" value={`${collectionPerformance.collectionRate.toFixed(1)}%`} sub="Collected against scheduled guide" iconBg="bg-teal-50" iconColor="#0D9488" />
            <StatCard icon={<TrendingDown size={20} />} label="Missed / Partial" value={`${collectionPerformance.missed} / ${collectionPerformance.partial}`} sub="Schedule-performance indicators" iconBg="bg-rose-50" iconColor="#E11D48" />
          </div>

          <SectionTitle>Earned Income Breakdown</SectionTitle>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="grid sm:grid-cols-2 xl:grid-cols-3">
              {incomeDetails.map((item, index) => (
                <div key={item.label} className={`flex items-center justify-between gap-4 px-5 py-3 ${index > 0 ? 'border-t border-gray-100 sm:border-t-0' : ''} ${index % 2 ? 'sm:border-l' : ''} ${index >= 3 ? 'xl:border-t' : ''}`}>
                  <span className="text-sm text-gray-500">{item.label}</span>
                  <span className="text-sm font-semibold tabular-nums text-gray-800">{formatCurrency(item.value)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-5 py-3">
              <span className="text-sm font-semibold text-gray-600">Total Earned Income</span>
              <span className="text-base font-bold tabular-nums text-emerald-700">{formatCurrency(totalIncome)}</span>
            </div>
          </div>

          <SectionTitle>Current Membership Snapshot</SectionTitle>

          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4 mb-4">
            <StatCard
              icon={<Users size={20} />}
              label="Total Members"
              value={memberStats?.total ?? 0}
              sub={`${memberStats?.active ?? 0} active`}
              iconBg="bg-blue-50"
              iconColor="#2563EB"
            />
            <StatCard
              icon={<Users size={20} />}
              label="Active Members"
              value={memberStats?.active ?? 0}
              iconBg="bg-emerald-50"
              iconColor="#059669"
            />
            <StatCard
              icon={<Users size={20} />}
              label="Inactive Members"
              value={memberStats?.inactive ?? 0}
              sub="Status: inactive"
              iconBg="bg-gray-100"
              iconColor="#6B7280"
            />
            <StatCard
              icon={<Users size={20} />}
              label="Closed Accounts"
              value={memberStats?.closed ?? 0}
              sub="Status: closed"
              iconBg="bg-rose-50"
              iconColor="#E11D48"
            />
            <StatCard
              icon={<Users size={20} />}
              label="Kiddy Members"
              value={memberStats?.kiddy ?? 0}
              sub={`${memberStats?.activeKiddy ?? 0} active`}
              iconBg="bg-teal-50"
              iconColor="#0D9488"
            />
          </div>

          <SectionTitle>Current Loan Portfolio</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
            <StatCard icon={<CreditCard size={20} />} label="Pending Loan Amount" value={formatCurrency(loanStats?.pendingAmount ?? 0)} sub={`${loanStats?.pending ?? 0} pending`} iconBg="bg-amber-50" iconColor="#D97706" />
            <StatCard icon={<CreditCard size={20} />} label="Approved Loan Amount" value={formatCurrency(loanStats?.approvedAmount ?? 0)} sub={`${loanStats?.approved ?? 0} approved`} iconBg="bg-blue-50" iconColor="#2563EB" />
            <StatCard icon={<TrendingUp size={20} />} label="Cumulative Released" value={formatCurrency(loanStats?.totalReleased ?? 0)} sub={`${loanStats?.released ?? 0} released loans`} iconBg="bg-green-50" iconColor="#16A34A" />
            <StatCard icon={<TrendingDown size={20} />} label="Outstanding Payable" value={formatCurrency(loanStats?.totalOutstanding ?? 0)} sub="Balance including interest" iconBg="bg-red-50" iconColor="#DC2626" />
          </div>

          <SectionTitle>Loan Status Breakdown</SectionTitle>
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {[
                { key: 'draft', label: 'Draft', color: 'bg-gray-400' },
                { key: 'credit_committee_approval', label: 'Pending Approval', color: 'bg-amber-400' },
                { key: 'pending', label: 'Pending', color: 'bg-yellow-400' },
                { key: 'approved', label: 'Approved', color: 'bg-blue-400' },
                { key: 'released', label: 'Released', color: 'bg-emerald-400' },
                { key: 'active', label: 'Active Loan', color: 'bg-green-500' },
                { key: 'partial', label: 'Partial', color: 'bg-orange-400' },
                { key: 'overdue', label: 'Overdue', color: 'bg-red-400' },
                { key: 'delinquent', label: 'Delinquent', color: 'bg-red-600' },
                { key: 'defaulted', label: 'Defaulted', color: 'bg-gray-700' },
                { key: 'paid', label: 'Paid', color: 'bg-indigo-400' },
              ].map(({ key, label, color }) => {
                const count = loanStats?.byStatus?.[key] ?? 0;
                const p = (loanStats?.total ?? 0) > 0 ? ((count / loanStats.total) * 100).toFixed(1) : '0.0';
                return (
                  <div key={key} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
                        <span className="text-xs font-semibold text-gray-600">{label}</span>
                      </div>
                      <span className="text-sm font-bold text-gray-900 tabular-nums">{count}</span>
                    </div>
                    <div className="h-2 bg-white rounded-full overflow-hidden">
                      <div className={`h-2 rounded-full ${color}`} style={{ width: `${p}%` }} />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">{p}% of loans</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* CBU & Savings */}
          <SectionTitle>Current Member Account Balances</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard icon={<PiggyBank size={20} />} label="Total CBU Balance"     value={formatCurrency(totalCBUBalance)}    sub={`${accountStats?.cbuCount ?? 0} accounts`}    iconBg="bg-emerald-50" iconColor="#059669" />
            <StatCard icon={<Wallet size={20} />}    label="Total Savings Balance"  value={formatCurrency(totalSavingsBalance)} sub={`${accountStats?.savingsCount ?? 0} accounts`} iconBg="bg-blue-50"    iconColor="#2563EB" />
          </div>

          {/* Trend Charts */}
          <SectionTitle>Trend Analysis</SectionTitle>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TrendChart title="Coop Income" current={chartData.income} color={CHART_COLORS.income} labels={labels} />
            <TrendChart title="Expenses" current={chartData.expense} color={CHART_COLORS.expense} labels={labels} />
            <TrendChart title="Loan Releases" current={chartData.loans} color={CHART_COLORS.loans} labels={labels} />
            <TrendChart title="Savings Deposits" current={chartData.savings} color={CHART_COLORS.savings} labels={labels} />
            <TrendChart title="CBU Deposits" current={chartData.cbu} color={CHART_COLORS.cbu} labels={labels} />
          </div>
        </>
      )}
    </div>
  );
}
