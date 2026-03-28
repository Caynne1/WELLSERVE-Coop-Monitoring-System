import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign,
  RefreshCw, ArrowUpRight, ArrowDownRight,
  LayoutDashboard, Plus,
} from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Badge from '../../components/ui/Badge';
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
import { formatCurrency, formatDate } from '../../utils/formatters';

// ── Category label + colour helpers ──────────────────────────────────────────

function CategoryBadge({ category }) {
  const label = CATEGORY_LABEL[category] || category || '—';
  const cls = CATEGORY_COLOR[category] || 'text-gray-600 bg-gray-100';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${cls}`}>
      {label}
    </span>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, bg, textColor }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
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

// ── Transaction row ───────────────────────────────────────────────────────────

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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CoopMonitoringPage() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [fund, setFund] = useState({ balance: 0, cash_in: 0, cash_out: 0 });
  const [transactions, setTransactions] = useState([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const [fundModalOpen, setFundModalOpen] = useState(false);
  const [fundAmount, setFundAmount] = useState('');
  const [fundDate, setFundDate] = useState(new Date().toISOString().split('T')[0]);
  const [fundDescription, setFundDescription] = useState('');
  const [savingFund, setSavingFund] = useState(false);

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

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleAddFund() {
    const value = parseFloat(fundAmount) || 0;

    if (value <= 0) {
      return toast.error('Enter a valid amount.');
    }

    if (!fundDate) {
      return toast.error('Date is required.');
    }

    setSavingFund(true);
    try {
      await recordManualFundDeposit({
        amount: value,
        date: fundDate,
        description: fundDescription,
        created_by: user?.id ?? null,
      });

      toast.success('Fund added successfully.');

      setFundModalOpen(false);
      setFundAmount('');
      setFundDescription('');
      setFundDate(new Date().toISOString().split('T')[0]);

      await fetchData(true);
    } catch (err) {
      console.error('[CoopMonitoringPage] add fund error:', err);
      toast.error(err.message || 'Failed to add fund.');
    } finally {
      setSavingFund(false);
    }
  }

  // ── Client-side filtering ────────────────────────────────────────────────────

  const filtered = transactions.filter(tx => {
    const matchType = !typeFilter || tx.type === typeFilter;
    const matchCat = !catFilter || tx.category === catFilter;
    return matchType && matchCat;
  });

  const categories = [...new Set(transactions.map(tx => tx.category).filter(Boolean))];

  // ── Render ───────────────────────────────────────────────────────────────────

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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 mb-6">
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
          </div>

          <CashInBreakdown transactions={transactions} />

          <div className="flex flex-wrap gap-3 mb-4">
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#07A04E] bg-white text-gray-700"
            >
              <option value="">All Types</option>
              <option value="cash_in">Cash In</option>
              <option value="cash_out">Cash Out</option>
            </select>

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

            {(typeFilter || catFilter) && (
              <button
                onClick={() => { setTypeFilter(''); setCatFilter(''); }}
                className="px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
              >
                Clear filters
              </button>
            )}

            <p className="ml-auto self-center text-xs text-gray-400">
              {filtered.length} of {transactions.length} transactions
            </p>
          </div>

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
                            {typeFilter || catFilter
                              ? 'No transactions match your filters.'
                              : 'No fund transactions recorded yet.'}
                          </p>
                          {!typeFilter && !catFilter && (
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
                      filtered
                        .filter(tx => tx.type === 'cash_in')
                        .reduce((s, tx) => s + tx.amount, 0)
                    )}
                  </span>
                  <span className="text-red-600 font-medium">
                    Out: {formatCurrency(
                      filtered
                        .filter(tx => tx.type === 'cash_out')
                        .reduce((s, tx) => s + tx.amount, 0)
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <Modal
        open={fundModalOpen}
        onClose={() => setFundModalOpen(false)}
        title="Add Fund"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
            <input
              type="number"
              step="0.01"
              min="0"
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

// ── Cash-In breakdown by category ─────────────────────────────────────────────

function CashInBreakdown({ transactions }) {
  const cashInTx = transactions.filter(tx => tx.type === 'cash_in');

  const groups = [
    { key: 'loan_payment', label: 'Loan Payments', color: 'bg-orange-400' },
    { key: 'cbu', label: 'CBU Deposits', color: 'bg-green-400' },
    { key: 'savings', label: 'Savings Deposits', color: 'bg-blue-400' },
    { key: 'membership', label: 'Membership Fees', color: 'bg-purple-400' },
    { key: 'capital', label: 'Capital / Fund Deposit', color: 'bg-indigo-400' },
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