import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, User, CreditCard, PiggyBank, Wallet, ArrowLeftRight,
  Edit, Phone, Mail, MapPin, Calendar, Hash, Plus, TrendingUp,
  TrendingDown, Clock, AlertCircle, DollarSign, Shield, Download, BadgeAlert,
} from 'lucide-react';
import toast from 'react-hot-toast';

import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';

import { getMemberById } from '../../services/memberService';
import { getAccountsByMemberId } from '../../services/accountService';
import { getLoansByMemberId } from '../../services/loanService';
import { getTransactionsByMemberId, createTransaction } from '../../services/transactionService';
import {
  getMembershipByMemberId,
  getMembershipPayments,
  getMembershipUpgradeLogs,
  recordMembershipPayment,
  upgradeMembership,
  createMembership,
  computeFeeBalance,
} from '../../services/membershipService';
import {
  getPenaltiesByMemberId,
  createPenalty,
  deletePenalty,
} from '../../services/penaltyService';
import { exportMemberReport } from '../../utils/excelExport.js';
import { createInvoiceForPayment } from '../../services/invoiceService';

import { formatDate, formatCurrency, formatDateTime } from '../../utils/formatters';

const TABS = [
  { id: 'overview', label: 'Overview', icon: User },
  { id: 'loan', label: 'Loans', icon: CreditCard },
  { id: 'cbu', label: 'CBU', icon: PiggyBank },
  { id: 'savings', label: 'Savings', icon: Wallet },
  { id: 'membership', label: 'Membership', icon: Shield },
  { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
  { id: 'penalty', label: 'Penalty', icon: BadgeAlert },
];

export default function MemberDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';

  const [member, setMember] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [loans, setLoans] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [payModal, setPayModal] = useState({ open: false, loan: null });
  const [cbuModal, setCbuModal] = useState(false);
  const [savingsModal, setSavingsModal] = useState(false);

  const [membership, setMembership] = useState(null);
  const [membershipPayments, setMembershipPayments] = useState([]);
  const [upgradeLogs, setUpgradeLogs] = useState([]);
  const [membershipLoading, setMembershipLoading] = useState(false);

  const [penalties, setPenalties] = useState([]);
  const [penaltyLoading, setPenaltyLoading] = useState(false);

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

  const fetchMembership = useCallback(async () => {
    try {
      setMembershipLoading(true);
      const ms = await getMembershipByMemberId(id);
      setMembership(ms);

      if (ms) {
        const [payments, logs] = await Promise.all([
          getMembershipPayments(ms.id),
          getMembershipUpgradeLogs(ms.id),
        ]);
        setMembershipPayments(payments || []);
        setUpgradeLogs(logs || []);
      } else {
        setMembershipPayments([]);
        setUpgradeLogs([]);
      }
    } catch {
      toast.error('Failed to load membership data');
    } finally {
      setMembershipLoading(false);
    }
  }, [id]);

  const fetchPenalties = useCallback(async () => {
    try {
      setPenaltyLoading(true);
      const data = await getPenaltiesByMemberId(id);
      setPenalties(data || []);
    } catch {
      toast.error('Failed to load penalties');
    } finally {
      setPenaltyLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAll();
  }, [id]);

  useEffect(() => {
    fetchMembership();
    fetchPenalties();
  }, [fetchMembership, fetchPenalties]);

  const cbuAccount = accounts.find(a => String(a.account_type).toLowerCase() === 'cbu');
  const savingsAccount = accounts.find(a => String(a.account_type).toLowerCase() === 'savings');
  const activeLoans = loans.filter(l => l.status === 'active');
  const displayMembershipType = membership?.membership_type || member?.membership_type || null;

  const loanTransactions = useMemo(
    () => transactions.filter(t => t.category === 'loan'),
    [transactions]
  );
  const cbuTransactions = useMemo(
    () => transactions.filter(t => t.category === 'cbu'),
    [transactions]
  );
  const savingsTransactions = useMemo(
    () => transactions.filter(t => t.category === 'savings'),
    [transactions]
  );

  const loanPaymentCount = loanTransactions.filter(t => t.type === 'loan_payment').length;
  const cbuPaymentCount = cbuTransactions.filter(t => t.type === 'deposit').length;
  const savingsPaymentCount = savingsTransactions.filter(t => t.type === 'deposit').length;

  async function handleExportExcel() {
    try {
      await exportMemberReport({
        member,
        loans,
        membership,
        transactions,
        penalties,
      });
      toast.success('Excel report generated.');
    } catch (err) {
      toast.error(err.message || 'Failed to generate Excel report.');
    }
  }

  async function refreshEverything() {
    await Promise.all([fetchAll(), fetchMembership()]);
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Spinner />
      </div>
    );
  }

  if (!member) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="mx-auto mb-3 text-gray-300" size={40} />
        <p className="text-gray-500">Member not found.</p>
        <Button className="mt-4" onClick={() => navigate('/members')}>
          Back to Members
        </Button>
      </div>
    );
  }

  const memberFullName = `${member.first_name || ''} ${member.last_name || ''}`.trim();

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <button
        onClick={() => navigate('/members')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors"
      >
        <ArrowLeft size={16} /> Back to Members
      </button>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xl font-semibold">
              {(member.first_name?.[0] || '') + (member.last_name?.[0] || '')}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {member.first_name} {member.last_name}
              </h1>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {member.member_no && (
                  <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                    {member.member_no}
                  </span>
                )}
                <Badge variant={member.status === 'active' ? 'success' : 'warning'}>
                  {member.status || 'active'}
                </Badge>
                {displayMembershipType && (
                  <Badge variant={displayMembershipType === 'regular' ? 'info' : 'default'}>
                    {displayMembershipType}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleExportExcel}
              icon={<Download size={14} />}
            >
              Generate / Export Excel
            </Button>
            <Button
              variant="blue"
              onClick={() => navigate(`/members/${id}/edit`)}
              icon={<Edit size={14} />}
            >
              Edit Member
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-5 border-t border-gray-100">
          <QuickStat
            label="Loan Balance"
            value={formatCurrency(activeLoans.reduce((sum, loan) => sum + (loan.balance || 0), 0))}
            icon={<CreditCard size={16} className="text-orange-600" />}
            color="text-orange-700"
          />
          <QuickStat
            label="CBU Total"
            value={formatCurrency(cbuAccount?.balance ?? 0)}
            icon={<PiggyBank size={16} className="text-green-600" />}
            color="text-green-700"
          />
          <QuickStat
            label="Savings Total"
            value={formatCurrency(savingsAccount?.balance ?? 0)}
            icon={<Wallet size={16} className="text-blue-600" />}
            color="text-blue-700"
          />
          <QuickStat
            label="Transactions"
            value={transactions.length}
            icon={<ArrowLeftRight size={16} className="text-purple-600" />}
            color="text-purple-700"
          />
        </div>
      </div>

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
          {activeTab === 'overview' && (
            <OverviewTab member={member} displayMembershipType={displayMembershipType} />
          )}

          {activeTab === 'loan' && (
            <LoanTab
              loans={loans}
              loanTransactions={loanTransactions}
              paymentCount={loanPaymentCount}
              memberId={id}
              navigate={navigate}
              onPayLoan={loan => setPayModal({ open: true, loan })}
            />
          )}

          {activeTab === 'cbu' && (
            <CBUTab
              account={cbuAccount}
              transactions={cbuTransactions}
              paymentCount={cbuPaymentCount}
              onDeposit={() => setCbuModal(true)}
            />
          )}

          {activeTab === 'savings' && (
            <SavingsTab
              account={savingsAccount}
              transactions={savingsTransactions}
              paymentCount={savingsPaymentCount}
              onDeposit={() => setSavingsModal(true)}
            />
          )}

          {activeTab === 'membership' && (
            <MembershipTab
              memberId={id}
              memberName={memberFullName}
              membership={membership}
              payments={membershipPayments}
              upgradeLogs={upgradeLogs}
              loading={membershipLoading}
              userId={user?.id}
              onRefresh={fetchMembership}
            />
          )}

          {activeTab === 'transactions' && (
            <TransactionsTab transactions={transactions} />
          )}

          {activeTab === 'penalty' && (
            <PenaltyTab
              memberId={id}
              penalties={penalties}
              loading={penaltyLoading}
              userId={user?.id}
              onRefresh={fetchPenalties}
            />
          )}
        </div>
      </div>

      <PaymentModal
        open={payModal.open}
        onClose={() => setPayModal({ open: false, loan: null })}
        loan={payModal.loan}
        cbuAccount={cbuAccount}
        savingsAccount={savingsAccount}
        memberId={id}
        memberName={memberFullName}
        userId={user?.id}
        onSuccess={refreshEverything}
      />

      <DepositModal
        open={cbuModal}
        onClose={() => setCbuModal(false)}
        accountType="cbu"
        label="CBU"
        account={cbuAccount}
        memberId={id}
        memberName={memberFullName}
        userId={user?.id}
        onSuccess={refreshEverything}
      />

      <DepositModal
        open={savingsModal}
        onClose={() => setSavingsModal(false)}
        accountType="savings"
        label="Savings"
        account={savingsAccount}
        memberId={id}
        memberName={memberFullName}
        userId={user?.id}
        onSuccess={refreshEverything}
      />
    </div>
  );
}

