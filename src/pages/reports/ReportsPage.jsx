import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Users, CreditCard, PiggyBank, Wallet,
  TrendingUp, TrendingDown, Download, RefreshCw,
  Calendar, ChevronDown, Printer,
  ArrowUpRight, ArrowDownRight, Minus, ToggleLeft, ToggleRight,
} from 'lucide-react';
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfQuarter, endOfQuarter, startOfYear, endOfYear,
  subWeeks, subMonths, subQuarters, subYears,
  format, parseISO, eachWeekOfInterval,
  eachMonthOfInterval, addDays, isValid,
} from 'date-fns';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import { getMemberStats } from '../../services/memberService';
import { getLoanStats } from '../../services/loanService';
import { getAccountStats } from '../../services/accountService';
import { getFundLedgerSummary } from '../../services/coopFundService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { exportToCSV } from '../../utils/csvExport';
import { printHtmlDocument, wrapWithLetterhead } from '../../utils/print';

// â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PRESETS = [
  { id: 'weekly',    label: 'This Week' },
  { id: 'monthly',   label: 'This Month' },
  { id: 'quarterly', label: 'This Quarter' },
  { id: 'annual',    label: 'This Year' },
  { id: 'custom',    label: 'Custom Range' },
];

const CHART_COLORS = {
  loans:   { stroke: '#f97316' },
  savings: { stroke: '#2563eb' },
  cbu:     { stroke: '#059669' },
  income:  { stroke: '#10b981' },
  expense: { stroke: '#ef4444' },
};

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
  const text = normalized(`${tx.description || ''} ${tx.ref_no || ''}`);
  return tx.type === 'cash_out' && (
    category === 'loan_release' ||
    category === 'loan_net_proceeds' ||
    (category === 'capital' && text.includes('loan'))
  );
}

function isLoanPayment(tx) {
  const text = normalized(`${tx.description || ''} ${tx.note || ''}`);
  return tx.type === 'cash_in' && (
    normalized(tx.category) === 'loan_payment' ||
    normalized(tx.raw_type) === 'loan_payment' ||
    (normalized(tx.category) === 'loan' && !text.includes('interest'))
  );
}

function isLoanInterest(tx) {
  const text = normalized(`${tx.description || ''} ${tx.note || ''}`);
  return tx.type === 'cash_in' && (
    normalized(tx.category) === 'loan_interest' ||
    (normalized(tx.category) === 'loan' && text.includes('interest'))
  );
}

function isCbuDeposit(tx) {
  return tx.type === 'cash_in' && normalized(tx.category) === 'cbu';
}

function isSavingsDeposit(tx) {
  return tx.type === 'cash_in' && normalized(tx.category) === 'savings';
}

function isCbuWithdrawal(tx) {
  return tx.type === 'cash_out' && normalized(tx.category) === 'cbu_withdrawal';
}

function isSavingsWithdrawal(tx) {
  return tx.type === 'cash_out' && normalized(tx.category) === 'savings_withdrawal';
}

function isMembershipCollection(tx) {
  const category = normalized(tx.category);
  const rawType = normalized(tx.raw_type);
  return tx.type === 'cash_in' && (
    category === 'membership' ||
    category === 'membership_fee' ||
    rawType === 'membership_payment'
  );
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
  const category = normalized(tx.category);
  return [
    'loan_payment',
    'loan_interest',
    'penalty_payment',
    'penalty',
    'penalty_due',
    'membership',
    'membership_fee',
    'vip_card',
    'service_fee',
    'cbu_retention',
    'legal_fees',
    'insurance',
    'clpi_insurance',
    'regular_savings',
    'annual_dues',
    'cbu_completion',
    'petty_cash',
    'admin_regulatory_fees',
    'capital',
    'others',
    'other_payment',
  ].includes(category);
}

function isExpense(tx) {
  return tx.type === 'cash_out' && !isLoanRelease(tx) && !normalized(tx.category).includes('withdrawal');
}

// â”€â”€ Date helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getPresetRange(preset) {
  const now = new Date();
  switch (preset) {
    case 'weekly':    return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'monthly':   return { from: startOfMonth(now), to: endOfMonth(now) };
    case 'quarterly': return { from: startOfQuarter(now), to: endOfQuarter(now) };
    case 'annual':    return { from: startOfYear(now), to: endOfYear(now) };
    default:          return { from: startOfMonth(now), to: endOfMonth(now) };
  }
}

