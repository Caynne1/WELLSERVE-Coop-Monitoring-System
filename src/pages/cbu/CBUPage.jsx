import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PiggyBank,
  Search,
  Eye,
  TrendingUp,
  TrendingDown,
  Users,
  DollarSign,
  Plus,
} from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { getAllCBUAccounts } from '../../services/accountService';
import { createTransaction } from '../../services/transactionService';
import { createInvoiceForPayment } from '../../services/invoiceService';
import { getApprovedWithdrawalVouchers } from '../../services/voucherService';
import { formatCurrency, formatDate } from '../../utils/formatters';

const PAYMENT_MODE_OPTIONS = [
  { value: '', label: 'Select mode of payment' },
  { value: 'Cash', label: 'Cash' },
  { value: 'GCash', label: 'GCash' },
  { value: 'Bank Transfer', label: 'Bank Transfer' },
  { value: 'Check', label: 'Check' },
  { value: 'Others', label: 'Others' },
];

export default function CBUPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [depositTarget, setDepositTarget] = useState(null);
  const [withdrawTarget, setWithdrawTarget] = useState(null);

  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [siNo, setSiNo] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [posting, setPosting] = useState(false);

  const [withdrawVouchers, setWithdrawVouchers] = useState([]);
  const [selectedVoucherId, setSelectedVoucherId] = useState('');
  const [loadingWithdrawVouchers, setLoadingWithdrawVouchers] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, []);

  async function fetchAccounts() {
    try {
      setLoading(true);
      setAccounts((await getAllCBUAccounts()) || []);
    } catch {
      toast.error('Failed to load CBU accounts');
    } finally {
      setLoading(false);
    }
  }

  function resetDepositFields() {
    setAmount('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setSiNo('');
    setPaymentMode('');
    setPaymentReference('');
    setPaymentNotes('');
  }

  function resetWithdrawFields() {
    setSelectedVoucherId('');
    setWithdrawVouchers([]);
    setAmount('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentMode('');
    setPaymentReference('');
    setPaymentNotes('');
  }

  function openDepositModal(account) {
    setDepositTarget({ account });
    setWithdrawTarget(null);
    resetDepositFields();
  }

  async function openWithdrawModal(account) {
    setWithdrawTarget({ account });
    setDepositTarget(null);
    resetWithdrawFields();

    try {
      setLoadingWithdrawVouchers(true);
      const vouchers = await getApprovedWithdrawalVouchers({
        member_id: account.member_id,
        account_id: account.id,
        account_type: 'cbu',
      });
      setWithdrawVouchers(vouchers || []);
    } catch (err) {
      toast.error(err.message || 'Failed to load approved withdrawal vouchers.');
      setWithdrawVouchers([]);
    } finally {
      setLoadingWithdrawVouchers(false);
    }
  }

  function handleVoucherSelect(voucherId) {
    setSelectedVoucherId(voucherId);

    const voucher = withdrawVouchers.find(v => v.id === voucherId);
    if (!voucher) {
      setAmount('');
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setPaymentMode('');
      setPaymentReference('');
      setPaymentNotes('');
      return;
    }

    setAmount(String(voucher.amount || ''));
    setPaymentDate(voucher.date || new Date().toISOString().split('T')[0]);
    setPaymentMode(voucher.payment_mode || '');
    setPaymentReference(voucher.reference || '');
    setPaymentNotes(voucher.notes || '');
  }

  async function handleDeposit() {
    const value = parseFloat(amount) || 0;
    const referenceRequired = ['GCash', 'Bank Transfer', 'Check'].includes(paymentMode);

    if (value <= 0) {
      return toast.error('Enter a valid amount greater than zero.');
    }

    if (!paymentDate) {
      return toast.error('Payment date is required.');
    }

    if (!siNo.trim()) {
      return toast.error('SI# is required.');
    }

    if (!paymentMode) {
      return toast.error('Mode of payment is required.');
    }

    if (referenceRequired && !paymentReference.trim()) {
      return toast.error('Reference / Account / Check No. is required for the selected payment mode.');
    }

    setPosting(true);
    try {
      const account = depositTarget.account;
      const memberName = [
        account.members?.first_name,
        account.members?.last_name,
      ].filter(Boolean).join(' ') || 'Unknown Member';

      const paymentModeNote =
        [paymentReference.trim(), paymentNotes.trim()].filter(Boolean).join(' | ') || null;

      await createTransaction({
        member_id: account.member_id,
        account_id: account.id,
        category: 'cbu',
        type: 'deposit',
        amount: value,
        reference: paymentReference.trim() || account.account_no || null,
        notes: paymentNotes.trim() || null,
        created_by: user?.id ?? null,
        transaction_date: paymentDate,
        payment_mode: paymentMode,
        payment_mode_note: paymentModeNote,
      });

      await createInvoiceForPayment({
        invoice_no: siNo.trim(),
        payment_type: 'cbu',
        member_id: account.member_id,
        member_name: memberName,
        amount: value,
        purpose: `CBU Deposit — ${account.account_no || account.id}`,
        ref_id: account.id,
        account_id: account.id,
        created_by: user?.id ?? null,
        date: paymentDate,
        notes: paymentNotes.trim() || null,
        payment_mode: paymentMode,
        payment_mode_note: paymentModeNote,
      });

      toast.success('CBU deposit posted.');
      setDepositTarget(null);
      resetDepositFields();
      fetchAccounts();
    } catch (err) {
      toast.error(err.message || 'Failed to post deposit.');
    } finally {
      setPosting(false);
    }
  }

  async function handleWithdraw() {
    const account = withdrawTarget?.account;
    const voucher = withdrawVouchers.find(v => v.id === selectedVoucherId);
    const value = parseFloat(amount) || 0;

    if (!account) {
      return toast.error('CBU account is missing.');
    }

    if (!voucher) {
      return toast.error('Select an approved withdrawal voucher first.');
    }

    if (value <= 0) {
      return toast.error('Voucher amount must be greater than zero.');
    }

    if (!paymentDate) {
      return toast.error('Withdrawal date is required.');
    }

    if (value > (parseFloat(account.balance) || 0)) {
      return toast.error(`Withdrawal exceeds current balance of ${formatCurrency(account.balance || 0)}.`);
    }

    setPosting(true);
    try {
      const paymentModeNote =
        [paymentReference.trim(), paymentNotes.trim()].filter(Boolean).join(' | ') || null;

      await createTransaction({
        member_id: account.member_id,
        account_id: account.id,
        category: 'cbu',
        type: 'withdrawal',
        amount: value,
        reference: voucher.voucher_no || paymentReference.trim() || account.account_no || null,
        notes: [
          `Voucher: ${voucher.voucher_no}`,
          voucher.purpose ? `Purpose: ${voucher.purpose}` : null,
          paymentNotes.trim() || voucher.notes || null,
        ].filter(Boolean).join(' | '),
        created_by: user?.id ?? null,
        transaction_date: paymentDate,
        payment_mode: paymentMode || voucher.payment_mode || null,
        payment_mode_note: paymentModeNote || voucher.reference || null,
      });

      toast.success('CBU withdrawal posted from approved voucher.');
      setWithdrawTarget(null);
      resetWithdrawFields();
      fetchAccounts();
    } catch (err) {
      toast.error(err.message || 'Failed to post withdrawal.');
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

  const totalBalance = accounts.reduce((s, a) => s + (a.balance || 0), 0);
  const totalDeposits = accounts.reduce((s, a) => s + (a.total_deposits || 0), 0);
  const activeCount = accounts.filter(a => a.status === 'active').length;

  return (
    <div className="p-6">
      <PageHeader title="CBU Monitoring" subtitle="Capital Build-Up accounts across all members" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 mb-6">
        <SummaryCard
          icon={<DollarSign size={20} className="text-green-600" />}
          label="Total CBU Balance"
          value={formatCurrency(totalBalance)}
          bg="bg-green-50"
        />
        <SummaryCard
          icon={<TrendingUp size={20} className="text-blue-600" />}
          label="Total Deposits"
          value={formatCurrency(totalDeposits)}
          bg="bg-blue-50"
        />
        <SummaryCard
          icon={<Users size={20} className="text-purple-600" />}
          label="Active Accounts"
          value={activeCount}
          bg="bg-purple-50"
        />
      </div>

      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by member name or ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#07A04E]"
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
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-400">
                      <PiggyBank size={32} className="mx-auto mb-2 text-gray-200" />
                      {search ? 'No CBU accounts match your search.' : 'No CBU accounts found.'}
                    </td>
                  </tr>
                ) : filtered.map(account => (
                  <tr key={account.id} className="hover:bg-[#D6FADC]/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-green-700 text-xs font-semibold">
                            {(account.members?.first_name?.[0] || '') + (account.members?.last_name?.[0] || '')}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {account.members?.first_name} {account.members?.last_name}
                          </p>
                          {account.members?.member_no && (
                            <p className="text-xs text-gray-400 font-mono">
                              {account.members.member_no}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">
                      {account.account_no || '—'}
                    </td>
                    <td className="px-4 py-3 font-semibold text-green-700">
                      {formatCurrency(account.balance || 0)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatCurrency(account.total_deposits || 0)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatCurrency(account.total_withdrawals || 0)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={account.status === 'active' ? 'success' : 'warning'}>
                        {account.status || 'active'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {account.updated_at ? formatDate(account.updated_at) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => openDepositModal(account)}
                          title="Post CBU Deposit"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                        >
                          <Plus size={15} />
                        </button>
                        <button
                          onClick={() => openWithdrawModal(account)}
                          title="Post CBU Withdrawal"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <TrendingDown size={15} />
                        </button>
                        <button
                          onClick={() => navigate(`/members/${account.member_id}?tab=cbu`)}
                          title="View Member CBU"
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
              <p className="text-xs text-gray-500">Showing {filtered.length} of {accounts.length} CBU accounts</p>
              <p className="text-xs font-medium text-green-700">
                Filtered total: {formatCurrency(filtered.reduce((s, a) => s + (a.balance || 0), 0))}
              </p>
            </div>
          )}
        </div>
      )}

      <Modal
        open={!!depositTarget}
        onClose={() => setDepositTarget(null)}
        title="Post CBU Deposit"
        size="sm"
      >
        {depositTarget && (
          <>
            <p className="text-sm text-gray-600 mb-1">
              Member:{' '}
              <span className="font-medium text-gray-900">
                {depositTarget.account.members?.first_name} {depositTarget.account.members?.last_name}
              </span>
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Current balance:{' '}
              <span className="font-semibold text-gray-800">
                {formatCurrency(depositTarget.account.balance)}
              </span>
            </p>

            <div className="space-y-4">
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
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#07A04E]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={e => setPaymentDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#07A04E]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SI#</label>
                <input
                  type="text"
                  value={siNo}
                  onChange={e => setSiNo(e.target.value)}
                  placeholder="Enter SI# manually"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#07A04E]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mode of Payment</label>
                <select
                  value={paymentMode}
                  onChange={e => setPaymentMode(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#07A04E]"
                >
                  {PAYMENT_MODE_OPTIONS.map(opt => (
                    <option key={opt.value || 'empty'} value={opt.value}>
                      {opt.label}
                    </option>
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
                  rows={2}
                  value={paymentNotes}
                  onChange={e => setPaymentNotes(e.target.value)}
                  placeholder="Optional notes"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[#07A04E]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-5">
              <Button variant="outline" onClick={() => setDepositTarget(null)}>
                Cancel
              </Button>
              <Button loading={posting} variant="finance" onClick={handleDeposit} icon={<TrendingUp size={15} />}>
                Post Deposit
              </Button>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={!!withdrawTarget}
        onClose={() => setWithdrawTarget(null)}
        title="Post CBU Withdrawal from Approved Voucher"
        size="sm"
      >
        {withdrawTarget && (
          <>
            <p className="text-sm text-gray-600 mb-1">
              Member:{' '}
              <span className="font-medium text-gray-900">
                {withdrawTarget.account.members?.first_name} {withdrawTarget.account.members?.last_name}
              </span>
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Current balance:{' '}
              <span className="font-semibold text-gray-800">
                {formatCurrency(withdrawTarget.account.balance)}
              </span>
            </p>

            {loadingWithdrawVouchers ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : withdrawVouchers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                No approved member withdrawal vouchers found for this CBU account.
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Approved Voucher</label>
                  <select
                    value={selectedVoucherId}
                    onChange={e => handleVoucherSelect(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="">Select approved voucher</option>
                    {withdrawVouchers.map(voucher => (
                      <option key={voucher.id} value={voucher.id}>
                        {voucher.voucher_no} · {formatCurrency(voucher.amount)} · {voucher.purpose}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                    <p className="text-xs text-gray-400 mb-1">Amount</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {amount ? formatCurrency(parseFloat(amount) || 0) : '—'}
                    </p>
                  </div>

                  <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                    <p className="text-xs text-gray-400 mb-1">Date</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {paymentDate ? formatDate(paymentDate) : '—'}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                  <p className="text-xs text-gray-400 mb-1">Mode of Payment</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {paymentMode || '—'}
                  </p>
                </div>

                <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                  <p className="text-xs text-gray-400 mb-1">Reference</p>
                  <p className="text-sm font-semibold text-gray-900 break-all">
                    {paymentReference || '—'}
                  </p>
                </div>

                <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                  <p className="text-xs text-gray-400 mb-1">Notes</p>
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">
                    {paymentNotes || '—'}
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-5">
              <Button variant="outline" onClick={() => setWithdrawTarget(null)}>
                Cancel
              </Button>
              <Button
                loading={posting}
                variant="danger"
                onClick={handleWithdraw}
                icon={<TrendingDown size={15} />}
                disabled={!selectedVoucherId || loadingWithdrawVouchers || withdrawVouchers.length === 0}
              >
                Post Withdrawal
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
      <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-lg font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}