async function createInvoiceStrict(args, label) {
  try {
    return await createInvoiceForPayment(args);
  } catch (e) {
    console.error(`[${label}] Invoice creation failed:`, e);
    throw new Error(e?.message || `${label} invoice creation failed.`);
  }
}

function PaymentModal({ open, onClose, loan, cbuAccount, savingsAccount, memberId, memberName, userId, onSuccess }) {
  const [loanAmt, setLoanAmt] = useState('');
  const [cbuAmt, setCbuAmt] = useState('');
  const [savingsAmt, setSavingsAmt] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setLoanAmt('');
      setCbuAmt('');
      setSavingsAmt('');
      setPaymentDate(new Date().toISOString().split('T')[0]);
    }
  }, [open]);

  async function handleSubmit() {
    const loanPay = parseFloat(loanAmt) || 0;
    const cbuPay = parseFloat(cbuAmt) || 0;
    const savingsPay = parseFloat(savingsAmt) || 0;

    if (loanPay + cbuPay + savingsPay === 0) {
      return toast.error('Enter at least one amount greater than zero.');
    }
    if (loanPay > 0 && !loan) {
      return toast.error('Loan record not found.');
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
    if (!paymentDate) {
      return toast.error('Payment date is required.');
    }

    setLoading(true);
    try {
      if (loanPay > 0) {
        await createTransaction({
          member_id: memberId,
          loan_id: loan.id,
          category: 'loan',
          type: 'loan_payment',
          amount: loanPay,
          reference: loan.loan_no || null,
          created_by: userId ?? null,
        });

        await createInvoiceStrict(
          {
            payment_type: 'loan_payment',
            member_id: memberId,
            member_name: memberName || 'Member',
            amount: loanPay,
            purpose: `Loan Payment — ${loan.loan_no || loan.id}`,
            ref_id: loan.id,
            created_by: userId ?? null,
            date: paymentDate,
          },
          'Loan payment'
        );
      }

      if (cbuPay > 0) {
        await createTransaction({
          member_id: memberId,
          account_id: cbuAccount.id,
          category: 'cbu',
          type: 'deposit',
          amount: cbuPay,
          reference: cbuAccount.account_no || null,
          created_by: userId ?? null,
        });

        await createInvoiceStrict(
          {
            payment_type: 'cbu',
            member_id: memberId,
            member_name: memberName || 'Member',
            amount: cbuPay,
            purpose: `CBU Deposit — ${cbuAccount.account_no || cbuAccount.id}`,
            ref_id: cbuAccount.id,
            account_id: cbuAccount.id,
            created_by: userId ?? null,
            date: paymentDate,
          },
          'CBU deposit'
        );
      }

      if (savingsPay > 0) {
        await createTransaction({
          member_id: memberId,
          account_id: savingsAccount.id,
          category: 'savings',
          type: 'deposit',
          amount: savingsPay,
          reference: savingsAccount.account_no || null,
          created_by: userId ?? null,
        });

        await createInvoiceStrict(
          {
            payment_type: 'savings',
            member_id: memberId,
            member_name: memberName || 'Member',
            amount: savingsPay,
            purpose: `Savings Deposit — ${savingsAccount.account_no || savingsAccount.id}`,
            ref_id: savingsAccount.id,
            account_id: savingsAccount.id,
            created_by: userId ?? null,
            date: paymentDate,
          },
          'Savings deposit'
        );
      }

      toast.success('Payment posted successfully.');
      await onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to post payment.');
    } finally {
      setLoading(false);
    }
  }

  const fieldClass =
    'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7EB751]';

  return (
    <Modal open={open} onClose={onClose} title="Post Payment" size="md">
      {loan && (
        <div className="mb-5 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
          <p className="text-sm font-semibold text-orange-900">
            {formatCurrency(loan.amount)} loan
          </p>
          <p className="text-sm text-orange-700 mt-1">
            Remaining balance: <span className="font-semibold">{formatCurrency(loan.balance)}</span>
          </p>
        </div>
      )}

      <p className="text-xs text-gray-400 mb-4">
        Enter amounts manually. Leave a field empty to skip that category.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Loan Payment <span className="text-gray-400">(max {formatCurrency(loan?.balance ?? 0)})</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max={loan?.balance ?? undefined}
            value={loanAmt}
            onChange={e => setLoanAmt(e.target.value)}
            placeholder="0.00"
            className={fieldClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            CBU Deposit{' '}
            <span className="text-gray-400">
              {cbuAccount ? `(current: ${formatCurrency(cbuAccount.balance)})` : '(no account yet)'}
            </span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={cbuAmt}
            onChange={e => setCbuAmt(e.target.value)}
            placeholder="0.00"
            disabled={!cbuAccount}
            className={`${fieldClass} ${!cbuAccount ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}`}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Savings Deposit{' '}
            <span className="text-gray-400">
              {savingsAccount ? `(current: ${formatCurrency(savingsAccount.balance)})` : '(no account yet)'}
            </span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={savingsAmt}
            onChange={e => setSavingsAmt(e.target.value)}
            placeholder="0.00"
            disabled={!savingsAccount}
            className={`${fieldClass} ${!savingsAccount ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}`}
          />
        </div>

        <div className="max-w-[220px]">
          <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
          <input
            type="date"
            value={paymentDate}
            onChange={e => setPaymentDate(e.target.value)}
            className={fieldClass}
          />
        </div>
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

function DepositModal({ open, onClose, accountType, label, account, memberId, memberName, userId, onSuccess }) {
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount('');
      setPaymentDate(new Date().toISOString().split('T')[0]);
    }
  }, [open]);

  async function handleSubmit() {
    const value = parseFloat(amount) || 0;
    if (value <= 0) return toast.error('Enter a valid amount greater than zero.');
    if (!account) return toast.error(`No ${label} account found for this member.`);
    if (!paymentDate) return toast.error('Payment date is required.');

    setLoading(true);
    try {
      await createTransaction({
        member_id: memberId,
        account_id: account.id,
        category: accountType,
        type: 'deposit',
        amount: value,
        reference: account.account_no || null,
        created_by: userId ?? null,
      });

      await createInvoiceStrict(
        {
          payment_type: accountType,
          member_id: memberId,
          member_name: memberName || 'Member',
          amount: value,
          purpose: `${label} Deposit — ${account.account_no || account.id}`,
          ref_id: account.id,
          account_id: account.id,
          created_by: userId ?? null,
          date: paymentDate,
        },
        `${label} deposit`
      );

      toast.success(`${label} deposit posted.`);
      await onSuccess();
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
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
          <input
            type="date"
            value={paymentDate}
            onChange={e => setPaymentDate(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
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

const MEMBERSHIP_TYPE_OPTS = [
  { value: 'associate', label: 'Associate' },
  { value: 'regular', label: 'Regular' },
];

function MembershipTab({ memberId, memberName, membership, payments, upgradeLogs, loading, userId, onRefresh }) {
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupType, setSetupType] = useState('associate');
  const [setupReq, setSetupReq] = useState('');
  const [setupPaid, setSetupPaid] = useState('');
  const [setupSaving, setSetupSaving] = useState(false);

  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payNotes, setPayNotes] = useState('');
  const [paySaving, setPaySaving] = useState(false);

  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeNotes, setUpgradeNotes] = useState('');
  const [upgrading, setUpgrading] = useState(false);

  const feeBalance = computeFeeBalance(membership);
  const isFullyPaid = membership && feeBalance <= 0;

  async function handleSetup() {
    if (!userId) return toast.error('User not authenticated');

    const req = parseFloat(setupReq) || 0;
    const paid = parseFloat(setupPaid) || 0;

    if (req <= 0) return toast.error('Fee Required must be greater than zero.');
    if (paid > req) return toast.error('Fee Paid cannot exceed Fee Required.');

    setSetupSaving(true);
    try {
      await createMembership({
        member_id: memberId,
        membership_type: setupType,
        fee_required: req,
        fee_paid_now: paid,
        created_by: userId,
      });

      if (paid > 0) {
        await createInvoiceStrict(
          {
            payment_type: 'membership',
            member_id: memberId,
            member_name: memberName || 'Member',
            amount: paid,
            purpose: 'Membership Initial Payment',
            ref_id: null,
            created_by: userId,
            date: new Date().toISOString().split('T')[0],
          },
          'Membership initial payment'
        );
      }

      toast.success('Membership record created.');
      setSetupOpen(false);
      await onRefresh();
    } catch (err) {
      toast.error(err.message || 'Failed to create membership record.');
    } finally {
      setSetupSaving(false);
    }
  }

  async function handlePayment() {
    if (!userId) return toast.error('User not authenticated');

    const amt = parseFloat(payAmount) || 0;
    if (amt <= 0) return toast.error('Enter a valid amount greater than zero.');
    if (!payDate) return toast.error('Payment date is required.');
    if (isFullyPaid) return toast.error('Membership fee is already fully paid.');

    setPaySaving(true);
    try {
      await recordMembershipPayment(
        membership.id,
        memberId,
        amt,
        payDate,
        payNotes || null,
        userId
      );

      await createInvoiceStrict(
        {
          payment_type: 'membership',
          member_id: memberId,
          member_name: memberName || 'Member',
          amount: amt,
          purpose: 'Membership Fee Payment',
          ref_id: membership.id,
          date: payDate,
          notes: payNotes || null,
          created_by: userId,
        },
        'Membership payment'
      );

      toast.success('Membership payment recorded.');
      setPayOpen(false);
      setPayAmount('');
      setPayNotes('');
      await onRefresh();
    } catch (err) {
      toast.error(err.message || 'Failed to record payment.');
    } finally {
      setPaySaving(false);
    }
  }

  async function handleUpgrade() {
    if (!userId) return toast.error('User not authenticated');

    setUpgrading(true);
    try {
      await upgradeMembership(
        membership.id,
        memberId,
        'regular',
        upgradeNotes || null,
        userId
      );
      toast.success('Member upgraded to Regular.');
      setUpgradeOpen(false);
      setUpgradeNotes('');
      await onRefresh();
    } catch (err) {
      toast.error(err.message || 'Failed to upgrade membership.');
    } finally {
      setUpgrading(false);
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  if (!membership) {
    return (
      <div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Shield size={36} className="text-gray-200 mb-3" />
          <p className="text-sm text-gray-500 mb-1 font-medium">No membership record found.</p>
          <p className="text-xs text-gray-400 mb-5">
            Set up a membership ledger to track fees and payment history.
          </p>
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => setSetupOpen(true)}>
            Set Up Membership
          </Button>
        </div>

        <Modal open={setupOpen} onClose={() => setSetupOpen(false)} title="Set Up Membership" size="md">
          <div className="space-y-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Membership Type</label>
              <select
                value={setupType}
                onChange={e => setSetupType(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7EB751] bg-white"
              >
                {MEMBERSHIP_TYPE_OPTS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Fee Required"
              value={setupReq}
              onChange={e => setSetupReq(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7EB751]"
            />

            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Initial Fee Paid"
              value={setupPaid}
              onChange={e => setSetupPaid(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7EB751]"
            />
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={() => setSetupOpen(false)} disabled={setupSaving}>
              Cancel
            </Button>
            <Button variant="primary" loading={setupSaving} onClick={handleSetup} icon={<Shield size={14} />}>
              Create Membership
            </Button>
          </div>
        </Modal>
      </div>
    );
  }

  const feeRequired = parseFloat(membership.fee_required) || 0;
  const feePaid = parseFloat(membership.fee_paid) || 0;
  const paidPct = feeRequired > 0 ? Math.min(100, (feePaid / feeRequired) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MembershipStatCard label="Fee Required" value={formatCurrency(feeRequired)} bg="bg-gray-50" textColor="text-gray-800" />
        <MembershipStatCard label="Total Paid" value={formatCurrency(feePaid)} bg="bg-green-50" textColor="text-green-700" />
        <MembershipStatCard
          label="Outstanding Balance"
          value={formatCurrency(feeBalance)}
          bg={feeBalance > 0 ? 'bg-amber-50' : 'bg-green-50'}
          textColor={feeBalance > 0 ? 'text-amber-700' : 'text-green-600'}
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
        <div className="flex items-start justify-between px-4 py-3 text-sm">
          <span className="text-gray-400 font-medium w-36 flex-shrink-0">Membership Type</span>
          <Badge variant={membership.membership_type === 'regular' ? 'info' : 'default'}>
            {membership.membership_type === 'regular' ? 'Regular' : 'Associate'}
          </Badge>
        </div>
        <div className="flex items-start justify-between px-4 py-3 text-sm">
          <span className="text-gray-400 font-medium w-36 flex-shrink-0">Status</span>
          <Badge variant={membership.status === 'active' ? 'success' : 'warning'}>
            {membership.status}
          </Badge>
        </div>
        <div className="flex items-start justify-between px-4 py-3 text-sm">
          <span className="text-gray-400 font-medium w-36 flex-shrink-0">Enrolled</span>
          <span className="text-gray-900">{formatDate(membership.created_at)}</span>
        </div>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span>Fee Payment Progress</span>
            <span>{paidPct.toFixed(0)}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${isFullyPaid ? 'bg-green-500' : 'bg-amber-400'}`}
              style={{ width: `${paidPct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {!isFullyPaid && (
          <Button
            variant="primary"
            icon={<Plus size={14} />}
            onClick={() => {
              setPayAmount('');
              setPayDate(new Date().toISOString().split('T')[0]);
              setPayNotes('');
              setPayOpen(true);
            }}
          >
            Record Payment
          </Button>
        )}
        {membership.membership_type === 'associate' && (
          <Button
            variant="blue"
            icon={<Shield size={14} />}
            onClick={() => {
              setUpgradeNotes('');
              setUpgradeOpen(true);
            }}
          >
            Upgrade to Regular
          </Button>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Payment History</h3>
        {payments.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">No payments recorded yet.</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Date', 'Amount', 'Notes', 'Recorded'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {payments.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{formatDate(p.payment_date)}</td>
                    <td className="px-4 py-3 font-semibold text-green-700">{formatCurrency(p.amount)}</td>
                    <td className="px-4 py-3 text-gray-500">{p.notes || '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{formatDateTime(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {upgradeLogs.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Upgrade History</h3>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Date', 'From', 'To', 'Notes'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {upgradeLogs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{formatDateTime(log.upgraded_at)}</td>
                    <td className="px-4 py-3 capitalize text-gray-600">{log.from_type}</td>
                    <td className="px-4 py-3 capitalize text-blue-700 font-medium">{log.to_type}</td>
                    <td className="px-4 py-3 text-gray-500">{log.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title="Record Membership Payment" size="sm">
        <p className="text-xs text-gray-400 mb-4">
          Outstanding balance: <span className="font-semibold text-amber-700">{formatCurrency(feeBalance)}</span>
        </p>
        <div className="space-y-4">
          <input
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Amount"
            value={payAmount}
            onChange={e => setPayAmount(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7EB751]"
          />
          <input
            type="date"
            value={payDate}
            onChange={e => setPayDate(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7EB751]"
          />
          <input
            type="text"
            placeholder="Optional notes..."
            value={payNotes}
            onChange={e => setPayNotes(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7EB751]"
          />
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => setPayOpen(false)} disabled={paySaving}>Cancel</Button>
          <Button variant="primary" loading={paySaving} onClick={handlePayment} icon={<DollarSign size={14} />}>
            Record Payment
          </Button>
        </div>
      </Modal>

      <Modal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} title="Upgrade to Regular Member" size="sm">
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 text-sm">
          <p className="font-medium text-blue-800">Upgrading from Associate → Regular</p>
          <p className="text-xs text-blue-600 mt-0.5">
            This will update the membership type and log the upgrade. This action cannot be undone.
          </p>
        </div>
        <div className="mb-5">
          <input
            type="text"
            placeholder="Reason for upgrade..."
            value={upgradeNotes}
            onChange={e => setUpgradeNotes(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7EB751]"
          />
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setUpgradeOpen(false)} disabled={upgrading}>Cancel</Button>
          <Button variant="blue" loading={upgrading} onClick={handleUpgrade} icon={<Shield size={14} />}>
            Confirm Upgrade
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function PenaltyTab({ memberId, penalties, loading, userId, onRefresh }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [penaltyDate, setPenaltyDate] = useState(new Date().toISOString().split('T')[0]);

  async function handleCreate() {
    const value = parseFloat(amount) || 0;
    if (!userId) return toast.error('User not authenticated');
    if (value <= 0) return toast.error('Penalty amount must be greater than zero.');

    setSaving(true);
    try {
      await createPenalty({
        member_id: memberId,
        amount: value,
        description: description || null,
        penalty_date: penaltyDate,
        created_by: userId,
      });
      toast.success('Penalty recorded.');
      setOpen(false);
      setAmount('');
      setDescription('');
      setPenaltyDate(new Date().toISOString().split('T')[0]);
      onRefresh();
    } catch (err) {
      toast.error(err.message || 'Failed to record penalty.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await deletePenalty(id);
      toast.success('Penalty deleted.');
      onRefresh();
    } catch (err) {
      toast.error(err.message || 'Failed to delete penalty.');
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  const totalPenalty = penalties.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Penalty Records</h3>
          <p className="text-xs text-gray-400 mt-1">
            Total Penalty: <span className="font-semibold text-red-600">{formatCurrency(totalPenalty)}</span>
          </p>
        </div>
        <Button size="sm" variant="outline" icon={<Plus size={14} />} onClick={() => setOpen(true)}>
          Add Penalty
        </Button>
      </div>

      {penalties.length === 0 ? (
        <EmptyState icon={BadgeAlert} message="No penalties recorded for this member." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Date', 'Amount', 'Description', 'Recorded'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {penalties.map(p => (
                <tr key={p.id}>
                  <td className="px-4 py-3">{formatDate(p.penalty_date)}</td>
                  <td className="px-4 py-3 font-semibold text-red-600">{formatCurrency(p.amount)}</td>
                  <td className="px-4 py-3 text-gray-500">{p.description || '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{formatDateTime(p.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add Penalty" size="sm">
        <div className="space-y-4">
          <input
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Amount"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <input
            type="date"
            value={penaltyDate}
            onChange={e => setPenaltyDate(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <input
            type="text"
            placeholder="Description / reason"
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={saving} variant="danger" onClick={handleCreate} icon={<BadgeAlert size={14} />}>
            Save Penalty
          </Button>
        </div>
      </Modal>
    </div>
  );
}

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

function OverviewTab({ member, displayMembershipType }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Personal Information</h3>
        <div className="space-y-0.5">
          <InfoRow icon={User} label="Full Name" value={`${member.first_name || ''} ${member.middle_initial ? `${member.middle_initial}. ` : ''}${member.last_name || ''}`.trim()} />
          <InfoRow icon={Hash} label="Member Number" value={member.member_no} />
          <InfoRow icon={Mail} label="Email" value={member.email} />
          <InfoRow icon={Phone} label="Mobile No." value={member.phone} />
          <InfoRow icon={Phone} label="Res. Tel. No." value={member.res_tel_no} />
          <InfoRow icon={MapPin} label="Address" value={member.address} />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Member Details</h3>
        <div className="space-y-0.5">
          <InfoRow icon={Calendar} label="Date Joined" value={member.date_joined ? formatDate(member.date_joined) : (member.created_at ? formatDate(member.created_at) : '—')} />
          <InfoRow icon={Calendar} label="Date of Birth" value={member.date_of_birth ? formatDate(member.date_of_birth) : '—'} />
          <InfoRow icon={User} label="Civil Status" value={member.civil_status} />
          <InfoRow icon={User} label="Sex" value={member.sex} />
          <InfoRow icon={User} label="Occupation" value={member.occupation} />
          <InfoRow icon={Shield} label="Membership Type" value={displayMembershipType ? displayMembershipType.charAt(0).toUpperCase() + displayMembershipType.slice(1) : '—'} />
          <InfoRow icon={User} label="Status" value={member.status || 'active'} />
          {member.notes && <InfoRow icon={User} label="Notes" value={member.notes} />}
        </div>
      </div>
    </div>
  );
}

function LoanTab({ loans, loanTransactions, paymentCount, memberId, navigate, onPayLoan }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Loan Records</h3>
          <p className="text-xs text-gray-400 mt-1">Loan payment count: {paymentCount}</p>
        </div>
        <Button size="sm" variant="green" onClick={() => navigate(`/loans/new?member=${memberId}`)} icon={<Plus size={14} />}>
          Add Loan
        </Button>
      </div>

      {loans.length === 0 ? (
        <EmptyState icon={CreditCard} message="No loan records for this member." />
      ) : (
        <div className="space-y-3">
          {loans.map(loan => (
            <LoanCard
              key={loan.id}
              loan={loan}
              navigate={navigate}
              onPay={onPayLoan}
              paymentCount={loanTransactions.filter(t => t.loan_id === loan.id && t.type === 'loan_payment').length}
            />
          ))}
        </div>
      )}

      {loanTransactions.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Payment History</h4>
          <HistoryTable rows={loanTransactions} />
        </div>
      )}
    </div>
  );
}

function LoanCard({ loan, navigate, onPay, paymentCount }) {
  const statusColors = {
    active: 'text-blue-700 bg-blue-50 border-blue-200',
    paid: 'text-green-700 bg-green-50 border-green-200',
    defaulted: 'text-red-700 bg-red-50 border-red-200',
    pending: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  };

  return (
    <div
      className="flex items-center justify-between p-4 rounded-lg border border-gray-100 hover:border-gray-200 bg-gray-50/50 cursor-pointer transition-colors"
      onClick={() => navigate(`/loans/${loan.id}`)}
    >
      <div>
        <p className="text-sm font-medium text-gray-800">{formatCurrency(loan.amount || 0)}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          Released: {loan.release_date ? formatDate(loan.release_date) : '—'} · Due: {loan.due_date ? formatDate(loan.due_date) : '—'}
        </p>
        <p className="text-xs text-gray-400 mt-1">Payment Count: {paymentCount}</p>
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
            onClick={e => {
              e.stopPropagation();
              onPay(loan);
            }}
            icon={<DollarSign size={13} />}
          >
            Pay
          </Button>
        )}
      </div>
    </div>
  );
}

function CBUTab({ account, transactions, paymentCount, onDeposit }) {
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
            <p className="text-xs text-gray-400 mt-1">Payment Count: {paymentCount}</p>
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

      {transactions.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Payment History</h4>
          <HistoryTable rows={transactions} />
        </div>
      )}
    </div>
  );
}

function SavingsTab({ account, transactions, paymentCount, onDeposit }) {
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
            <p className="text-xs text-gray-400 mt-1">Payment Count: {paymentCount}</p>
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

      {transactions.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Payment History</h4>
          <HistoryTable rows={transactions} />
        </div>
      )}
    </div>
  );
}

function TransactionsTab({ transactions }) {
  const typeStyles = {
    deposit: { icon: TrendingUp, color: 'text-green-600' },
    withdrawal: { icon: TrendingDown, color: 'text-red-600' },
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

function HistoryTable({ rows }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            {['Date', 'Type', 'Amount', 'Reference'].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map(row => (
            <tr key={row.id}>
              <td className="px-4 py-3">{formatDate(row.created_at || row.transaction_date || row.payment_date)}</td>
              <td className="px-4 py-3 capitalize">{(row.type || '').replace('_', ' ') || '—'}</td>
              <td className="px-4 py-3 font-medium">{formatCurrency(row.amount || 0)}</td>
              <td className="px-4 py-3 text-gray-500">{row.reference || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
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

function MembershipStatCard({ label, value, bg, textColor }) {
  return (
    <div className={`${bg} rounded-xl border border-gray-100 p-4`}>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-lg font-bold ${textColor}`}>{value}</p>
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