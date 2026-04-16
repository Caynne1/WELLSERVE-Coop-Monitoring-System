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
import { getTransactions } from '../../services/transactionService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { exportToCSV } from '../../utils/csvExport';

// ── Constants ──────────────────────────────────────────────────────────────

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
};

// ── Date helpers ───────────────────────────────────────────────────────────

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
      const d = tx.transaction_date ? parseISO(tx.transaction_date) : (tx.created_at ? parseISO(tx.created_at) : null);
      if (!d || !isValid(d)) return false;
      return d >= periodStart && d <= (preset === 'weekly' ? periodStart : periodEnd);
    });

    return {
      label: preset === 'weekly'
        ? format(periodStart, 'EEE')
        : preset === 'monthly'
          ? `W${i + 1}`
          : format(periodStart, preset === 'annual' ? 'MMM' : 'MMM yy'),
      loans:   inPeriod.filter(t => t.type === 'loan_release').reduce((s, t) => s + (t.amount || 0), 0),
      savings: inPeriod.filter(t => t.type === 'deposit' && t.category === 'savings').reduce((s, t) => s + (t.amount || 0), 0),
      cbu:     inPeriod.filter(t => t.type === 'deposit' && t.category === 'cbu').reduce((s, t) => s + (t.amount || 0), 0),
    };
  });
}

// ── SVG Trend Chart ────────────────────────────────────────────────────────

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

// ── Stat Card ──────────────────────────────────────────────────────────────

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

function SectionTitle({ children }) {
  return (
    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-3 mt-8">
      {children}
    </h2>
  );
}

// ── Date Range Picker ──────────────────────────────────────────────────────

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
            {format(customFrom, 'MMM d')} – {format(customTo, 'MMM d, yyyy')}
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

// ── Print CSS ──────────────────────────────────────────────────────────────

const PRINT_CSS = `
@media print {
  body > * { display: none !important; }
  #wellserve-report-root { display: block !important; }
  #wellserve-report-root * { visibility: visible !important; }
  .no-print { display: none !important; }
  @page { size: A4 portrait; margin: 16mm; }
  .bg-white { background: white !important; }
  .border { border: 1px solid #e5e7eb !important; }
}
`;