function getPreviousRange(preset, from, to) {
  if (preset === 'weekly')    return { from: subWeeks(from, 1), to: subWeeks(to, 1) };
  if (preset === 'monthly')   return { from: subMonths(from, 1), to: subMonths(to, 1) };
  if (preset === 'quarterly') return { from: subQuarters(from, 1), to: subQuarters(to, 1) };
  if (preset === 'annual')    return { from: subYears(from, 1), to: subYears(to, 1) };
  const duration = to - from;
  return { from: new Date(from - duration - 86400000), to: new Date(from - 86400000) };
}

function buildTimeSeries(transactions, from, to, preset) {
  let intervals = [];
  const opts = { weekStartsOn: 1 };

  if (preset === 'weekly') {
    let d = new Date(from);
    while (d <= to) { intervals.push(new Date(d)); d = addDays(d, 1); }
  } else if (preset === 'monthly') {
    intervals = eachWeekOfInterval({ start: from, end: to }, opts);
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
      return d >= periodStart && d <= (preset === 'weekly' ? periodStart : periodEnd);
    });

    return {
      label: preset === 'weekly'
        ? format(periodStart, 'EEE')
        : preset === 'monthly'
          ? `W${i + 1}`
          : format(periodStart, preset === 'annual' ? 'MMM' : 'MMM yy'),
      loans:   inPeriod.filter(t => isCountedLedgerRow(t) && isLoanRelease(t)).reduce((s, t) => s + (t.amount || 0), 0),
      savings: inPeriod.filter(isSavingsDeposit).reduce((s, t) => s + (t.amount || 0), 0),
      cbu:     inPeriod.filter(isCbuDeposit).reduce((s, t) => s + (t.amount || 0), 0),
      income:  inPeriod.filter(t => isCountedLedgerRow(t) && isReportIncome(t)).reduce((s, t) => s + (t.amount || 0), 0),
      expense: inPeriod.filter(t => isCountedLedgerRow(t) && isExpense(t)).reduce((s, t) => s + (t.amount || 0), 0),
    };
  });
}

// â”€â”€ SVG Trend Chart â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function TrendChart({ title, current, previous, color, showComparison, labels }) {
  const H = 130, W = 100;
  const max = Math.max(...current, ...(showComparison ? previous : []), 1);

  const toPoints = arr => arr.map((v, i) => [
    arr.length < 2 ? W / 2 : (i / (arr.length - 1)) * W,
    H - (v / max) * (H * 0.82) - H * 0.08,
  ]);

  const toPath = pts => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
  const toFill = pts => {
    if (pts.length < 2) return '';
    return `${toPath(pts)} L${pts[pts.length-1][0].toFixed(2)},${H} L${pts[0][0].toFixed(2)},${H} Z`;
  };

  const currPts = toPoints(current);
  const prevPts = showComparison && previous.length >= 2 ? toPoints(previous) : [];

  const lastCurr = current[current.length - 1] || 0;
  const lastPrev = previous[previous.length - 1] || 0;
  const pctChange = lastPrev === 0 ? null : ((lastCurr - lastPrev) / lastPrev) * 100;
  const gradId = `cg-${title.replace(/\s+/g, '')}`;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{title}</span>
        {pctChange !== null && showComparison && (
          <span className={`flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
            pctChange > 0 ? 'bg-emerald-50 text-emerald-600' : pctChange < 0 ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-500'
          }`}>
            {pctChange > 0 ? <ArrowUpRight size={11} /> : pctChange < 0 ? <ArrowDownRight size={11} /> : <Minus size={11} />}
            {Math.abs(pctChange).toFixed(1)}%
          </span>
        )}
      </div>

      <div style={{ height: H }} className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color.stroke} stopOpacity="0.18" />
              <stop offset="100%" stopColor={color.stroke} stopOpacity="0.01" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((r, i) => (
            <line key={i} x1="0" y1={H*r} x2={W} y2={H*r} stroke="#f1f5f9" strokeWidth="0.3" />
          ))}
          {showComparison && prevPts.length >= 2 && (
            <path d={toPath(prevPts)} fill="none" stroke={color.stroke}
              strokeWidth="0.5" strokeDasharray="1.2,0.8" strokeOpacity="0.45" strokeLinecap="round" />
          )}
          {currPts.length >= 2 && (
            <path d={toFill(currPts)} fill={`url(#${gradId})`} />
          )}
          {currPts.length >= 2 && (
            <path d={toPath(currPts)} fill="none" stroke={color.stroke}
              strokeWidth="0.7" strokeLinecap="round" strokeLinejoin="round" />
          )}
          {currPts.map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r="1" fill={color.stroke} />
          ))}
        </svg>
      </div>

      <div className="flex justify-between">
        {labels.filter((_, i) => {
          const step = Math.ceil(labels.length / 6);
          return i % step === 0 || i === labels.length - 1;
        }).map((l, i) => (
          <span key={i} className="text-[9px] text-gray-400 font-medium">{l}</span>
        ))}
      </div>

      {showComparison && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-px" style={{ background: color.stroke }} />
            <span className="text-[10px] text-gray-500">Current</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 border-t border-dashed" style={{ borderColor: color.stroke, opacity: 0.5 }} />
            <span className="text-[10px] text-gray-400">Previous</span>
          </div>
        </div>
      )}
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

