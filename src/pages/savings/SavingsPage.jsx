import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, Search, Eye, TrendingUp, Users, DollarSign, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { getAllSavingsAccounts } from '../../services/accountService';
import { createTransaction } from '../../services/transactionService';
import { formatCurrency, formatDate } from '../../utils/formatters';

export default function SavingsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [accounts, setAccounts]           = useState([]);
  const [loading, setLoading]             = useState(true);
  const [search, setSearch]               = useState('');
  const [depositTarget, setDepositTarget] = useState(null);
  const [amount, setAmount]               = useState('');
  const [posting, setPosting]             = useState(false);

  useEffect(() => { fetchAccounts(); }, []);

  async function fetchAccounts() {
    try {
      setLoading(true);
      setAccounts(await getAllSavingsAccounts() || []);
    } catch {
      toast.error('Failed to load Savings accounts');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeposit() {
    const value = parseFloat(amount) || 0;
    if (value <= 0) return toast.error('Enter a valid amount greater than zero.');
    setPosting(true);
    try {
      const tx = { member_id: depositTarget.account.member_id, account_id: depositTarget.account.id, category: 'savings', type: 'deposit', amount: value, created_by: user?.id ?? null };
      console.log('[SavingsPage] savings deposit:', tx);
      await createTransaction(tx);
      toast.success('Savings deposit posted.');
      setDepositTarget(null);
      setAmount('');
      fetchAccounts();
    } catch (err) {
      toast.error(err.message || 'Failed to post deposit.');
    } finally {
      setPosting(false);
    }
  }

  const filtered = accounts.filter(a => {
    const q = search.toLowerCase();
    return (
      a.members?.first_name?.toLowerCase().includes(q) ||
      a.members?.last_name?.toLowerCase().includes(q) ||
      a.members?.member_no?.toLowerCase().includes(q) ||
      a.account_no?.toLowerCase().includes(q)
    );
  });

  const totalBalance   = accounts.reduce((s, a) => s + (a.balance || 0), 0);
  const totalDeposits  = accounts.reduce((s, a) => s + (a.total_deposits || 0), 0);
  const activeCount    = accounts.filter(a => a.status === 'active').length;

  return (
    <div className="p-6">
      <PageHeader title="Savings Monitoring" subtitle="Member savings accounts overview" />

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 mb-6">
        <SummaryCard icon={<DollarSign size={20} className="text-blue-600" />}    label="Total Savings Balance" value={formatCurrency(totalBalance)}  bg="bg-blue-50" />
        <SummaryCard icon={<TrendingUp size={20} className="text-indigo-600" />}  label="Total Deposits"        value={formatCurrency(totalDeposits)} bg="bg-indigo-50" />
        <SummaryCard icon={<Users size={20} className="text-violet-600" />}       label="Active Accounts"       value={activeCount}                   bg="bg-violet-50" />
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by member name or ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7EB751]"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Member', 'Account No.', 'Balance', 'Total Deposits', 'Total Withdrawals', 'Status', 'Updated', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-400">
                      <Wallet size={32} className="mx-auto mb-2 text-gray-200" />
                      {search ? 'No Savings accounts match your search.' : 'No Savings accounts found.'}
                    </td>
                  </tr>
                ) : filtered.map(account => (
                  <tr key={account.id} className="hover:bg-[#D6FADC]/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-blue-700 text-xs font-semibold">
                            {(account.members?.first_name?.[0] || '') + (account.members?.last_name?.[0] || '')}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{account.members?.first_name} {account.members?.last_name}</p>
                          {account.members?.member_no && (
                            <p className="text-xs text-gray-400 font-mono">{account.members.member_no}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{account.account_no || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-blue-700">{formatCurrency(account.balance || 0)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatCurrency(account.total_deposits || 0)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatCurrency(account.total_withdrawals || 0)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={account.status === 'active' ? 'success' : 'warning'}>
                        {account.status || 'active'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{account.updated_at ? formatDate(account.updated_at) : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => { setDepositTarget({ account }); setAmount(''); }}
                          title="Post Savings Deposit"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <Plus size={15} />
                        </button>
                        <button
                          onClick={() => navigate(`/members/${account.member_id}?tab=savings`)}
                          title="View Member Savings"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <Eye size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <p className="text-xs text-gray-500">Showing {filtered.length} of {accounts.length} Savings accounts</p>
              <p className="text-xs font-medium text-blue-700">
                Filtered total: {formatCurrency(filtered.reduce((s, a) => s + (a.balance || 0), 0))}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Deposit Modal */}
      <Modal
        open={!!depositTarget}
        onClose={() => setDepositTarget(null)}
        title="Post Savings Deposit"
        size="sm"
      >
        {depositTarget && (
          <>
            <p className="text-sm text-gray-600 mb-1">
              Member: <span className="font-medium text-gray-900">
                {depositTarget.account.members?.first_name} {depositTarget.account.members?.last_name}
              </span>
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Current balance: <span className="font-semibold text-gray-800">{formatCurrency(depositTarget.account.balance)}</span>
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                autoFocus
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7EB751]"
              />
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <Button variant="outline" onClick={() => setDepositTarget(null)}>Cancel</Button>
              <Button loading={posting} variant="finance" onClick={handleDeposit} icon={<TrendingUp size={15} />}>
                Post Deposit
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

function SummaryCard({ icon, label, value, bg }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>{icon}</div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-lg font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}