// ── Main ───────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [memberStats, setMemberStats]   = useState(null);
  const [loanStats, setLoanStats]       = useState(null);
  const [accountStats, setAccountStats] = useState(null);
  const [allTransactions, setAllTransactions] = useState([]);
  const [loading, setLoading]           = useState(true);

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
      const [ms, ls, as, txs] = await Promise.all([
        getMemberStats(),
        getLoanStats(),
        getAccountStats(),
        getTransactions(),
      ]);
      setMemberStats(ms);
      setLoanStats(ls);
      setAccountStats(as);
      setAllTransactions(txs || []);
    } catch {
      toast.error('Failed to load report data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAll(); }, []);

  // Filter by period
  const filterByRange = (txs, rangeFrom, rangeTo) => txs.filter(tx => {
    const d = tx.transaction_date ? parseISO(tx.transaction_date) : (tx.created_at ? parseISO(tx.created_at) : null);
    if (!d || !isValid(d)) return false;
    return d >= rangeFrom && d <= rangeTo;
  });

  const transactions     = useMemo(() => filterByRange(allTransactions, from, to), [allTransactions, from, to]);
  const prevTransactions = useMemo(() => filterByRange(allTransactions, prevRange.from, prevRange.to), [allTransactions, prevRange]);

  // Derived
  const sum = (arr, pred) => arr.filter(pred).reduce((s, t) => s + (t.amount || 0), 0);
  const pct = (curr, prev) => prev === 0 ? null : ((curr - prev) / prev) * 100;

  const totalDeposited  = sum(transactions, t => t.type === 'deposit');
  const totalWithdrawn  = sum(transactions, t => t.type === 'withdrawal');
  const totalRepaid     = sum(transactions, t => t.type === 'loan_payment');
  const totalReleased   = sum(transactions, t => t.type === 'loan_release');
  const cbuDeposits     = sum(transactions, t => t.type === 'deposit' && t.category === 'cbu');
  const savingsDeposits = sum(transactions, t => t.type === 'deposit' && t.category === 'savings');

  const prevDeposited   = sum(prevTransactions, t => t.type === 'deposit');
  const prevWithdrawn   = sum(prevTransactions, t => t.type === 'withdrawal');
  const prevRepaid      = sum(prevTransactions, t => t.type === 'loan_payment');
  const prevReleased    = sum(prevTransactions, t => t.type === 'loan_release');
  const prevCbuDep      = sum(prevTransactions, t => t.type === 'deposit' && t.category === 'cbu');
  const prevSavingsDep  = sum(prevTransactions, t => t.type === 'deposit' && t.category === 'savings');

  const deposits     = transactions.filter(t => t.type === 'deposit');
  const withdrawals  = transactions.filter(t => t.type === 'withdrawal');
  const loanPayments = transactions.filter(t => t.type === 'loan_payment');
  const loanReleases = transactions.filter(t => t.type === 'loan_release');

  // Time series
  const currSeries = useMemo(() => buildTimeSeries(transactions, from, to, preset), [transactions, from, to, preset]);
  const prevSeries = useMemo(() => buildTimeSeries(prevTransactions, prevRange.from, prevRange.to, preset), [prevTransactions, prevRange, preset]);

  const labels = currSeries.map(s => s.label);
  const chartData = {
    loans:   { current: currSeries.map(s => s.loans),   previous: prevSeries.map(s => s.loans) },
    savings: { current: currSeries.map(s => s.savings), previous: prevSeries.map(s => s.savings) },
    cbu:     { current: currSeries.map(s => s.cbu),     previous: prevSeries.map(s => s.cbu) },
  };

  // Exports
  function handleExportSummary() {
    const rows = [
      { Metric: 'Report Period',                Value: `${formatDate(from.toISOString())} – ${formatDate(to.toISOString())}` },
      { Metric: 'Total Members',                Value: memberStats?.total ?? 0 },
      { Metric: 'Active Members',               Value: memberStats?.active ?? 0 },
      { Metric: 'Total CBU Balance (PHP)',       Value: accountStats?.totalCBU ?? 0 },
      { Metric: 'Total Savings Balance (PHP)',   Value: accountStats?.totalSavings ?? 0 },
      { Metric: 'Total Loans',                  Value: loanStats?.total ?? 0 },
      { Metric: 'Active Loans',                 Value: loanStats?.active ?? 0 },
      { Metric: 'Outstanding Balance (PHP)',     Value: loanStats?.totalOutstanding ?? 0 },
      { Metric: 'Period: Loans Released (PHP)', Value: totalReleased },
      { Metric: 'Period: Loan Repayments (PHP)',Value: totalRepaid },
      { Metric: 'Period: All Deposits (PHP)',   Value: totalDeposited },
      { Metric: 'Period: All Withdrawals (PHP)',Value: totalWithdrawn },
      { Metric: 'Period: CBU Deposits (PHP)',   Value: cbuDeposits },
      { Metric: 'Period: Savings Deposits (PHP)',Value: savingsDeposits },
      { Metric: 'Report Generated',             Value: format(new Date(), 'MMM d, yyyy h:mm a') },
    ];
    exportToCSV('wellserve_summary_report', rows);
    toast.success('Summary report exported.');
  }

  function handleExportTransactions() {
    if (transactions.length === 0) return toast.error('No transactions in this period.');
    const rows = transactions.map(tx => ({
      type: tx.type || '',
      category: tx.category || '',
      member_name: `${tx.members?.first_name || ''} ${tx.members?.last_name || ''}`.trim(),
      member_no: tx.members?.member_no || '',
      amount: tx.amount ?? 0,
      reference: tx.reference || '',
      date: tx.transaction_date || (tx.created_at ? formatDate(tx.created_at) : ''),
    }));
    exportToCSV(`transactions_${format(from, 'yyyy-MM-dd')}_to_${format(to, 'yyyy-MM-dd')}`, rows);
    toast.success(`Exported ${rows.length} transactions.`);
  }

  function handlePrint() {
    let styleEl = document.getElementById('ws-print-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'ws-print-style';
      document.head.appendChild(styleEl);
    }
    styleEl.innerHTML = PRINT_CSS;
    window.print();
    setTimeout(() => { if (styleEl) styleEl.innerHTML = ''; }, 2000);
  }

  const periodLabel = preset !== 'custom'
    ? `${PRESETS.find(p => p.id === preset)?.label} — ${format(from, 'MMM d')} to ${format(to, 'MMM d, yyyy')}`
    : `${format(from, 'MMM d, yyyy')} – ${format(to, 'MMM d, yyyy')}`;

  const auditRows = [
    { label: 'Total Members',            curr: memberStats?.total ?? 0,           prev: memberStats?.total ?? 0,          fmt: v => v },
    { label: 'Active Members',           curr: memberStats?.active ?? 0,          prev: memberStats?.active ?? 0,         fmt: v => v },
    { label: 'Total CBU Balance',        curr: accountStats?.totalCBU ?? 0,       prev: accountStats?.totalCBU ?? 0,      fmt: formatCurrency },
    { label: 'Total Savings Balance',    curr: accountStats?.totalSavings ?? 0,   prev: accountStats?.totalSavings ?? 0,  fmt: formatCurrency },
    { label: 'Outstanding Loan Balance', curr: loanStats?.totalOutstanding ?? 0,  prev: loanStats?.totalOutstanding ?? 0, fmt: formatCurrency },
    { label: 'Loans Released (Period)',  curr: totalReleased,                      prev: prevReleased,                      fmt: formatCurrency },
    { label: 'Loan Repayments (Period)', curr: totalRepaid,                        prev: prevRepaid,                        fmt: formatCurrency },
    { label: 'Deposits (Period)',        curr: totalDeposited,                     prev: prevDeposited,                     fmt: formatCurrency },
    { label: 'Withdrawals (Period)',     curr: totalWithdrawn,                     prev: prevWithdrawn,                     fmt: formatCurrency },
    { label: 'CBU Deposits (Period)',    curr: cbuDeposits,                        prev: prevCbuDep,                        fmt: formatCurrency },
    { label: 'Savings Deposits (Period)',curr: savingsDeposits,                    prev: prevSavingsDep,                    fmt: formatCurrency },
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
          {/* Print header — only visible when printing */}
          <div className="hidden print-show mb-6 pb-4 border-b-2 border-gray-900">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-900">WELLSERVE Cooperative</h1>
                <p className="text-sm text-gray-600 mt-0.5">Financial Report — {periodLabel}</p>
              </div>
              <div className="text-right text-xs text-gray-500">
                <p>Generated: {format(new Date(), 'MMMM d, yyyy h:mm a')}</p>
                <p className="font-semibold text-gray-700 mt-0.5">CONFIDENTIAL — FOR AUTHORIZED USE ONLY</p>
              </div>
            </div>
          </div>

          {/* Period banner */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-100 text-xs font-semibold text-emerald-700">
                <Calendar size={11} />
                {periodLabel}
              </span>
              {showComparison && (
                <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-gray-50 border border-gray-200 text-xs text-gray-500">
                  vs. {format(prevRange.from, 'MMM d')} – {format(prevRange.to, 'MMM d, yyyy')}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400">
              {transactions.length} transaction{transactions.length !== 1 ? 's' : ''} in period
            </p>
          </div>

          {/* Membership */}
          <SectionTitle>Membership</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard icon={<Users size={20} />} label="Total Members"  value={memberStats?.total ?? 0}     iconBg="bg-blue-50"    iconColor="#2563EB" />
            <StatCard icon={<Users size={20} />} label="Active Members" value={memberStats?.active ?? 0}    iconBg="bg-emerald-50" iconColor="#059669" />
            <StatCard icon={<Users size={20} />} label="Associate"      value={memberStats?.associate ?? 0} iconBg="bg-amber-50"   iconColor="#D97706" />
            <StatCard icon={<Users size={20} />} label="Regular"        value={memberStats?.regular ?? 0}   iconBg="bg-violet-50"  iconColor="#7C3AED" />
          </div>

          {/* Loans */}
          <SectionTitle>Loans</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard icon={<CreditCard size={20} />} label="Total Loans"  value={loanStats?.total ?? 0}  iconBg="bg-orange-50" iconColor="#EA580C" />
            <StatCard icon={<CreditCard size={20} />} label="Active Loans" value={loanStats?.active ?? 0} iconBg="bg-orange-50" iconColor="#EA580C" />
            <StatCard icon={<TrendingUp size={20} />}   label="Total Released"  value={formatCurrency(loanStats?.totalReleased ?? 0)}    iconBg="bg-green-50" iconColor="#16A34A"
              trend={showComparison ? pct(totalReleased, prevReleased) : undefined} trendLabel="vs prev" />
            <StatCard icon={<TrendingDown size={20} />} label="Outstanding" value={formatCurrency(loanStats?.totalOutstanding ?? 0)} sub="Active loans only" iconBg="bg-red-50" iconColor="#DC2626" />
          </div>

          {/* CBU & Savings */}
          <SectionTitle>CBU & Savings</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard icon={<PiggyBank size={20} />} label="Total CBU Balance"     value={formatCurrency(accountStats?.totalCBU ?? 0)}    sub={`${accountStats?.cbuCount ?? 0} accounts`}    iconBg="bg-emerald-50" iconColor="#059669" />
            <StatCard icon={<Wallet size={20} />}    label="Total Savings Balance"  value={formatCurrency(accountStats?.totalSavings ?? 0)} sub={`${accountStats?.savingsCount ?? 0} accounts`} iconBg="bg-blue-50"    iconColor="#2563EB" />
            <StatCard icon={<TrendingUp size={20} />} label="CBU Deposits (Period)"     value={formatCurrency(cbuDeposits)}     iconBg="bg-emerald-50" iconColor="#059669"
              trend={showComparison ? pct(cbuDeposits, prevCbuDep) : undefined} trendLabel="vs prev" />
            <StatCard icon={<TrendingUp size={20} />} label="Savings Deposits (Period)" value={formatCurrency(savingsDeposits)} iconBg="bg-blue-50"    iconColor="#2563EB"
              trend={showComparison ? pct(savingsDeposits, prevSavingsDep) : undefined} trendLabel="vs prev" />
          </div>

          {/* Transaction totals */}
          <SectionTitle>Transaction Totals — Period</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard icon={<TrendingUp size={20} />}   label="All Deposits"    value={formatCurrency(totalDeposited)} sub={`${deposits.length} transactions`}    iconBg="bg-green-50"  iconColor="#16A34A"
              trend={showComparison ? pct(totalDeposited, prevDeposited) : undefined} trendLabel="vs prev" />
            <StatCard icon={<TrendingDown size={20} />} label="All Withdrawals" value={formatCurrency(totalWithdrawn)} sub={`${withdrawals.length} transactions`} iconBg="bg-red-50"    iconColor="#DC2626"
              trend={showComparison ? pct(totalWithdrawn, prevWithdrawn) : undefined} trendLabel="vs prev" />
            <StatCard icon={<CreditCard size={20} />} label="Loan Repayments" value={formatCurrency(totalRepaid)}   sub={`${loanPayments.length} payments`}   iconBg="bg-orange-50" iconColor="#EA580C"
              trend={showComparison ? pct(totalRepaid, prevRepaid) : undefined} trendLabel="vs prev" />
            <StatCard icon={<CreditCard size={20} />} label="Loans Released"  value={formatCurrency(totalReleased)} sub={`${loanReleases.length} releases`}   iconBg="bg-violet-50" iconColor="#7C3AED"
              trend={showComparison ? pct(totalReleased, prevReleased) : undefined} trendLabel="vs prev" />
          </div>

          {/* Trend Charts */}
          <SectionTitle>Trend Analysis</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <TrendChart title="Loan Releases"    current={chartData.loans.current}   previous={chartData.loans.previous}   color={CHART_COLORS.loans}   showComparison={showComparison} labels={labels} />
            <TrendChart title="Savings Deposits" current={chartData.savings.current} previous={chartData.savings.previous} color={CHART_COLORS.savings} showComparison={showComparison} labels={labels} />
            <TrendChart title="CBU Deposits"     current={chartData.cbu.current}     previous={chartData.cbu.previous}     color={CHART_COLORS.cbu}     showComparison={showComparison} labels={labels} />
          </div>

          {/* Audit Summary Table */}
          <SectionTitle>Audit Summary</SectionTitle>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Metric</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {showComparison ? 'Current Period' : 'Value'}
                  </th>
                  {showComparison && <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Previous Period</th>}
                  {showComparison && <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Change</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {auditRows.map(({ label, curr, prev, fmt }) => {
                  const change = pct(curr, prev);
                  return (
                    <tr key={label} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-gray-700 font-medium">{label}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">{fmt(curr)}</td>
                      {showComparison && <td className="px-4 py-3 text-right text-gray-500 tabular-nums">{fmt(prev)}</td>}
                      {showComparison && (
                        <td className="px-4 py-3 text-right">
                          {change === null ? (
                            <span className="text-gray-400 text-xs">—</span>
                          ) : (
                            <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
                              change > 0 ? 'text-emerald-600' : change < 0 ? 'text-red-500' : 'text-gray-400'
                            }`}>
                              {change > 0 ? <ArrowUpRight size={11} /> : change < 0 ? <ArrowDownRight size={11} /> : <Minus size={11} />}
                              {Math.abs(change).toFixed(1)}%
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Transactions Table */}
          <div className="flex items-center justify-between mt-8 mb-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest">
              Transactions — Period ({transactions.length})
            </h2>
            <Button variant="outline" size="sm" icon={<Download size={13} />} onClick={handleExportTransactions} className="no-print">
              Export CSV
            </Button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Type', 'Category', 'Member', 'Amount', 'Date'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-10 text-gray-400">No transactions in this period.</td>
                    </tr>
                  ) : transactions.slice(0, 30).map(tx => (
                    <tr key={tx.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 capitalize text-gray-700">{tx.type?.replace(/_/g, ' ') || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="capitalize text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{tx.category || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{tx.members?.first_name} {tx.members?.last_name}</p>
                        {tx.members?.member_no && <p className="text-xs text-gray-400 font-mono">{tx.members.member_no}</p>}
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-800 tabular-nums">{formatCurrency(tx.amount)}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {tx.transaction_date ? formatDate(tx.transaction_date) : (tx.created_at ? formatDate(tx.created_at) : '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {transactions.length > 30 && (
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50">
                <p className="text-xs text-gray-400">
                  Showing 30 of {transactions.length} transactions. Use <strong>Export CSV</strong> for the full list.
                </p>
              </div>
            )}
          </div>

          {/* Print footer */}
          <div className="hidden print-show mt-8 pt-4 border-t border-gray-200 text-xs text-gray-400 text-center">
            <p>WELLSERVE Cooperative Monitoring System — This report is intended for authorized personnel only.</p>
            <p className="mt-1">Generated on {format(new Date(), 'MMMM d, yyyy')} at {format(new Date(), 'h:mm a')}</p>
          </div>
        </>
      )}
    </div>
  );
}