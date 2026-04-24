import { useState, useRef, useCallback } from 'react';
import {
  Users,
  CreditCard,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownLeft,
  AlertTriangle,
  DollarSign,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRealtimeDashboard } from '../../hooks/useRealtimeDashboard';
import { formatCurrency, formatRelativeTime } from '../../utils/formatters';

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip
// ─────────────────────────────────────────────────────────────────────────────

function Tooltip({ text, x, y, visible }) {
  if (!visible || !text) return null;
  return (
    <div
      className="pointer-events-none fixed z-50 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs text-white shadow-lg whitespace-nowrap"
      style={{ left: x + 12, top: y - 8 }}
    >
      {text}
      <div className="absolute -left-1 top-2 h-2 w-2 rotate-45 bg-gray-900" />
    </div>
  );
}

function useTooltip() {
  const [tooltip, setTooltip] = useState({ visible: false, text: '', x: 0, y: 0 });

  const show = useCallback((e, text) => {
    setTooltip({ visible: true, text, x: e.clientX, y: e.clientY });
  }, []);
  const move = useCallback((e) => {
    setTooltip(t => t.visible ? { ...t, x: e.clientX, y: e.clientY } : t);
  }, []);
  const hide = useCallback(() => {
    setTooltip(t => ({ ...t, visible: false }));
  }, []);

  return { tooltip, show, move, hide };
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton Loader
// ─────────────────────────────────────────────────────────────────────────────

function Skeleton({ className = '' }) {
  return (
    <div className={`animate-pulse rounded-lg bg-gray-100 ${className}`} />
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-52" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-100 bg-white p-4 space-y-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-100 bg-white p-5 space-y-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BarChart — with hover tooltip + click handler per bar
// ─────────────────────────────────────────────────────────────────────────────

function BarChart({ data, valueKey, color = '#2563EB', height = 100, formatValue, onBarClick }) {
  const { tooltip, show, move, hide } = useTooltip();
  const [hoveredIdx, setHoveredIdx] = useState(null);

  if (!data || data.length === 0)
    return <div className="text-xs text-gray-400 py-4 text-center">No data available</div>;

  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  const fmt = formatValue || (v => String(v));

  return (
    <>
      <Tooltip {...tooltip} />
      <div className="flex items-end gap-1.5 w-full" style={{ height }}>
        {data.map((d, i) => {
          const pct = ((d[valueKey] || 0) / max) * 100;
          const isHovered = hoveredIdx === i;
          const barH = Math.max(pct, 4);

          return (
            <div
              key={i}
              className="flex flex-col items-center gap-1 flex-1 cursor-pointer group"
              onClick={() => onBarClick?.(d)}
              onMouseEnter={(e) => { setHoveredIdx(i); show(e, `${d.label}: ${fmt(d[valueKey] || 0)}`); }}
              onMouseMove={move}
              onMouseLeave={() => { setHoveredIdx(null); hide(); }}
            >
              {/* Value label on hover */}
              <span
                className="text-[9px] font-semibold tabular-nums transition-opacity duration-150"
                style={{ color, opacity: isHovered ? 1 : 0 }}
              >
                {fmt(d[valueKey] || 0)}
              </span>
              <div
                className="w-full rounded-t-md transition-all duration-300"
                style={{
                  height: `${barH}%`,
                  background: color,
                  opacity: hoveredIdx === null ? 0.82 : isHovered ? 1 : 0.35,
                  transform: isHovered ? 'scaleX(1.06)' : 'scaleX(1)',
                  transformOrigin: 'bottom',
                }}
              />
              <span
                className="text-[9px] leading-none transition-colors duration-150"
                style={{ color: isHovered ? '#111827' : '#9ca3af' }}
              >
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GroupedBarChart — with hover tooltip + click per group
// ─────────────────────────────────────────────────────────────────────────────

function GroupedBarChart({ data, height = 100, onBarClick }) {
  const { tooltip, show, move, hide } = useTooltip();
  const [hovered, setHovered] = useState(null); // { idx, key }

  if (!data || data.length === 0)
    return <div className="text-xs text-gray-400 py-4 text-center">No data available</div>;

  const max = Math.max(...data.flatMap(d => [d.cashIn || 0, d.cashOut || 0]), 1);
  const innerH = height - 20; // reserve 20px for label

  return (
    <>
      <Tooltip {...tooltip} />
      <div className="flex items-end gap-2 w-full" style={{ height }}>
        {data.map((d, i) => {
          const inH  = Math.max(((d.cashIn  || 0) / max) * innerH, 2);
          const outH = Math.max(((d.cashOut || 0) / max) * innerH, 2);
          const isGroupHovered = hovered?.idx === i;

          return (
            <div key={i} className="flex flex-col items-center gap-1 flex-1">
              <div className="flex items-end gap-0.5 w-full">
                {/* Cash In bar */}
                <div
                  className="flex-1 rounded-t-sm cursor-pointer transition-all duration-300"
                  style={{
                    height: `${inH}px`,
                    background: '#059669',
                    opacity: hovered === null ? 0.8 : (hovered?.idx === i && hovered?.key === 'in') ? 1 : 0.3,
                    transform: (hovered?.idx === i && hovered?.key === 'in') ? 'scaleX(1.1)' : 'scaleX(1)',
                    transformOrigin: 'bottom',
                  }}
                  onMouseEnter={(e) => { setHovered({ idx: i, key: 'in' }); show(e, `${d.label} Cash In: ${formatCurrency(d.cashIn || 0)}`); }}
                  onMouseMove={move}
                  onMouseLeave={() => { setHovered(null); hide(); }}
                  onClick={() => onBarClick?.({ ...d, focusKey: 'cashIn' })}
                />
                {/* Cash Out bar */}
                <div
                  className="flex-1 rounded-t-sm cursor-pointer transition-all duration-300"
                  style={{
                    height: `${outH}px`,
                    background: '#DC2626',
                    opacity: hovered === null ? 0.7 : (hovered?.idx === i && hovered?.key === 'out') ? 1 : 0.3,
                    transform: (hovered?.idx === i && hovered?.key === 'out') ? 'scaleX(1.1)' : 'scaleX(1)',
                    transformOrigin: 'bottom',
                  }}
                  onMouseEnter={(e) => { setHovered({ idx: i, key: 'out' }); show(e, `${d.label} Cash Out: ${formatCurrency(d.cashOut || 0)}`); }}
                  onMouseMove={move}
                  onMouseLeave={() => { setHovered(null); hide(); }}
                  onClick={() => onBarClick?.({ ...d, focusKey: 'cashOut' })}
                />
              </div>
              <span
                className="text-[9px] leading-none transition-colors duration-150"
                style={{ color: isGroupHovered ? '#111827' : '#9ca3af' }}
              >
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DonutChart — with hover tooltip + click per segment
// ─────────────────────────────────────────────────────────────────────────────

const DONUT_COLORS = ['#059669', '#2563EB', '#F59E0B', '#DC2626', '#8B5CF6', '#6B7280'];

function DonutChart({ data, size = 110, onSegmentClick }) {
  const { tooltip, show, move, hide } = useTooltip();
  const [hoveredIdx, setHoveredIdx] = useState(null);

  if (!data || data.length === 0)
    return <div className="text-xs text-gray-400 py-4 text-center">No data available</div>;

  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0)
    return <div className="text-xs text-gray-400 py-4 text-center">No data available</div>;

  const r = 38;
  const cx = 50;
  const cy = 50;
  const circumference = 2 * Math.PI * r;

  let cumulative = 0;
  const segments = data.map((d, i) => {
    const pct = d.value / total;
    const dash = pct * circumference;
    const offset = circumference - cumulative * circumference;
    cumulative += pct;
    return { ...d, dash, offset, color: DONUT_COLORS[i % DONUT_COLORS.length], pct };
  });

  const hovered = hoveredIdx !== null ? segments[hoveredIdx] : null;

  return (
    <>
      <Tooltip {...tooltip} />
      <div className="flex items-center gap-4">
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
          <svg
            width={size}
            height={size}
            viewBox="0 0 100 100"
            className="overflow-visible"
          >
            {/* Background ring */}
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth="14" />

            {/* Segments */}
            {segments.map((seg, i) => (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={hoveredIdx === i ? 17 : 14}
                strokeDasharray={`${seg.dash} ${circumference}`}
                strokeDashoffset={seg.offset}
                strokeLinecap="butt"
                transform="rotate(-90 50 50)"
                className="cursor-pointer transition-all duration-200"
                style={{
                  opacity: hoveredIdx === null ? 1 : hoveredIdx === i ? 1 : 0.35,
                  filter: hoveredIdx === i ? 'drop-shadow(0 0 3px rgba(0,0,0,0.2))' : 'none',
                }}
                onMouseEnter={(e) => {
                  setHoveredIdx(i);
                  show(e, `${seg.label}: ${seg.value} (${Math.round(seg.pct * 100)}%)`);
                }}
                onMouseMove={move}
                onMouseLeave={() => { setHoveredIdx(null); hide(); }}
                onClick={() => onSegmentClick?.(seg)}
              />
            ))}

            {/* Center label — shows hovered segment or total */}
            {hovered ? (
              <>
                <text x="50" y="46" textAnchor="middle" fontSize="9" fill="#6B7280" fontWeight="500">
                  {hovered.label.length > 8 ? hovered.label.slice(0, 8) + '…' : hovered.label}
                </text>
                <text x="50" y="58" textAnchor="middle" fontSize="13" fontWeight="700" fill={hovered.color}>
                  {hovered.value}
                </text>
              </>
            ) : (
              <>
                <text x="50" y="46" textAnchor="middle" fontSize="9" fill="#6B7280" fontWeight="500">
                  Total
                </text>
                <text x="50" y="58" textAnchor="middle" fontSize="13" fontWeight="700" fill="#111827">
                  {total}
                </text>
              </>
            )}
          </svg>
        </div>

        {/* Legend */}
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          {segments.map((seg, i) => (
            <button
              key={i}
              type="button"
              className="flex items-center gap-2 text-xs text-left rounded-md px-1.5 py-1 transition-colors cursor-pointer"
              style={{
                background: hoveredIdx === i ? `${seg.color}12` : 'transparent',
              }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => onSegmentClick?.(seg)}
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform duration-150"
                style={{
                  background: seg.color,
                  transform: hoveredIdx === i ? 'scale(1.3)' : 'scale(1)',
                }}
              />
              <span className="text-gray-600 capitalize truncate">{seg.label}</span>
              <span className="ml-auto font-semibold text-gray-800 tabular-nums">{seg.value}</span>
              <span className="text-gray-400 tabular-nums">{Math.round(seg.pct * 100)}%</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary Card
// ─────────────────────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, icon, accent = '#059669', accentBg = 'rgba(5,150,105,0.08)', onClick, trend }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="app-card app-card-hover w-full text-left p-4 flex flex-col gap-3 group"
    >
      <div className="flex items-start justify-between">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0 transition-transform duration-150 group-hover:scale-110"
          style={{ background: accentBg }}
        >
          <span style={{ color: accent }}>{icon}</span>
        </div>
        {trend !== undefined && (
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-md ${trend >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
            {trend >= 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <div>
        <p className="stat-label mb-1">{label}</p>
        <p className="tabular-nums text-2xl font-bold leading-none tracking-tight text-gray-900">
          {value}
        </p>
        {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
      </div>
      {/* Subtle bottom accent on hover */}
      <div
        className="h-0.5 w-0 group-hover:w-full transition-all duration-300 rounded-full"
        style={{ background: accent }}
      />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart Card Wrapper
// ─────────────────────────────────────────────────────────────────────────────

function ChartCard({ title, subtitle, children, action, footerNote }) {
  return (
    <div className="app-card p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
      {footerNote && (
        <p className="text-[10px] text-gray-400 border-t border-gray-50 pt-2">{footerNote}</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Recent Transactions
// ─────────────────────────────────────────────────────────────────────────────

const INFLOW_TYPES = ['deposit', 'loan_release', 'payment', 'interest'];

function RecentTransactionsCard({ stats, navigate }) {
  return (
    <ChartCard
      title="Recent Transactions"
      subtitle="Latest cooperative activity"
      action={
        <button
          onClick={() => navigate('/transactions')}
          className="text-xs font-medium text-emerald-700 hover:underline"
        >
          View all →
        </button>
      }
    >
      {!stats?.recentTransactions?.length ? (
        <div className="text-center text-sm text-gray-400 py-8">No transactions yet</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {stats.recentTransactions.slice(0, 6).map((tx) => {
            const isInflow = INFLOW_TYPES.includes(tx.type);
            return (
              <div
                key={tx.id}
                className="flex items-center justify-between py-3 rounded-lg px-1 hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => navigate('/transactions')}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0 transition-transform duration-150 hover:scale-110 ${
                      isInflow ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                    }`}
                  >
                    {isInflow ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 capitalize leading-tight">
                      {tx.type?.replace(/_/g, ' ')}
                    </p>
                    <p className="text-xs text-gray-400">{formatRelativeTime(tx.created_at)}</p>
                  </div>
                </div>
                <span className={`text-sm font-semibold tabular-nums ${isInflow ? 'text-emerald-600' : 'text-red-500'}`}>
                  {isInflow ? '+' : '-'}{formatCurrency(tx.amount)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </ChartCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Drill-down Drawer — shown when a chart element is clicked
// ─────────────────────────────────────────────────────────────────────────────

function DrillDownDrawer({ item, onClose, navigate }) {
  if (!item) return null;

  const rows = item.rows || [];
  const isMonthly = 'cashIn' in item || 'count' in item;

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-t-2xl sm:rounded-2xl border border-gray-200 shadow-2xl w-full max-w-md mx-4 mb-0 sm:mb-4 p-5 z-50 max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4 sm:hidden" />

        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 capitalize">{item.label}</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {item.value !== undefined
                ? `${item.value} loan${item.value !== 1 ? 's' : ''}`
                : item.cashIn !== undefined
                ? `In: ${formatCurrency(item.cashIn)} · Out: ${formatCurrency(item.cashOut)}`
                : `${item.count} member${item.count !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-lg leading-none px-2"
          >
            ×
          </button>
        </div>

        {/* Action buttons based on item type */}
        <div className="flex gap-2 mb-4">
          {item.value !== undefined && (
            <button
              onClick={() => { navigate(`/loans?status=${item.label}`); onClose(); }}
              className="flex-1 text-xs font-medium py-2 px-3 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
            >
              View {item.label} loans →
            </button>
          )}
          {(item.cashIn !== undefined || item.cashOut !== undefined) && (
            <button
              onClick={() => { navigate('/transactions'); onClose(); }}
              className="flex-1 text-xs font-medium py-2 px-3 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
            >
              View transactions →
            </button>
          )}
          {item.count !== undefined && (
            <button
              onClick={() => { navigate('/members'); onClose(); }}
              className="flex-1 text-xs font-medium py-2 px-3 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
            >
              View members →
            </button>
          )}
        </div>

        {/* Breakdown stats */}
        {item.cashIn !== undefined && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
              <p className="text-[10px] text-emerald-600 font-medium uppercase tracking-wide mb-1">Cash In</p>
              <p className="text-base font-bold text-emerald-700 tabular-nums">{formatCurrency(item.cashIn || 0)}</p>
            </div>
            <div className="rounded-lg bg-red-50 border border-red-100 p-3">
              <p className="text-[10px] text-red-600 font-medium uppercase tracking-wide mb-1">Cash Out</p>
              <p className="text-base font-bold text-red-600 tabular-nums">{formatCurrency(item.cashOut || 0)}</p>
            </div>
            <div className="col-span-2 rounded-lg bg-gray-50 border border-gray-100 p-3">
              <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide mb-1">Net Flow</p>
              <p className={`text-base font-bold tabular-nums ${(item.cashIn - item.cashOut) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {(item.cashIn - item.cashOut) >= 0 ? '+' : ''}{formatCurrency((item.cashIn || 0) - (item.cashOut || 0))}
              </p>
            </div>
          </div>
        )}
        {item.count !== undefined && (
          <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
            <p className="text-[10px] text-blue-600 font-medium uppercase tracking-wide mb-1">New Members</p>
            <p className="text-base font-bold text-blue-700 tabular-nums">{item.count}</p>
          </div>
        )}
        {item.value !== undefined && (
          <div className="rounded-lg border border-gray-100 p-3 bg-gray-50">
            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide mb-1">Count</p>
            <p className="text-base font-bold text-gray-800 tabular-nums">{item.value} loans</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DASHBOARD PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate();
  const { stats, loading, refetch } = useRealtimeDashboard();
  const [drillItem, setDrillItem] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function handleRefetch() {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 600);
  }

  if (loading) return <DashboardSkeleton />;

  const netCashFlow = (stats?.totalCashIn ?? 0) - (stats?.totalCashOut ?? 0);

  return (
    <>
      {/* Drill-down drawer */}
      <DrillDownDrawer
        item={drillItem}
        onClose={() => setDrillItem(null)}
        navigate={navigate}
      />

      <div className="mx-auto max-w-7xl px-6 py-6 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="section-title">Dashboard</h1>
            <p className="section-subtitle">WELLSERVE Cooperative — live overview</p>
          </div>
          <button
            onClick={handleRefetch}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors px-3 py-2 rounded-xl hover:bg-gray-100"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <SummaryCard
            label="Total Members"
            value={stats?.totalMembers ?? 0}
            sub={`${stats?.activeMembers ?? 0} active`}
            icon={<Users size={18} />}
            accent="#2563EB"
            accentBg="rgba(37,99,235,0.08)"
            onClick={() => navigate('/members')}
          />
          <SummaryCard
            label="Active Loans"
            value={stats?.activeLoans ?? 0}
            sub={formatCurrency(stats?.totalLoanOutstanding ?? 0) + ' outstanding'}
            icon={<CreditCard size={18} />}
            accent="#059669"
            accentBg="rgba(5,150,105,0.08)"
            onClick={() => navigate('/loans')}
          />
          <SummaryCard
            label="Cash In"
            value={formatCurrency(stats?.totalCashIn ?? 0)}
            sub="Total inflows"
            icon={<TrendingUp size={18} />}
            accent="#059669"
            accentBg="rgba(5,150,105,0.08)"
            onClick={() => navigate('/transactions')}
          />
          <SummaryCard
            label="Cash Out"
            value={formatCurrency(stats?.totalCashOut ?? 0)}
            sub="Total outflows"
            icon={<TrendingDown size={18} />}
            accent="#DC2626"
            accentBg="rgba(220,38,38,0.07)"
            onClick={() => navigate('/transactions')}
          />
          <SummaryCard
            label="Overdue Payments"
            value={stats?.overduePayments ?? 0}
            sub="Past due loans"
            icon={<AlertTriangle size={18} />}
            accent={stats?.overduePayments > 0 ? '#D97706' : '#6B7280'}
            accentBg={stats?.overduePayments > 0 ? 'rgba(217,119,6,0.08)' : 'rgba(107,114,128,0.08)'}
            onClick={() => navigate('/loans')}
          />
        </div>

        {/* ── Income Strip ── */}
        <div className="app-card p-4 flex items-center justify-between border-emerald-100 bg-gradient-to-r from-emerald-50 to-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
              <DollarSign size={18} className="text-emerald-700" />
            </div>
            <div>
              <p className="stat-label">Total Income</p>
              <p className="text-xl font-bold text-emerald-700 tabular-nums">{formatCurrency(stats?.totalIncome ?? 0)}</p>
            </div>
          </div>
          <div className="text-right hidden sm:block">
            <p className="stat-label">Net Cash Flow</p>
            <p className={`text-lg font-bold tabular-nums ${netCashFlow >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {netCashFlow >= 0 ? '+' : ''}{formatCurrency(netCashFlow)}
            </p>
          </div>
        </div>

        {/* ── Charts Row ── */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

          {/* Loan Status Donut */}
          <ChartCard
            title="Loan Status"
            subtitle="Click a segment to drill down"
            footerNote="Click any segment or legend item to filter loans by status."
            action={
              <button onClick={() => navigate('/loans')} className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
                All loans →
              </button>
            }
          >
            <DonutChart
              data={stats?.loanStatusChart ?? []}
              size={110}
              onSegmentClick={(seg) => setDrillItem(seg)}
            />
          </ChartCard>

          {/* Cash Flow Grouped Bar */}
          <ChartCard
            title="Cash Flow"
            subtitle="Click a bar to see monthly breakdown"
            footerNote="Click any bar to view that month's transaction details."
            action={
              <div className="flex items-center gap-3 text-[10px] text-gray-400">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" />In
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-sm bg-red-500" />Out
                </span>
              </div>
            }
          >
            <GroupedBarChart
              data={stats?.cashFlowChart ?? []}
              height={100}
              onBarClick={(item) => setDrillItem(item)}
            />
          </ChartCard>

          {/* Member Growth Bar */}
          <ChartCard
            title="Member Growth"
            subtitle="Click a bar to drill down"
            footerNote="Click any bar to see members who joined that month."
            action={
              <button onClick={() => navigate('/members')} className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
                All members →
              </button>
            }
          >
            <BarChart
              data={stats?.memberGrowthChart ?? []}
              valueKey="count"
              color="#2563EB"
              height={100}
              formatValue={v => `${v} member${v !== 1 ? 's' : ''}`}
              onBarClick={(item) => setDrillItem(item)}
            />
          </ChartCard>
        </div>

        {/* ── Bottom: CBU / Savings + Recent Transactions ── */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="flex flex-col gap-3">
            <div
              className="app-card app-card-hover p-5 cursor-pointer group"
              onClick={() => navigate('/cbu')}
            >
              <p className="stat-label mb-1">Total CBU Balance</p>
              <p className="tabular-nums text-2xl font-bold text-gray-900 group-hover:text-emerald-700 transition-colors">
                {formatCurrency(stats?.totalCBU ?? 0)}
              </p>
              <p className="mt-1 text-xs text-gray-400">Capital Build-Up</p>
            </div>
            <div
              className="app-card app-card-hover p-5 cursor-pointer group"
              onClick={() => navigate('/savings')}
            >
              <p className="stat-label mb-1">Total Savings</p>
              <p className="tabular-nums text-2xl font-bold text-gray-900 group-hover:text-emerald-700 transition-colors">
                {formatCurrency(stats?.totalSavings ?? 0)}
              </p>
              <p className="mt-1 text-xs text-gray-400">Member savings accounts</p>
            </div>
            <div
              className="app-card app-card-hover p-5 cursor-pointer group"
              onClick={() => navigate('/time-deposit')}
            >
              <div className="flex items-center gap-2 mb-1">
                <Clock size={13} className="text-violet-400" />
                <p className="stat-label">Time Deposits</p>
              </div>
              <p className="tabular-nums text-2xl font-bold text-gray-900 group-hover:text-violet-700 transition-colors">
                {formatCurrency(stats?.totalTimeDeposit ?? 0)}
              </p>
              <p className="mt-1 text-xs text-gray-400">
                {stats?.timeDepositCount ?? 0} active deposit{(stats?.timeDepositCount ?? 0) !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <div className="xl:col-span-2">
            <RecentTransactionsCard stats={stats} navigate={navigate} />
          </div>
        </div>

      </div>
    </>
  );
}