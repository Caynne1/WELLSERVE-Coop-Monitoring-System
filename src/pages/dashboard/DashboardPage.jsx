import {
  Users,
  CreditCard,
  PiggyBank,
  Wallet,
  TrendingUp,
  ArrowUpRight,
  ArrowDownLeft,
  Layers,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRealtimeDashboard } from '../../hooks/useRealtimeDashboard';
import Spinner from '../../components/ui/Spinner';
import { formatCurrency, formatRelativeTime } from '../../utils/formatters';

const INFLOW_TYPES = ['deposit', 'loan_release'];

// ─────────────────────────────────────────────
// Stat Card
// ─────────────────────────────────────────────
function StatCard({ label, value, icon, iconBg, iconColor, valueColor, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="app-card app-card-hover w-full text-left p-5"
    >
      <div className="mb-4 flex items-start justify-between">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-xl"
          style={{ background: iconBg }}
        >
          <span style={{ color: iconColor }}>{icon}</span>
        </div>

        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
          <ArrowUpRight size={13} />
        </div>
      </div>

      <p className="stat-label mb-1">{label}</p>

      <p
        className="tabular-nums text-[26px] font-bold leading-none tracking-tight"
        style={{ color: valueColor }}
      >
        {value}
      </p>
    </button>
  );
}

// ─────────────────────────────────────────────
// Loan Portfolio (same style as stat cards)
// ─────────────────────────────────────────────
function PortfolioCard({ stats, navigate }) {
  return (
    <button
      type="button"
      onClick={() => navigate('/loans')}
      className="app-card app-card-hover w-full text-left p-5"
    >
      <div className="mb-4 flex items-start justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100">
          <Layers size={20} className="text-emerald-600" />
        </div>

        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
          <ArrowUpRight size={13} />
        </div>
      </div>

      <p className="stat-label mb-1">Loan Portfolio</p>

      <p className="tabular-nums text-[26px] font-bold leading-none tracking-tight text-gray-900">
        {formatCurrency(stats?.totalLoanOutstanding ?? 0)}
      </p>

      <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
        <TrendingUp size={13} />
        <span>{stats?.activeLoans ?? 0} active loans</span>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────
// Recent Transactions
// ─────────────────────────────────────────────
function RecentTransactionsCard({ stats, navigate }) {
  return (
    <div className="app-card p-5">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">
            Recent Transactions
          </h3>
          <p className="text-sm text-gray-500">
            Latest cooperative activity
          </p>
        </div>

        <button
          onClick={() => navigate('/transactions')}
          className="text-sm font-medium text-emerald-700 hover:underline"
        >
          View all
        </button>
      </div>

      {!stats?.recentTransactions?.length ? (
        <div className="text-center text-sm text-gray-400 py-10">
          No transactions yet
        </div>
      ) : (
        <div className="space-y-4">
          {stats.recentTransactions.slice(0, 5).map((tx) => {
            const isInflow = INFLOW_TYPES.includes(tx.type);

            return (
              <div key={tx.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full ${
                      isInflow
                        ? 'bg-emerald-50 text-emerald-600'
                        : 'bg-red-50 text-red-500'
                    }`}
                  >
                    {isInflow ? (
                      <ArrowDownLeft size={15} />
                    ) : (
                      <ArrowUpRight size={15} />
                    )}
                  </div>

                  <div>
                    <p className="text-sm font-medium text-gray-900 capitalize">
                      {tx.type?.replace(/_/g, ' ')}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatRelativeTime(tx.created_at)}
                    </p>
                  </div>
                </div>

                <span
                  className={`text-sm font-semibold ${
                    isInflow ? 'text-emerald-600' : 'text-red-500'
                  }`}
                >
                  {formatCurrency(tx.amount)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate();
  const { stats, loading } = useRealtimeDashboard();

  if (loading) {
    return (
      <div className="flex items-center justify-center pt-24">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="section-title">Dashboard</h1>
        <p className="section-subtitle">
          WELLSERVE Cooperative overview
        </p>
      </div>

      {/* Top Stats */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Members"
          value={stats?.totalMembers ?? 0}
          icon={<Users size={20} />}
          iconBg="rgba(59,130,246,0.10)"
          iconColor="#2563EB"
          valueColor="#111827"
          onClick={() => navigate('/members')}
        />

        <StatCard
          label="Total CBU Balance"
          value={formatCurrency(stats?.totalCBU ?? 0)}
          icon={<PiggyBank size={20} />}
          iconBg="rgba(16,185,129,0.12)"
          iconColor="#059669"
          valueColor="#059669"
          onClick={() => navigate('/cbu')}
        />

        <StatCard
          label="Total Savings"
          value={formatCurrency(stats?.totalSavings ?? 0)}
          icon={<Wallet size={20} />}
          iconBg="rgba(132,204,22,0.14)"
          iconColor="#65A30D"
          valueColor="#65A30D"
          onClick={() => navigate('/savings')}
        />

        <StatCard
          label="Active Loans"
          value={stats?.activeLoans ?? 0}
          icon={<CreditCard size={20} />}
          iconBg="rgba(249,115,22,0.12)"
          iconColor="#EA580C"
          valueColor="#EA580C"
          onClick={() => navigate('/loans')}
        />
      </div>

      {/* Bottom Section (FIXED GRID) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PortfolioCard stats={stats} navigate={navigate} />

        <div className="xl:col-span-3">
          <RecentTransactionsCard stats={stats} navigate={navigate} />
        </div>
      </div>
    </div>
  );
}