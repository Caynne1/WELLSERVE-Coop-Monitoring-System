import {
  Users, CreditCard, PiggyBank, Wallet,
  TrendingUp, ArrowUpRight, ArrowDownLeft, Layers,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRealtimeDashboard } from '../../hooks/useRealtimeDashboard';
import Spinner from '../../components/ui/Spinner';
import { formatCurrency, formatRelativeTime } from '../../utils/formatters';

// ── All logic unchanged ────────────────────────────────────────

const INFLOW_TYPES = ['deposit', 'loan_release'];

// ── Brand stat card ────────────────────────────────────────────
function StatCard({ label, value, icon, iconBg, iconColor, valueColor, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#ffffff',
        borderRadius: '16px',
        border: '1px solid #e8f5eb',
        padding: '20px',
        boxShadow: '0 1px 4px rgba(39,60,44,0.06)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.2s, transform 0.15s',
      }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.boxShadow = '0 4px 16px rgba(39,60,44,0.12)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
      onMouseLeave={e => { if (onClick) { e.currentTarget.style.boxShadow = '0 1px 4px rgba(39,60,44,0.06)'; e.currentTarget.style.transform = 'translateY(0)'; } }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{
          width: '44px', height: '44px', borderRadius: '12px',
          background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <span style={{ color: iconColor, display: 'flex' }}>{icon}</span>
        </div>
        {onClick && (
          <div style={{
            width: '26px', height: '26px', borderRadius: '8px',
            background: '#f3f4f4', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ArrowUpRight size={13} style={{ color: '#9ca3af' }} />
          </div>
        )}
      </div>
      <p style={{ fontSize: '10px', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>
        {label}
      </p>
      <p style={{ fontSize: '22px', fontWeight: '800', color: valueColor, lineHeight: 1 }}>
        {value}
      </p>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { stats, loading } = useRealtimeDashboard();

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', paddingTop: '96px' }}>
      <Spinner />
    </div>
  );

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>

      {/* ── Page heading ── */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#273C2C', margin: 0 }}>Dashboard</h1>
        <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '3px' }}>WELLSERVE Cooperative overview</p>
      </div>

      {/* ── 4 stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>

        <StatCard
          label="Total Members"
          value={stats?.totalMembers ?? 0}
          icon={<Users size={22} />}
          iconBg="#AEECEF40"
          iconColor="#000066"
          valueColor="#000066"
          onClick={() => navigate('/members')}
        />
        <StatCard
          label="Total CBU Balance"
          value={formatCurrency(stats?.totalCBU ?? 0)}
          icon={<PiggyBank size={22} />}
          iconBg="#D6FADC"
          iconColor="#07A04E"
          valueColor="#07A04E"
          onClick={() => navigate('/cbu')}
        />
        <StatCard
          label="Total Savings"
          value={formatCurrency(stats?.totalSavings ?? 0)}
          icon={<Wallet size={22} />}
          iconBg="#D6FADC"
          iconColor="#7EB751"
          valueColor="#7EB751"
          onClick={() => navigate('/savings')}
        />
        <StatCard
          label="Active Loans"
          value={stats?.activeLoans ?? 0}
          icon={<CreditCard size={22} />}
          iconBg="#fff7ed"
          iconColor="#ea580c"
          valueColor="#ea580c"
          onClick={() => navigate('/loans')}
        />
      </div>

      {/* ── Bottom row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

        {/* Loan portfolio — brand dark green card */}
        <div
          onClick={() => navigate('/loans')}
          style={{
            background: '#273C2C',
            borderRadius: '18px',
            padding: '24px',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(39,60,44,0.22)',
            transition: 'box-shadow 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 28px rgba(39,60,44,0.32)'; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(39,60,44,0.22)'; }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div style={{
              width: '34px', height: '34px', borderRadius: '10px',
              background: 'rgba(7,160,78,0.20)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Layers size={16} style={{ color: '#7EB751' }} />
            </div>
            <p style={{ fontSize: '13px', fontWeight: '600', color: 'rgba(255,255,255,0.70)', margin: 0 }}>
              Loan Portfolio
            </p>
          </div>

          <p style={{ fontSize: '30px', fontWeight: '800', color: '#ffffff', lineHeight: 1, margin: 0 }}>
            {formatCurrency(stats?.totalLoanOutstanding ?? 0)}
          </p>
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', marginTop: '6px' }}>
            Total outstanding balance
          </p>

          <div style={{
            marginTop: '18px', paddingTop: '16px',
            borderTop: '1px solid rgba(255,255,255,0.12)',
            display: 'flex', alignItems: 'center', gap: '6px',
            fontSize: '11px', color: '#7EB751',
          }}>
            <TrendingUp size={13} />
            <span>{stats?.activeLoans ?? 0} active loans</span>
          </div>
        </div>

        {/* Recent transactions */}
        <div style={{
          background: '#ffffff',
          borderRadius: '18px',
          border: '1px solid #e8f5eb',
          padding: '24px',
          boxShadow: '0 1px 4px rgba(39,60,44,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#273C2C', margin: 0 }}>
              Recent Transactions
            </h3>
            <button
              onClick={() => navigate('/transactions')}
              style={{
                fontSize: '11px', color: '#07A04E', fontWeight: '600',
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '3px', padding: 0,
              }}
            >
              View all <ArrowUpRight size={12} />
            </button>
          </div>

          {!stats?.recentTransactions?.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 0', textAlign: 'center' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#f3f4f4', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                <ArrowDownLeft size={18} style={{ color: '#d1d5db' }} />
              </div>
              <p style={{ fontSize: '13px', color: '#9ca3af' }}>No recent transactions.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {stats.recentTransactions.slice(0, 5).map(tx => {
                const isInflow = INFLOW_TYPES.includes(tx.type);
                return (
                  <div key={tx.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '32px', height: '32px', borderRadius: '50%',
                        background: isInflow ? '#D6FADC' : '#fef2f2',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        {isInflow
                          ? <ArrowDownLeft size={14} style={{ color: '#07A04E' }} />
                          : <ArrowUpRight  size={14} style={{ color: '#dc2626' }} />}
                      </div>
                      <div>
                        <p style={{ fontSize: '13px', fontWeight: '600', color: '#273C2C', textTransform: 'capitalize', margin: 0 }}>
                          {tx.type?.replace(/_/g, ' ') || 'Transaction'}
                        </p>
                        <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '1px' }}>
                          {formatRelativeTime(tx.created_at)}
                        </p>
                      </div>
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: isInflow ? '#07A04E' : '#dc2626' }}>
                      {formatCurrency(tx.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}