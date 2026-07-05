import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Eye,
  Trash2,
  Search,
  CreditCard,
  Calendar,
  Wallet,
  Layers3,
  AlertCircle,
  Printer,
  Download,
  Upload,
  LayoutGrid,
  TrendingUp,
  TrendingDown,
  Briefcase,
  Heart,
  Bike,
  Sliders,
} from 'lucide-react';
import PesoSign from '../../components/shared/PesoSign';
import { exportToCSV } from '../../utils/csvExport';
import toast from 'react-hot-toast';
import LoanImportModal from '../../components/shared/LoanImportModal';
import LoanTypeModal from '../../components/shared/LoanTypeModal';

import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import Modal from '../../components/ui/Modal';

import {
  getLoans,
  deleteLoan,
  applyLoanPaymentToSchedule,
  updateLoan,
} from '../../services/loanService';
import { getAccountsByMemberId } from '../../services/accountService';
import {
  getMembershipByMemberId,
  recordMembershipPayment,
  computeFeeBalance,
} from '../../services/membershipService';
import { createPenalty } from '../../services/penaltyService';
import { createInvoiceForPayment, checkInvoiceNoExists } from '../../services/invoiceService';
import { createTransaction } from '../../services/transactionService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { printHtmlDocument } from '../../utils/print';
import { useAuth } from '../../context/AuthContext';
import { trackActivity } from '../../services/logService';

const statusVariant = {
  active: 'success',
  ongoing: 'success',
  paid: 'info',
  defaulted: 'danger',
  pending: 'warning',
};

const FREQUENCY_FILTER_OPTIONS = [
  { value: 'all', label: 'All Frequency' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'semi_monthly', label: 'Semi-Monthly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

const METHOD_FILTER_OPTIONS = [
  { value: 'all', label: 'All Method' },
  { value: 'straight', label: 'Straight' },
  { value: 'diminishing', label: 'Diminishing' },
];

const DUE_FILTER_OPTIONS = [
  { value: 'all', label: 'All Due Status' },
  { value: 'due_7', label: 'Due in 7 Days' },
  { value: 'due_2', label: 'Due in 2 Days' },
  { value: 'overdue', label: 'Overdue' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'defaulted', label: 'Defaulted' },
];

const PAYMENT_MODE_OPTIONS = [
  { value: '', label: 'Select mode of payment' },
  { value: 'Cash', label: 'Cash' },
  { value: 'GCash', label: 'GCash' },
  { value: 'Bank Transfer', label: 'Bank Transfer' },
  { value: 'Check', label: 'Check' },
  { value: 'Others', label: 'Others' },
];

const PRODUCT_TABS = [
  { value: 'all',                    label: 'All Products',           icon: LayoutGrid },
  { value: 'beneficial_straight',    label: 'Beneficial (Straight)',  icon: TrendingUp },
  { value: 'beneficial_diminishing', label: 'Beneficial (Dim.)',      icon: TrendingDown },
  { value: 'productive',             label: 'WELLife Productive',     icon: Briefcase },
  { value: 'providential',           label: 'Providential',           icon: Heart },
  { value: 'financing',              label: 'Financing',              icon: Bike },
  { value: 'custom',                 label: 'Custom / Other',         icon: Sliders },
];

function titleCase(value) {
  if (!value) return '—';
  return String(value)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, m => m.toUpperCase());
}

function frequencyLabel(value) {
  if (!value) return '—';

  const map = {
    weekly: 'Weekly',
    semi_monthly: 'Semi-Monthly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    yearly: 'Yearly',
  };

  return map[value] || titleCase(value);
}

function parseJSONSafe(val, fallback = {}) {
  try {
    return typeof val === 'string' ? JSON.parse(val) : (val ?? fallback);
  } catch {
    return fallback;
  }
}

function getNextDueInfo(loan) {
  const schedule = parseJSONSafe(loan?.preview_schedule_json, []);
  const nextDue = Array.isArray(schedule) ? schedule.find(row => !row.paid) : null;

  const dueDate = nextDue?.due_date || loan?.due_date || null;
  if (!dueDate) {
    return {
      dueDate: null,
      badge: null,
      diffDays: null,
    };
  }

  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const due = new Date(dueDate);
  const dueOnly = new Date(due.getFullYear(), due.getMonth(), due.getDate());

  const diffMs = dueOnly.getTime() - todayOnly.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      dueDate,
      diffDays,
      badge: {
        label: 'Overdue',
        className: 'bg-red-50 text-red-700 border border-red-200',
      },
    };
  }

  if (diffDays <= 2) {
    return {
      dueDate,
      diffDays,
      badge: {
        label: 'Due in 2 Days',
        className: 'bg-amber-50 text-amber-700 border border-amber-200',
      },
    };
  }

  if (diffDays <= 7) {
    return {
      dueDate,
      diffDays,
      badge: {
        label: 'Due in 7 Days',
        className: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
      },
    };
  }

  return {
    dueDate,
    diffDays,
    badge: null,
  };
}

