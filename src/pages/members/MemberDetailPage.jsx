// MemberDetailPage.jsx - Enhanced UI Design

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, User, CreditCard, PiggyBank, Wallet, ArrowLeftRight,
  Edit, Phone, Mail, MapPin, Calendar, Hash, Plus, TrendingUp,
  TrendingDown, Clock, AlertCircle, Shield, Download, BadgeAlert,
  Printer, Upload, Sprout,
} from 'lucide-react';
import PesoSign from '../../components/shared/PesoSign';
import toast from 'react-hot-toast';

import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import LoanImportModal from '../../components/shared/LoanImportModal';
import LoanScheduleTable from '../../components/shared/LoanScheduleTable';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';

import { getMemberById, initializeMemberAccounts } from '../../services/memberService';
import { getAccountsByMemberId } from '../../services/accountService';
import {
  getLoansByMemberId,
  applyLoanPaymentToSchedule,
} from '../../services/loanService';
import { getTransactionsByMemberId, createTransaction, deleteTransaction } from '../../services/transactionService';
import {
  getMembershipByMemberId,
  getMembershipPayments,
  getMembershipUpgradeLogs,
  recordMembershipPayment,
  upgradeMembership,
  createMembership,
  patchMembershipFeeRequired,
} from '../../services/membershipService';
import {
  getPenaltiesByMemberId,
  createPenalty,
  deletePenalty,
} from '../../services/penaltyService';
import { getApprovedWithdrawalVouchers } from '../../services/voucherService';
import {
  getTimeDepositsByMemberId,
  createTimeDeposit,
  recordTimeDepositPayment,
} from '../../services/timeDepositService';
import { exportMemberReport } from '../../utils/excelExport.js';
import { createInvoiceForPayment, createInvoice, checkInvoiceNoExists } from '../../services/invoiceService';
import { trackActivity } from '../../services/logService';

import { formatDate, formatCurrency, formatDateTime } from '../../utils/formatters';
import { printHtmlDocument, wrapWithLetterhead } from '../../utils/print';

const TABS = [
  { id: 'overview',        label: 'Overview',       icon: User },
  { id: 'loan',            label: 'Loans',          icon: CreditCard },
  { id: 'cbu',             label: 'CBU',            icon: PiggyBank },
  { id: 'savings',         label: 'Savings',        icon: Wallet },
  { id: 'time_deposit',    label: 'Time Deposit',   icon: Clock },
  { id: 'savings_booster', label: 'Savings Booster', icon: Sprout },
  { id: 'membership',      label: 'Membership',     icon: Shield },
  { id: 'transactions',    label: 'Transactions',   icon: ArrowLeftRight },
  { id: 'penalty',         label: 'Penalty',        icon: BadgeAlert },
  { id: 'credit_profile',  label: 'Credit Profile', icon: TrendingUp },
];

// Tabs that don't apply to Kiddy & Youth Savings members
const HIDDEN_FOR_KIDDY = new Set(['loan', 'cbu', 'penalty']);

const PAYMENT_MODE_OPTIONS = [
  { value: '', label: 'Select mode of payment' },
  { value: 'Cash', label: 'Cash' },
  { value: 'GCash', label: 'GCash' },
  { value: 'Bank Transfer', label: 'Bank Transfer' },
  { value: 'Check', label: 'Check' },
  { value: 'Others', label: 'Others' },
];

function parseJSONSafe(val, fallback = {}) {
  try {
    return typeof val === 'string' ? JSON.parse(val) : (val ?? fallback);
  } catch {
    return fallback;
  }
}

