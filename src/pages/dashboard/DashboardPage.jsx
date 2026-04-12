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
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRealtimeDashboard } from '../../hooks/useRealtimeDashboard';
import Spinner from '../../components/ui/Spinner';
import { formatCurrency, formatRelativeTime } from '../../utils/formatters';

// ─────────────────────────────────────────────
// Mini Inline SVG Charts (no external deps)
// ─────────────────────────────────────────────

function BarChart({ data, valueKey, colorClass = '#059669', height = 80 }) {
  if (!data || data.length === 0) return <div className="text-xs text-gray-400 py-4 text-center">No data</div>;
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  return (
    <div className="flex items-end gap-1.5 w-full" style={{ height }}>
      {data.map((d, i) => {
        const pct = ((d[valueKey] || 0) / max) * 100;
        return (
          <div key={i} className="flex flex-col items-center gap-1 flex-1">
            <div
              className="w-full rounded-t-md transition-all duration-500"
              style={{
                height: `${Math.max(pct, 4)}%`,
                background: colorClass,
                opacity: 0.85,
              }}
              title={`${d.label}: ${d[valueKey]}`}
            />
            <span className="text-[9px] text-gray-400 leading-none">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function GroupedBarChart({ data, height = 80 }) {
  if (!data || data.length === 0) return <div className="text-xs text-gray-400 py-4 text-center">No data</div>;
  const max = Math.max(...data.flatMap(d => [d.cashIn || 0, d.cashOut || 0]), 1);
  return (
    <div className="flex items-end gap-2 w-full" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center gap-1 flex-1">
          <div className="flex items-end gap-0.5 w-full">
            <div
              className="flex-1 rounded-t-sm transition-all duration-500"
              style={{ height: `${Math.max(((d.cashIn || 0) / max) * (height - 20), 2)}px`, background: '#059669', opacity: 0.8 }}
              title={`In: ${formatCurrency(d.cashIn)}`}
            />
            <div
              className="flex-1 rounded-t-sm transition-all duration-500"
              style={{ height: `${Math.max(((d.cashOut || 0) / max) * (height - 20), 2)}px`, background: '#DC2626', opacity: 0.7 }}
              title={`Out: ${formatCurrency(d.cashOut)}`}
            />
          </div>
          <span className="text-[9px] text-gray-400 leading-none">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ data, size = 100 }) {
  if (!data || data.length === 0) return <div className="text-xs text-gray-400 py-4 text-center">No data</div>;

  const COLORS = ['#059669', '#3B82F6', '#F59E0B', '#DC2626', '#8B5CF6', '#6B7280'];
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div className="text-xs text-gray-400 py-4 text-center">No data</div>;

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
    return { ...d, dash, offset, color: COLORS[i % COLORS.length] };
  });

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth="14" />
        {segments.map((seg, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth="14"
            strokeDasharray={`${seg.dash} ${circumference}`}
            strokeDashoffset={seg.offset}
            strokeLinecap="butt"
            transform="rotate(-90 50 50)"
          />
        ))}
        <text x="50" y="50" textAnchor="middle" dy="0.35em" fontSize="13" fontWeight="700" fill="#111827">
          {total}
        </text>
      </svg>
      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: seg.color }} />
            <span className="text-gray-600 capitalize truncate">{seg.label}</span>
            <span className="ml-auto font-semibold text-gray-800">{seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Summary Widget Card
// ─────────────────────────────────────────────
function SummaryCard({ label, value, sub, icon, accent = '#059669', accentBg = 'rgba(5,150,105,0.08)', onClick, trend }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="app-card app-card-hover w-full text-left p-4 flex flex-col gap-3"
    >
      <div className="flex items-start justify-between">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0"
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
    </button>
  );
}

// ─────────────────────────────────────────────
// Chart Card Wrapper
// ─────────────────────────────────────────────
function ChartCard({ title, subtitle, children, action }) {
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
    </div>
  );
}

// ─────────────────────────────────────────────
// Recent Transactions
// ─────────────────────────────────────────────
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
              <div key={tx.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0 ${
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

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate();
  const { stats, loading, refetch } = useRealtimeDashboard();

  if (loading) {
    return (
      <div className="flex items-center justify-center pt-24">
        <Spinner />
      </div>
    );
  }

  const netCashFlow = (stats?.totalCashIn ?? 0) - (stats?.totalCashOut ?? 0);

  return (
    <div className="mx-auto max-w-7xl px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">Dashboard</h1>
          <p className="section-subtitle">WELLSERVE Cooperative — live overview</p>
        </div>
        <button
          onClick={refetch}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors px-3 py-2 rounded-xl hover:bg-gray-100"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Summary Widgets — 5 cards */}
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

      {/* Total Income highlight strip */}
      <div className="app-card p-4 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-white border-emerald-100">
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

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Loan Status Donut */}
        <ChartCard
          title="Loan Status"
          subtitle="Distribution by status"
          action={
            <button onClick={() => navigate('/loans')} className="text-xs text-gray-400 hover:text-gray-700">
              View →
            </button>
          }
        >
          <DonutChart data={stats?.loanStatusChart ?? []} size={100} />
        </ChartCard>

        {/* Cash Flow Bar */}
        <ChartCard
          title="Cash Flow"
          subtitle="Last 6 months"
          action={
            <div className="flex items-center gap-3 text-[10px] text-gray-400">
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" />In</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-red-500" />Out</span>
            </div>
          }
        >
          <GroupedBarChart data={stats?.cashFlowChart ?? []} height={100} />
        </ChartCard>

        {/* Member Growth */}
        <ChartCard
          title="Member Growth"
          subtitle="New members per month"
          action={
            <button onClick={() => navigate('/members')} className="text-xs text-gray-400 hover:text-gray-700">
              View →
            </button>
          }
        >
          <BarChart
            data={stats?.memberGrowthChart ?? []}
            valueKey="count"
            colorClass="#2563EB"
            height={100}
          />
        </ChartCard>
      </div>

      {/* Bottom: Savings / CBU + Recent Transactions */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Savings & CBU */}
        <div className="flex flex-col gap-3">
          <div
            className="app-card app-card-hover p-5 cursor-pointer"
            onClick={() => navigate('/cbu')}
          >
            <p className="stat-label mb-1">Total CBU Balance</p>
            <p className="tabular-nums text-2xl font-bold text-gray-900">{formatCurrency(stats?.totalCBU ?? 0)}</p>
            <p className="mt-1 text-xs text-gray-400">Capital Build-Up</p>
          </div>
          <div
            className="app-card app-card-hover p-5 cursor-pointer"
            onClick={() => navigate('/savings')}
          >
            <p className="stat-label mb-1">Total Savings</p>
            <p className="tabular-nums text-2xl font-bold text-gray-900">{formatCurrency(stats?.totalSavings ?? 0)}</p>
            <p className="mt-1 text-xs text-gray-400">Member savings accounts</p>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="xl:col-span-2">
          <RecentTransactionsCard stats={stats} navigate={navigate} />
        </div>
      </div>
    </div>
  );
}