function DateRangePicker({ preset, customFrom, customTo, onPresetChange, onCustomChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const activeLabel = PRESETS.find(p => p.id === preset)?.label || 'Select period';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-all"
      >
        <Calendar size={14} className="text-gray-400" />
        <span>{activeLabel}</span>
        {preset === 'custom' && customFrom && customTo && (
          <span className="text-xs text-gray-400 ml-1">
            {format(customFrom, 'MMM d')} - {format(customTo, 'MMM d, yyyy')}
          </span>
        )}
        <ChevronDown size={13} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 overflow-hidden">
          <div className="p-2">
            {PRESETS.filter(p => p.id !== 'custom').map(p => (
              <button
                key={p.id}
                onClick={() => { onPresetChange(p.id); setOpen(false); }}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  preset === p.id ? 'bg-emerald-50 text-emerald-700' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="border-t border-gray-100 p-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Custom Range</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">From</label>
                <input
                  type="date"
                  value={customFrom && isValid(customFrom) ? format(customFrom, 'yyyy-MM-dd') : ''}
                  onChange={e => {
                    const d = e.target.value ? new Date(e.target.value + 'T00:00:00') : null;
                    onCustomChange(d, customTo);
                    onPresetChange('custom');
                  }}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">To</label>
                <input
                  type="date"
                  value={customTo && isValid(customTo) ? format(customTo, 'yyyy-MM-dd') : ''}
                  onChange={e => {
                    const d = e.target.value ? new Date(e.target.value + 'T23:59:59') : null;
                    onCustomChange(customFrom, d);
                    onPresetChange('custom');
                  }}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                />
              </div>
            </div>
            {preset === 'custom' && customFrom && customTo && (
              <button
                onClick={() => setOpen(false)}
                className="mt-2 w-full py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors"
              >
                Apply Range
              </button>
            )}
          </div>
        </div>
      )}
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
  totalIncome, totalExpense, loanInterest, membershipCollections,
  loanDeductions, totalCBUBalance, totalSavingsBalance,
  cbuDeposits, savingsDeposits,
}) {
  const fmt = (n) =>
    'PHP ' + Number(n ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num = (n) => Number(n ?? 0).toLocaleString();
  const now = new Date();
  const generated = now.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    + ' at ' + now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });

  return `
    <h1 class="report-title">Financial Report</h1>
    <div class="report-meta">
      <strong>Period:</strong> ${periodLabel} &nbsp;|&nbsp;
      <strong>Generated:</strong> ${generated} &nbsp;|&nbsp;
      <span style="color:#b91c1c;font-weight:600">CONFIDENTIAL - AUTHORIZED USE ONLY</span>
    </div>

    <div class="section-heading">Membership Overview</div>
    <div class="stats-grid">
      <div class="stat-box"><div class="stat-label">Total Members</div><div class="stat-value">${num(memberStats?.total)}</div><div class="stat-sub">${num(memberStats?.active)} active</div></div>
      <div class="stat-box"><div class="stat-label">Regular</div><div class="stat-value">${num(memberStats?.regular)}</div></div>
      <div class="stat-box"><div class="stat-label">Associate</div><div class="stat-value">${num(memberStats?.associate)}</div></div>
      <div class="stat-box"><div class="stat-label">Kiddy</div><div class="stat-value">${num(memberStats?.kiddy)}</div></div>
      <div class="stat-box"><div class="stat-label">Active</div><div class="stat-value">${num(memberStats?.active)}</div></div>
      <div class="stat-box"><div class="stat-label">Inactive</div><div class="stat-value">${num(memberStats?.inactive)}</div></div>
      <div class="stat-box"><div class="stat-label">Closed Accounts</div><div class="stat-value">${num(memberStats?.closed)}</div></div>
      <div class="stat-box"><div class="stat-label">Membership Collections</div><div class="stat-value" style="font-size:10pt">${fmt(membershipCollections)}</div></div>
    </div>

    <div class="section-heading">Loan Portfolio</div>
    <div class="stats-grid">
      <div class="stat-box"><div class="stat-label">Total Loans</div><div class="stat-value">${num(loanStats?.total)}</div><div class="stat-sub">${num(loanStats?.active)} active</div></div>
      <div class="stat-box"><div class="stat-label">Pending Loan Amount</div><div class="stat-value" style="font-size:10pt">${fmt(loanStats?.pendingAmount)}</div></div>
      <div class="stat-box"><div class="stat-label">Approved Loan Amount</div><div class="stat-value" style="font-size:10pt">${fmt(loanStats?.approvedAmount)}</div></div>
      <div class="stat-box"><div class="stat-label">Released Loan Amount</div><div class="stat-value" style="font-size:10pt">${fmt(loanStats?.totalReleased)}</div></div>
      <div class="stat-box"><div class="stat-label">Outstanding Payable</div><div class="stat-value" style="font-size:10pt">${fmt(loanStats?.totalOutstanding)}</div></div>
      <div class="stat-box"><div class="stat-label">Loan Interest Earned</div><div class="stat-value" style="font-size:10pt">${fmt(loanInterest)}</div></div>
    </div>

    <div class="section-heading">Cash Flow & Savings</div>
    <div class="stats-grid">
      <div class="stat-box"><div class="stat-label">Total CBU Balance</div><div class="stat-value" style="font-size:10pt">${fmt(totalCBUBalance)}</div></div>
      <div class="stat-box"><div class="stat-label">Total Savings Balance</div><div class="stat-value" style="font-size:10pt">${fmt(totalSavingsBalance)}</div></div>
      <div class="stat-box"><div class="stat-label">Cash In (Period)</div><div class="stat-value" style="font-size:10pt">${fmt(totalDeposited)}</div></div>
      <div class="stat-box"><div class="stat-label">Cash Out (Period)</div><div class="stat-value" style="font-size:10pt">${fmt(totalWithdrawn)}</div></div>
      <div class="stat-box"><div class="stat-label">Coop Income</div><div class="stat-value" style="font-size:10pt">${fmt(totalIncome)}</div></div>
      <div class="stat-box"><div class="stat-label">Expenses</div><div class="stat-value" style="font-size:10pt">${fmt(totalExpense)}</div></div>
      <div class="stat-box"><div class="stat-label">Loan Deductions</div><div class="stat-value" style="font-size:10pt">${fmt(loanDeductions)}</div></div>
      <div class="stat-box"><div class="stat-label">CBU Deposits</div><div class="stat-value" style="font-size:10pt">${fmt(cbuDeposits)}</div></div>
      <div class="stat-box"><div class="stat-label">Savings Deposits</div><div class="stat-value" style="font-size:10pt">${fmt(savingsDeposits)}</div></div>
    </div>

    <div class="confidential">
      WELLSERVE Cooperative Monitoring System - This report is for authorized personnel only.
    </div>
  `;
}