function frequencyLabel(value) {
  if (!value) return 'period';
  const map = {
    weekly: 'week',
    semi_monthly: 'semi-month',
    monthly: 'month',
    quarterly: 'quarter',
    yearly: 'year',
  };
  return map[value] || value;
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function MemberDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const canEditMember = hasPermission('members', 'edit');
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';

  const [member, setMember] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [loans, setLoans] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [payModal, setPayModal] = useState({ open: false, loan: null });
  const [cbuDepositModal, setCbuDepositModal] = useState(false);
  const [savingsDepositModal, setSavingsDepositModal] = useState(false);
  const [cbuWithdrawModal, setCbuWithdrawModal] = useState(false);
  const [savingsWithdrawModal, setSavingsWithdrawModal] = useState(false);

  const [membership, setMembership] = useState(null);
  const [membershipPayments, setMembershipPayments] = useState([]);
  const [upgradeLogs, setUpgradeLogs] = useState([]);
  const [membershipLoading, setMembershipLoading] = useState(false);

  const [penalties, setPenalties] = useState([]);
  const [penaltyLoading, setPenaltyLoading] = useState(false);

  const [memberTimeDeposits, setMemberTimeDeposits] = useState([]);
  const [timeDepositLoading, setTimeDepositLoading] = useState(false);

  const [memberBoosterSlots, setMemberBoosterSlots] = useState([]);
  const [boosterLoading, setBoosterLoading] = useState(false);

  async function fetchAll() {
    try {
      setLoading(true);

      const [memberData, initialAccounts, loansData, txData] = await Promise.all([
        getMemberById(id),
        getAccountsByMemberId(id),
        getLoansByMemberId(id),
        getTransactionsByMemberId(id),
      ]);

      let finalAccounts = initialAccounts || [];
      const accountTypes = finalAccounts.map(a => String(a.account_type).toLowerCase());

      if (!accountTypes.includes('cbu') || !accountTypes.includes('savings')) {
        await initializeMemberAccounts(id);
        finalAccounts = await getAccountsByMemberId(id);
      }

      setMember(memberData);
      setAccounts(finalAccounts || []);
      setLoans(loansData || []);
      setTransactions(txData || []);
    } catch (err) {
      console.error('[MemberDetailPage] fetchAll failed:', err);
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

  const fetchTimeDeposits = useCallback(async () => {
    try {
      setTimeDepositLoading(true);
      const data = await getTimeDepositsByMemberId(id);
      setMemberTimeDeposits(data || []);
    } catch {
      // silently fail — member_id column may not exist yet
    } finally {
      setTimeDepositLoading(false);
    }
  }, [id]);

  const fetchBoosterSlots = useCallback(async () => {
    try {
      setBoosterLoading(true);
      const { data, error } = await supabase
        .from('savings_booster')
        .select('*')
        .eq('member_id', id)
        .order('slot_number', { ascending: true });
      if (error) throw error;
      setMemberBoosterSlots(data || []);
    } catch (err) {
      console.warn('[MemberDetailPage] fetchBoosterSlots error:', err.message);
      setMemberBoosterSlots([]);
    } finally {
      setBoosterLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAll();
  }, [id]);

  useEffect(() => {
    fetchMembership();
    fetchPenalties();
    fetchTimeDeposits();
    fetchBoosterSlots();
  }, [fetchMembership, fetchPenalties, fetchTimeDeposits, fetchBoosterSlots]);

  useEffect(() => {
    if (member?.membership_type === 'kiddy' && HIDDEN_FOR_KIDDY.has(activeTab)) {
      setSearchParams({ tab: 'overview' });
    }
  }, [member, activeTab, setSearchParams]);

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
  const timeDepositTransactions = useMemo(
    () => transactions.filter(t => t.category === 'time_deposit'),
    [transactions]
  );
  const savingsBoosterTransactions = useMemo(
    () => transactions.filter(t => t.category === 'savings_booster'),
    [transactions]
  );

  const paymentHistoryRows = useMemo(() => {
    const relevant = transactions
      .filter(t => t.type === 'loan_payment')
      .sort((a, b) => {
        const aDate = a.transaction_date || a.created_at;
        const bDate = b.transaction_date || b.created_at;
        return new Date(bDate) - new Date(aDate);
      });

    const grouped = [];

    for (const tx of relevant) {
      const txDateValue = tx.transaction_date || tx.created_at;
      const txDate = new Date(txDateValue);
      const txDay = String(tx.transaction_date || txDate.toISOString().slice(0, 10));

      const last = grouped[grouped.length - 1];

      const canMerge =
        last &&
        last.created_by === (tx.created_by || 'System') &&
        last.created_by_name === (tx.created_by_name || 'System') &&
        last.tx_day === txDay &&
        last.payment_mode === (tx.payment_mode || '') &&
        last.payment_mode_note === (tx.payment_mode_note || '');

      if (canMerge) {
        last.loan_amount += Number(tx.amount || 0);

        if (txDate > new Date(last.latest_created_at)) {
          last.latest_created_at = tx.created_at;
        }

        last.ids.push(tx.id);
      } else {
        grouped.push({
          id: tx.id,
          ids: [tx.id],
          created_at: tx.created_at,
          latest_created_at: tx.created_at,
          transaction_date: tx.transaction_date || txDay,
          tx_day: txDay,
          created_by: tx.created_by || 'System',
          created_by_name: tx.created_by_name || 'System',
          payment_mode: tx.payment_mode || '',
          payment_mode_note: tx.payment_mode_note || '',
          loan_amount: Number(tx.amount || 0),
          cbu_amount: 0,
          savings_amount: 0,
        });
      }
    }

    return grouped;
  }, [transactions]);

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

  function handlePrint() {
    const fmt = (n) => 'PHP ' + Number(n ?? 0).toLocaleString('en-PH', {minimumFractionDigits:2,maximumFractionDigits:2});
    const cbuAcc = accounts.find(a => String(a.account_type).toLowerCase() === 'cbu');
    const savAcc = accounts.find(a => String(a.account_type).toLowerCase() === 'savings');
    const activeLoans = loans.filter(l => l.status === 'active');
    const loanRows = activeLoans.map(l => `<tr>
      <td>${l.loan_no||'—'}</td>
      <td style="text-transform:capitalize">${(l.loan_type||'').replace(/_/g,' ')}</td>
      <td style="text-align:right;font-weight:600">${fmt(l.principal_amount)}</td>
      <td style="text-align:right;color:#b91c1c">${fmt(l.outstanding_balance)}</td>
      <td style="text-align:center">${l.status||'—'}</td>
    </tr>`).join('');
    const html = `
      <h1 class="report-title">Member Record</h1>
      <div class="report-meta">Generated: ${new Date().toLocaleString('en-PH')} &nbsp;|&nbsp; <strong>CONFIDENTIAL</strong></div>
      <div class="section-heading">Personal Information</div>
      <div class="stats-grid" style="grid-template-columns:repeat(2,1fr)">
        <div class="stat-box"><div class="stat-label">Full Name</div><div class="stat-value" style="font-size:12pt">${member?.first_name||''} ${member?.last_name||''}</div></div>
        <div class="stat-box"><div class="stat-label">Member No.</div><div class="stat-value" style="font-size:12pt">${member?.member_no||'—'}</div></div>
        <div class="stat-box"><div class="stat-label">Type</div><div class="stat-value" style="font-size:12pt;text-transform:capitalize">${member?.membership_type||'—'}</div></div>
        <div class="stat-box"><div class="stat-label">Status</div><div class="stat-value" style="font-size:12pt;text-transform:capitalize">${member?.status||'—'}</div></div>
        <div class="stat-box"><div class="stat-label">Contact</div><div class="stat-value" style="font-size:11pt">${member?.contact_no||'—'}</div></div>
        <div class="stat-box"><div class="stat-label">Date Joined</div><div class="stat-value" style="font-size:11pt">${member?.date_joined||member?.created_at?.slice(0,10)||'—'}</div></div>
      </div>
      <div class="section-heading">Account Balances</div>
      <div class="stats-grid" style="grid-template-columns:repeat(2,1fr)">
        <div class="stat-box"><div class="stat-label">CBU Balance</div><div class="stat-value" style="font-size:12pt">${fmt(cbuAcc?.balance)}</div></div>
        <div class="stat-box"><div class="stat-label">Savings Balance</div><div class="stat-value" style="font-size:12pt">${fmt(savAcc?.balance)}</div></div>
      </div>
      ${activeLoans.length > 0 ? `
      <div class="section-heading">Active Loans</div>
      <table>
        <thead><tr><th>Loan No.</th><th>Type</th><th style="text-align:right">Principal</th><th style="text-align:right">Outstanding</th><th style="text-align:center">Status</th></tr></thead>
        <tbody>${loanRows}</tbody>
      </table>` : ''}
      <div class="confidential">WELLSERVE Cooperative Monitoring System — Authorized personnel only.</div>
    `;
    const win = printHtmlDocument(wrapWithLetterhead(html, {title:`Member — ${member?.first_name||''} ${member?.last_name||''}`}), {
      onBlocked: () => toast.error('Pop-up blocked. Please allow pop-ups and try again.'),
    });
    if (win) toast.success('Print dialog opened.');
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
    <div className="p-4 md:p-6 max-w-7xl mx-auto bg-gray-50/30 min-h-screen">
      {/* Back button */}
      <button
        onClick={() => navigate('/members')}
        className="group flex items-center gap-2 text-sm text-gray-400 hover:text-gray-700 mb-4 transition-all duration-200"
      >
        <div className="p-1 rounded-lg bg-white border border-gray-100 group-hover:border-gray-200 group-hover:shadow-sm transition-all">
          <ArrowLeft size={14} />
        </div>
        Back to Members
      </button>

      {/* ── Profile Header Card ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        <div className="relative">
          {/* Gradient banner */}
          <div className={`h-20 ${member.membership_type === 'kiddy' ? 'bg-gradient-to-r from-teal-500 to-emerald-400' : 'bg-gradient-to-r from-emerald-600 to-emerald-400'}`} />
          
          <div className="px-6 pb-6">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 -mt-10">
              <div className="flex items-end gap-4">
                <div className={`relative w-20 h-20 rounded-2xl border-4 border-white shadow-lg flex items-center justify-center text-2xl font-bold
                  ${member.membership_type === 'kiddy' ? 'bg-teal-100 text-teal-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {(member.first_name?.[0] || '') + (member.last_name?.[0] || '')}
                  <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 border-white flex items-center justify-center
                    ${member.status === 'active' ? 'bg-emerald-500' : member.status === 'closed' ? 'bg-gray-400' : 'bg-amber-500'}`}>
                    <div className={`w-2 h-2 rounded-full ${member.status === 'active' ? 'bg-white' : 'bg-white/70'}`} />
                  </div>
                </div>
                <div className="pb-1">
                  <h1 className="text-2xl font-bold text-gray-900">
                    {member.first_name} {member.last_name}
                  </h1>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {member.member_no && (
                      <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg">
                        {member.member_no}
                      </span>
                    )}
                    <Badge variant={member.status === 'active' ? 'success' : member.status === 'closed' ? 'dark' : 'warning'} dot>
                      {member.status === 'closed' ? 'Closed Account' : (member.status || 'Active')}
                    </Badge>
                    {displayMembershipType && (
                      <Badge variant={displayMembershipType === 'regular' ? 'info' : displayMembershipType === 'kiddy' ? 'success' : 'default'}>
                        {displayMembershipType === 'kiddy' ? 'Kiddy' : displayMembershipType}
                      </Badge>
                    )}
                    {member.record_type === 'old_member' && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                        Historical
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all"
                >
                  <Printer size={14} />
                  <span className="hidden sm:inline">Print</span>
                </button>
                <button
                  onClick={handleExportExcel}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all"
                >
                  <Download size={14} />
                  <span className="hidden sm:inline">Export</span>
                </button>
                {canEditMember && (
                <button
                  onClick={() => navigate(`/members/${id}/edit`)}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-xl shadow-sm transition-all
                    ${member.membership_type === 'kiddy' ? 'bg-teal-600 hover:bg-teal-700 shadow-teal-200' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'}`}
                >
                  <Edit size={14} />
                  Edit Member
                </button>
                )}
              </div>
            </div>

            {/* Quick stats */}
            <div className={`grid grid-cols-2 ${member.membership_type === 'kiddy' ? 'sm:grid-cols-2' : 'sm:grid-cols-4'} gap-3 mt-5 pt-4 border-t border-gray-100`}>
              {member.membership_type !== 'kiddy' && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-orange-50/60 border border-orange-100/50">
                  <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                    <CreditCard size={15} className="text-orange-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-orange-500 uppercase tracking-wider">Loan Balance</p>
                    <p className="text-sm font-bold text-orange-700 tabular-nums">
                      {formatCurrency(activeLoans.reduce((sum, loan) => sum + (loan.balance || 0), 0))}
                    </p>
                  </div>
                </div>
              )}
              {member.membership_type !== 'kiddy' && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-green-50/60 border border-green-100/50">
                  <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                    <PiggyBank size={15} className="text-green-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-green-500 uppercase tracking-wider">CBU Total</p>
                    <p className="text-sm font-bold text-green-700 tabular-nums">{formatCurrency(cbuAccount?.balance ?? 0)}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50/60 border border-blue-100/50">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Wallet size={15} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-[10px] font-medium text-blue-500 uppercase tracking-wider">Savings</p>
                  <p className="text-sm font-bold text-blue-700 tabular-nums">{formatCurrency(savingsAccount?.balance ?? 0)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-purple-50/60 border border-purple-100/50">
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                  <ArrowLeftRight size={15} className="text-purple-600" />
                </div>
                <div>
                  <p className="text-[10px] font-medium text-purple-500 uppercase tracking-wider">Transactions</p>
                  <p className="text-sm font-bold text-purple-700 tabular-nums">{transactions.length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Tab navigation */}
        <div className="overflow-x-auto border-b border-gray-100 scrollbar-thin scrollbar-thumb-gray-200 bg-gray-50/50">
          <div className="flex min-w-max px-2">
            {TABS.filter(tab => {
              if (member?.membership_type === 'kiddy' && HIDDEN_FOR_KIDDY.has(tab.id)) return false;
              if (tab.id === 'time_deposit') return memberTimeDeposits.length > 0;
              if (tab.id === 'savings_booster') return memberBoosterSlots.length > 0;
              return true;
            }).map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setSearchParams({ tab: tab.id })}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all duration-200 flex-shrink-0
                    ${isActive
                      ? member.membership_type === 'kiddy'
                        ? 'border-teal-500 text-teal-700 bg-teal-50/30'
                        : 'border-emerald-500 text-emerald-700 bg-emerald-50/30'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  <tab.icon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4 md:p-6">
          {activeTab === 'overview' && (
            <OverviewTab
              member={member}
              displayMembershipType={displayMembershipType}
              cbuAccount={cbuAccount}
              savingsAccount={savingsAccount}
            />
          )}

          {activeTab === 'loan' && (
            <LoanTab
              loans={loans}
              loanTransactions={loanTransactions}
              paymentCount={loanPaymentCount}
              memberId={id}
              memberName={memberFullName}
              userId={user?.id}
              navigate={navigate}
              onPayLoan={loan => setPayModal({ open: true, loan })}
              paymentHistoryRows={paymentHistoryRows}
              onRefresh={refreshEverything}
            />
          )}

          {activeTab === 'cbu' && (
            <CBUTab
              account={cbuAccount}
              transactions={cbuTransactions}
              paymentCount={cbuPaymentCount}
              onDeposit={() => setCbuDepositModal(true)}
              onWithdraw={() => setCbuWithdrawModal(true)}
            />
          )}

          {activeTab === 'savings' && (
            <SavingsTab
              account={savingsAccount}
              transactions={savingsTransactions}
              paymentCount={savingsPaymentCount}
              onDeposit={() => setSavingsDepositModal(true)}
              onWithdraw={() => setSavingsWithdrawModal(true)}
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
              cbuAccount={cbuAccount}
              savingsAccount={savingsAccount}
              onRefresh={refreshEverything}
              memberRecordType={member?.record_type}
            />
          )}

          {activeTab === 'time_deposit' && (
            <MemberTimeDepositTab
              timeDeposits={memberTimeDeposits}
              loading={timeDepositLoading}
              memberId={id}
              memberName={memberFullName}
              userId={user?.id}
              onRefresh={fetchTimeDeposits}
            />
          )}

          {activeTab === 'savings_booster' && (
            <MemberSavingsBoosterTab
              slots={memberBoosterSlots}
              transactions={savingsBoosterTransactions}
              loading={boosterLoading}
            />
          )}

          {activeTab === 'transactions' && (
            <TransactionsTab transactions={transactions} />
          )}

          {activeTab === 'penalty' && (
            <PenaltyTab
              memberId={id}
              memberName={memberFullName}
              penalties={penalties}
              loading={penaltyLoading}
              userId={user?.id}
              onRefresh={fetchPenalties}
            />
          )}

          {activeTab === 'credit_profile' && (
            <CreditProfileTab loans={loans} memberName={memberFullName} />
          )}
        </div>
      </div>

      {/* ── Modals ── */}
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
        open={cbuDepositModal}
        onClose={() => setCbuDepositModal(false)}
        accountType="cbu"
        label="CBU"
        account={cbuAccount}
        memberId={id}
        memberName={memberFullName}
        userId={user?.id}
        onSuccess={refreshEverything}
      />

      <DepositModal
        open={savingsDepositModal}
        onClose={() => setSavingsDepositModal(false)}
        accountType="savings"
        label="Savings"
        account={savingsAccount}
        memberId={id}
        memberName={memberFullName}
        userId={user?.id}
        onSuccess={refreshEverything}
      />

      <WithdrawalVoucherModal
        open={cbuWithdrawModal}
        onClose={() => setCbuWithdrawModal(false)}
        accountType="cbu"
        label="CBU"
        account={cbuAccount}
        memberId={id}
        userId={user?.id}
        onSuccess={refreshEverything}
      />

      <WithdrawalVoucherModal
        open={savingsWithdrawModal}
        onClose={() => setSavingsWithdrawModal(false)}
        accountType="savings"
        label="Savings"
        account={savingsAccount}
        memberId={id}
        userId={user?.id}
        onSuccess={refreshEverything}
      />
    </div>
  );
}

// ─── OVERVIEW TAB ────────────────────────────────────────────────────────────

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

function OverviewTab({ member, displayMembershipType, cbuAccount, savingsAccount }) {
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
          {member.membership_type === 'kiddy' ? (
            <InfoRow icon={User} label="Guardian Name" value={member.guardian_name || '—'} />
          ) : (
            <InfoRow icon={User} label="Referred By" value={member.recruiter_name || 'Self'} />
          )}
          {member.membership_type !== 'kiddy' && (
            <InfoRow icon={PiggyBank} label="CBU Account No." value={cbuAccount?.account_no || '—'} />
          )}
          <InfoRow icon={Wallet} label="Savings Account No." value={savingsAccount?.account_no || '—'} />
          <InfoRow icon={User} label="Status" value={member.status === 'closed' ? 'Closed Account' : (member.status || 'active')} />
          {member.notes && <InfoRow icon={User} label="Notes" value={member.notes} />}
        </div>
      </div>
    </div>
  );
}

// ─── LOAN TAB ─────────────────────────────────────────────────────────────────

function LoanTab({ loans, loanTransactions, paymentCount, memberId, memberName, userId, navigate, onPayLoan, paymentHistoryRows, onRefresh }) {
  const { hasPermission } = useAuth();
  const canCreateLoan = hasPermission('loans', 'create');
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Loan Records</h3>
          <p className="text-xs text-gray-400 mt-1">Loan payment count: {paymentCount}</p>
        </div>
        {canCreateLoan && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} icon={<Upload size={14} />}>
            Import Excel
          </Button>
          <Button size="sm" variant="green" onClick={() => navigate(`/loans/new?member=${memberId}`)} icon={<Plus size={14} />}>
            Add Loan
          </Button>
        </div>
        )}
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

      {paymentHistoryRows.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Payment History</h4>
          <LoanPaymentHistoryTable rows={paymentHistoryRows} />
        </div>
      )}

      <LoanImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        memberId={memberId}
        memberName={memberName}
        userId={userId}
        onImported={onRefresh}
      />
    </div>
  );
}

function LoanCard({ loan, navigate, onPay, paymentCount }) {
  const [showSchedule, setShowSchedule] = useState(false);
  const statusColors = {
    active: 'text-blue-700 bg-blue-50 border-blue-200',
    paid: 'text-green-700 bg-green-50 border-green-200',
    defaulted: 'text-red-700 bg-red-50 border-red-200',
    pending: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  };

  const summary = parseJSONSafe(loan.preview_summary_json, {});
  const schedule = parseJSONSafe(loan.preview_schedule_json, []);
  const nextDue = Array.isArray(schedule) ? schedule.find(row => !row.paid) : null;

  const scheduledPayment =
    nextDue?.remaining_due ||
    nextDue?.total_due ||
    nextDue?.payment ||
    summary?.payment_per_period ||
    0;

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/50 overflow-hidden">
      <div
        className="flex items-center justify-between p-4 hover:bg-gray-100/50 cursor-pointer transition-colors"
        onClick={() => navigate(`/loans/${loan.id}`)}
      >
        <div>
          <p className="text-sm font-medium text-gray-800">{formatCurrency(loan.amount || 0)}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Released: {loan.release_date ? formatDate(loan.release_date) : '—'}
          </p>
          <p className="text-xs text-gray-400 mt-1">Payment Count: {paymentCount}</p>

          <p className="text-xs text-blue-600 mt-1 font-medium">
            Scheduled: {formatCurrency(scheduledPayment)} / {frequencyLabel(loan.repayment_frequency)}
          </p>

          {nextDue && (
            <p className="text-xs text-orange-600 mt-0.5">
              Next Due: {formatDate(nextDue.due_date)} · {formatCurrency(nextDue.remaining_due || nextDue.total_due || nextDue.payment || 0)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-gray-400">Balance</p>
            <p className="text-sm font-semibold text-gray-800">{formatCurrency(loan.balance ?? 0)}</p>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full border font-medium ${statusColors[loan.status] || 'text-gray-600 bg-gray-100 border-gray-200'}`}>
            {loan.status || 'pending'}
          </span>
        </div>
      </div>

      {schedule.length > 0 && (
        <>
          <button
            onClick={e => { e.stopPropagation(); setShowSchedule(v => !v); }}
            className="w-full px-4 py-2 text-xs font-medium text-emerald-600 hover:bg-emerald-50 border-t border-gray-100 flex items-center justify-center gap-1 transition-colors"
          >
            {showSchedule ? 'Hide' : 'View'} Amortization Schedule ({schedule.filter(r => r.paid).length}/{schedule.length} paid)
          </button>

          {showSchedule && (
            <div className="border-t border-gray-100">
              <LoanScheduleTable
                schedule={schedule}
                frequency={loan.repayment_frequency || 'monthly'}
                loanAmount={loan.amount || 0}
                monthlyInterestRate={summary?.monthly_interest_rate ?? loan.interest_rate ?? 0}
                compact={true}
                defaultOpen={true}
                showPaymentTracking={true}
                title=""
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LoanPaymentHistoryTable({ rows }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden w-full">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            {['Date & Time', 'Loan Payment', 'Mode', 'Assisted by'].map(h => (
              <th
                key={h}
                className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map(row => (
            <tr key={row.id}>
              <td className="px-4 py-3 whitespace-nowrap">
                {formatDateTime(row.latest_created_at || row.created_at)}
              </td>
              <td className="px-4 py-3 font-medium">
                {row.loan_amount > 0 ? formatCurrency(row.loan_amount) : '—'}
              </td>
              <td className="px-4 py-3 text-gray-500">
                {row.payment_mode || '—'}
              </td>
              <td className="px-4 py-3 text-gray-500">
                {row.created_by_name || row.created_by || 'System'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── CBU TAB ─────────────────────────────────────────────────────────────────

function CBUTab({ account, transactions, paymentCount, onDeposit, onWithdraw }) {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('cbu', 'edit');
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
        {canEdit && (
        <div className="flex items-center gap-2">
          <Button onClick={onDeposit} variant="primary" icon={<TrendingUp size={14} />} size="sm">
            Deposit
          </Button>
          <Button onClick={onWithdraw} variant="danger" icon={<TrendingDown size={14} />} size="sm">
            Withdraw
          </Button>
        </div>
        )}
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

// ─── SAVINGS TAB ─────────────────────────────────────────────────────────────

function SavingsTab({ account, transactions, paymentCount, onDeposit, onWithdraw }) {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('savings', 'edit');
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
        {canEdit && (
        <div className="flex items-center gap-2">
          <Button onClick={onDeposit} variant="primary" icon={<TrendingUp size={14} />} size="sm">
            Deposit
          </Button>
          <Button onClick={onWithdraw} variant="danger" icon={<TrendingDown size={14} />} size="sm">
            Withdraw
          </Button>
        </div>
        )}
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

// ─── SAVINGS BOOSTER TAB ─────────────────────────────────────────────────────

function SavingsBoosterSlotCard({ slot }) {
  const statusStyle = {
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    matured: 'bg-blue-50 text-blue-700 border-blue-200',
    forfeited: 'bg-amber-50 text-amber-700 border-amber-200',
    withdrawn: 'bg-gray-50 text-gray-500 border-gray-200',
  }[slot.status] || 'bg-gray-50 text-gray-500 border-gray-200';

  const withdrawable = (slot.total_deposited || 0) + (slot.interest_earned || 0);

  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-800">Slot #{slot.slot_number || '—'}</p>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border capitalize ${statusStyle}`}>
          {slot.status || 'active'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <AccountInfoCell label="Start Date" value={slot.start_date ? formatDate(slot.start_date) : '—'} />
        <AccountInfoCell label="Last Deposit" value={slot.last_deposit_date ? formatDate(slot.last_deposit_date) : '—'} />
        <AccountInfoCell label="Total Deposited" value={formatCurrency(slot.total_deposited || 0)} />
        <AccountInfoCell label="Interest Earned" value={formatCurrency(slot.interest_earned || 0)} />
        <AccountInfoCell label="Weeks Deposited" value={`${slot.weeks_deposited || 0} wk(s)`} />
        <AccountInfoCell label="Total Withdrawable" value={formatCurrency(withdrawable)} />
      </div>
    </div>
  );
}

function MemberSavingsBoosterTab({ slots, transactions, loading }) {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (!slots || slots.length === 0) {
    return <EmptyState icon={Sprout} message="No Savings Booster enrollment for this member." />;
  }

  const totalDeposited = slots.reduce((s, e) => s + (e.total_deposited || 0), 0);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center">
          <Sprout size={20} className="text-teal-600" />
        </div>
        <div>
          <p className="text-xs text-gray-400">Total Deposited Across {slots.length} Slot{slots.length !== 1 ? 's' : ''}</p>
          <p className="text-2xl font-bold text-teal-700">{formatCurrency(totalDeposited)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {slots.map(slot => (
          <SavingsBoosterSlotCard key={slot.id} slot={slot} />
        ))}
      </div>

      {transactions.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Deposit History</h4>
          <HistoryTable rows={transactions} />
        </div>
      )}
    </div>
  );
}

// ─── TRANSACTIONS TAB ────────────────────────────────────────────────────────

function TransactionsTab({ transactions }) {
  const typeStyles = {
    deposit:            { icon: TrendingUp,   color: 'text-green-600'  },
    withdrawal:         { icon: TrendingDown, color: 'text-red-600'    },
    loan_payment:       { icon: TrendingDown, color: 'text-orange-600' },
    loan_release:       { icon: TrendingUp,   color: 'text-blue-600'   },
    membership_payment: { icon: TrendingDown, color: 'text-purple-600' },
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
                      {tx.type?.replace(/_/g, ' ') || 'Transaction'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {tx.category && <span className="capitalize mr-1">{tx.category} ·</span>}
                      {tx.payment_mode && <span>{tx.payment_mode} · </span>}
                      {tx.created_by_name && <span>By: {tx.created_by_name} · </span>}
                      {(tx.transaction_date || tx.created_at) ? formatDate(tx.transaction_date || tx.created_at) : '—'}
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

// ─── PENALTY TAB ─────────────────────────────────────────────────────────────

function PenaltyTab({ memberId, memberName, penalties, loading, userId, onRefresh }) {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('members', 'edit');
  const canDelete = hasPermission('members', 'delete');
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
      trackActivity({
        userId,
        module: 'member',
        action: 'create',
        description: `Penalty of ${formatCurrency(value)} recorded for member (${memberName || memberId})${description ? ': ' + description : ''}`,
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
      trackActivity({
        userId,
        module: 'member',
        action: 'delete',
        description: `Penalty (ID: ${id}) deleted for member (${memberName || memberId})`,
      });
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
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden w-full">
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

// ─── CREDIT PROFILE TAB ─────────────────────────────────────────────────────

function computeCreditProfile(loans) {
  const total        = loans.length;
  const paid         = loans.filter(l => l.status === 'paid').length;
  const active       = loans.filter(l => l.status === 'active' || l.status === 'ongoing').length;
  const overdue      = loans.filter(l => l.status === 'overdue').length;
  const defaulted    = loans.filter(l => l.status === 'defaulted').length;
  const partial      = loans.filter(l => l.status === 'partial').length;
  const totalBorrowed   = loans.reduce((s, l) => s + (l.amount || 0), 0);
  const totalOutstanding = loans.filter(l => (l.balance || 0) > 0).reduce((s, l) => s + (l.balance || 0), 0);
  const repaymentRate   = total > 0 ? Math.round((paid / total) * 100) : 0;

  let score = 0;
  if (total > 0) {
    const historyScore = Math.round(((paid + active * 0.5) / total) * 40);
    const penaltyScore = Math.max(0, 30 - defaulted * 15 - overdue * 5);
    const exposureScore = totalBorrowed > 0
      ? Math.round(((totalBorrowed - totalOutstanding) / totalBorrowed) * 30)
      : 30;
    score = Math.min(100, historyScore + penaltyScore + exposureScore);
  }

  const grade =
    score >= 85 ? 'A' :
    score >= 70 ? 'B' :
    score >= 55 ? 'C' :
    score >= 40 ? 'D' : 'F';

  const gradeColor =
    grade === 'A' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' :
    grade === 'B' ? 'text-blue-700 bg-blue-50 border-blue-200' :
    grade === 'C' ? 'text-amber-700 bg-amber-50 border-amber-200' :
    grade === 'D' ? 'text-orange-700 bg-orange-50 border-orange-200' :
                   'text-red-700 bg-red-50 border-red-200';

  const recommendations = [];
  if (defaulted > 0)       recommendations.push('Resolve defaulted loans to improve credit standing.');
  if (overdue > 0)         recommendations.push('Clear overdue obligations to avoid further penalties.');
  if (total === 0)         recommendations.push('No loan history found. First-time borrower.');
  if (repaymentRate < 50 && total > 0) recommendations.push('Improve repayment rate for better credit grade.');
  if (score >= 85)         recommendations.push('Excellent credit record. Eligible for preferential rates.');

  return { total, paid, active, overdue, defaulted, partial, totalBorrowed, totalOutstanding, repaymentRate, score, grade, gradeColor, recommendations };
}

function CreditProfileTab({ loans, memberName }) {
  const profile = useMemo(() => computeCreditProfile(loans || []), [loans]);

  const statItems = [
    { label: 'Total Loans', value: profile.total, color: 'text-gray-800' },
    { label: 'Loans Paid',  value: profile.paid,  color: 'text-emerald-700' },
    { label: 'Active',      value: profile.active, color: 'text-blue-700' },
    { label: 'Overdue',     value: profile.overdue, color: profile.overdue > 0 ? 'text-red-700' : 'text-gray-400' },
    { label: 'Defaulted',   value: profile.defaulted, color: profile.defaulted > 0 ? 'text-rose-700' : 'text-gray-400' },
    { label: 'Repayment Rate', value: `${profile.repaymentRate}%`, color: profile.repaymentRate >= 70 ? 'text-emerald-700' : 'text-orange-600' },
  ];

  return (
    <div className="space-y-5 py-1">
      {/* Score card */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex flex-col items-center gap-1">
          <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center ${profile.gradeColor}`}>
            <span className="text-3xl font-extrabold">{profile.grade}</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">Credit Grade</p>
        </div>

        <div className="flex-1">
          <p className="text-lg font-bold text-gray-900">{memberName}</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all ${
                  profile.score >= 85 ? 'bg-emerald-500' :
                  profile.score >= 70 ? 'bg-blue-500' :
                  profile.score >= 55 ? 'bg-amber-400' :
                  profile.score >= 40 ? 'bg-orange-400' : 'bg-red-500'
                }`}
                style={{ width: `${profile.score}%` }}
              />
            </div>
            <span className="text-sm font-bold text-gray-700 tabular-nums w-12 text-right">{profile.score}/100</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">Credit Score</p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {statItems.map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
            <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Exposure */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-sm font-semibold text-gray-700 mb-3">Loan Exposure</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-400 mb-1">Total Borrowed</p>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(profile.totalBorrowed)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Outstanding Balance</p>
            <p className={`text-lg font-bold ${profile.totalOutstanding > 0 ? 'text-orange-600' : 'text-emerald-700'}`}>
              {formatCurrency(profile.totalOutstanding)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Amount Repaid</p>
            <p className="text-lg font-bold text-emerald-700">
              {formatCurrency(profile.totalBorrowed - profile.totalOutstanding)}
            </p>
          </div>
        </div>
        {profile.totalBorrowed > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
              <span>Repaid</span>
              <span>{Math.round(((profile.totalBorrowed - profile.totalOutstanding) / profile.totalBorrowed) * 100)}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="h-2 rounded-full bg-emerald-500"
                style={{ width: `${Math.min(100, ((profile.totalBorrowed - profile.totalOutstanding) / profile.totalBorrowed) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Recommendations */}
      {profile.recommendations.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">Recommendations</p>
          <ul className="space-y-2">
            {profile.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                <span className="mt-0.5 w-4 h-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0 text-[10px] font-bold">{i + 1}</span>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Loan breakdown */}
      {(loans || []).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden w-full">
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">Loan History</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100">
                  {['Loan No.', 'Amount', 'Balance', 'Term', 'Status', 'Released'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loans.map(loan => (
                  <tr key={loan.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{loan.loan_no || '—'}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums">{formatCurrency(loan.amount)}</td>
                    <td className="px-4 py-3 tabular-nums">
                      <span className={(loan.balance || 0) > 0 ? 'text-orange-600 font-semibold' : 'text-emerald-600'}>
                        {formatCurrency(loan.balance ?? loan.amount)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{loan.term_months ? `${loan.term_months} mo.` : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium
                        ${loan.status === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                          loan.status === 'defaulted' ? 'bg-red-50 text-red-700' :
                          loan.status === 'overdue' ? 'bg-red-50 text-red-600' :
                          loan.status === 'active' ? 'bg-blue-50 text-blue-700' :
                          'bg-gray-100 text-gray-600'}`}>
                        {loan.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(loan.release_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── HELPER COMPONENTS ─────────────────────────────────────────────────────

function AccountInfoCell({ label, value, mono }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-gray-700 ${mono ? 'font-mono text-xs' : ''}`}>{value}</p>
    </div>
  );
}

function HistoryTable({ rows }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden w-full">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            {['Date & Time', 'Type', 'Amount', 'Mode', 'Assisted By'].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map(row => (
            <tr key={row.id}>
              <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(row.created_at || row.transaction_date || row.payment_date)}</td>
              <td className="px-4 py-3 capitalize">{(row.type || '').replace('_', ' ') || '—'}</td>
              <td className={`px-4 py-3 font-medium ${row.type === 'withdrawal' ? 'text-red-600' : ''}`}>
                {formatCurrency(row.amount || 0)}
              </td>
              <td className="px-4 py-3 text-gray-500">{row.payment_mode || '—'}</td>
              <td className="px-4 py-3 text-gray-500">{row.created_by_name || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
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

// ─── PAYMENT MODAL ───────────────────────────────────────────────────────────

async function createInvoiceStrict(args, label) {
  try {
    return await createInvoiceForPayment(args);
  } catch (e) {
    console.error(`[${label}] Invoice creation failed:`, e);
    throw new Error(e?.message || `${label} invoice creation failed.`);
  }
}

function PaymentModal({ open, onClose, loan, cbuAccount, savingsAccount, memberId, memberName, userId, onSuccess }) {
  const { hasPermission } = useAuth();
  const [loanAmt, setLoanAmt] = useState('');
  const [cbuAmt, setCbuAmt] = useState('');
  const [savingsAmt, setSavingsAmt] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [siNo, setSiNo] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const referenceRequired = ['GCash', 'Bank Transfer', 'Check'].includes(paymentMode);

  useEffect(() => {
    if (open) {
      setCbuAmt('');
      setSavingsAmt('');
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setSiNo('');
      setPaymentMode('');
      setPaymentReference('');
      setPaymentNotes('');

      if (loan) {
        const schedule = parseJSONSafe(loan.preview_schedule_json, []);
        const summary = parseJSONSafe(loan.preview_summary_json, {});
        const nextDue = Array.isArray(schedule)
          ? schedule.find(row => !row.paid)
          : null;

        const suggestedAmount =
          nextDue?.remaining_due ||
          nextDue?.total_due ||
          nextDue?.payment ||
          summary?.payment_per_period ||
          '';

        setLoanAmt(String(suggestedAmount || ''));
      } else {
        setLoanAmt('');
      }
    }
  }, [open, loan]);

  const totalPayment = useMemo(() => {
    return (parseFloat(loanAmt) || 0) + (parseFloat(cbuAmt) || 0) + (parseFloat(savingsAmt) || 0);
  }, [loanAmt, cbuAmt, savingsAmt]);

  async function handleSubmit() {
    const loanPay = parseFloat(loanAmt) || 0;
    const cbuPay = parseFloat(cbuAmt) || 0;
    const savingsPay = parseFloat(savingsAmt) || 0;

    if (loanPay > 0 && !hasPermission('loans', 'edit')) {
      return toast.error('You do not have permission to post loan payments.');
    }
    if (cbuPay > 0 && !hasPermission('cbu', 'edit')) {
      return toast.error('You do not have permission to post CBU transactions.');
    }
    if (savingsPay > 0 && !hasPermission('savings', 'edit')) {
      return toast.error('You do not have permission to post savings transactions.');
    }

    if (loanPay + cbuPay + savingsPay === 0) {
      return toast.error('Enter at least one amount greater than zero.');
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
      const duplicate = await checkInvoiceNoExists(siNo.trim());
      if (duplicate) {
        toast.error(`Invoice Number "${siNo.trim()}" is already in use. Please enter a different SI#.`);
        setLoading(false);
        return;
      }

      const paymentModeNote = [paymentReference.trim(), paymentNotes.trim()].filter(Boolean).join(' | ') || null;

      const rollbacks = [];
      async function runRollbacks() {
        for (const undo of rollbacks.reverse()) {
          try {
            await undo();
          } catch (rollbackErr) {
            console.error('[Combined payment] rollback step failed:', rollbackErr);
          }
        }
      }

      try {
        if (loanPay > 0) {
          const loanTx = await createTransaction({
            member_id: memberId,
            loan_id: loan.id,
            category: 'loan',
            type: 'loan_payment',
            amount: loanPay,
            reference: paymentReference.trim() || loan.loan_no || null,
            notes: paymentNotes.trim() || null,
            created_by: userId ?? null,
            transaction_date: paymentDate,
            payment_mode: paymentMode,
            payment_mode_note: paymentModeNote,
          });
          rollbacks.push(() => deleteTransaction(loanTx.id));

          await applyLoanPaymentToSchedule(loan.id, loanPay);
        }

        if (cbuPay > 0) {
          const cbuTx = await createTransaction({
            member_id: memberId,
            account_id: cbuAccount.id,
            category: 'cbu',
            type: 'deposit',
            amount: cbuPay,
            reference: paymentReference.trim() || cbuAccount.account_no || null,
            notes: paymentNotes.trim() || null,
            created_by: userId ?? null,
            transaction_date: paymentDate,
            payment_mode: paymentMode,
            payment_mode_note: paymentModeNote,
          });
          rollbacks.push(() => deleteTransaction(cbuTx.id));
        }

        if (savingsPay > 0) {
          const savingsTx = await createTransaction({
            member_id: memberId,
            account_id: savingsAccount.id,
            category: 'savings',
            type: 'deposit',
            amount: savingsPay,
            reference: paymentReference.trim() || savingsAccount.account_no || null,
            notes: paymentNotes.trim() || null,
            created_by: userId ?? null,
            transaction_date: paymentDate,
            payment_mode: paymentMode,
            payment_mode_note: paymentModeNote,
          });
          rollbacks.push(() => deleteTransaction(savingsTx.id));
        }

        const invoiceBreakdown = [];
        if (loanPay > 0) invoiceBreakdown.push(`Loan: ${formatCurrency(loanPay)}`);
        if (cbuPay > 0) invoiceBreakdown.push(`CBU: ${formatCurrency(cbuPay)}`);
        if (savingsPay > 0) invoiceBreakdown.push(`Savings: ${formatCurrency(savingsPay)}`);

        await createInvoiceStrict(
          {
            invoice_no: siNo.trim(),
            payment_type: 'loan_payment',
            member_id: memberId,
            member_name: memberName || 'Member',
            amount: totalPayment,
            purpose: invoiceBreakdown.length > 1 ? 'Combined Payment' : (invoiceBreakdown[0] || 'Payment'),
            ref_id: loan?.id || null,
            created_by: userId ?? null,
            date: paymentDate,
            notes: invoiceBreakdown.join(' | '),
            payment_mode: paymentMode,
            payment_mode_note: paymentModeNote,
          },
          'Combined payment'
        );
      } catch (paymentErr) {
        await runRollbacks();
        throw paymentErr;
      }

      trackActivity({
        userId,
        module: 'loan',
        action: 'payment',
        description: `Posted payment of ${formatCurrency(totalPayment)} for member (${memberName})${invoiceBreakdown.length ? ': ' + invoiceBreakdown.join(', ') : ''}`,
      });

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
    'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500';

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
            CBU Deposit <span className="text-gray-400">(current: {formatCurrency(cbuAccount?.balance ?? 0)})</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={cbuAmt}
            onChange={e => setCbuAmt(e.target.value)}
            placeholder="0.00"
            className={fieldClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Savings Deposit <span className="text-gray-400">(current: {formatCurrency(savingsAccount?.balance ?? 0)})</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={savingsAmt}
            onChange={e => setSavingsAmt(e.target.value)}
            placeholder="0.00"
            className={fieldClass}
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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">SI#</label>
          <input
            type="text"
            value={siNo}
            onChange={e => setSiNo(e.target.value)}
            placeholder="Enter SI# manually"
            className={fieldClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mode of Payment</label>
          <select
            value={paymentMode}
            onChange={e => setPaymentMode(e.target.value)}
            className={fieldClass}
          >
            {PAYMENT_MODE_OPTIONS.map(opt => (
              <option key={opt.value || 'empty'} value={opt.value}>{opt.label}</option>
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
            className={fieldClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Payment Notes</label>
          <textarea
            rows={2}
            value={paymentNotes}
            onChange={e => setPaymentNotes(e.target.value)}
            placeholder="Optional notes"
            className={`${fieldClass} resize-none`}
          />
        </div>

        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
          <p className="text-sm font-semibold text-blue-900 mb-2">Payment Summary</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-blue-800">
            <div>Loan: <span className="font-semibold">{formatCurrency(parseFloat(loanAmt) || 0)}</span></div>
            <div>CBU: <span className="font-semibold">{formatCurrency(parseFloat(cbuAmt) || 0)}</span></div>
            <div>Savings: <span className="font-semibold">{formatCurrency(parseFloat(savingsAmt) || 0)}</span></div>
          </div>
          <div className="mt-3 pt-2 border-t border-blue-200 text-sm text-blue-900">
            Total Payment: <span className="font-bold">{formatCurrency(totalPayment)}</span>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button loading={loading} variant="finance" onClick={handleSubmit} icon={<PesoSign size={15} />}>
          Post Payment
        </Button>
      </div>
    </Modal>
  );
}

// ─── DEPOSIT MODAL ───────────────────────────────────────────────────────────

function DepositModal({ open, onClose, accountType, label, account, memberId, memberName, userId, onSuccess }) {
  const { hasPermission } = useAuth();
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [siNo, setSiNo] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const referenceRequired = ['GCash', 'Bank Transfer', 'Check'].includes(paymentMode);

  useEffect(() => {
    if (open) {
      setAmount('');
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setSiNo('');
      setPaymentMode('');
      setPaymentReference('');
      setPaymentNotes('');
    }
  }, [open]);

  async function handleSubmit() {
    if (!hasPermission(accountType, 'edit')) {
      return toast.error(`You do not have permission to post ${label} transactions`);
    }
    const value = parseFloat(amount) || 0;
    if (value <= 0) return toast.error('Enter a valid amount greater than zero.');
    if (!account) return toast.error(`No ${label} account found for this member.`);
    if (!paymentDate) return toast.error('Payment date is required.');
    if (!siNo.trim()) return toast.error('SI# is required.');
    if (!paymentMode) return toast.error('Mode of payment is required.');
    if (referenceRequired && !paymentReference.trim()) {
      return toast.error('Reference / Account / Check No. is required for the selected payment mode.');
    }

    setLoading(true);
    try {
      const duplicate = await checkInvoiceNoExists(siNo.trim());
      if (duplicate) {
        toast.error(`Invoice Number "${siNo.trim()}" is already in use. Please enter a different SI#.`);
        setLoading(false);
        return;
      }

      const paymentModeNote = [paymentReference.trim(), paymentNotes.trim()].filter(Boolean).join(' | ') || null;

      const depositTx = await createTransaction({
        member_id: memberId,
        account_id: account.id,
        category: accountType,
        type: 'deposit',
        amount: value,
        reference: paymentReference.trim() || account.account_no || null,
        notes: paymentNotes.trim() || null,
        created_by: userId ?? null,
        transaction_date: paymentDate,
        payment_mode: paymentMode,
        payment_mode_note: paymentModeNote,
      });

      try {
        await createInvoiceStrict(
          {
            invoice_no: siNo.trim(),
            payment_type: accountType,
            member_id: memberId,
            member_name: memberName || 'Member',
            amount: value,
            purpose: `${label} Deposit`,
            ref_id: account.id,
            account_id: account.id,
            created_by: userId ?? null,
            date: paymentDate,
            notes: paymentNotes.trim() || null,
            payment_mode: paymentMode,
            payment_mode_note: paymentModeNote,
          },
          `${label} deposit`
        );
      } catch (invoiceErr) {
        try {
          await deleteTransaction(depositTx.id);
        } catch (rollbackErr) {
          console.error(`[${label} deposit] rollback of deposit transaction failed:`, rollbackErr);
        }
        throw invoiceErr;
      }

      trackActivity({
        userId,
        module: accountType,
        action: 'deposit',
        description: `${label} deposit of ${formatCurrency(value)} for member (${memberName}) via Member Detail`,
      });

      toast.success(`${label} deposit posted.`);
      await onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.message || `Failed to post ${label} deposit.`);
    } finally {
      setLoading(false);
    }
  }

  const fieldClass =
    'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500';

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
            className={fieldClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
          <input
            type="date"
            value={paymentDate}
            onChange={e => setPaymentDate(e.target.value)}
            className={fieldClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">SI#</label>
          <input
            type="text"
            value={siNo}
            onChange={e => setSiNo(e.target.value)}
            placeholder="Enter SI# manually"
            className={fieldClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mode of Payment</label>
          <select
            value={paymentMode}
            onChange={e => setPaymentMode(e.target.value)}
            className={fieldClass}
          >
            {PAYMENT_MODE_OPTIONS.map(opt => (
              <option key={opt.value || 'empty'} value={opt.value}>{opt.label}</option>
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
            className={fieldClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Payment Notes</label>
          <textarea
            rows={2}
            value={paymentNotes}
            onChange={e => setPaymentNotes(e.target.value)}
            placeholder="Optional notes"
            className={`${fieldClass} resize-none`}
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

// ─── WITHDRAWAL VOUCHER MODAL ──────────────────────────────────────────────

function WithdrawalVoucherModal({ open, onClose, accountType, label, account, memberId, userId, onSuccess }) {
  const { hasPermission } = useAuth();
  const [withdrawVouchers, setWithdrawVouchers] = useState([]);
  const [selectedVoucherId, setSelectedVoucherId] = useState('');
  const [loadingVouchers, setLoadingVouchers] = useState(false);
  const [posting, setPosting] = useState(false);

  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  useEffect(() => {
    async function loadVouchers() {
      if (!open) return;

      setSelectedVoucherId('');
      setAmount('');
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setPaymentMode('');
      setPaymentReference('');
      setPaymentNotes('');

      try {
        setLoadingVouchers(true);
        const vouchers = await getApprovedWithdrawalVouchers({
          member_id: memberId,
          ...(account ? { account_id: account.id } : {}),
          account_type: accountType,
        });
        setWithdrawVouchers(vouchers || []);
      } catch (err) {
        toast.error(err.message || 'Failed to load approved withdrawal vouchers.');
        setWithdrawVouchers([]);
      } finally {
        setLoadingVouchers(false);
      }
    }

    loadVouchers();
  }, [open, memberId, accountType, account]);

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

  async function handleSubmit() {
    if (!hasPermission(accountType, 'edit')) {
      return toast.error(`You do not have permission to post ${label || accountType} transactions`);
    }
    const voucher = withdrawVouchers.find(v => v.id === selectedVoucherId);
    const value = parseFloat(amount) || 0;

    if (!voucher) return toast.error('Select an approved withdrawal voucher first.');
    if (value <= 0) return toast.error('Voucher amount must be greater than zero.');
    if (!paymentDate) return toast.error('Withdrawal date is required.');
    if (account && value > (parseFloat(account.balance) || 0)) {
      return toast.error(`Withdrawal exceeds current balance of ${formatCurrency(account.balance || 0)}.`);
    }

    setPosting(true);
    try {
      const paymentModeNote =
        [paymentReference.trim(), paymentNotes.trim()].filter(Boolean).join(' | ') || null;

      await createTransaction({
        member_id: memberId,
        ...(account ? { account_id: account.id } : {}),
        category: accountType,
        type: 'withdrawal',
        amount: value,
        reference: voucher.voucher_no || paymentReference.trim() || (account ? account.account_no : null) || null,
        notes: [
          `Voucher: ${voucher.voucher_no}`,
          voucher.purpose ? `Purpose: ${voucher.purpose}` : null,
          paymentNotes.trim() || voucher.notes || null,
        ].filter(Boolean).join(' | '),
        created_by: userId ?? null,
        transaction_date: paymentDate,
        payment_mode: paymentMode || voucher.payment_mode || null,
        payment_mode_note: paymentModeNote || voucher.reference || null,
      });

      trackActivity({
        userId,
        module: accountType,
        action: 'withdrawal',
        description: `${label} withdrawal of ${formatCurrency(value)} via voucher ${voucher.voucher_no} via Member Detail`,
      });

      toast.success(`${label} withdrawal posted from approved voucher.`);
      await onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.message || `Failed to post ${label} withdrawal.`);
    } finally {
      setPosting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`${label} Withdrawal from Approved Voucher`} size="sm">
      {account && (
        <p className="text-sm text-gray-500 mb-4">
          Current balance: <span className="font-semibold text-gray-800">{formatCurrency(account.balance)}</span>
        </p>
      )}

      {loadingVouchers ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : withdrawVouchers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No approved member withdrawal vouchers found for this {label} account.
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
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          loading={posting}
          variant="danger"
          onClick={handleSubmit}
          icon={<TrendingDown size={15} />}
          disabled={!selectedVoucherId || loadingVouchers || withdrawVouchers.length === 0}
        >
          Post Withdrawal
        </Button>
      </div>
    </Modal>
  );
}

// ─── MEMBERSHIP TAB ─────────────────────────────────────────────────────────

const MEMBERSHIP_TYPE_OPTS = [
  { value: 'associate', label: 'Associate' },
  { value: 'regular', label: 'Regular' },
];

const NEW_ITEM_CATEGORIES = {
  membership_fee:  'membership',
  vip_card:        'membership',
  cbu:             'cbu',
  cbu_assoc:       'cbu',
  admin_fees:      'membership',
  savings_deposit: 'savings',
  min_cbu:         'cbu',
};

const MEMBERSHIP_FEES = {
  associate: {
    entry: 300, cbu: 1000, savings: 500, total: 1800,
    rows: [['Membership Entry', 300, 'entry'], ['Initial CBU', 1000, 'cbu'], ['Initial Savings', 500, 'savings']],
  },
  regular: {
    entry: 1800, cbu: 4000, savings: 1000, total: 6800,
    rows: [['Membership Entry', 1800, 'entry'], ['Initial CBU', 4000, 'cbu'], ['Initial Savings', 1000, 'savings']],
  },
  new_associate: {
    entry: 400, cbu: 500, savings: 0, total: 900,
    rows: [
      ['Membership Fee',   100, 'membership_fee'],
      ['WELLife VIP Card', 300, 'vip_card'],
      ['Initial CBU',      500, 'cbu'],
    ],
  },
  new_regular: {
    entry: 1400, cbu: 4000, savings: 500, total: 5900,
    rows: [
      ['Membership Fee',          100,  'membership_fee'],
      ['WELLife VIP Card',        300,  'vip_card'],
      ['Initial CBU',             500,  'cbu_assoc'],
      ['Admin & Regulatory Fees', 1000, 'admin_fees'],
      ['Initial Savings Deposit', 500,  'savings_deposit'],
      ['Minimum CBU',             3500, 'min_cbu'],
    ],
  },
};

function MembershipTab({ memberId, memberName, membership, payments, upgradeLogs, loading, userId, cbuAccount, savingsAccount, onRefresh, memberRecordType }) {
  const { hasPermission } = useAuth();
  const canEditMember = hasPermission('members', 'edit');
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupType, setSetupType] = useState('associate');
  const [setupRecordType, setSetupRecordType] = useState(
    memberRecordType === 'old_member' ? 'old_member' : 'new_member'
  );
  const [setupSaving, setSetupSaving] = useState(false);

  const [payOpen, setPayOpen] = useState(false);
  const [payTotalAmount, setPayTotalAmount] = useState('');
  const [payEntry, setPayEntry] = useState('');
  const [payCbu, setPayCbu] = useState('');
  const [paySavings, setPaySavings] = useState('');
  const [paySiNo, setPaySiNo] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payMode, setPayMode] = useState('');
  const [payReference, setPayReference] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [paySaving, setPaySaving] = useState(false);

  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeNotes, setUpgradeNotes] = useState('');
  const [upgrading, setUpgrading] = useState(false);

  const isNewMember = memberRecordType === 'new_member';

  const feeKey = memberRecordType === 'new_member'
    ? `new_${membership?.membership_type}`
    : (membership?.membership_type ?? '');
  const membershipFees = MEMBERSHIP_FEES[feeKey] || null;
  const storedFeeRequired = parseFloat(membership?.fee_required) || 0;
  const feePaid = parseFloat(membership?.fee_paid) || 0;
  const effectiveFeeRequired = membershipFees
    ? Math.max(storedFeeRequired, membershipFees.total)
    : storedFeeRequired;
  const feeBalance = Math.max(0, effectiveFeeRequired - feePaid);
  const isFullyPaid = membership != null && feeBalance <= 0;
  const isSetupNewMember = setupRecordType === 'new_member';
  const setupFeeKey = isSetupNewMember ? `new_${setupType}` : setupType;
  const setupFees = MEMBERSHIP_FEES[setupFeeKey] || MEMBERSHIP_FEES.associate;

  const perComponentTotals = useMemo(() => {
    return (payments || []).reduce((acc, p) => {
      try {
        const data = JSON.parse(p.notes || '{}');
        if (typeof data !== 'object' || data === null) return acc;
        if ('entry' in data) {
          acc.entry   = (acc.entry   || 0) + Number(data.entry   || 0);
          acc.cbu     = (acc.cbu     || 0) + Number(data.cbu     || 0);
          acc.savings = (acc.savings || 0) + Number(data.savings || 0);
        } else {
          Object.entries(data).forEach(([key, val]) => {
            if (key !== 'text') acc[key] = (acc[key] || 0) + Number(val || 0);
          });
        }
      } catch { /* plain text notes — skip */ }
      return acc;
    }, {});
  }, [payments]);

  const allocationPreview = useMemo(() => {
    if (!isNewMember || !membershipFees?.rows) return [];
    const amount = parseFloat(payTotalAmount) || 0;
    if (amount <= 0) return [];
    let remaining = amount;
    return membershipFees.rows.map(([label, itemAmount, key]) => {
      const alreadyPaid = perComponentTotals[key] || 0;
      const itemRemaining = Math.max(0, itemAmount - alreadyPaid);
      const allocate = Math.min(remaining, itemRemaining);
      if (allocate > 0) remaining -= allocate;
      return { key, label, itemAmount, alreadyPaid, allocate };
    });
  }, [isNewMember, membershipFees, payTotalAmount, perComponentTotals]);

  const ITEM_LABELS = {
    membership_fee:  'Membership Fee',
    vip_card:        'WELLife VIP Card',
    cbu:             'Initial CBU',
    cbu_assoc:       'Initial CBU',
    admin_fees:      'Admin & Reg. Fees',
    savings_deposit: 'Savings Deposit',
    min_cbu:         'Minimum CBU',
  };

  function parsePaymentNotes(notes) {
    try {
      const data = JSON.parse(notes || '{}');
      if (typeof data !== 'object' || data === null) return notes || '—';
      if ('entry' in data) {
        const parts = [];
        if (data.entry   > 0) parts.push(`Entry ₱${Number(data.entry).toLocaleString()}`);
        if (data.cbu     > 0) parts.push(`CBU ₱${Number(data.cbu).toLocaleString()}`);
        if (data.savings > 0) parts.push(`Savings ₱${Number(data.savings).toLocaleString()}`);
        return [parts.join(' · '), data.text].filter(Boolean).join(' | ') || '—';
      }
      const parts = Object.entries(data)
        .filter(([key, val]) => key !== 'text' && Number(val) > 0)
        .map(([key, val]) => `${ITEM_LABELS[key] || key.replace(/_/g, ' ')}: ₱${Number(val).toLocaleString()}`);
      return [parts.join(' · '), data.text].filter(Boolean).join(' | ') || '—';
    } catch {
      return notes || '—';
    }
  }

  async function handleSetup() {
    if (!userId) return toast.error('User not authenticated');
    if (!canEditMember) return toast.error('You do not have permission to edit members');
    setSetupSaving(true);
    try {
      await createMembership({
        member_id: memberId,
        membership_type: setupType,
        fee_required: setupFees.total,
        fee_paid_now: isSetupNewMember ? 0 : setupFees.total,
        is_historical: !isSetupNewMember,
        notes: isSetupNewMember
          ? null
          : `Historical record — membership fully paid before system. Breakdown: Entry ${formatCurrency(setupFees.entry)}, CBU ${formatCurrency(setupFees.cbu)}, Savings ${formatCurrency(setupFees.savings)}`,
        created_by: userId,
      });
      trackActivity({
        userId,
        module: 'member',
        action: 'create',
        description: `Set up ${isSetupNewMember ? 'new' : 'old / historical'} ${setupType} membership for member (${memberName}), total fee: ${formatCurrency(setupFees.total)}`,
      });
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
    if (!canEditMember) return toast.error('You do not have permission to edit members');
    if (!payDate) return toast.error('Payment date is required.');
    if (!payMode) return toast.error('Mode of payment is required.');
    if (isFullyPaid) return toast.error('Membership fee is already fully paid.');

    if (paySiNo.trim()) {
      const duplicate = await checkInvoiceNoExists(paySiNo.trim());
      if (duplicate) {
        return toast.error(`Invoice Number "${paySiNo.trim()}" is already in use. Please enter a different SI#.`);
      }
    }

    let total, breakdownNote, membershipAmt, cbuAmt, savingsAmt, parts;
    let membershipItems = [], cbuParts = [], savingsParts = [];

    if (isNewMember && membershipFees?.rows) {
      const amount = parseFloat(payTotalAmount) || 0;
      if (amount <= 0) return toast.error('Enter an amount greater than zero.');

      let remaining = amount;
      const allocation = {};
      for (const [, itemAmount, key] of membershipFees.rows) {
        if (remaining <= 0) break;
        const alreadyPaid = perComponentTotals[key] || 0;
        const itemRemaining = Math.max(0, itemAmount - alreadyPaid);
        const allocate = Math.min(remaining, itemRemaining);
        if (allocate > 0) {
          allocation[key] = allocate;
          remaining -= allocate;
        }
      }

      if (Object.keys(allocation).length === 0) {
        return toast.error('No remaining balance to pay for any item.');
      }

      total = Object.values(allocation).reduce((s, v) => s + v, 0);
      breakdownNote = JSON.stringify({
        ...allocation,
        ...(payNotes.trim() ? { text: payNotes.trim() } : {}),
      });

      membershipAmt = Object.entries(allocation)
        .filter(([k]) => NEW_ITEM_CATEGORIES[k] === 'membership')
        .reduce((s, [, v]) => s + v, 0);
      cbuAmt = Object.entries(allocation)
        .filter(([k]) => NEW_ITEM_CATEGORIES[k] === 'cbu')
        .reduce((s, [, v]) => s + v, 0);
      savingsAmt = Object.entries(allocation)
        .filter(([k]) => NEW_ITEM_CATEGORIES[k] === 'savings')
        .reduce((s, [, v]) => s + v, 0);

      membershipItems = Object.entries(allocation)
        .filter(([k]) => NEW_ITEM_CATEGORIES[k] === 'membership')
        .map(([k, v]) => ({ amount: v, label: ITEM_LABELS[k] || k }));
      cbuParts = Object.entries(allocation)
        .filter(([k]) => NEW_ITEM_CATEGORIES[k] === 'cbu')
        .map(([k, v]) => `${ITEM_LABELS[k] || k}: ${formatCurrency(v)}`);
      savingsParts = Object.entries(allocation)
        .filter(([k]) => NEW_ITEM_CATEGORIES[k] === 'savings')
        .map(([k, v]) => `${ITEM_LABELS[k] || k}: ${formatCurrency(v)}`);

      parts = Object.entries(allocation)
        .map(([k, v]) => `${ITEM_LABELS[k] || k}: ${formatCurrency(v)}`);
    } else {
      const entry = parseFloat(payEntry) || 0;
      const cbu = parseFloat(payCbu) || 0;
      const savings = parseFloat(paySavings) || 0;
      total = entry + cbu + savings;
      if (total <= 0) return toast.error('Enter at least one amount greater than zero.');

      membershipAmt = entry;
      cbuAmt = cbu;
      savingsAmt = savings;
      if (entry > 0) membershipItems = [{ amount: entry, label: 'Membership Entry' }];
      if (cbu > 0) cbuParts = [`CBU: ${formatCurrency(cbu)}`];
      if (savings > 0) savingsParts = [`Savings: ${formatCurrency(savings)}`];
      breakdownNote = JSON.stringify({
        entry, cbu, savings,
        ...(payNotes.trim() ? { text: payNotes.trim() } : {}),
      });
      parts = [];
      if (entry > 0) parts.push(`Entry ${formatCurrency(entry)}`);
      if (cbu > 0) parts.push(`CBU ${formatCurrency(cbu)}`);
      if (savings > 0) parts.push(`Savings ${formatCurrency(savings)}`);
    }

    setPaySaving(true);
    try {
      if (storedFeeRequired < effectiveFeeRequired) {
        await patchMembershipFeeRequired(membership.id, effectiveFeeRequired);
      }

      await recordMembershipPayment(membership.id, memberId, total, payDate, breakdownNote, userId);

      const payModeNote = [payReference.trim(), payNotes.trim()].filter(Boolean).join(' | ') || null;

      for (const item of membershipItems) {
        await createTransaction({
          member_id: memberId,
          category: 'membership',
          type: 'membership_payment',
          amount: item.amount,
          notes: [item.label, payNotes.trim()].filter(Boolean).join(' — '),
          created_by: userId,
          transaction_date: payDate,
          payment_mode: payMode || null,
          payment_mode_note: payModeNote,
        });
      }

      if (cbuAmt > 0 && cbuAccount) {
        await createTransaction({
          member_id: memberId,
          account_id: cbuAccount.id,
          category: 'cbu',
          type: 'deposit',
          amount: cbuAmt,
          reference: cbuAccount.account_no || null,
          notes: [cbuParts.join(' · ') || 'Initial CBU (Membership)', payNotes.trim()].filter(Boolean).join(' — '),
          created_by: userId,
          transaction_date: payDate,
          payment_mode: payMode || null,
          payment_mode_note: payModeNote,
        });
      }

      if (savingsAmt > 0 && savingsAccount) {
        await createTransaction({
          member_id: memberId,
          account_id: savingsAccount.id,
          category: 'savings',
          type: 'deposit',
          amount: savingsAmt,
          reference: savingsAccount.account_no || null,
          notes: [savingsParts.join(' · ') || 'Initial Savings (Membership)', payNotes.trim()].filter(Boolean).join(' — '),
          created_by: userId,
          transaction_date: payDate,
          payment_mode: payMode || null,
          payment_mode_note: payModeNote,
        });
      }

      if (paySiNo.trim()) {
        await createInvoiceStrict(
          {
            invoice_no: paySiNo.trim(),
            payment_type: 'membership',
            member_id: memberId,
            member_name: memberName || 'Member',
            amount: total,
            purpose: parts.length > 1 ? 'Membership Payment' : (parts[0] || 'Membership Payment'),
            ref_id: membership.id,
            date: payDate,
            notes: [...parts, payNotes.trim()].filter(Boolean).join(' | '),
            created_by: userId,
          },
          'Membership payment'
        );
      }

      trackActivity({
        userId,
        module: 'member',
        action: 'payment',
        description: `Membership payment of ${formatCurrency(total)} for member (${memberName})${parts.length ? ': ' + parts.join(', ') : ''}`,
      });

      toast.success('Membership payment recorded.');
      setPayOpen(false);
      setPayTotalAmount('');
      setPayEntry('');
      setPayCbu('');
      setPaySavings('');
      setPaySiNo('');
      setPayMode('');
      setPayReference('');
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
    if (!canEditMember) return toast.error('You do not have permission to edit members');
    setUpgrading(true);
    try {
      await upgradeMembership(membership.id, memberId, 'regular', upgradeNotes || null, userId);
      trackActivity({
        userId,
        module: 'member',
        action: 'update',
        description: `Membership upgraded to Regular for member (${memberName})`,
      });
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

  const fieldClass = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500';

  function openPayModal() {
    if (!canEditMember) {
      toast.error('You do not have permission to edit members');
      return;
    }
    setPayEntry('');
    setPayCbu('');
    setPaySavings('');
    setPaySiNo('');
    setPayDate(new Date().toISOString().split('T')[0]);
    setPayMode('');
    setPayReference('');
    setPayNotes('');
    setPayOpen(true);
  }

  if (!membership) {
    return (
      <div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Shield size={36} className="text-gray-200 mb-3" />
          <p className="text-sm text-gray-500 mb-1 font-medium">No membership record found.</p>
          <p className="text-xs text-gray-400 mb-5">
            Set up a membership ledger to track fees and payment history.
          </p>
          {canEditMember && (
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => setSetupOpen(true)}>
            Set Up Membership
          </Button>
          )}
        </div>

        <Modal open={setupOpen} onClose={() => setSetupOpen(false)} title="Set Up Membership" size="md">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Record Type</label>
              <span
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 ${
                  isSetupNewMember
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                {isSetupNewMember ? 'New Membership' : 'Old / Historical Membership'}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <select
                value={setupRecordType}
                onChange={e => setSetupRecordType(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                <option value="new_member">New Membership — current fee structure</option>
                <option value="old_member">Old / Historical Membership — previous fee structure</option>
              </select>
              <p className="text-[11px] text-gray-400">
                {isSetupNewMember
                  ? 'Ledger starts unpaid — use "Record Payment" to log onboarding payments.'
                  : 'Marked fully paid immediately using the previous fee structure — no payment record needed.'}
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Membership Type</label>
              <select
                value={setupType}
                onChange={e => setSetupType(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                {MEMBERSHIP_TYPE_OPTS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2 border-b border-gray-100">
                Fee Breakdown
              </p>
              <div className="divide-y divide-gray-100">
                {[
                  [isSetupNewMember ? 'Membership Fees' : 'Membership Entry', setupFees.entry],
                  ['Initial CBU', setupFees.cbu],
                  ['Initial Savings', setupFees.savings],
                ].map(([label, amount]) => (
                  <div key={label} className="flex justify-between items-center px-4 py-2.5 text-sm">
                    <span className="text-gray-600">{label}</span>
                    <span className="font-medium text-gray-800">{formatCurrency(amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center px-4 py-2.5 text-sm font-semibold bg-emerald-50">
                  <span className="text-emerald-800">Total</span>
                  <span className="text-emerald-700">{formatCurrency(setupFees.total)}</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-400">
              {isSetupNewMember
                ? 'Use "Record Payment" after setup to log partial or full payments.'
                : 'Historical records are recorded as fully paid at setup — no further payment needed.'}
            </p>
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

  const paidPct = effectiveFeeRequired > 0 ? Math.min(100, (feePaid / effectiveFeeRequired) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
            <Shield size={20} className="text-emerald-600" />
          </div>
          <div>
            <p className="text-xs text-gray-400">Outstanding Balance</p>
            <p className={`text-2xl font-bold ${feeBalance > 0 ? 'text-amber-600' : 'text-green-600'}`}>
              {formatCurrency(feeBalance)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {isFullyPaid
                ? 'Fully Paid'
                : `${formatCurrency(feePaid)} paid of ${formatCurrency(effectiveFeeRequired)}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEditMember && membership.membership_type === 'associate' && (
            <Button variant="blue" icon={<Shield size={14} />} size="sm" onClick={() => { setUpgradeNotes(''); setUpgradeOpen(true); }}>
              Upgrade to Regular
            </Button>
          )}
        </div>
      </div>

      {membershipFees && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden w-full">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5 border-b border-gray-100">
            Payment Breakdown — {membership.membership_type === 'regular' ? 'Regular' : 'Associate'}
          </p>
          <div className="divide-y divide-gray-50">
            {(membershipFees.rows || [
              ['Membership Entry', membershipFees.entry,   'entry'],
              ['Initial CBU',      membershipFees.cbu,     'cbu'],
              ['Initial Savings',  membershipFees.savings, 'savings'],
            ]).map(([label, target, componentKey]) => {
              const paid = perComponentTotals[componentKey] ?? 0;
              const remaining = Math.max(0, target - paid);
              const pct = target > 0 ? Math.min(100, (paid / target) * 100) : 0;
              return (
                <div key={label} className="px-4 py-3">
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="text-gray-600">{label}</span>
                    <span className="text-xs text-gray-500">
                      <span className="font-semibold text-green-700">{formatCurrency(paid)}</span>
                      <span className="text-gray-400"> / {formatCurrency(target)}</span>
                      {remaining > 0 && (
                        <span className="ml-2 text-amber-600 font-medium">({formatCurrency(remaining)} left)</span>
                      )}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : 'bg-amber-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="flex justify-between items-center px-4 py-2.5 text-sm font-semibold bg-gray-50">
              <span className="text-gray-700">Total</span>
              <span className={feeBalance > 0 ? 'text-amber-700' : 'text-green-700'}>
                {formatCurrency(feePaid)} / {formatCurrency(effectiveFeeRequired)}
              </span>
            </div>
          </div>
        </div>
      )}

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
            <span>Overall Payment Progress</span>
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

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Payment History</h3>
        {payments.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">No payments recorded yet.</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden w-full">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Date', 'Amount', 'Breakdown / Notes', 'Recorded'].map(h => (
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
                    <td className="px-4 py-3 text-gray-500">{parsePaymentNotes(p.notes)}</td>
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
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden w-full">
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
        <div className="mb-4 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5">
          <p className="text-xs text-amber-700">
            Outstanding: <span className="font-bold">{formatCurrency(feeBalance)}</span>
            {membershipFees?.rows && (
              <span className="text-amber-600 ml-2">
                ({membershipFees.rows.map(([label, amount]) => `${label} ₱${amount.toLocaleString()}`).join(' · ')})
              </span>
            )}
          </p>
        </div>
        <div className="space-y-3">
          {isNewMember && membershipFees?.rows ? (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Payment Amount <span className="text-red-400">*</span>
                </label>
                <input type="number" step="0.01" min="0" placeholder="0.00"
                  value={payTotalAmount} onChange={e => setPayTotalAmount(e.target.value)} className={fieldClass} />
                {allocationPreview.length > 0 && (
                  <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 space-y-1">
                    <p className="text-xs font-semibold text-blue-700 mb-1.5">Allocation Preview</p>
                    {allocationPreview.map(({ key, label, itemAmount, alreadyPaid, allocate }) => {
                      const isComplete = alreadyPaid >= itemAmount;
                      return (
                        <div key={key} className="flex justify-between text-xs">
                          <span className="text-gray-600">
                            {label}
                            <span className="text-gray-400 ml-1">(₱{itemAmount.toLocaleString()})</span>
                          </span>
                          <span className={
                            isComplete ? 'text-green-600 font-medium'
                            : allocate > 0 ? 'text-blue-700 font-semibold'
                            : 'text-gray-400'
                          }>
                            {isComplete ? '✓ Fully paid' : allocate > 0 ? `+${formatCurrency(allocate)}` : '—'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 flex justify-between text-sm">
                <span className="text-gray-500">Total</span>
                <span className="font-semibold text-gray-800">{formatCurrency(parseFloat(payTotalAmount) || 0)}</span>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Membership Entry <span className="text-gray-400">(optional)</span>
                </label>
                <input type="number" step="0.01" min="0"
                  placeholder={membershipFees ? `e.g. ₱${membershipFees.entry.toLocaleString()}` : '0.00'}
                  value={payEntry} onChange={e => setPayEntry(e.target.value)} className={fieldClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  CBU <span className="text-gray-400">(optional)</span>
                </label>
                <input type="number" step="0.01" min="0"
                  placeholder={membershipFees ? `e.g. ₱${membershipFees.cbu.toLocaleString()}` : '0.00'}
                  value={payCbu} onChange={e => setPayCbu(e.target.value)} className={fieldClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Savings <span className="text-gray-400">(optional)</span>
                </label>
                <input type="number" step="0.01" min="0"
                  placeholder={membershipFees ? `e.g. ₱${membershipFees.savings.toLocaleString()}` : '0.00'}
                  value={paySavings} onChange={e => setPaySavings(e.target.value)} className={fieldClass} />
              </div>
              <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 flex justify-between text-sm">
                <span className="text-gray-500">Total</span>
                <span className="font-semibold text-gray-800">
                  {formatCurrency((parseFloat(payEntry) || 0) + (parseFloat(payCbu) || 0) + (parseFloat(paySavings) || 0))}
                </span>
              </div>
            </>
          )}
          <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className={fieldClass} />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Mode of Payment <span className="text-red-400">*</span>
            </label>
            <select
              value={payMode}
              onChange={e => setPayMode(e.target.value)}
              className={fieldClass + ' bg-white'}
            >
              {PAYMENT_MODE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Reference / Account / Check No. <span className="text-gray-400">(optional)</span>
            </label>
            <input type="text" placeholder="e.g. GCash ref, account no., check no."
              value={payReference} onChange={e => setPayReference(e.target.value)} className={fieldClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              SI# <span className="text-gray-400">(optional — recorded in Invoice)</span>
            </label>
            <input type="text" placeholder="Enter SI# manually"
              value={paySiNo} onChange={e => setPaySiNo(e.target.value)} className={fieldClass} />
          </div>
          <input type="text" placeholder="Notes (optional)"
            value={payNotes} onChange={e => setPayNotes(e.target.value)} className={fieldClass} />
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => setPayOpen(false)} disabled={paySaving}>Cancel</Button>
          <Button variant="finance" loading={paySaving} onClick={handlePayment} icon={<PesoSign size={14} />}>
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
          <input type="text" placeholder="Reason for upgrade..."
            value={upgradeNotes} onChange={e => setUpgradeNotes(e.target.value)}
            className={fieldClass} />
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

// ─── TIME DEPOSIT TAB ──────────────────────────────────────────────────────

const TD_PAYMENT_MODES = ['Cash', 'GCash', 'Bank Transfer', 'Check', 'Others'];

const EMPTY_TD_FORM = {
  date_applied: new Date().toISOString().split('T')[0],
  terms: '',
  amount: '',
  interest_rate: '',
  si_number: '',
  payment_mode: '',
  termination_date: '',
};

function MemberTimeDepositTab({ timeDeposits, loading, memberId, memberName, userId, onRefresh }) {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('time_deposit', 'create');
  const canEdit = hasPermission('time_deposit', 'edit');
  const [addOpen, setAddOpen]         = useState(false);
  const [tdForm, setTdForm]           = useState(EMPTY_TD_FORM);
  const [addSaving, setAddSaving]     = useState(false);

  const [payTarget, setPayTarget]     = useState(null);
  const [payAmount, setPayAmount]     = useState('');
  const [payDate, setPayDate]         = useState(new Date().toISOString().split('T')[0]);
  const [paySiNo, setPaySiNo]         = useState('');
  const [payMode, setPayMode]         = useState('');
  const [paying, setPaying]           = useState(false);

  const [withdrawOpen, setWithdrawOpen]   = useState(false);

  const tdFieldClass = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500';

  function openAdd() {
    if (!canCreate) {
      toast.error('You do not have permission to create time deposit applications');
      return;
    }
    setTdForm({ ...EMPTY_TD_FORM, date_applied: new Date().toISOString().split('T')[0] });
    setAddOpen(true);
  }

  function openPay(td) {
    if (!canEdit) {
      toast.error('You do not have permission to edit time deposit records');
      return;
    }
    setPayTarget(td);
    setPayAmount('');
    setPayDate(new Date().toISOString().split('T')[0]);
    setPaySiNo('');
    setPayMode('');
  }

  async function handleAdd() {
    if (!canCreate) return toast.error('You do not have permission to create time deposit applications');
    if (!tdForm.si_number.trim()) return toast.error('SI# is required.');
    if (!tdForm.payment_mode) return toast.error('Mode of payment is required.');
    if (!tdForm.terms || parseFloat(tdForm.terms) <= 0) return toast.error('Terms (months) is required.');
    if (!tdForm.amount || parseFloat(tdForm.amount) <= 0) return toast.error('Amount is required.');
    if (!tdForm.interest_rate && tdForm.interest_rate !== '0') return toast.error('Interest rate is required.');

    setAddSaving(true);
    try {
      const duplicate = await checkInvoiceNoExists(tdForm.si_number.trim());
      if (duplicate) {
        toast.error(`Invoice Number "${tdForm.si_number.trim()}" is already in use. Please enter a different SI#.`);
        setAddSaving(false);
        return;
      }

      const amt = parseFloat(tdForm.amount);
      const newTd = await createTimeDeposit({
        ...tdForm,
        name: memberName || 'Member',
        member_id: memberId,
      });

      await createInvoice({
        invoice_no:   tdForm.si_number.trim(),
        date:         tdForm.date_applied,
        payee:        memberName || 'Member',
        purpose:      `New Time Deposit — ${memberName || 'Member'}`,
        amount:       amt,
        status:       'paid',
        payment_type: 'time_deposit',
        payment_mode: tdForm.payment_mode || null,
        created_by:   userId ?? null,
        member_id:    memberId,
        ref_id:       newTd.id,
        account_id:   null,
        fund_added:   false,
      });

      await createTransaction({
        category:         'time_deposit',
        type:             'deposit',
        amount:           amt,
        transaction_date: tdForm.date_applied,
        created_by:       userId ?? null,
        reference:        tdForm.si_number.trim(),
        notes:            `New Time Deposit — ${memberName || 'Member'}`,
        payment_mode:     tdForm.payment_mode || null,
        member_id:        memberId,
      });

      trackActivity({
        userId,
        module: 'time_deposit',
        action: 'create',
        description: `New time deposit for ${memberName} — SI# ${tdForm.si_number.trim()}, ${formatCurrency(amt)}`,
      });

      toast.success('Time Deposit added.');
      setAddOpen(false);
      await onRefresh();
    } catch (err) {
      toast.error(err.message || 'Failed to add time deposit.');
    } finally {
      setAddSaving(false);
    }
  }

  async function handlePay() {
    if (!canEdit) return toast.error('You do not have permission to edit time deposit records');
    const value = parseFloat(payAmount) || 0;
    if (!paySiNo.trim()) return toast.error('SI# is required.');
    if (value <= 0) return toast.error('Enter a valid amount.');
    if (!payDate) return toast.error('Payment date is required.');
    if (!payMode) return toast.error('Mode of payment is required.');

    setPaying(true);
    try {
      const duplicate = await checkInvoiceNoExists(paySiNo.trim());
      if (duplicate) {
        toast.error(`Invoice Number "${paySiNo.trim()}" is already in use. Please enter a different SI#.`);
        setPaying(false);
        return;
      }

      await recordTimeDepositPayment({
        time_deposit_id: payTarget.id,
        amount:          value,
        payment_date:    payDate,
        si_number:       paySiNo.trim(),
        created_by:      userId ?? null,
      });

      await createInvoice({
        invoice_no:   paySiNo.trim(),
        date:         payDate,
        payee:        memberName || payTarget.name,
        purpose:      `Time Deposit Payment — ${memberName || payTarget.name}`,
        amount:       value,
        status:       'paid',
        payment_type: 'time_deposit',
        payment_mode: payMode,
        created_by:   userId ?? null,
        member_id:    memberId,
        ref_id:       payTarget.id,
        account_id:   null,
        fund_added:   false,
      });

      await createTransaction({
        category:         'time_deposit',
        type:             'deposit',
        amount:           value,
        transaction_date: payDate,
        created_by:       userId ?? null,
        reference:        paySiNo.trim(),
        notes:            `Time Deposit Payment — ${memberName || payTarget.name}`,
        payment_mode:     payMode,
        member_id:        memberId,
      });

      trackActivity({
        userId,
        module: 'time_deposit',
        action: 'create',
        description: `Time deposit payment for ${memberName} — SI# ${paySiNo.trim()}, ${formatCurrency(value)}`,
      });

      toast.success(`Payment recorded. SI# ${paySiNo.trim()}`);
      setPayTarget(null);
      await onRefresh();
    } catch (err) {
      toast.error(err.message || 'Failed to record payment.');
    } finally {
      setPaying(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-16"><Spinner /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Time Deposit Accounts</h3>
        {canCreate && (
        <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={openAdd}>
          Add Time Deposit
        </Button>
        )}
      </div>

      {(!timeDeposits || timeDeposits.length === 0) ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400">
          <Clock size={36} className="mx-auto mb-2 text-gray-200" />
          <p className="text-sm font-medium text-gray-500">No Time Deposit</p>
          <p className="text-xs text-gray-400 mt-1">Click "Add Time Deposit" to create the first record.</p>
        </div>
      ) : (
        timeDeposits.map(td => {
          const totalPaid = (td.time_deposit_payments || []).reduce((s, p) => s + (p.amount || 0), 0);
          const isActive  = td.status === 'Active';
          const maturityDate = td.termination_date
            ? formatDate(td.termination_date)
            : td.date_applied
            ? (() => {
                const d = new Date(td.date_applied);
                d.setMonth(d.getMonth() + (td.terms || 0));
                return formatDate(d.toISOString().slice(0, 10));
              })()
            : '—';

          return (
            <div key={td.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden w-full">
              <div className="px-5 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{td.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Applied: {formatDate(td.date_applied)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={isActive ? 'success' : 'default'} dot>
                    {td.status || 'Active'}
                  </Badge>
                  {canEdit && (
                  <Button variant="danger" size="sm" icon={<TrendingDown size={12} />} onClick={() => setWithdrawOpen(true)}>
                    Withdraw
                  </Button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y divide-gray-50">
                {[
                  ['Amount', formatCurrency(td.amount || 0)],
                  ['Terms', `${td.terms || 0} month${td.terms !== 1 ? 's' : ''}`],
                  ['Interest Rate', `${td.interest_rate || 0}%`],
                  ['Maturity Date', maturityDate],
                ].map(([label, value]) => (
                  <div key={label} className="px-4 py-3">
                    <p className="text-xs text-gray-400">{label}</p>
                    <p className="text-sm font-semibold text-gray-800 mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
              {td.time_deposit_payments && td.time_deposit_payments.length > 0 && (
                <div className="border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-2 bg-gray-50">
                    Payment History
                  </p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-50 bg-gray-50">
                        {['SI#', 'Date', 'Amount'].map(h => (
                          <th key={h} className="px-4 py-2 text-left font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {td.time_deposit_payments.map(p => (
                        <tr key={p.id}>
                          <td className="px-4 py-2 text-gray-500">{p.si_number || '—'}</td>
                          <td className="px-4 py-2 text-gray-500">{formatDate(p.payment_date)}</td>
                          <td className="px-4 py-2 font-medium text-gray-800">{formatCurrency(p.amount || 0)}</td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50">
                        <td colSpan={2} className="px-4 py-2 font-semibold text-gray-600">Total Paid</td>
                        <td className="px-4 py-2 font-bold text-emerald-700">{formatCurrency(totalPaid)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Time Deposit" size="sm">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date Applied</label>
            <input type="date" value={tdForm.date_applied}
              onChange={e => setTdForm(f => ({ ...f, date_applied: e.target.value }))}
              className={tdFieldClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Terms (months) <span className="text-red-400">*</span></label>
            <input type="number" min="1" placeholder="12" value={tdForm.terms}
              onChange={e => setTdForm(f => ({ ...f, terms: e.target.value }))}
              className={tdFieldClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Amount (₱) <span className="text-red-400">*</span></label>
            <input type="number" min="0" step="0.01" placeholder="0.00" value={tdForm.amount}
              onChange={e => setTdForm(f => ({ ...f, amount: e.target.value }))}
              className={tdFieldClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Interest Rate (%) <span className="text-red-400">*</span></label>
            <input type="number" min="0" step="0.01" placeholder="5.00" value={tdForm.interest_rate}
              onChange={e => setTdForm(f => ({ ...f, interest_rate: e.target.value }))}
              className={tdFieldClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Termination Date <span className="text-gray-400">(optional)</span></label>
            <input type="date" value={tdForm.termination_date}
              onChange={e => setTdForm(f => ({ ...f, termination_date: e.target.value }))}
              className={tdFieldClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">SI# <span className="text-red-400">*</span></label>
            <input type="text" placeholder="e.g. TD-20260429-0001" value={tdForm.si_number}
              onChange={e => setTdForm(f => ({ ...f, si_number: e.target.value }))}
              className={tdFieldClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Mode of Payment <span className="text-red-400">*</span></label>
            <select value={tdForm.payment_mode}
              onChange={e => setTdForm(f => ({ ...f, payment_mode: e.target.value }))}
              className={tdFieldClass + ' bg-white'}>
              <option value="">Select mode of payment</option>
              {TD_PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => setAddOpen(false)} disabled={addSaving}>Cancel</Button>
          <Button variant="primary" loading={addSaving} onClick={handleAdd} icon={<Plus size={14} />}>
            Submit
          </Button>
        </div>
      </Modal>

      <WithdrawalVoucherModal
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        accountType="time_deposit"
        label="Time Deposit"
        account={null}
        memberId={memberId}
        userId={userId}
        onSuccess={async () => { setWithdrawOpen(false); await onRefresh(); }}
      />

      <Modal open={!!payTarget} onClose={() => setPayTarget(null)} title="Record Time Deposit Payment" size="sm">
        {payTarget && (
          <>
            <div className="mb-4 p-3 bg-indigo-50 rounded-xl border border-indigo-100 text-sm">
              <p className="font-semibold text-indigo-800">{payTarget.name}</p>
              <p className="text-xs text-indigo-600 mt-0.5">
                {formatCurrency(payTarget.amount)} · {payTarget.terms} months · {parseFloat(payTarget.interest_rate || 0).toFixed(2)}% interest
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">SI# <span className="text-red-400">*</span></label>
                <input type="text" placeholder="Enter SI# manually" value={paySiNo}
                  onChange={e => setPaySiNo(e.target.value)} className={tdFieldClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Amount Paid (₱) <span className="text-red-400">*</span></label>
                <input type="number" min="0" step="0.01" placeholder="0.00" value={payAmount}
                  onChange={e => setPayAmount(e.target.value)} className={tdFieldClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Payment Date <span className="text-red-400">*</span></label>
                <input type="date" value={payDate}
                  onChange={e => setPayDate(e.target.value)} className={tdFieldClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mode of Payment <span className="text-red-400">*</span></label>
                <select value={payMode} onChange={e => setPayMode(e.target.value)}
                  className={tdFieldClass + ' bg-white'}>
                  <option value="">Select mode of payment</option>
                  {TD_PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={() => setPayTarget(null)} disabled={paying}>Cancel</Button>
              <Button variant="finance" loading={paying} onClick={handlePay} icon={<PesoSign size={14} />}>
                Record Payment
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}