export default function LoansPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [frequencyFilter, setFrequencyFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [dueFilter, setDueFilter] = useState('all');
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [statusSavingId, setStatusSavingId] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [loanTypeModalOpen, setLoanTypeModalOpen] = useState(false);
  const [productFilter, setProductFilter] = useState('all');

  const [payModal, setPayModal] = useState({
    open: false,
    loan: null,
  });

  useEffect(() => {
    fetchLoans();
  }, []);

  async function fetchLoans() {
    try {
      setLoading(true);
      setLoans(await getLoans());
    } catch {
      toast.error(
        (t) => (
          <span className="flex items-center gap-3 text-sm">
            Failed to load loans
            <button
              className="flex-shrink-0 text-xs font-bold underline"
              onClick={() => { toast.dismiss(t.id); fetchLoans(); }}
            >
              Retry
            </button>
          </span>
        ),
        { duration: 6000 }
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!toDelete) return;

    setDeleting(true);
    try {
      await deleteLoan(toDelete.id);
      toast.success('Loan deleted');
      trackActivity({ userId: user?.id, module: 'loan', action: 'delete', description: `Deleted loan ID: ${toDelete.id}` });
      setLoans(prev => prev.filter(l => l.id !== toDelete.id));
      setToDelete(null);
    } catch {
      toast.error('Failed to delete loan');
    } finally {
      setDeleting(false);
    }
  }

  async function handleStatusChange(loan, newStatus) {
    if (!loan?.id || !newStatus || newStatus === loan.status) return;

    try {
      setStatusSavingId(loan.id);
      await updateLoan(loan.id, { status: newStatus });
      toast.success('Loan status updated');
      trackActivity({ userId: user?.id, module: 'loan', action: newStatus, description: `Loan status changed to ${newStatus} (ID: ${loan.id})` });
      await fetchLoans();
    } catch (err) {
      toast.error(err.message || 'Failed to update loan status');
    } finally {
      setStatusSavingId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return loans.filter(loan => {
      const memberName = `${loan.members?.first_name || ''} ${loan.members?.last_name || ''}`.toLowerCase();
      const matchesSearch =
        !q ||
        memberName.includes(q) ||
        (loan.members?.member_no || '').toLowerCase().includes(q) ||
        (loan.purpose || '').toLowerCase().includes(q) ||
        titleCase(loan.loan_method).toLowerCase().includes(q) ||
        frequencyLabel(loan.repayment_frequency).toLowerCase().includes(q);

      const matchesFrequency =
        frequencyFilter === 'all' || (loan.repayment_frequency || '') === frequencyFilter;

      const matchesMethod =
        methodFilter === 'all' || (loan.loan_method || '') === methodFilter;

      const dueInfo = getNextDueInfo(loan);
      let matchesDue = true;

      if (dueFilter === 'due_7') {
        matchesDue = dueInfo.diffDays !== null && dueInfo.diffDays >= 0 && dueInfo.diffDays <= 7;
      } else if (dueFilter === 'due_2') {
        matchesDue = dueInfo.diffDays !== null && dueInfo.diffDays >= 0 && dueInfo.diffDays <= 2;
      } else if (dueFilter === 'overdue') {
        matchesDue = dueInfo.diffDays !== null && dueInfo.diffDays < 0;
      }

      const matchesProduct =
        productFilter === 'all' || (loan.loan_product || '') === productFilter;

      return matchesSearch && matchesFrequency && matchesMethod && matchesDue && matchesProduct;
    });
  }, [loans, search, frequencyFilter, methodFilter, dueFilter, productFilter]);

  const stats = useMemo(() => {
    const activeLoans = loans.filter(l => l.status === 'active' || l.status === 'ongoing');
    const totalReleased = loans.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
    const totalOutstanding = activeLoans.reduce((sum, l) => sum + (Number(l.balance) || 0), 0);

    return {
      total: loans.length,
      active: activeLoans.length,
      totalReleased,
      totalOutstanding,
    };
  }, [loans]);

  function handlePrint() {
    const rowsHtml = filtered.map(loan => {
      const memberName = `${loan.members?.first_name || ''} ${loan.members?.last_name || ''}`.trim() || '—';
      const dueInfo = getNextDueInfo(loan);

      return `
        <tr>
          <td>${memberName}<br/><span>${loan.members?.member_no || '—'}</span></td>
          <td style="text-align:right;">${formatCurrency(loan.amount || 0)}</td>
          <td style="text-align:right;">${formatCurrency(loan.balance ?? loan.amount ?? 0)}</td>
          <td>${titleCase(loan.loan_method)}</td>
          <td>${frequencyLabel(loan.repayment_frequency)}</td>
          <td>${loan.term_months || '—'}</td>
          <td>${formatDate(loan.release_date || loan.created_at)}</td>
          <td>${formatDate(dueInfo.dueDate)}</td>
          <td>${titleCase(loan.status || '—')}</td>
        </tr>
      `;
    }).join('');

    printHtmlDocument(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8"/>
          <title>Loans Report</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; color: #111827; padding: 24px; }
            .header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #059669; padding-bottom: 12px; margin-bottom: 18px; }
            h1 { margin: 0; font-size: 20px; letter-spacing: 0.08em; }
            .subtitle { margin: 4px 0 0; color: #059669; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; }
            .meta { text-align: right; font-size: 11px; color: #6b7280; line-height: 1.5; }
            .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
            .summary div { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; }
            .summary span { display: block; color: #6b7280; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; }
            .summary strong { display: block; margin-top: 4px; font-size: 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #e5e7eb; padding: 7px; vertical-align: top; }
            th { background: #f3f4f6; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
            td span { color: #6b7280; font-size: 10px; }
            @page { size: A4 landscape; margin: 12mm; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>WELLSERVE</h1>
              <p class="subtitle">Loans Report</p>
            </div>
            <div class="meta">
              Generated: ${new Date().toLocaleString()}<br/>
              ${filtered.length} of ${loans.length} loans
            </div>
          </div>

          <div class="summary">
            <div><span>Total Loans</span><strong>${stats.total}</strong></div>
            <div><span>Total Released</span><strong>${formatCurrency(stats.totalReleased)}</strong></div>
            <div><span>Outstanding Balance</span><strong>${formatCurrency(stats.totalOutstanding)}</strong></div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th style="text-align:right;">Amount</th>
                <th style="text-align:right;">Balance</th>
                <th>Method</th>
                <th>Frequency</th>
                <th>Term</th>
                <th>Released</th>
                <th>Due Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="9" style="text-align:center; padding:16px;">No loans found.</td></tr>'}
            </tbody>
          </table>
        </body>
      </html>
    `, {
      width: 1200,
      height: 900,
      onBlocked: () => toast.error('Unable to open print preview.'),
    });
  }

  function handleExportCSV() {
    try {
      if (filtered.length === 0) { toast.error('No loans to export.'); return; }
      const rows = filtered.map(l => ({
        member: `${l.members?.first_name || ''} ${l.members?.last_name || ''}`.trim(),
        member_no: l.members?.member_no || '',
        amount: l.amount || 0,
        balance: l.balance ?? l.amount,
        method: titleCase(l.loan_method),
        frequency: frequencyLabel(l.repayment_frequency),
        term_months: l.term_months || '',
        released: formatDate(l.release_date || l.created_at),
        status: l.status || '',
      }));
      exportToCSV('loans_report.csv', rows);
      toast.success('CSV exported successfully');
    } catch (err) {
      toast.error(err.message || 'Failed to export CSV');
    }
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Loans"
        subtitle="Manage and monitor member loans"
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" icon={<Upload size={15} />} onClick={() => setImportOpen(true)}>
              Import Excel
            </Button>
            <Button icon={<Plus size={15} />} onClick={() => setLoanTypeModalOpen(true)}>
              New Loan
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 mb-5">
        <SummaryCard
          icon={<CreditCard size={18} className="text-blue-600" />}
          label="Total Loans"
          value={String(stats.total)}
          bg="bg-blue-50"
        />
        <SummaryCard
          icon={<Wallet size={18} className="text-green-600" />}
          label="Total Released"
          value={formatCurrency(stats.totalReleased)}
          bg="bg-green-50"
        />
        <SummaryCard
          icon={<Layers3 size={18} className="text-orange-600" />}
          label="Outstanding Balance"
          value={formatCurrency(stats.totalOutstanding)}
          bg="bg-orange-50"
        />
      </div>

      {/* Product Tabs */}
      <div className="mt-5 flex gap-2 flex-wrap print:hidden">
        {PRODUCT_TABS.map(tab => {
          const Icon = tab.icon;
          const count = tab.value === 'all'
            ? loans.length
            : loans.filter(l => (l.loan_product || '') === tab.value).length;
          const isActive = productFilter === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => setProductFilter(tab.value)}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all
                ${isActive
                  ? 'bg-[#07A04E] text-white shadow-sm shadow-green-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }
              `}
            >
              <Icon size={15} />
              {tab.label}
              <span className={`
                text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center
                ${isActive
                  ? 'bg-white/20 text-white'
                  : 'bg-gray-200 text-gray-500'
                }
              `}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 mb-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder="Search by member, member no., purpose, method..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl
                focus:outline-none focus:ring-2 focus:ring-[#07A04E] focus:border-transparent
                w-80 bg-white shadow-sm"
            />
          </div>

          <select
            value={frequencyFilter}
            onChange={e => setFrequencyFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#07A04E]"
          >
            {FREQUENCY_FILTER_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <select
            value={methodFilter}
            onChange={e => setMethodFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#07A04E]"
          >
            {METHOD_FILTER_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <select
            value={dueFilter}
            onChange={e => setDueFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#07A04E]"
          >
            {DUE_FILTER_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          {!loading && (
            <p className="text-xs text-gray-400 mr-2">
              {filtered.length} of {loans.length} loans
            </p>
          )}
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
          >
            <Printer size={14} />
            Print
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100">
                  {[
                    'Member',
                    'Amount',
                    'Balance',
                    'Method',
                    'Frequency',
                    'Term',
                    'Released',
                    'Due Date',
                    'Status',
                    'Actions',
                  ].map((h, i) => (
                    <th
                      key={h}
                      className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide ${
                        i === 1 || i === 2 ? 'text-right' : i === 9 ? 'text-right' : 'text-left'
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
                    <td colSpan={10} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-2 text-gray-400">
                        <CreditCard size={32} className="text-gray-200" />
                        <p className="text-sm">
                          {search || frequencyFilter !== 'all' || methodFilter !== 'all' || dueFilter !== 'all'
                            ? 'No loans match your search/filter.'
                            : 'No loans yet.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map(loan => {
                    const dueInfo = getNextDueInfo(loan);

                    return (
                      <tr
                        key={loan.id}
                        className="hover:bg-[#D6FADC]/25 transition-colors group"
                      >
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-900">
                            {loan.members?.first_name} {loan.members?.last_name}
                          </p>
                          {loan.members?.member_no && (
                            <p className="text-xs text-gray-400 font-mono mt-0.5">
                              {loan.members.member_no}
                            </p>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold text-gray-900">
                            {formatCurrency(loan.amount)}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-right">
                          <span
                            className={`font-semibold ${
                              (loan.balance ?? loan.amount) > 0 ? 'text-orange-600' : 'text-green-600'
                            }`}
                          >
                            {formatCurrency(loan.balance ?? loan.amount)}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-gray-600 text-xs">
                          <span className="inline-flex items-center px-2 py-1 rounded-lg bg-gray-100 text-gray-700">
                            {titleCase(loan.loan_method || 'diminishing')}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-gray-600 text-xs">
                          <span className="inline-flex items-center px-2 py-1 rounded-lg bg-blue-50 text-blue-700">
                            {frequencyLabel(loan.repayment_frequency)}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {loan.term_months ? `${loan.term_months} mo.` : '—'}
                        </td>

                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Calendar size={12} className="text-gray-300" />
                            <span>{formatDate(loan.release_date || loan.created_at)}</span>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          <div className="space-y-1">
                            <div className="text-gray-600">
                              {dueInfo.dueDate ? formatDate(dueInfo.dueDate) : '—'}
                            </div>
                            {dueInfo.badge && (
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium ${dueInfo.badge.className}`}>
                                <AlertCircle size={11} />
                                {dueInfo.badge.label}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <select
                            value={loan.status || 'pending'}
                            onChange={e => handleStatusChange(loan, e.target.value)}
                            disabled={statusSavingId === loan.id}
                            className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#07A04E]"
                          >
                            {STATUS_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => navigate(`/loans/${loan.id}`)}
                              title="View loan"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            >
                              <Eye size={15} />
                            </button>

                            <button
                              onClick={() => setToDelete(loan)}
                              title="Delete loan"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/50 flex items-center justify-between">
              <p className="text-xs text-gray-400">
                Showing <span className="font-medium text-gray-600">{filtered.length}</span> of{' '}
                <span className="font-medium text-gray-600">{loans.length}</span> loans
              </p>
              <p className="text-xs font-medium" style={{ color: '#273C2C' }}>
                Total outstanding:{' '}
                {formatCurrency(
                  filtered
                    .filter(l => l.status === 'active' || l.status === 'ongoing')
                    .reduce((s, l) => s + (l.balance || 0), 0)
                )}
              </p>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Loan"
        message="Delete this loan record? This cannot be undone."
      />

      <LoansPaymentModal
        open={payModal.open}
        onClose={() => setPayModal({ open: false, loan: null })}
        loan={payModal.loan}
        userId={user?.id}
        onSuccess={fetchLoans}
      />

      <LoanImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        userId={user?.id}
        onImported={fetchLoans}
      />

      <LoanTypeModal
        open={loanTypeModalOpen}
        onClose={() => setLoanTypeModalOpen(false)}
        onContinue={(loanType) => navigate(`/loans/new?loan_type=${loanType}`)}
      />
    </div>
  );
}

function LoansPaymentModal({ open, onClose, loan, userId, onSuccess }) {
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);

  const [memberAccounts, setMemberAccounts] = useState({
    cbu: null,
    savings: null,
  });
  const [membership, setMembership] = useState(null);

  const [loanAmt, setLoanAmt] = useState('');
  const [cbuAmt, setCbuAmt] = useState('');
  const [savingsAmt, setSavingsAmt] = useState('');
  const [membershipAmt, setMembershipAmt] = useState('');
  const [penaltyAmt, setPenaltyAmt] = useState('');
  const [penaltyDescription, setPenaltyDescription] = useState('');
  const [withOthers, setWithOthers] = useState(false);
  const [othersPurpose, setOthersPurpose] = useState('');
  const [othersAmt, setOthersAmt] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [siNo, setSiNo] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  const memberName = `${loan?.members?.first_name || ''} ${loan?.members?.last_name || ''}`.trim() || 'Member';

  useEffect(() => {
    async function bootstrap() {
      if (!open || !loan?.member_id) return;

      setLoadingData(true);
      try {
        const [accounts, memberMembership] = await Promise.all([
          getAccountsByMemberId(loan.member_id),
          getMembershipByMemberId(loan.member_id),
        ]);

        const cbu = (accounts || []).find(a => String(a.account_type).toLowerCase() === 'cbu') || null;
        const savings = (accounts || []).find(a => String(a.account_type).toLowerCase() === 'savings') || null;

        setMemberAccounts({ cbu, savings });
        setMembership(memberMembership || null);

        const schedule = parseJSONSafe(loan.preview_schedule_json, []);
        const summary = parseJSONSafe(loan.preview_summary_json, {});
        const nextDue = Array.isArray(schedule) ? schedule.find(row => !row.paid) : null;

        const suggestedLoanAmount =
          nextDue?.remaining_due ||
          nextDue?.total_due ||
          nextDue?.payment ||
          summary?.payment_per_period ||
          '';

        setLoanAmt(String(suggestedLoanAmount || ''));
        setCbuAmt('');
        setSavingsAmt('');
        setMembershipAmt('');
        setPenaltyAmt('');
        setPenaltyDescription('');
        setWithOthers(false);
        setOthersPurpose('');
        setOthersAmt('');
        setPaymentDate(new Date().toISOString().split('T')[0]);
        setSiNo('');
        setPaymentMode('');
        setPaymentReference('');
        setPaymentNotes('');
      } catch (err) {
        toast.error(err.message || 'Failed to load payment data.');
      } finally {
        setLoadingData(false);
      }
    }

    bootstrap();
  }, [open, loan]);

  const membershipBalance = computeFeeBalance(membership);

  const totalPayment =
    (parseFloat(loanAmt) || 0) +
    (parseFloat(cbuAmt) || 0) +
    (parseFloat(savingsAmt) || 0) +
    (parseFloat(membershipAmt) || 0) +
    (parseFloat(penaltyAmt) || 0) +
    (parseFloat(othersAmt) || 0);

  const referenceRequired = ['GCash', 'Bank Transfer', 'Check'].includes(paymentMode);

  async function handleSubmit() {
    if (!loan || !userId) {
      toast.error('Payment context is missing.');
      return;
    }

    const loanPay = parseFloat(loanAmt) || 0;
    const cbuPay = parseFloat(cbuAmt) || 0;
    const savingsPay = parseFloat(savingsAmt) || 0;
    const membershipPay = parseFloat(membershipAmt) || 0;
    const penaltyPay = parseFloat(penaltyAmt) || 0;
    const otherPay = parseFloat(othersAmt) || 0;

    if (loanPay + cbuPay + savingsPay + membershipPay + penaltyPay + otherPay === 0) {
      toast.error('Enter at least one amount greater than zero.');
      return;
    }

    if (!siNo.trim()) {
      toast.error('SI# is required.');
      return;
    }

    if (!paymentMode) {
      toast.error('Mode of payment is required.');
      return;
    }

    if (referenceRequired && !paymentReference.trim()) {
      toast.error('Reference / Account / Check No. is required for the selected payment mode.');
      return;
    }

    if (loanPay > 0 && loanPay > (loan.balance ?? 0)) {
      toast.error(`Loan payment exceeds remaining balance of ${formatCurrency(loan.balance)}.`);
      return;
    }

    if (membershipPay > 0 && !membership) {
      toast.error('This member has no membership record.');
      return;
    }

    if (membershipPay > membershipBalance) {
      toast.error(`Membership payment exceeds remaining balance of ${formatCurrency(membershipBalance)}.`);
      return;
    }

    if (withOthers && !othersPurpose.trim()) {
      toast.error('Others purpose is required.');
      return;
    }

    if (!paymentDate) {
      toast.error('Payment date is required.');
      return;
    }

    setSaving(true);
    try {
      const duplicate = await checkInvoiceNoExists(siNo.trim());
      if (duplicate) {
        toast.error(`Invoice Number "${siNo.trim()}" is already in use. Please enter a different SI#.`);
        setSaving(false);
        return;
      }

      const paymentModeNote =
        [paymentReference.trim(), paymentNotes.trim()].filter(Boolean).join(' | ') || null;

      if (loanPay > 0) {
        await createTransaction({
          member_id: loan.member_id,
          loan_id: loan.id,
          category: 'loan',
          type: 'loan_payment',
          amount: loanPay,
          reference: paymentReference.trim() || loan.loan_no || null,
          notes: paymentNotes.trim() || null,
          created_by: userId,
          transaction_date: paymentDate,
          payment_mode: paymentMode,
          payment_mode_note: paymentModeNote,
        });

        await applyLoanPaymentToSchedule(loan.id, loanPay);
      }

      if (cbuPay > 0) {
        if (!memberAccounts.cbu) {
          throw new Error('No CBU account found for this member.');
        }

        await createTransaction({
          member_id: loan.member_id,
          account_id: memberAccounts.cbu.id,
          category: 'cbu',
          type: 'deposit',
          amount: cbuPay,
          reference: paymentReference.trim() || memberAccounts.cbu.account_no || null,
          notes: paymentNotes.trim() || null,
          created_by: userId,
          transaction_date: paymentDate,
          payment_mode: paymentMode,
          payment_mode_note: paymentModeNote,
        });
      }

      if (savingsPay > 0) {
        if (!memberAccounts.savings) {
          throw new Error('No Savings account found for this member.');
        }

        await createTransaction({
          member_id: loan.member_id,
          account_id: memberAccounts.savings.id,
          category: 'savings',
          type: 'deposit',
          amount: savingsPay,
          reference: paymentReference.trim() || memberAccounts.savings.account_no || null,
          notes: paymentNotes.trim() || null,
          created_by: userId,
          transaction_date: paymentDate,
          payment_mode: paymentMode,
          payment_mode_note: paymentModeNote,
        });
      }

      if (membershipPay > 0) {
        const updatedMembership = await recordMembershipPayment(
          membership.id,
          loan.member_id,
          membershipPay,
          paymentDate,
          paymentNotes.trim() || 'Membership payment from Loans page',
          userId
        );

        setMembership(updatedMembership);

        await createTransaction({
          member_id: loan.member_id,
          category: 'membership',
          type: 'membership_payment',
          amount: membershipPay,
          reference: paymentReference.trim() || null,
          notes: paymentNotes.trim() || null,
          created_by: userId,
          transaction_date: paymentDate,
          payment_mode: paymentMode,
          payment_mode_note: paymentModeNote,
        });
      }

      if (penaltyPay > 0) {
        await createPenalty({
          member_id: loan.member_id,
          amount: penaltyPay,
          description: penaltyDescription || 'Penalty recorded from Loans page payment',
          penalty_date: paymentDate,
          created_by: userId,
        });

        await createTransaction({
          member_id: loan.member_id,
          category: 'penalty',
          type: 'penalty_payment',
          amount: penaltyPay,
          reference: paymentReference.trim() || null,
          notes: paymentNotes.trim() || penaltyDescription || null,
          created_by: userId,
          transaction_date: paymentDate,
          payment_mode: paymentMode,
          payment_mode_note: paymentModeNote,
        });
      }

      if (withOthers && otherPay > 0) {
        await createTransaction({
          member_id: loan.member_id,
          category: 'others',
          type: 'other_payment',
          amount: otherPay,
          reference: paymentReference.trim() || othersPurpose.trim(),
          notes: paymentNotes.trim() || null,
          created_by: userId,
          transaction_date: paymentDate,
          payment_mode: paymentMode,
          payment_mode_note: paymentModeNote,
        });
      }

      const invoiceBreakdown = [];
      if (loanPay > 0) invoiceBreakdown.push(`Loan: ${formatCurrency(loanPay)}`);
      if (cbuPay > 0) invoiceBreakdown.push(`CBU: ${formatCurrency(cbuPay)}`);
      if (savingsPay > 0) invoiceBreakdown.push(`Savings: ${formatCurrency(savingsPay)}`);
      if (membershipPay > 0) invoiceBreakdown.push(`Membership: ${formatCurrency(membershipPay)}`);
      if (penaltyPay > 0) invoiceBreakdown.push(`Penalty: ${formatCurrency(penaltyPay)}`);
      if (otherPay > 0) invoiceBreakdown.push(`Others (${othersPurpose.trim()}): ${formatCurrency(otherPay)}`);

      await createInvoiceForPayment({
        invoice_no: siNo.trim(),
        payment_type: 'loan_payment',
        member_id: loan.member_id,
        member_name: memberName,
        amount: totalPayment,
        purpose: invoiceBreakdown.length > 1 ? 'Combined Payment' : (invoiceBreakdown[0] || 'Payment'),
        ref_id: loan.id,
        created_by: userId,
        date: paymentDate,
        payment_mode: paymentMode,
        payment_mode_note: paymentModeNote,
        notes: invoiceBreakdown.join(' | '),
      });

      toast.success('Payment posted successfully.');
      trackActivity({ userId: user?.id, module: 'loan', action: 'payment', description: `Posted loan payment of ${formatCurrency(totalPayment)} for ${memberName}` });
      await onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to post payment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Post Payment" size="lg">
      {!loan ? null : loadingData ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="mb-5 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
            <p className="text-sm font-semibold text-orange-900">
              {memberName}
            </p>
            <p className="text-sm text-orange-700 mt-1">
              Loan balance: <span className="font-semibold">{formatCurrency(loan.balance ?? 0)}</span>
            </p>
            {membership && membershipBalance > 0 && (
              <p className="text-sm text-orange-700 mt-1">
                Membership balance: <span className="font-semibold">{formatCurrency(membershipBalance)}</span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PaymentField
              label={`Loan ${loan.balance != null ? `(max ${formatCurrency(loan.balance)})` : ''}`}
              value={loanAmt}
              onChange={setLoanAmt}
            />
            <PaymentField
              label={`CBU ${memberAccounts.cbu ? `(Acct: ${memberAccounts.cbu.account_no || '—'})` : ''}`}
              value={cbuAmt}
              onChange={setCbuAmt}
            />
            <PaymentField
              label={`Savings ${memberAccounts.savings ? `(Acct: ${memberAccounts.savings.account_no || '—'})` : ''}`}
              value={savingsAmt}
              onChange={setSavingsAmt}
            />

            {membership && membershipBalance > 0 ? (
              <PaymentField
                label={`Membership (Optional, max ${formatCurrency(membershipBalance)})`}
                value={membershipAmt}
                onChange={setMembershipAmt}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-gray-200 p-3 text-xs text-gray-400">
                Membership (Optional)
                <div className="mt-1">
                  {membership ? 'Fully paid' : 'No membership record'}
                </div>
              </div>
            )}

            <PaymentField
              label="Penalty (Optional)"
              value={penaltyAmt}
              onChange={setPenaltyAmt}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
              <input
                type="date"
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7EB751]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SI#</label>
              <input
                type="text"
                value={siNo}
                onChange={e => setSiNo(e.target.value)}
                placeholder="Enter SI# manually"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7EB751]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mode of Payment</label>
              <select
                value={paymentMode}
                onChange={e => setPaymentMode(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#7EB751]"
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
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7EB751]"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Penalty Description</label>
            <input
              type="text"
              value={penaltyDescription}
              onChange={e => setPenaltyDescription(e.target.value)}
              placeholder="Optional penalty description"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7EB751]"
            />
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Notes</label>
            <textarea
              rows={2}
              value={paymentNotes}
              onChange={e => setPaymentNotes(e.target.value)}
              placeholder="Optional notes"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[#7EB751]"
            />
          </div>

          <div className="mt-5 rounded-lg border border-gray-100 bg-gray-50 p-4">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={withOthers}
                onChange={e => setWithOthers(e.target.checked)}
              />
              Others
            </label>

            {withOthers && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Purpose</label>
                  <input
                    type="text"
                    value={othersPurpose}
                    onChange={e => setOthersPurpose(e.target.value)}
                    placeholder="Enter purpose"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7EB751]"
                  />
                </div>

                <PaymentField
                  label="Amount"
                  value={othersAmt}
                  onChange={setOthersAmt}
                />
              </div>
            )}
          </div>

          <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-sm font-semibold text-blue-900 mb-2">Payment Summary</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-blue-800">
              <div>Loan: <span className="font-semibold">{formatCurrency(parseFloat(loanAmt) || 0)}</span></div>
              <div>CBU: <span className="font-semibold">{formatCurrency(parseFloat(cbuAmt) || 0)}</span></div>
              <div>Savings: <span className="font-semibold">{formatCurrency(parseFloat(savingsAmt) || 0)}</span></div>
              <div>Membership: <span className="font-semibold">{formatCurrency(parseFloat(membershipAmt) || 0)}</span></div>
              <div>Penalty: <span className="font-semibold">{formatCurrency(parseFloat(penaltyAmt) || 0)}</span></div>
              <div>Others: <span className="font-semibold">{formatCurrency(parseFloat(othersAmt) || 0)}</span></div>
            </div>
            <div className="mt-3 pt-2 border-t border-blue-200 text-sm text-blue-900">
              Total Payment: <span className="font-bold">{formatCurrency(totalPayment)}</span>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              loading={saving}
              variant="finance"
              onClick={handleSubmit}
              icon={<PesoSign size={15} />}
            >
              Post Payment
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

function PaymentField({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="0.00"
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7EB751]"
      />
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