// â”€â”€ Main â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function ReportsPage() {
  const [memberStats, setMemberStats]       = useState(null);
  const [loanStats, setLoanStats]           = useState(null);
  const [accountStats, setAccountStats]     = useState(null);
  const [allTransactions, setAllTransactions] = useState([]);
  const [loading, setLoading]               = useState(true);

  const [preset, setPreset]             = useState('monthly');
  const [customFrom, setCustomFrom]     = useState(null);
  const [customTo, setCustomTo]         = useState(null);
  const [showComparison, setShowComparison] = useState(false);

  // Active date range
  const { from, to } = useMemo(() => {
    if (preset === 'custom' && customFrom && customTo) return { from: customFrom, to: customTo };
    return getPresetRange(preset);
  }, [preset, customFrom, customTo]);

  const prevRange = useMemo(() => getPreviousRange(preset, from, to), [preset, from, to]);

  async function fetchAll() {
    setLoading(true);
    try {
      const [ms, ls, as, fundSummary] = await Promise.all([
        getMemberStats(),
        getLoanStats(),
        getAccountStats(),
        getFundLedgerSummary(),
      ]);
      setMemberStats(ms);
      setLoanStats(ls);
      setAccountStats(as);
      setAllTransactions(fundSummary?.transactions || []);
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

  useEffect(() => { fetchAll(); }, []);

  // Filter by period
  const filterByRange = (txs, rangeFrom, rangeTo) => txs.filter(tx => {
    const dateValue = ledgerDate(tx);
    const d = dateValue ? parseISO(dateValue) : null;
    if (!d || !isValid(d)) return false;
    return d >= rangeFrom && d <= rangeTo;
  });

  const transactions     = useMemo(() => filterByRange(allTransactions, from, to), [allTransactions, from, to]);
  const prevTransactions = useMemo(() => filterByRange(allTransactions, prevRange.from, prevRange.to), [allTransactions, prevRange]);
  const countedTransactions = useMemo(() => transactions.filter(isCountedLedgerRow), [transactions]);
  const countedPrevTransactions = useMemo(() => prevTransactions.filter(isCountedLedgerRow), [prevTransactions]);

  // Derived
  const sum = (arr, pred) => arr.filter(pred).reduce((s, t) => s + (t.amount || 0), 0);
  const pct = (curr, prev) => prev === 0 ? null : ((curr - prev) / prev) * 100;

  const totalDeposited  = sum(countedTransactions, t => t.type === 'cash_in');
  const totalWithdrawn  = sum(countedTransactions, t => t.type === 'cash_out');
  const totalRepaid     = sum(countedTransactions, isLoanPayment);
  const totalReleased   = sum(countedTransactions, isLoanRelease);
  const totalExpense    = sum(countedTransactions, isExpense);
  const totalIncome     = sum(countedTransactions, isReportIncome);
  const loanInterest    = sum(countedTransactions, isLoanInterest);
  const membershipCollections = sum(countedTransactions, isMembershipCollection);
  const loanDeductions = sum(countedTransactions, isLoanDeduction);
  const cbuDeposits     = sum(transactions, isCbuDeposit);
  const savingsDeposits = sum(transactions, isSavingsDeposit);
  const totalCBUBalance = Number(accountStats?.totalCBU || 0);
  const totalSavingsBalance = Number(accountStats?.totalSavings || 0);

  const prevDeposited   = sum(countedPrevTransactions, t => t.type === 'cash_in');
  const prevWithdrawn   = sum(countedPrevTransactions, t => t.type === 'cash_out');
  const prevRepaid      = sum(countedPrevTransactions, isLoanPayment);
  const prevReleased    = sum(countedPrevTransactions, isLoanRelease);
  const prevExpense     = sum(countedPrevTransactions, isExpense);
  const prevIncome      = sum(countedPrevTransactions, isReportIncome);
  const prevLoanInterest = sum(countedPrevTransactions, isLoanInterest);
  const prevMembershipCollections = sum(countedPrevTransactions, isMembershipCollection);
  const prevLoanDeductions = sum(countedPrevTransactions, isLoanDeduction);
  const prevCbuDep      = sum(prevTransactions, isCbuDeposit);
  const prevSavingsDep  = sum(prevTransactions, isSavingsDeposit);

  // Time series
  const currSeries = useMemo(() => buildTimeSeries(transactions, from, to, preset), [transactions, from, to, preset]);
  const prevSeries = useMemo(() => buildTimeSeries(prevTransactions, prevRange.from, prevRange.to, preset), [prevTransactions, prevRange, preset]);

  const labels = currSeries.map(s => s.label);
  const chartData = {
    loans:   { current: currSeries.map(s => s.loans),   previous: prevSeries.map(s => s.loans) },
    savings: { current: currSeries.map(s => s.savings), previous: prevSeries.map(s => s.savings) },
    cbu:     { current: currSeries.map(s => s.cbu),     previous: prevSeries.map(s => s.cbu) },
    income:  { current: currSeries.map(s => s.income),  previous: prevSeries.map(s => s.income) },
    expense: { current: currSeries.map(s => s.expense), previous: prevSeries.map(s => s.expense) },
  };

  // Exports
  function handleExportSummary() {
    const rows = [
      { Metric: 'Report Period',                  Value: `${formatDate(from.toISOString())} - ${formatDate(to.toISOString())}` },
      { Metric: 'Total Members',                  Value: memberStats?.total ?? 0 },
      { Metric: 'Active Members',                 Value: memberStats?.active ?? 0 },
      { Metric: 'Inactive Members',               Value: memberStats?.inactive ?? 0 },
      { Metric: 'Closed Accounts',                Value: memberStats?.closed ?? 0 },
      { Metric: 'Regular Members',                Value: memberStats?.regular ?? 0 },
      { Metric: 'Associate Members',              Value: memberStats?.associate ?? 0 },
      { Metric: 'Kiddy Members',                  Value: memberStats?.kiddy ?? 0 },
      { Metric: 'Total CBU Balance (PHP)',         Value: totalCBUBalance },
      { Metric: 'Total Savings Balance (PHP)',     Value: totalSavingsBalance },
      { Metric: 'Total Loans',                    Value: loanStats?.total ?? 0 },
      { Metric: 'Active Loans',                   Value: loanStats?.active ?? 0 },
      { Metric: 'Pending Loan Amount (PHP)',      Value: loanStats?.pendingAmount ?? 0 },
      { Metric: 'Approved Loan Amount (PHP)',     Value: loanStats?.approvedAmount ?? 0 },
      { Metric: 'Released Loan Amount (PHP)',     Value: loanStats?.totalReleased ?? 0 },
      { Metric: 'Outstanding Payable Balance (PHP)', Value: loanStats?.totalOutstanding ?? 0 },
      { Metric: 'Period: Loan Repayments (PHP)',  Value: totalRepaid },
      { Metric: 'Period: Cooperative Income (PHP)', Value: totalIncome },
      { Metric: 'Period: Membership Collections (PHP)', Value: membershipCollections },
      { Metric: 'Period: Loan Deductions (PHP)', Value: loanDeductions },
      { Metric: 'Period: Loan Interest (PHP)',    Value: loanInterest },
      { Metric: 'Period: Cash In (PHP)',          Value: totalDeposited },
      { Metric: 'Period: Cash Out (PHP)',         Value: totalWithdrawn },
      { Metric: 'Period: Expenses (PHP)',         Value: totalExpense },
      { Metric: 'Period: CBU Deposits (PHP)',     Value: cbuDeposits },
      { Metric: 'Period: Savings Deposits (PHP)', Value: savingsDeposits },
      { Metric: 'Report Generated',               Value: format(new Date(), 'MMM d, yyyy h:mm a') },
    ];
    exportToCSV('wellserve_summary_report', rows);
    toast.success('Summary report exported.');
  }

  function handlePrint() {
    const contentHtml = buildReportHtml({
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
      membershipCollections,
      loanDeductions,
      totalCBUBalance,
      totalSavingsBalance,
      cbuDeposits,
      savingsDeposits,
    });

    const fullHtml = wrapWithLetterhead(contentHtml, {
      title: `WELLSERVE Report - ${periodLabel}`,
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

  const periodLabel = preset !== 'custom'
    ? `${PRESETS.find(p => p.id === preset)?.label} - ${format(from, 'MMM d')} to ${format(to, 'MMM d, yyyy')}`
    : `${format(from, 'MMM d, yyyy')} - ${format(to, 'MMM d, yyyy')}`;

  const auditRows = [
    { group: 'Members', label: 'Total Members', curr: memberStats?.total ?? 0, prev: memberStats?.total ?? 0, fmt: v => v },
    { group: 'Members', label: 'Active Members', curr: memberStats?.active ?? 0, prev: memberStats?.active ?? 0, fmt: v => v },
    { group: 'Members', label: 'Closed Accounts', curr: memberStats?.closed ?? 0, prev: memberStats?.closed ?? 0, fmt: v => v },
    { group: 'Members', label: 'Regular / Associate / Kiddy', curr: `${memberStats?.regular ?? 0} / ${memberStats?.associate ?? 0} / ${memberStats?.kiddy ?? 0}`, prev: null, fmt: v => v },
    { group: 'Loans', label: 'Pending Loan Amount', curr: loanStats?.pendingAmount ?? 0, prev: loanStats?.pendingAmount ?? 0, fmt: formatCurrency },
    { group: 'Loans', label: 'Approved Loan Amount', curr: loanStats?.approvedAmount ?? 0, prev: loanStats?.approvedAmount ?? 0, fmt: formatCurrency },
    { group: 'Loans', label: 'Released Loan Amount', curr: loanStats?.totalReleased ?? 0, prev: loanStats?.totalReleased ?? 0, fmt: formatCurrency },
    { group: 'Loans', label: 'Outstanding Payable Balance', curr: loanStats?.totalOutstanding ?? 0, prev: loanStats?.totalOutstanding ?? 0, fmt: formatCurrency },
    { group: 'Loans', label: 'Loan Interest Earned', curr: loanInterest, prev: prevLoanInterest, fmt: formatCurrency },
    { group: 'Funds', label: 'Cooperative Income', curr: totalIncome, prev: prevIncome, fmt: formatCurrency },
    { group: 'Funds', label: 'Membership Collections', curr: membershipCollections, prev: prevMembershipCollections, fmt: formatCurrency },
    { group: 'Funds', label: 'Loan Deductions', curr: loanDeductions, prev: prevLoanDeductions, fmt: formatCurrency },
    { group: 'Funds', label: 'Expenses', curr: totalExpense, prev: prevExpense, fmt: formatCurrency },
    { group: 'CBU & Savings', label: 'Total CBU Balance', curr: totalCBUBalance, prev: totalCBUBalance, fmt: formatCurrency },
    { group: 'CBU & Savings', label: 'Total Savings Balance', curr: totalSavingsBalance, prev: totalSavingsBalance, fmt: formatCurrency },
    { group: 'CBU & Savings', label: 'CBU Cash In', curr: cbuDeposits, prev: prevCbuDep, fmt: formatCurrency },
    { group: 'CBU & Savings', label: 'Savings Cash In', curr: savingsDeposits, prev: prevSavingsDep, fmt: formatCurrency },
  ];

  return (
    <div className="p-6" id="wellserve-report-root">

      {/* Header */}
      <PageHeader
        title="Reports"
        subtitle="Cooperative financial and membership analytics"
        action={
          <div className="flex flex-wrap items-center gap-2 no-print">
            <DateRangePicker
              preset={preset}
              customFrom={customFrom}
              customTo={customTo}
              onPresetChange={setPreset}
              onCustomChange={(f, t) => { setCustomFrom(f); setCustomTo(t); }}
            />
            <button
              onClick={() => setShowComparison(c => !c)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
                showComparison
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {showComparison ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
              Compare
            </button>
            <Button variant="outline" icon={<RefreshCw size={14} />} onClick={fetchAll} disabled={loading}>Refresh</Button>
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
              {showComparison && (
                <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-gray-50 border border-gray-200 text-xs text-gray-500">
                  vs. {format(prevRange.from, 'MMM d')} â€“ {format(prevRange.to, 'MMM d, yyyy')}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400">
              {transactions.length} transaction{transactions.length !== 1 ? 's' : ''} in period
            </p>
          </div>

          <SectionTitle>Membership</SectionTitle>

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
            <StatCard
              icon={<PiggyBank size={20} />}
              label="Membership Collections"
              value={formatCurrency(membershipCollections)}
              sub="Membership payments"
              iconBg="bg-purple-50"
              iconColor="#7C3AED"
              trend={showComparison ? pct(membershipCollections, prevMembershipCollections) : undefined}
              trendLabel="vs prev"
            />
          </div>

          <SectionTitle>Loans</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
            <StatCard icon={<CreditCard size={20} />} label="Pending Loan Amount" value={formatCurrency(loanStats?.pendingAmount ?? 0)} sub={`${loanStats?.pending ?? 0} pending`} iconBg="bg-amber-50" iconColor="#D97706" />
            <StatCard icon={<CreditCard size={20} />} label="Approved Loan Amount" value={formatCurrency(loanStats?.approvedAmount ?? 0)} sub={`${loanStats?.approved ?? 0} approved`} iconBg="bg-blue-50" iconColor="#2563EB" />
            <StatCard icon={<TrendingUp size={20} />} label="Released Loan Amount" value={formatCurrency(loanStats?.totalReleased ?? 0)} sub={`${loanStats?.released ?? 0} released`} iconBg="bg-green-50" iconColor="#16A34A" />
            <StatCard icon={<TrendingDown size={20} />} label="Outstanding Payable" value={formatCurrency(loanStats?.totalOutstanding ?? 0)} sub="Balance including interest" iconBg="bg-red-50" iconColor="#DC2626" />
            <StatCard icon={<TrendingUp size={20} />} label="Loan Interest Earned" value={formatCurrency(loanInterest)} sub="Collected in period" iconBg="bg-emerald-50" iconColor="#059669"
              trend={showComparison ? pct(loanInterest, prevLoanInterest) : undefined} trendLabel="vs prev" />
          </div>

          <SectionTitle>Loan Status Breakdown</SectionTitle>
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {[
                { key: 'draft', label: 'Draft', color: 'bg-gray-400' },
                { key: 'credit_committee_approval', label: 'Pending Approval', color: 'bg-amber-400' },
                { key: 'approved', label: 'Approved', color: 'bg-blue-400' },
                { key: 'released', label: 'Released', color: 'bg-emerald-400' },
                { key: 'active', label: 'Active Loan', color: 'bg-green-500' },
                { key: 'overdue', label: 'Overdue', color: 'bg-red-400' },
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
          <SectionTitle>CBU & Savings</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard icon={<PiggyBank size={20} />} label="Total CBU Balance"     value={formatCurrency(totalCBUBalance)}    sub={`${accountStats?.cbuCount ?? 0} accounts`}    iconBg="bg-emerald-50" iconColor="#059669" />
            <StatCard icon={<Wallet size={20} />}    label="Total Savings Balance"  value={formatCurrency(totalSavingsBalance)} sub={`${accountStats?.savingsCount ?? 0} accounts`} iconBg="bg-blue-50"    iconColor="#2563EB" />
            <StatCard icon={<TrendingUp size={20} />} label="CBU Cash In (Period)"     value={formatCurrency(cbuDeposits)}     iconBg="bg-emerald-50" iconColor="#059669"
              trend={showComparison ? pct(cbuDeposits, prevCbuDep) : undefined} trendLabel="vs prev" />
            <StatCard icon={<TrendingUp size={20} />} label="Savings Cash In (Period)" value={formatCurrency(savingsDeposits)} iconBg="bg-blue-50"    iconColor="#2563EB"
              trend={showComparison ? pct(savingsDeposits, prevSavingsDep) : undefined} trendLabel="vs prev" />
          </div>

          {/* Trend Charts */}
          <SectionTitle>Trend Analysis</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <TrendChart title="Coop Income" current={chartData.income.current} previous={chartData.income.previous} color={CHART_COLORS.income} showComparison={showComparison} labels={labels} />
            <TrendChart title="Expenses" current={chartData.expense.current} previous={chartData.expense.previous} color={CHART_COLORS.expense} showComparison={showComparison} labels={labels} />
            <TrendChart title="Loan Releases"    current={chartData.loans.current}   previous={chartData.loans.previous}   color={CHART_COLORS.loans}   showComparison={showComparison} labels={labels} />
            <TrendChart title="Savings Deposits" current={chartData.savings.current} previous={chartData.savings.previous} color={CHART_COLORS.savings} showComparison={showComparison} labels={labels} />
            <TrendChart title="CBU Deposits"     current={chartData.cbu.current}     previous={chartData.cbu.previous}     color={CHART_COLORS.cbu}     showComparison={showComparison} labels={labels} />
          </div>

          <SectionTitle>Audit Summary</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {auditRows.map(({ group, label, curr, prev, fmt }) => {
              const numeric = typeof curr === 'number' && typeof prev === 'number';
              const change = numeric ? pct(curr, prev) : null;
              return (
                <div key={`${group}-${label}`} className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{group}</p>
                  <p className="mt-1 text-xs font-semibold text-gray-500">{label}</p>
                  <p className="mt-2 text-lg font-bold text-gray-900 tabular-nums">{fmt(curr)}</p>
                  {showComparison && numeric && (
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <span className="text-gray-400">Prev: {fmt(prev)}</span>
                      {change === null ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <span className={`inline-flex items-center gap-0.5 font-semibold ${
                          change > 0 ? 'text-emerald-600' : change < 0 ? 'text-red-500' : 'text-gray-400'
                        }`}>
                          {change > 0 ? <ArrowUpRight size={11} /> : change < 0 ? <ArrowDownRight size={11} /> : <Minus size={11} />}
                          {Math.abs(change).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
