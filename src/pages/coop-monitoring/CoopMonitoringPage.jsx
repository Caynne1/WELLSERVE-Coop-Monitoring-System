import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign,
  RefreshCw, ArrowUpRight, ArrowDownRight,
  LayoutDashboard, Plus, AlertTriangle, Calendar,
  BarChart2, X, Printer, Download,
} from 'lucide-react';
import { exportToCSV } from '../../utils/csvExport';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Spinner from '../../components/ui/Spinner';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import {
  computeCoopSummaryFromInvoices,
  CATEGORY_LABEL,
  CATEGORY_COLOR,
  recordManualFundDeposit,
} from '../../services/coopFundService';
import { supabase } from '../../services/supabase';
import { formatCurrency, formatDate } from '../../utils/formatters';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PAYMENT_MODE_OPTIONS = [
  { value: '', label: 'Select mode of payment' },
  { value: 'Cash', label: 'Cash' },
  { value: 'GCash', label: 'GCash' },
  { value: 'Bank Transfer', label: 'Bank Transfer' },
  { value: 'Check', label: 'Check' },
  { value: 'Others', label: 'Others' },
];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function CategoryBadge({ category }) {
  const label = CATEGORY_LABEL[category] || category || '—';
  const cls = CATEGORY_COLOR[category] || 'text-gray-600 bg-gray-100';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${cls}`}>
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat Card
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, bg, textColor, accent }) {
  return (
    <div className={`bg-white rounded-xl border ${accent || 'border-gray-200'} p-5 flex items-center gap-4`}>
      <div className={`w-12 h-12 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className={`text-xl font-bold ${textColor}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini Bar Chart (SVG, no external lib)
// ─────────────────────────────────────────────────────────────────────────────

function BarChart({ data, color, height = 80 }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map(d => d.value), 1);
  const w = 100 / data.length;
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      {data.map((d, i) => {
        const barH = (d.value / max) * (height - 4);
        const x = i * w + w * 0.15;
        const barW = w * 0.7;
        return (
          <g key={i}>
            <rect
              x={x} y={height - barH} width={barW} height={barH}
              fill={color} rx="2" opacity="0.85"
            />
          </g>
        );
      })}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Line Chart (SVG)
// ─────────────────────────────────────────────────────────────────────────────

function LineChart({ series, height = 120, labels }) {
  // series: [{ color, data: number[] }]
  if (!series || series.length === 0) return null;
  const allVals = series.flatMap(s => s.data);
  const max = Math.max(...allVals, 1);
  const n = series[0].data.length;
  if (n < 2) return null;

  const W = 600;
  const H = 180;
  const pad = { t: 12, b: 30, l: 8, r: 8 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const px = i => pad.l + (i / (n - 1)) * innerW;
  const py = v => pad.t + innerH - (v / max) * innerH;

  const makePath = (data) =>
    data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join(' ');

  const makeArea = (data) => {
    const line = makePath(data);
    return `${line} L ${px(n - 1).toFixed(1)} ${(pad.t + innerH).toFixed(1)} L ${px(0).toFixed(1)} ${(pad.t + innerH).toFixed(1)} Z`;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="w-full" style={{ height }}>
      {/* Grid lines */}
      {[0, 0.5, 1].map((pct, i) => (
        <line
          key={i}
          x1={pad.l} y1={pad.t + innerH * (1 - pct)}
          x2={W - pad.r} y2={pad.t + innerH * (1 - pct)}
          stroke="#f0f0f0" strokeWidth="1.5"
        />
      ))}
      {/* Area fills */}
      {series.map((s, si) => (
        <path key={`area-${si}`} d={makeArea(s.data)} fill={s.color} opacity="0.08" />
      ))}
      {/* Lines */}
      {series.map((s, si) => (
        <path key={`line-${si}`} d={makePath(s.data)} fill="none" stroke={s.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {/* Dots */}
      {series.map((s, si) =>
        s.data.map((v, i) => (
          <circle key={`dot-${si}-${i}`} cx={px(i)} cy={py(v)} r="5" fill={s.color} />
        ))
      )}
      {/* X Labels */}
      {labels && labels.map((lbl, i) => (
        <text key={i} x={px(i)} y={H - 4} textAnchor="middle" fontSize="16" fill="#9ca3af">
          {lbl}
        </text>
      ))}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Donut Chart (SVG)
// ─────────────────────────────────────────────────────────────────────────────

function DonutChart({ slices, size = 100 }) {
  // slices: [{ value, color, label }]
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  if (total === 0) return null;

  const cx = size / 2, cy = size / 2, r = size * 0.38, innerR = size * 0.25;
  let angle = -Math.PI / 2;

  const arc = (startA, endA) => {
    const x1 = cx + r * Math.cos(startA), y1 = cy + r * Math.sin(startA);
    const x2 = cx + r * Math.cos(endA), y2 = cy + r * Math.sin(endA);
    const xi1 = cx + innerR * Math.cos(endA), yi1 = cy + innerR * Math.sin(endA);
    const xi2 = cx + innerR * Math.cos(startA), yi2 = cy + innerR * Math.sin(startA);
    const large = endA - startA > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi1} ${yi1} A ${innerR} ${innerR} 0 ${large} 0 ${xi2} ${yi2} Z`;
  };

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full" style={{ maxWidth: size }}>
      {slices.map((sl, i) => {
        const sweep = (sl.value / total) * 2 * Math.PI;
        const path = arc(angle, angle + sweep);
        angle += sweep;
        return <path key={i} d={path} fill={sl.color} opacity="0.9" />;
      })}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Date Range Picker
// ─────────────────────────────────────────────────────────────────────────────

function DateRangePicker({ from, to, onChange }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm">
        <Calendar size={13} className="text-gray-400 flex-shrink-0" />
        <span className="text-gray-400 text-xs">From</span>
        <input
          type="date"
          value={from}
          onChange={e => onChange({ from: e.target.value, to })}
          className="text-sm text-gray-700 bg-transparent border-none outline-none"
        />
      </div>
      <span className="text-gray-300 text-sm">—</span>
      <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm">
        <Calendar size={13} className="text-gray-400 flex-shrink-0" />
        <span className="text-gray-400 text-xs">To</span>
        <input
          type="date"
          value={to}
          onChange={e => onChange({ from, to: e.target.value })}
          className="text-sm text-gray-700 bg-transparent border-none outline-none"
        />
      </div>
      {(from || to) && (
        <button
          onClick={() => onChange({ from: '', to: '' })}
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
        >
          <X size={11} /> Clear
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction Row
// ─────────────────────────────────────────────────────────────────────────────

function TxRow({ tx }) {
  const isCashIn = tx.type === 'cash_in';
  return (
    <tr className="hover:bg-gray-50/60 transition-colors">
      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
        {tx.created_at ? formatDate(tx.created_at) : '—'}
      </td>
      <td className="px-4 py-3">
        <CategoryBadge category={tx.category} />
      </td>
      <td className="px-4 py-3 text-sm text-gray-700">
        {tx.description || '—'}
      </td>
      <td className="px-4 py-3 text-xs font-mono text-gray-400">
        {tx.ref_no || '—'}
      </td>
      <td className="px-4 py-3 text-right">
        <span className={`text-sm font-semibold flex items-center justify-end gap-1 ${isCashIn ? 'text-green-700' : 'text-red-600'}`}>
          {isCashIn
            ? <ArrowUpRight size={14} className="flex-shrink-0" />
            : <ArrowDownRight size={14} className="flex-shrink-0" />}
          {formatCurrency(tx.amount)}
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
          isCashIn
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-600 border border-red-200'
        }`}>
          {isCashIn ? 'Cash In' : 'Cash Out'}
        </span>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Charts Panel
// ─────────────────────────────────────────────────────────────────────────────

function DashboardCharts({ transactions, penaltyTotal, penaltyCount }) {
  // Build last 6 months buckets
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { year: d.getFullYear(), month: d.getMonth(), label: MONTH_NAMES[d.getMonth()] };
  });

  const bucket = (tx) => {
    const d = new Date(tx.created_at);
    return months.findIndex(m => m.year === d.getFullYear() && m.month === d.getMonth());
  };

  const cashInByMonth = Array(6).fill(0);
  const cashOutByMonth = Array(6).fill(0);

  transactions.forEach(tx => {
    const idx = bucket(tx);
    if (idx < 0) return;
    if (tx.type === 'cash_in') cashInByMonth[idx] += tx.amount;
    else cashOutByMonth[idx] += tx.amount;
  });

  const labels = months.map(m => m.label);

  // Cash-in breakdown for donut
  const breakdownDefs = [
    { key: 'loan_payment', label: 'Loan Payments', color: '#f97316' },
    { key: 'cbu', label: 'CBU Deposits', color: '#22c55e' },
    { key: 'savings', label: 'Savings', color: '#3b82f6' },
    { key: 'membership', label: 'Membership', color: '#a855f7' },
    { key: 'capital', label: 'Capital', color: '#6366f1' },
    { key: 'penalty', label: 'Penalties', color: '#ef4444' },
    { key: 'time_deposit', label: 'Time Deposits', color: '#8b5cf6' },
    { key: 'invoice', label: 'Other', color: '#9ca3af' },
  ];

  const cashInTx = transactions.filter(tx => tx.type === 'cash_in');
  const donutSlices = breakdownDefs.map(d => ({
    ...d,
    value: cashInTx.filter(tx => tx.category === d.key).reduce((s, tx) => s + tx.amount, 0),
  })).filter(d => d.value > 0);

  const grandCashIn = donutSlices.reduce((s, d) => s + d.value, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
      {/* Cash Flow Line Chart */}
      <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Cash Flow — Last 6 Months</h3>
            <p className="text-xs text-gray-400 mt-0.5">Monthly cash in vs. cash out</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-green-600">
              <span className="w-3 h-0.5 bg-green-500 inline-block rounded" /> Cash In
            </span>
            <span className="flex items-center gap-1.5 text-red-500">
              <span className="w-3 h-0.5 bg-red-400 inline-block rounded" /> Cash Out
            </span>
          </div>
        </div>
        <LineChart
          series={[
            { color: '#22c55e', data: cashInByMonth },
            { color: '#ef4444', data: cashOutByMonth },
          ]}
          labels={labels}
          height={220}
        />
      </div>

      {/* Cash-In Donut */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Cash In Breakdown</h3>
        <p className="text-xs text-gray-400 mb-3">By category</p>
        {donutSlices.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-xs text-gray-400">No data</div>
        ) : (
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-20">
              <DonutChart slices={donutSlices} size={80} />
            </div>
            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
              {donutSlices.map(d => (
                <div key={d.key} className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
                  <span className="text-xs text-gray-500 truncate flex-1">{d.label}</span>
                  <span className="text-xs font-semibold text-gray-700 flex-shrink-0">
                    {grandCashIn > 0 ? `${((d.value / grandCashIn) * 100).toFixed(0)}%` : '0%'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Monthly Bar Charts row */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 size={14} className="text-green-500" />
          <h3 className="text-sm font-semibold text-gray-700">Monthly Cash In</h3>
        </div>
        <BarChart data={cashInByMonth.map((v, i) => ({ label: labels[i], value: v }))} color="#22c55e" height={70} />
        <div className="flex justify-between mt-1">
          {labels.map(l => (
            <span key={l} className="text-[9px] text-gray-400">{l}</span>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 size={14} className="text-red-400" />
          <h3 className="text-sm font-semibold text-gray-700">Monthly Cash Out</h3>
        </div>
        <BarChart data={cashOutByMonth.map((v, i) => ({ label: labels[i], value: v }))} color="#f87171" height={70} />
        <div className="flex justify-between mt-1">
          {labels.map(l => (
            <span key={l} className="text-[9px] text-gray-400">{l}</span>
          ))}
        </div>
      </div>

      {/* Penalty Income Summary */}
      <div className="bg-white rounded-xl border border-amber-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={15} className="text-amber-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Penalty Income</h3>
            <p className="text-xs text-gray-400">All penalty charges collected</p>
          </div>
        </div>
        <p className="text-2xl font-bold text-amber-600 mb-1">{formatCurrency(penaltyTotal)}</p>
        <p className="text-xs text-gray-400">
          {penaltyCount} penalt{penaltyCount !== 1 ? 'ies' : 'y'} recorded
        </p>
        {penaltyCount > 0 && (
          <div className="mt-3 pt-3 border-t border-amber-100">
            <p className="text-xs text-gray-500">
              Avg. per penalty: <span className="font-semibold text-gray-700">{formatCurrency(penaltyTotal / penaltyCount)}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cash-In Breakdown Bar
// ─────────────────────────────────────────────────────────────────────────────

function CashInBreakdown({ transactions }) {
  const cashInTx = transactions.filter(tx => tx.type === 'cash_in');

  const groups = [
    { key: 'loan_payment', label: 'Loan Payments', color: 'bg-orange-400' },
    { key: 'cbu', label: 'CBU Deposits', color: 'bg-green-400' },
    { key: 'savings', label: 'Savings Deposits', color: 'bg-blue-400' },
    { key: 'membership', label: 'Membership Fees', color: 'bg-purple-400' },
    { key: 'capital', label: 'Capital / Fund Deposit', color: 'bg-indigo-400' },
    { key: 'penalty', label: 'Penalty Income', color: 'bg-amber-400' },
    { key: 'time_deposit', label: 'Time Deposits', color: 'bg-violet-400' },
    { key: 'invoice', label: 'Other Invoices', color: 'bg-gray-400' },
  ].map(g => ({
    ...g,
    total: cashInTx.filter(tx => tx.category === g.key).reduce((s, tx) => s + tx.amount, 0),
    count: cashInTx.filter(tx => tx.category === g.key).length,
  })).filter(g => g.total > 0);

  if (groups.length === 0) return null;

  const grandTotal = groups.reduce((s, g) => s + g.total, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Cash In — Breakdown by Type</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {groups.map(g => (
          <div key={g.key} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${g.color} flex-shrink-0`} />
              <p className="text-xs text-gray-500 truncate">{g.label}</p>
            </div>
            <p className="text-base font-bold text-gray-800 pl-4">{formatCurrency(g.total)}</p>
            <p className="text-xs text-gray-400 pl-4">{g.count} transaction{g.count !== 1 ? 's' : ''}</p>
            <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
              <div
                className={`h-1.5 rounded-full ${g.color}`}
                style={{ width: grandTotal > 0 ? `${(g.total / grandTotal) * 100}%` : '0%' }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Penalty Income Table
// ─────────────────────────────────────────────────────────────────────────────

function PenaltyIncomeTable({ penalties, loading }) {
  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-amber-200 overflow-hidden mb-6">
      <div className="px-5 py-3 border-b border-amber-100 flex items-center gap-2 bg-amber-50/40">
        <AlertTriangle size={14} className="text-amber-500" />
        <h3 className="text-sm font-semibold text-amber-800">Penalty Income</h3>
        <span className="ml-auto text-xs text-amber-600 font-medium">
          {penalties.length} record{penalties.length !== 1 ? 's' : ''}
        </span>
      </div>

      {penalties.length === 0 ? (
        <div className="py-12 text-center">
          <AlertTriangle size={28} className="text-amber-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No penalty records found.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100">
                {['Date', 'Member', 'Description', 'Amount'].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide ${
                      i === 3 ? 'text-right' : 'text-left'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {penalties.map(p => (
                <tr key={p.id} className="hover:bg-amber-50/20 transition-colors">
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {p.penalty_date ? formatDate(p.penalty_date) : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {p.members
                      ? `${p.members.first_name || ''} ${p.members.last_name || ''}`.trim() || '—'
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{p.description || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-semibold text-amber-600">
                      {formatCurrency(p.amount)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-amber-50/60 border-t border-amber-100">
                <td colSpan={3} className="px-4 py-3 text-xs font-semibold text-amber-700">
                  Total Penalty Income
                </td>
                <td className="px-4 py-3 text-right text-sm font-bold text-amber-700">
                  {formatCurrency(penalties.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function CoopMonitoringPage() {
  const { user } = useAuth();

  // ── Core data state ───────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [fund, setFund] = useState({ balance: 0, cash_in: 0, cash_out: 0 });
  const [transactions, setTransactions] = useState([]);
  const [penalties, setPenalties] = useState([]);
  const [penaltiesLoading, setPenaltiesLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [typeFilter, setTypeFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  // ── Add Fund modal state ──────────────────────────────────────────────────
  const [fundModalOpen, setFundModalOpen] = useState(false);
  const [fundAmount, setFundAmount] = useState('');
  const [fundDate, setFundDate] = useState(new Date().toISOString().split('T')[0]);
  const [fundDescription, setFundDescription] = useState('');
  const [siNo, setSiNo] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [savingFund, setSavingFund] = useState(false);

  // ── Fetch penalties ───────────────────────────────────────────────────────
  const fetchPenalties = useCallback(async () => {
    try {
      setPenaltiesLoading(true);
      const { data, error } = await supabase
        .from('penalties')
        .select('*, members(first_name, last_name)')
        .order('penalty_date', { ascending: false });
      if (error) throw error;
      setPenalties(data || []);
    } catch (err) {
      console.error('[CoopMonitoringPage] penalty fetch error:', err);
    } finally {
      setPenaltiesLoading(false);
    }
  }, []);

  // ── Fetch main data ───────────────────────────────────────────────────────
  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      const { fund: f, transactions: txs } = await computeCoopSummaryFromInvoices();
      setFund(f);
      setTransactions(txs);
    } catch (err) {
      console.error('[CoopMonitoringPage] fetch error:', err);
      toast.error('Failed to load cooperative fund data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchPenalties();
  }, [fetchData, fetchPenalties]);

  // ── Add Fund handler ──────────────────────────────────────────────────────
  async function handleAddFund() {
    const value = parseFloat(fundAmount) || 0;
    const referenceRequired = ['GCash', 'Bank Transfer', 'Check'].includes(paymentMode);

    if (!siNo.trim()) return toast.error('SI# is required.');
    if (!paymentMode) return toast.error('Mode of payment is required.');
    if (referenceRequired && !paymentReference.trim())
      return toast.error('Reference is required for selected payment mode.');
    if (value <= 0) return toast.error('Enter a valid amount.');
    if (!fundDate) return toast.error('Date is required.');

    setSavingFund(true);
    try {
      await recordManualFundDeposit({
        invoice_no: siNo.trim(),
        amount: value,
        date: fundDate,
        description: fundDescription,
        created_by: user?.id ?? null,
        payment_mode: paymentMode,
        payment_mode_note:
          [paymentReference.trim(), paymentNotes.trim()].filter(Boolean).join(' | ') || null,
      });

      toast.success('Fund added successfully.');
      setFundModalOpen(false);
      setFundAmount('');
      setFundDescription('');
      setFundDate(new Date().toISOString().split('T')[0]);
      setSiNo('');
      setPaymentMode('');
      setPaymentReference('');
      setPaymentNotes('');
      await fetchData(true);
    } catch (err) {
      console.error('[CoopMonitoringPage] add fund error:', err);
      toast.error(err.message || 'Failed to add fund.');
    } finally {
      setSavingFund(false);
    }
  }

  // ── Client-side filtering ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return transactions.filter(tx => {
      if (typeFilter && tx.type !== typeFilter) return false;
      if (catFilter && tx.category !== catFilter) return false;
      if (dateRange.from) {
        const txDate = new Date(tx.created_at);
        if (txDate < new Date(dateRange.from)) return false;
      }
      if (dateRange.to) {
        const txDate = new Date(tx.created_at);
        const toDate = new Date(dateRange.to);
        toDate.setHours(23, 59, 59, 999);
        if (txDate > toDate) return false;
      }
      return true;
    });
  }, [transactions, typeFilter, catFilter, dateRange]);

  const filteredPenalties = useMemo(() => {
    return penalties.filter(p => {
      if (dateRange.from && p.penalty_date < dateRange.from) return false;
      if (dateRange.to && p.penalty_date > dateRange.to) return false;
      return true;
    });
  }, [penalties, dateRange]);

  const penaltyTotal = filteredPenalties.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

  const categories = [...new Set(transactions.map(tx => tx.category).filter(Boolean))];
  const hasFilters = typeFilter || catFilter || dateRange.from || dateRange.to;

  function handlePrint() { window.print(); }

  function handleExportCSV() {
    try {
      if (filtered.length === 0) { toast.error('No transactions to export.'); return; }
      const rows = filtered.map(tx => ({
        date: tx.created_at ? formatDate(tx.created_at) : '',
        category: CATEGORY_LABEL[tx.category] || tx.category || '',
        description: tx.description || '',
        reference: tx.ref_no || '',
        amount: tx.amount || 0,
        flow: tx.type === 'cash_in' ? 'Cash In' : 'Cash Out',
      }));
      exportToCSV('coop_monitoring_transactions.csv', rows);
      toast.success('CSV exported successfully');
    } catch (err) {
      toast.error(err.message || 'Failed to export CSV');
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6">
      <PageHeader
        title="Account Monitoring"
        subtitle="Cooperative fund — cash inflow and outflow overview"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              icon={<Plus size={14} />}
              onClick={() => setFundModalOpen(true)}
            >
              Add Fund
            </Button>
            <Button
              variant="outline"
              icon={<RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />}
              onClick={() => fetchData(true)}
              disabled={refreshing}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="flex justify-center py-24"><Spinner /></div>
      ) : (
        <>
          {/* ── Stat Cards ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 mb-6">
            <StatCard
              icon={<DollarSign size={22} className="text-emerald-600" />}
              label="Current Fund Balance"
              value={formatCurrency(fund.balance)}
              sub="Cash In minus Cash Out"
              bg="bg-emerald-50"
              textColor={fund.balance >= 0 ? 'text-emerald-700' : 'text-red-600'}
            />
            <StatCard
              icon={<TrendingUp size={22} className="text-green-600" />}
              label="Total Cash In"
              value={formatCurrency(fund.cash_in)}
              sub="All paid invoices"
              bg="bg-green-50"
              textColor="text-green-700"
            />
            <StatCard
              icon={<TrendingDown size={22} className="text-red-500" />}
              label="Total Cash Out"
              value={formatCurrency(fund.cash_out)}
              sub="Approved vouchers"
              bg="bg-red-50"
              textColor="text-red-600"
            />
            <StatCard
              icon={<AlertTriangle size={22} className="text-amber-500" />}
              label="Total Penalty Income"
              value={formatCurrency(penaltyTotal)}
              sub={`${filteredPenalties.length} penalt${filteredPenalties.length !== 1 ? 'ies' : 'y'} recorded`}
              bg="bg-amber-50"
              textColor="text-amber-600"
              accent="border-amber-200"
            />
          </div>

          {/* ── Dashboard Charts ───────────────────────────────────────────── */}
          <DashboardCharts
            transactions={transactions}
            penaltyTotal={penaltyTotal}
            penaltyCount={filteredPenalties.length}
          />

          {/* ── Cash-In Breakdown ──────────────────────────────────────────── */}
          <CashInBreakdown transactions={transactions} />

          {/* ── Penalty Income Table ───────────────────────────────────────── */}
          <PenaltyIncomeTable
            penalties={filteredPenalties}
            loading={penaltiesLoading}
          />

          {/* ── Filters Row ────────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            {/* Type filter */}
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#07A04E] bg-white text-gray-700"
            >
              <option value="">All Types</option>
              <option value="cash_in">Cash In</option>
              <option value="cash_out">Cash Out</option>
            </select>

            {/* Category filter */}
            <select
              value={catFilter}
              onChange={e => setCatFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#07A04E] bg-white text-gray-700"
            >
              <option value="">All Categories</option>
              {categories.map(c => (
                <option key={c} value={c}>{CATEGORY_LABEL[c] || c}</option>
              ))}
            </select>

            {/* Date Range Picker */}
            <DateRangePicker
              from={dateRange.from}
              to={dateRange.to}
              onChange={setDateRange}
            />

            {/* Clear all */}
            {hasFilters && (
              <button
                onClick={() => { setTypeFilter(''); setCatFilter(''); setDateRange({ from: '', to: '' }); }}
                className="px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
              >
                Clear all filters
              </button>
            )}

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              <Printer size={14} />
              Print
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              <Download size={14} />
              Export CSV
            </button>

            <p className="ml-auto self-center text-xs text-gray-400">
              {filtered.length} of {transactions.length} transactions
            </p>
          </div>

          {/* ── Transactions Table ─────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
              <LayoutDashboard size={15} className="text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-700">All Fund Transactions</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-100">
                    {['Date', 'Category', 'Description', 'Reference', 'Amount', 'Flow'].map((h, i) => (
                      <th
                        key={h}
                        className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide ${
                          i === 4 ? 'text-right' : i === 5 ? 'text-center' : 'text-left'
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-16 text-center">
                        <div className="flex flex-col items-center gap-2 text-gray-400">
                          <DollarSign size={32} className="text-gray-200" />
                          <p className="text-sm">
                            {hasFilters
                              ? 'No transactions match your filters.'
                              : 'No fund transactions recorded yet.'}
                          </p>
                          {!hasFilters && (
                            <p className="text-xs text-gray-400 max-w-xs text-center">
                              Transactions appear here automatically when payments are posted
                              and invoices are marked paid.
                            </p>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filtered.map(tx => <TxRow key={tx.id} tx={tx} />)
                  )}
                </tbody>
              </table>
            </div>

            {filtered.length > 0 && (
              <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/50 flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  Showing <span className="font-medium text-gray-600">{filtered.length}</span> of{' '}
                  <span className="font-medium text-gray-600">{transactions.length}</span> transactions
                </p>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-green-700 font-medium">
                    In: {formatCurrency(
                      filtered.filter(tx => tx.type === 'cash_in').reduce((s, tx) => s + tx.amount, 0)
                    )}
                  </span>
                  <span className="text-red-600 font-medium">
                    Out: {formatCurrency(
                      filtered.filter(tx => tx.type === 'cash_out').reduce((s, tx) => s + tx.amount, 0)
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Add Fund Modal ──────────────────────────────────────────────────── */}
      <Modal
        open={fundModalOpen}
        onClose={() => setFundModalOpen(false)}
        title="Add Fund"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SI#</label>
            <input
              type="text"
              value={siNo}
              onChange={e => setSiNo(e.target.value)}
              placeholder="Enter SI#"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#07A04E]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
            <input
              type="number" step="0.01" min="0"
              value={fundAmount}
              onChange={e => setFundAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#07A04E]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={fundDate}
              onChange={e => setFundDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#07A04E]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mode of Payment</label>
            <select
              value={paymentMode}
              onChange={e => setPaymentMode(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#07A04E] bg-white"
            >
              {PAYMENT_MODE_OPTIONS.map(opt => (
                <option key={opt.value || 'empty'} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reference / Account / Check No.
            </label>
            <input
              type="text"
              value={paymentReference}
              onChange={e => setPaymentReference(e.target.value)}
              placeholder="Optional for Cash, required for GCash/Bank/Check"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#07A04E]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Notes</label>
            <textarea
              value={paymentNotes}
              onChange={e => setPaymentNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[#07A04E]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={fundDescription}
              onChange={e => setFundDescription(e.target.value)}
              placeholder="Manual fund deposit"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#07A04E]"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-5">
          <Button variant="outline" onClick={() => setFundModalOpen(false)}>
            Cancel
          </Button>
          <Button loading={savingFund} onClick={handleAddFund} icon={<Plus size={14} />}>
            Add Fund
          </Button>
        </div>
      </Modal>
    </div>
  );
}