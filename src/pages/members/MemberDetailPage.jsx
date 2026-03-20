import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, User, CreditCard, PiggyBank, Wallet, ArrowLeftRight,
  Edit, Phone, Mail, MapPin, Calendar, Hash, Plus, TrendingUp,
  TrendingDown, Clock, AlertCircle, DollarSign,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
import { getMemberById } from '../../services/memberService';
import { getAccountsByMemberId } from '../../services/accountService';
import { getLoansByMemberId } from '../../services/loanService';
import { getTransactionsByMemberId, createTransaction } from '../../services/transactionService';
import { formatDate, formatCurrency } from '../../utils/formatters';

const TABS = [
  { id: 'overview',      label: 'Overview',      icon: User },
  { id: 'loan',          label: 'Loans',          icon: CreditCard },
  { id: 'cbu',           label: 'CBU',            icon: PiggyBank },
  { id: 'savings',       label: 'Savings',        icon: Wallet },
  { id: 'transactions',  label: 'Transactions',   icon: ArrowLeftRight },
];

export default function MemberDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';

  const [member, setMember]           = useState(null);
  const [accounts, setAccounts]       = useState([]);
  const [loans, setLoans]             = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading]         = useState(true);

  // Modal state
  const [payModal, setPayModal]         = useState({ open: false, loan: null });
  const [cbuModal, setCbuModal]         = useState(false);
  const [savingsModal, setSavingsModal] = useState(false);

  useEffect(() => { fetchAll(); }, [id]);

  async function fetchAll() {
    try {
      setLoading(true);
      const [memberData, accountsData, loansData, txData] = await Promise.all([
        getMemberById(id),
        getAccountsByMemberId(id),
        getLoansByMemberId(id),
        getTransactionsByMemberId(id),
      ]);
      setMember(memberData);
      setAccounts(accountsData || []);
      setLoans(loansData || []);
      setTransactions(txData || []);
    } catch {
      toast.error('Failed to load member data');
    } finally {
      setLoading(false);
    }
  }

  const cbuAccount     = accounts.find(a => a.account_type === 'cbu');
  const savingsAccount = accounts.find(a => a.account_type === 'savings');
  const activeLoans    = loans.filter(l => l.status === 'active');

  if (loading) return <div className="flex justify-center items-center py-20"><Spinner /></div>;

  if (!member) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="mx-auto mb-3 text-gray-300" size={40} />
        <p className="text-gray-500">Member not found.</p>
        <Button className="mt-4" onClick={() => navigate('/members')}>Back to Members</Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <button
        onClick={() => navigate('/members')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors"
      >
        <ArrowLeft size={16} /> Back to Members
      </button>

      {/* Member header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xl font-semibold">
              {(member.first_name?.[0] || '') + (member.last_name?.[0] || '')}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{member.first_name} {member.last_name}</h1>
              <div className="flex items-center gap-3 mt-1">
                {member.member_no && (
                  <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                    {member.member_no}
                  </span>
                )}
                <Badge variant={member.status === 'active' ? 'success' : 'warning'}>
                  {member.status || 'active'}
                </Badge>
              </div>
            </div>
          </div>
          <Button variant="blue" onClick={() => navigate(`/members/${id}/edit`)} icon={<Edit size={14} />}>
            Edit Member
          </Button>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-5 border-t border-gray-100">
          <QuickStat label="CBU Balance"       value={formatCurrency(cbuAccount?.balance ?? 0)}     icon={<PiggyBank size={16} className="text-green-600" />}    color="text-green-700" />
          <QuickStat label="Savings Balance"   value={formatCurrency(savingsAccount?.balance ?? 0)} icon={<Wallet size={16} className="text-blue-600" />}         color="text-blue-700" />
          <QuickStat label="Active Loans"      value={activeLoans.length}                            icon={<CreditCard size={16} className="text-orange-600" />}   color="text-orange-700" />
          <QuickStat label="Transactions"      value={transactions.length}                           icon={<ArrowLeftRight size={16} className="text-purple-600" />} color="text-purple-700" />
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex overflow-x-auto border-b border-gray-100">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setSearchParams({ tab: tab.id })}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <tab.icon size={15} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === 'overview' && <OverviewTab member={member} />}

          {activeTab === 'loan' && (
            <LoanTab
              loans={loans}
              memberId={id}
              navigate={navigate}
              onPayLoan={loan => setPayModal({ open: true, loan })}
            />
          )}

          {activeTab === 'cbu' && (
            <CBUTab
              account={cbuAccount}
              onDeposit={() => setCbuModal(true)}
            />
          )}

          {activeTab === 'savings' && (
            <SavingsTab
              account={savingsAccount}
              onDeposit={() => setSavingsModal(true)}
            />
          )}

          {activeTab === 'transactions' && <TransactionsTab transactions={transactions} />}
        </div>
      </div>

      {/* ── Modals ── */}

      {/* Combined payment modal (loan + CBU + savings) */}
      <PaymentModal
        open={payModal.open}
        onClose={() => setPayModal({ open: false, loan: null })}
        loan={payModal.loan}
        cbuAccount={cbuAccount}
        savingsAccount={savingsAccount}
        memberId={id}
        userId={user?.id}
        onSuccess={fetchAll}
      />

      {/* CBU deposit modal */}
      <DepositModal
        open={cbuModal}
        onClose={() => setCbuModal(false)}
        accountType="cbu"
        label="CBU"
        account={cbuAccount}
        memberId={id}
        userId={user?.id}
        onSuccess={fetchAll}
      />

      {/* Savings deposit modal */}
      <DepositModal
        open={savingsModal}
        onClose={() => setSavingsModal(false)}
        accountType="savings"
        label="Savings"
        account={savingsAccount}
        memberId={id}
        userId={user?.id}
        onSuccess={fetchAll}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  MODALS
// ─────────────────────────────────────────────────────────────

function PaymentModal({ open, onClose, loan, cbuAccount, savingsAccount, memberId, userId, onSuccess }) {
  const [loanAmt, setLoanAmt]       = useState('');
  const [cbuAmt, setCbuAmt]         = useState('');
  const [savingsAmt, setSavingsAmt] = useState('');
  const [loading, setLoading]       = useState(false);

  useEffect(() => {
    if (open) { setLoanAmt(''); setCbuAmt(''); setSavingsAmt(''); }
  }, [open]);

  async function handleSubmit() {
    const loanPay    = parseFloat(loanAmt)    || 0;
    const cbuPay     = parseFloat(cbuAmt)     || 0;
    const savingsPay = parseFloat(savingsAmt) || 0;

    if (loanPay + cbuPay + savingsPay === 0) {
      return toast.error('Enter at least one amount greater than zero.');
    }
    if (loanPay > 0 && loanPay > (loan?.balance ?? 0)) {
      return toast.error(`Loan payment exceeds remaining balance of ${formatCurrency(loan.balance)}.`);
    }
    if (cbuPay > 0 && !cbuAccount) {
      return toast.error('No CBU account found for this member.');
    }
    if (savingsPay > 0 && !savingsAccount) {
      return toast.error('No Savings account found for this member.');
    }

    setLoading(true);
    try {
      // Insert sequentially so each triggers independently
      if (loanPay > 0) {
        const loanTx = { member_id: memberId, loan_id: loan.id, category: 'loan', type: 'loan_payment', amount: loanPay, created_by: userId ?? null };
        console.log('[PaymentModal] loan_payment:', loanTx);
        await createTransaction(loanTx);
      }
      if (cbuPay > 0) {
        const cbuTx = { member_id: memberId, account_id: cbuAccount.id, category: 'cbu', type: 'deposit', amount: cbuPay, created_by: userId ?? null };
        console.log('[PaymentModal] cbu deposit:', cbuTx);
        await createTransaction(cbuTx);
      }
      if (savingsPay > 0) {
        const savTx = { member_id: memberId, account_id: savingsAccount.id, category: 'savings', type: 'deposit', amount: savingsPay, created_by: userId ?? null };
        console.log('[PaymentModal] savings deposit:', savTx);
        await createTransaction(savTx);
      }

      toast.success('Payment posted successfully.');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to post payment.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Post Payment">
      {loan && (
        <div className="mb-5 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm">
          <p className="font-medium text-orange-800">{formatCurrency(loan.amount)} loan</p>
          <p className="text-orange-600 text-xs mt-0.5">
            Remaining balance: <span className="font-semibold">{formatCurrency(loan.balance)}</span>
          </p>
        </div>
      )}

      <p className="text-xs text-gray-400 mb-4">
        Enter amounts manually. Leave a field empty to skip that category.
      </p>

      <div className="space-y-4">
        {loan && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Loan Payment <span className="text-gray-400">(max {formatCurrency(loan.balance)})</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              max={loan.balance}
              value={loanAmt}
              onChange={e => setLoanAmt(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        )}

        {cbuAccount && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              CBU Deposit <span className="text-gray-400">(current: {formatCurrency(cbuAccount.balance)})</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={cbuAmt}
              onChange={e => setCbuAmt(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        )}

        {savingsAccount && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Savings Deposit <span className="text-gray-400">(current: {formatCurrency(savingsAccount.balance)})</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={savingsAmt}
              onChange={e => setSavingsAmt(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button loading={loading} variant="finance" onClick={handleSubmit} icon={<DollarSign size={15} />}>
          Post Payment
        </Button>
      </div>
    </Modal>
  );
}

function DepositModal({ open, onClose, accountType, label, account, memberId, userId, onSuccess }) {
  const [amount, setAmount]   = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (open) setAmount(''); }, [open]);

  async function handleSubmit() {
    const value = parseFloat(amount) || 0;
    if (value <= 0) return toast.error('Enter a valid amount greater than zero.');
    if (!account) return toast.error(`No ${label} account found for this member.`);

    setLoading(true);
    try {
      const depositTx = { member_id: memberId, account_id: account.id, category: accountType, type: 'deposit', amount: value, created_by: userId ?? null };
      console.log('[DepositModal]', accountType, 'deposit:', depositTx);
      await createTransaction(depositTx);
      toast.success(`${label} deposit posted.`);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.message || `Failed to post ${label} deposit.`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`${label} Deposit`} size="sm">
      {account && (
        <p className="text-sm text-gray-500 mb-4">
          Current balance: <span className="font-semibold text-gray-800">{formatCurrency(account.balance)}</span>
        </p>
      )}
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
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="flex justify-end gap-3 mt-5">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button loading={loading} onClick={handleSubmit} icon={<TrendingUp size={15} />}>
          Post Deposit
        </Button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
//  TAB COMPONENTS
// ─────────────────────────────────────────────────────────────

function QuickStat({ label, value, icon, color }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center">{icon}</div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className={`text-sm font-semibold ${color}`}>{value}</p>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <Icon size={15} className="text-gray-400 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-gray-400 mb-0.5">{label}</p>
        <p className="text-sm text-gray-800 break-words">{value || '—'}</p>
      </div>
    </div>
  );
}

function OverviewTab({ member }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Personal Information</h3>
        <div className="space-y-0.5">
          <InfoRow icon={User}    label="Full Name"      value={`${member.first_name || ''} ${member.last_name || ''}`.trim()} />
          <InfoRow icon={Hash}    label="Member Number"  value={member.member_no} />
          <InfoRow icon={Mail}    label="Email"          value={member.email} />
          <InfoRow icon={Phone}   label="Phone"          value={member.phone} />
          <InfoRow icon={MapPin}  label="Address"        value={member.address} />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Membership Details</h3>
        <div className="space-y-0.5">
          <InfoRow icon={Calendar} label="Date Joined"    value={member.created_at ? formatDate(member.created_at) : '—'} />
          <InfoRow icon={Calendar} label="Date of Birth"  value={member.date_of_birth ? formatDate(member.date_of_birth) : '—'} />
          <InfoRow icon={User}     label="Status"         value={member.status || 'active'} />
          {member.notes && <InfoRow icon={User} label="Notes" value={member.notes} />}
        </div>
      </div>
    </div>
  );
}

function LoanTab({ loans, memberId, navigate, onPayLoan }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">Loan Records</h3>
        <Button size="sm" variant="green" onClick={() => navigate(`/loans/new?member=${memberId}`)} icon={<Plus size={14} />}>
          Add Loan
        </Button>
      </div>

      {loans.length === 0 ? (
        <EmptyState icon={CreditCard} message="No loan records for this member." />
      ) : (
        <div className="space-y-3">
          {loans.map(loan => (
            <LoanCard key={loan.id} loan={loan} navigate={navigate} onPay={onPayLoan} />
          ))}
        </div>
      )}
    </div>
  );
}

function LoanCard({ loan, navigate, onPay }) {
  const statusColors = {
    active:    'text-blue-700 bg-blue-50 border-blue-200',
    paid:      'text-green-700 bg-green-50 border-green-200',
    defaulted: 'text-red-700 bg-red-50 border-red-200',
    pending:   'text-yellow-700 bg-yellow-50 border-yellow-200',
  };

  return (
    <div
      className="flex items-center justify-between p-4 rounded-lg border border-gray-100 hover:border-gray-200 bg-gray-50/50 cursor-pointer transition-colors"
      onClick={() => navigate(`/loans/${loan.id}`)}
    >
      <div>
        <p className="text-sm font-medium text-gray-800">
          {formatCurrency(loan.amount || 0)}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          Released: {loan.release_date ? formatDate(loan.release_date) : '—'} ·
          Due: {loan.due_date ? formatDate(loan.due_date) : '—'}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-xs text-gray-400">Balance</p>
          <p className="text-sm font-semibold text-gray-800">{formatCurrency(loan.balance ?? 0)}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full border font-medium ${statusColors[loan.status] || 'text-gray-600 bg-gray-100 border-gray-200'}`}>
          {loan.status || 'pending'}
        </span>
        {loan.status === 'active' && (
          <Button
            size="sm"
            variant="finance"
            onClick={e => { e.stopPropagation(); onPay(loan); }}
            icon={<DollarSign size={13} />}
          >
            Pay
          </Button>
        )}
      </div>
    </div>
  );
}

function CBUTab({ account, onDeposit }) {
  if (!account) return <EmptyState icon={PiggyBank} message="No CBU account initialized for this member." />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center">
            <PiggyBank size={20} className="text-green-600" />
          </div>
          <div>
            <p className="text-xs text-gray-400">CBU Balance</p>
            <p className="text-2xl font-bold text-green-700">{formatCurrency(account.balance ?? 0)}</p>
          </div>
        </div>
        <Button onClick={onDeposit} variant="finance" icon={<Plus size={14} />} size="sm">
          Deposit CBU
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <AccountInfoCell label="Account No." value={account.account_no || '—'} mono />
        <AccountInfoCell label="Opened" value={account.created_at ? formatDate(account.created_at) : '—'} />
        <AccountInfoCell label="Total Deposits" value={formatCurrency(account.total_deposits ?? 0)} />
        <AccountInfoCell label="Total Withdrawals" value={formatCurrency(account.total_withdrawals ?? 0)} />
      </div>
    </div>
  );
}

function SavingsTab({ account, onDeposit }) {
  if (!account) return <EmptyState icon={Wallet} message="No Savings account initialized for this member." />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
            <Wallet size={20} className="text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-gray-400">Savings Balance</p>
            <p className="text-2xl font-bold text-blue-700">{formatCurrency(account.balance ?? 0)}</p>
          </div>
        </div>
        <Button onClick={onDeposit} variant="finance" icon={<Plus size={14} />} size="sm">
          Deposit Savings
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <AccountInfoCell label="Account No." value={account.account_no || '—'} mono />
        <AccountInfoCell label="Opened" value={account.created_at ? formatDate(account.created_at) : '—'} />
        <AccountInfoCell label="Total Deposits" value={formatCurrency(account.total_deposits ?? 0)} />
        <AccountInfoCell label="Total Withdrawals" value={formatCurrency(account.total_withdrawals ?? 0)} />
      </div>
    </div>
  );
}

function TransactionsTab({ transactions }) {
  const typeStyles = {
    deposit:      { icon: TrendingUp,   color: 'text-green-600' },
    withdrawal:   { icon: TrendingDown, color: 'text-red-600' },
    loan_payment: { icon: TrendingDown, color: 'text-orange-600' },
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-4">All Transactions</h3>
      {transactions.length === 0 ? (
        <EmptyState icon={ArrowLeftRight} message="No transactions recorded for this member." />
      ) : (
        <div className="divide-y divide-gray-50">
          {transactions.map(tx => {
            const style = typeStyles[tx.type] || { icon: Clock, color: 'text-gray-500' };
            const TxIcon = style.icon;
            return (
              <div key={tx.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                    <TxIcon size={14} className={style.color} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800 capitalize">
                      {tx.type?.replace('_', ' ') || 'Transaction'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {tx.category && <span className="capitalize mr-1">{tx.category} ·</span>}
                      {tx.reference && `Ref: ${tx.reference} · `}
                      {tx.created_at ? formatDate(tx.created_at) : '—'}
                    </p>
                  </div>
                </div>
                <p className={`text-sm font-semibold ${style.color}`}>
                  {formatCurrency(tx.amount || 0)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AccountInfoCell({ label, value, mono }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-gray-700 ${mono ? 'font-mono text-xs' : ''}`}>{value}</p>
    </div>
  );
}

function EmptyState({ icon: Icon, message }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon size={36} className="text-gray-200 mb-3" />
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  );
}