import { useState, useEffect } from 'react';
import {
  BarChart2, Users, CreditCard, PiggyBank, Wallet,
  TrendingUp, TrendingDown, Download, RefreshCw,
} from 'lucide-react';
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, iconBg, iconColor }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        <span style={{ color: iconColor }}>{icon}</span>
      </div>
      <div>
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
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

// ── Main ─────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [memberStats, setMemberStats]   = useState(null);
  const [loanStats, setLoanStats]       = useState(null);
  const [accountStats, setAccountStats] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading]           = useState(true);

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
      setTransactions(txs || []);
    } catch {
      toast.error('Failed to load report data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAll(); }, []);

  // ── Derived transaction breakdown ──────────────────────────────────────────
  const deposits     = transactions.filter(t => t.type === 'deposit');
  const withdrawals  = transactions.filter(t => t.type === 'withdrawal');
  const loanPayments = transactions.filter(t => t.type === 'loan_payment');
  const loanReleases = transactions.filter(t => t.type === 'loan_release');

  const totalDeposited  = deposits.reduce((s, t) => s + (t.amount || 0), 0);
  const totalWithdrawn  = withdrawals.reduce((s, t) => s + (t.amount || 0), 0);
  const totalRepaid     = loanPayments.reduce((s, t) => s + (t.amount || 0), 0);
  const totalReleased   = loanReleases.reduce((s, t) => s + (t.amount || 0), 0);

  // ── Category breakdown (CBU vs Savings) ───────────────────────────────────
  const cbuDeposits     = deposits.filter(t => t.category === 'cbu').reduce((s, t) => s + (t.amount || 0), 0);
  const savingsDeposits = deposits.filter(t => t.category === 'savings').reduce((s, t) => s + (t.amount || 0), 0);

  // ── Export summary ─────────────────────────────────────────────────────────
  function handleExportSummary() {
    const rows = [
      { metric: 'Total Members',         value: memberStats?.total ?? 0 },
      { metric: 'Active Members',        value: memberStats?.active ?? 0 },
      { metric: 'Associate Members',     value: memberStats?.associate ?? 0 },
      { metric: 'Regular Members',       value: memberStats?.regular ?? 0 },
      { metric: 'Total Loans',           value: loanStats?.total ?? 0 },
      { metric: 'Active Loans',          value: loanStats?.active ?? 0 },
      { metric: 'Total Released (PHP)',   value: loanStats?.totalReleased ?? 0 },
      { metric: 'Outstanding Balance (PHP)', value: loanStats?.totalOutstanding ?? 0 },
      { metric: 'Total CBU Balance (PHP)',   value: accountStats?.totalCBU ?? 0 },
      { metric: 'Total Savings Balance (PHP)', value: accountStats?.totalSavings ?? 0 },
      { metric: 'Total Deposits (PHP)',   value: totalDeposited },
      { metric: 'Total Withdrawals (PHP)',value: totalWithdrawn },
      { metric: 'Total Loan Repayments (PHP)', value: totalRepaid },
      { metric: 'CBU Deposits (PHP)',     value: cbuDeposits },
      { metric: 'Savings Deposits (PHP)', value: savingsDeposits },
      { metric: 'Report Generated',       value: formatDate(new Date().toISOString()) },
    ];
    exportToCSV(rows, 'wellserve_summary_report');
    toast.success('Summary report exported.');
  }

  function handleExportTransactions() {
    if (transactions.length === 0) return toast.error('No transactions to export.');
    const rows = transactions.map(tx => ({
      type: tx.type || '',
      category: tx.category || '',
      member_name: `${tx.members?.first_name || ''} ${tx.members?.last_name || ''}`.trim(),
      member_no: tx.members?.member_no || '',
      amount: tx.amount ?? 0,
      reference: tx.reference || '',
      date: tx.created_at ? formatDate(tx.created_at) : '',
    }));
    exportToCSV(rows, 'all_transactions');
    toast.success(`Exported ${rows.length} transactions.`);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Reports"
        subtitle="Cooperative financial and membership summary"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              icon={<RefreshCw size={14} />}
              onClick={fetchAll}
              disabled={loading}
            >
              Refresh
            </Button>
            <Button
              variant="outline"
              icon={<Download size={14} />}
              onClick={handleExportSummary}
              disabled={loading}
            >
              Export Summary
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <>
          {/* ── Membership ───────────────────────────────────────────────── */}
          <SectionTitle>Membership</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              icon={<Users size={20} />}
              label="Total Members"
              value={memberStats?.total ?? 0}
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
              label="Associate"
              value={memberStats?.associate ?? 0}
              iconBg="bg-amber-50"
              iconColor="#D97706"
            />
            <StatCard
              icon={<Users size={20} />}
              label="Regular"
              value={memberStats?.regular ?? 0}
              iconBg="bg-violet-50"
              iconColor="#7C3AED"
            />
          </div>

          {/* ── Loans ────────────────────────────────────────────────────── */}
          <SectionTitle>Loans</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              icon={<CreditCard size={20} />}
              label="Total Loans"
              value={loanStats?.total ?? 0}
              iconBg="bg-orange-50"
              iconColor="#EA580C"
            />
            <StatCard
              icon={<CreditCard size={20} />}
              label="Active Loans"
              value={loanStats?.active ?? 0}
              iconBg="bg-orange-50"
              iconColor="#EA580C"
            />
            <StatCard
              icon={<TrendingUp size={20} />}
              label="Total Released"
              value={formatCurrency(loanStats?.totalReleased ?? 0)}
              iconBg="bg-green-50"
              iconColor="#16A34A"
            />
            <StatCard
              icon={<TrendingDown size={20} />}
              label="Outstanding"
              value={formatCurrency(loanStats?.totalOutstanding ?? 0)}
              sub="Active loans only"
              iconBg="bg-red-50"
              iconColor="#DC2626"
            />
          </div>

          {/* ── Accounts ─────────────────────────────────────────────────── */}
          <SectionTitle>CBU & Savings</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              icon={<PiggyBank size={20} />}
              label="Total CBU Balance"
              value={formatCurrency(accountStats?.totalCBU ?? 0)}
              sub={`${accountStats?.cbuCount ?? 0} accounts`}
              iconBg="bg-emerald-50"
              iconColor="#059669"
            />
            <StatCard
              icon={<Wallet size={20} />}
              label="Total Savings Balance"
              value={formatCurrency(accountStats?.totalSavings ?? 0)}
              sub={`${accountStats?.savingsCount ?? 0} accounts`}
              iconBg="bg-blue-50"
              iconColor="#2563EB"
            />
            <StatCard
              icon={<TrendingUp size={20} />}
              label="CBU Deposits"
              value={formatCurrency(cbuDeposits)}
              iconBg="bg-emerald-50"
              iconColor="#059669"
            />
            <StatCard
              icon={<TrendingUp size={20} />}
              label="Savings Deposits"
              value={formatCurrency(savingsDeposits)}
              iconBg="bg-blue-50"
              iconColor="#2563EB"
            />
          </div>

          {/* ── Transaction Totals ───────────────────────────────────────── */}
          <SectionTitle>Transaction Totals</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              icon={<TrendingUp size={20} />}
              label="All Deposits"
              value={formatCurrency(totalDeposited)}
              sub={`${deposits.length} transactions`}
              iconBg="bg-green-50"
              iconColor="#16A34A"
            />
            <StatCard
              icon={<TrendingDown size={20} />}
              label="All Withdrawals"
              value={formatCurrency(totalWithdrawn)}
              sub={`${withdrawals.length} transactions`}
              iconBg="bg-red-50"
              iconColor="#DC2626"
            />
            <StatCard
              icon={<CreditCard size={20} />}
              label="Loan Repayments"
              value={formatCurrency(totalRepaid)}
              sub={`${loanPayments.length} payments`}
              iconBg="bg-orange-50"
              iconColor="#EA580C"
            />
            <StatCard
              icon={<CreditCard size={20} />}
              label="Loans Released"
              value={formatCurrency(totalReleased)}
              sub={`${loanReleases.length} releases`}
              iconBg="bg-violet-50"
              iconColor="#7C3AED"
            />
          </div>

          {/* ── Recent Transactions Table ────────────────────────────────── */}
          <div className="flex items-center justify-between mt-8 mb-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest">
              Recent Transactions
            </h2>
            <Button
              variant="outline"
              size="sm"
              icon={<Download size={13} />}
              onClick={handleExportTransactions}
            >
              Export All
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
                      <td colSpan={5} className="text-center py-10 text-gray-400">No transactions yet.</td>
                    </tr>
                  ) : transactions.slice(0, 20).map(tx => (
                    <tr key={tx.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 capitalize text-gray-700">
                        {tx.type?.replace(/_/g, ' ') || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="capitalize text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                          {tx.category || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">
                          {tx.members?.first_name} {tx.members?.last_name}
                        </p>
                        {tx.members?.member_no && (
                          <p className="text-xs text-gray-400 font-mono">{tx.members.member_no}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-800">
                        {formatCurrency(tx.amount)}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {tx.created_at ? formatDate(tx.created_at) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {transactions.length > 20 && (
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50">
                <p className="text-xs text-gray-400">
                  Showing 20 of {transactions.length} transactions.{' '}
                  Use <strong>Export All</strong> to download the full list.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
