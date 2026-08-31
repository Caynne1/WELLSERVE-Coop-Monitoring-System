import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  CreditCard,
  Layers3,
  Printer,
  Download,
} from 'lucide-react';
import PesoSign from '../../components/shared/PesoSign';
import { exportToCSV } from '../../utils/csvExport';
import toast from 'react-hot-toast';
import LoanTypeModal from '../../components/shared/LoanTypeModal';

import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import LoanTable from './LoanTable';
import LoanReleasedSummary, { LoanReleaseDateFilter } from './LoanReleasedSummary';
import { computeCoopSummaryFromInvoices } from '../../services/coopFundService';
import { filterFundLedgerByDate, sumPostedLoanReleases, parseLedgerDate, txDisplayDate } from '../../utils/fundLoanReleases';
import { getLoanFilterDate, matchesLoanDateRange } from '../../utils/loanDateFilter';
import { getLoanBalanceWithInterest, getLoanFinancials, getLoanDueState, normalizeLoanStatus, isLoanReleased, getLoanWorkflowTarget, getLoanTypeLabel } from '../../utils/loanListState';
import Spinner from '../../components/ui/Spinner';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import usePagination from '../../hooks/usePagination';

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
import { formatCurrency, formatDate, formatAmountInput, cleanAmountInput } from '../../utils/formatters';
import { printHtmlDocument, wrapWithLetterhead } from '../../utils/print';
import { useAuth } from '../../context/AuthContext';
import { trackActivity } from '../../services/logService';

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

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'draft', label: 'Draft' },
  { value: 'credit_committee_approval', label: 'For Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'released', label: 'Released' },
  { value: 'active', label: 'Active' },
  { value: 'paid', label: 'Paid' },
  { value: 'delinquent', label: 'Delinquent' },
];

const PAYMENT_MODE_OPTIONS = [
  { value: '', label: 'Select mode of payment' },
  { value: 'Cash', label: 'Cash' },
  { value: 'GCash', label: 'GCash' },
  { value: 'Bank Transfer', label: 'Bank Transfer' },
  { value: 'Check', label: 'Check' },
  { value: 'Others', label: 'Others' },
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

export default function LoansPage() {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const canCreate = hasPermission('loans', 'create');
  const canEdit = hasPermission('loans', 'edit');
  const canDelete = hasPermission('loans', 'delete');
  // Admins are allowed automatically; every other role requires an explicit
  // Loans "approve" permission assigned by an administrator.
  const canApproveLoan = hasPermission('loans', 'approve');

  const [loans, setLoans] = useState([]);
  const [releaseLedger, setReleaseLedger] = useState(null);
  const [releaseLedgerLoading, setReleaseLedgerLoading] = useState(true);
  const [releaseLedgerError, setReleaseLedgerError] = useState(false);
  const [releaseDateRange, setReleaseDateRange] = useState({ from: '', to: '' });
  const releaseYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const baseYears = Array.from({ length: Math.max(8, currentYear - 2024 + 5) }, (_, i) => 2024 + i);
    const ledgerYears = (releaseLedger || []).map(tx => parseLedgerDate(txDisplayDate(tx)))
      .filter(Boolean).map(date => date.getFullYear());
    const loanYears = loans.map(getLoanFilterDate).filter(Boolean).map(day => Number(day.slice(0, 4)));
    return [...new Set([...baseYears, ...ledgerYears, ...loanYears])].sort((a, b) => b - a);
  }, [releaseLedger, loans]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [frequencyFilter, setFrequencyFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [dueFilter, setDueFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [statusSavingId, setStatusSavingId] = useState(null);
  const [loanTypeModalOpen, setLoanTypeModalOpen] = useState(false);

  const [payModal, setPayModal] = useState({
    open: false,
    loan: null,
  });

  useEffect(() => {
    fetchLoans();
  }, []);

  async function fetchLoans() {
    fetchReleaseLedger();
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

  async function fetchReleaseLedger() {
    setReleaseLedgerLoading(true);
    setReleaseLedgerError(false);
    setReleaseLedger(null);
    try {
      const { transactions } = await computeCoopSummaryFromInvoices({ strict: true });
      setReleaseLedger(transactions);
    } catch {
      setReleaseLedgerError(true);
    } finally {
      setReleaseLedgerLoading(false);
    }
  }

  async function handleDelete() {
    if (!toDelete) return;
    if (!canDelete) {
      toast.error('You do not have permission to delete loans');
      setToDelete(null);
      return;
    }

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
    // Approval decisions require the separate permission assigned by an administrator.
    const isApprovalDecision = newStatus === 'approved' || newStatus === 'rejected';
    if (isApprovalDecision ? !canApproveLoan : !canEdit) {
      toast.error(
        isApprovalDecision
          ? 'You do not have permission to approve or reject loans.'
          : 'You do not have permission to edit loans'
      );
      return;
    }

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

  async function handleWorkflowAction(loan) {
    const nextStatus = getLoanWorkflowTarget(loan);
    if (!nextStatus || statusSavingId) return;

    if (nextStatus === 'credit_committee_approval' && !canEdit) {
      toast.error('You do not have permission to edit loans');
      return;
    }
    if (nextStatus === 'approved' && !canApproveLoan) {
      toast.error('You do not have permission to approve loans.');
      return;
    }

    await handleStatusChange(loan, nextStatus);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return loans.filter(loan => {
      if (!matchesLoanDateRange(loan, releaseDateRange)) return false;
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

      const dueInfo = getLoanDueState(loan);
      let matchesDue = true;

      if (dueFilter === 'due_7') {
        matchesDue = dueInfo.diffDays !== null && dueInfo.diffDays >= 0 && dueInfo.diffDays <= 7;
      } else if (dueFilter === 'due_2') {
        matchesDue = dueInfo.diffDays !== null && dueInfo.diffDays >= 0 && dueInfo.diffDays <= 2;
      } else if (dueFilter === 'overdue') {
        matchesDue = dueInfo.diffDays !== null && dueInfo.diffDays < 0;
      }

      const matchesStatus =
        statusFilter === 'all' || normalizeLoanStatus(loan.status) === statusFilter;

      return matchesSearch && matchesFrequency && matchesMethod && matchesDue && matchesStatus;
    });
  }, [loans, search, frequencyFilter, methodFilter, dueFilter, statusFilter, releaseDateRange]);

  function handleSort(key) {
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  }

  const sorted = useMemo(() => {
    const { key, direction } = sortConfig;
    if (!key) return filtered;

    const dir = direction === 'asc' ? 1 : -1;
    const arr = [...filtered];

    arr.sort((a, b) => {
      let aVal;
      let bVal;

      switch (key) {
        case 'member':
          aVal = `${a.members?.first_name || ''} ${a.members?.last_name || ''}`.trim().toLowerCase();
          bVal = `${b.members?.first_name || ''} ${b.members?.last_name || ''}`.trim().toLowerCase();
          break;
        case 'loan_type':
          aVal = getLoanTypeLabel(a);
          bVal = getLoanTypeLabel(b);
          break;
        case 'amount':
          aVal = Number(a.amount) || 0;
          bVal = Number(b.amount) || 0;
          break;
        case 'interest':
        case 'payable':
        case 'paid':
        case 'balance':
          aVal = getLoanFinancials(a)[key];
          bVal = getLoanFinancials(b)[key];
          break;
        case 'released':
          aVal = new Date(a.release_date || a.created_at || 0).getTime() || 0;
          bVal = new Date(b.release_date || b.created_at || 0).getTime() || 0;
          break;
        case 'due_date': {
          const aDue = getLoanDueState(a).dueDate;
          const bDue = getLoanDueState(b).dueDate;
          aVal = aDue ? new Date(aDue).getTime() : Infinity;
          bVal = bDue ? new Date(bDue).getTime() : Infinity;
          break;
        }
        case 'status':
          aVal = normalizeLoanStatus(a.status);
          bVal = normalizeLoanStatus(b.status);
          break;
        default:
          aVal = 0;
          bVal = 0;
      }

      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;
      return 0;
    });

    return arr;
  }, [filtered, sortConfig]);

  const { page, setPage, pageSize, setPageSize, pageItems, totalPages } = usePagination(sorted, { pageSize: 25 });

  useEffect(() => { setPage(1); }, [releaseDateRange.from, releaseDateRange.to, setPage]);

  useEffect(() => {
    setPage(1);
  }, [search, frequencyFilter, methodFilter, dueFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const activeLoans = loans.filter(l => isLoanReleased(l) && getLoanBalanceWithInterest(l) > 0);
    const invalidRange = releaseDateRange.from && releaseDateRange.to && releaseDateRange.from > releaseDateRange.to;
    const totalReleased = releaseLedger && !invalidRange
      ? sumPostedLoanReleases(filterFundLedgerByDate(releaseLedger, releaseDateRange))
      : null;
    const totalOutstanding = activeLoans.reduce((sum, l) => sum + getLoanBalanceWithInterest(l), 0);

    return {
      total: loans.length,
      active: activeLoans.length,
      totalReleased,
      totalOutstanding,
    };
  }, [loans, releaseLedger, releaseDateRange]);

  function handlePrint() {
    const rowsHtml = filtered.map(loan => {
      const memberName = `${loan.members?.first_name || ''} ${loan.members?.last_name || ''}`.trim() || '—';
      const financials = getLoanFinancials(loan);

      return `
        <tr>
          <td>${memberName}<br/><span style="color:#6b7280;font-size:9pt;">${loan.members?.member_no || '—'}</span></td>
          <td>${getLoanTypeLabel(loan)}</td>
          <td style="text-align:right;">${formatCurrency(financials.amount)}</td>
          <td style="text-align:right;">${formatCurrency(financials.interest)}</td>
          <td style="text-align:right;">${formatCurrency(financials.payable)}</td>
          <td style="text-align:right;">${formatCurrency(financials.paid)}</td>
          <td style="text-align:right;">${formatCurrency(financials.balance)}</td>
          <td>${formatDate(getLoanDueState(loan).dueDate)}</td>
          <td>${titleCase(normalizeLoanStatus(loan.status))}</td>
        </tr>
      `;
    }).join('');

    const html = `
      <h1 class="report-title">Loans Report</h1>
      <div class="report-meta">Generated: ${new Date().toLocaleString()} &nbsp;|&nbsp; ${filtered.length} of ${loans.length} loans</div>
      <div class="stats-grid">
        <div class="stat-box"><div class="stat-label">Total Loans</div><div class="stat-value">${stats.total}</div></div>
        <div class="stat-box"><div class="stat-label">Total Released (Net Cash Out)</div><div class="stat-value">${stats.totalReleased == null ? 'Unavailable' : formatCurrency(stats.totalReleased)}</div><div class="stat-sub">${releaseDateRange.from || 'All time'} to ${releaseDateRange.to || 'Present'}</div></div>
        <div class="stat-box"><div class="stat-label">Outstanding Balance</div><div class="stat-value">${formatCurrency(stats.totalOutstanding)}</div></div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Member</th>
            <th>Loan Type</th>
            <th style="text-align:right;">Principal</th>
            <th style="text-align:right;">Interest</th>
            <th style="text-align:right;">Total Payable</th>
            <th style="text-align:right;">Amount Paid</th>
            <th style="text-align:right;">Balance</th>
            <th>Due Date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="9" style="text-align:center; padding:16px;">No loans found.</td></tr>'}
        </tbody>
      </table>
      <div class="confidential">WELLSERVE Cooperative Monitoring System — Authorized personnel only.</div>
    `;

    printHtmlDocument(wrapWithLetterhead(html, { title: 'Loans Report' }), {
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
        loan_type: getLoanTypeLabel(l),
        principal: getLoanFinancials(l).amount,
        interest: getLoanFinancials(l).interest,
        total_payable: getLoanFinancials(l).payable,
        amount_paid: getLoanFinancials(l).paid,
        balance: getLoanFinancials(l).balance,
        due_date: formatDate(getLoanDueState(l).dueDate),
        method: titleCase(l.loan_method),
        frequency: frequencyLabel(l.repayment_frequency),
        term_months: l.term_months || '',
        released: isLoanReleased(l) ? formatDate(l.release_date) : '',
        planned_release: !isLoanReleased(l) ? formatDate(l.release_date) : '',
        status: l.status || '',
      }));
      exportToCSV('loans_report.csv', rows);
      toast.success('CSV exported successfully');
    } catch (err) {
      toast.error(err.message || 'Failed to export CSV');
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Loans"
        subtitle="Manage and monitor member loans"
        action={
          <div className="flex items-center gap-2">
            {canCreate && (
              <Button icon={<Plus size={15} />} onClick={() => setLoanTypeModalOpen(true)}>
                New Loan
              </Button>
            )}
          </div>
        }
      />

      <LoanReleaseDateFilter range={releaseDateRange} onRangeChange={setReleaseDateRange} years={releaseYears} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 mb-5">
        <SummaryCard
          icon={<CreditCard size={18} className="text-blue-600" />}
          label="Total Loans"
          value={String(stats.total)}
          bg="bg-blue-50"
        />
        <LoanReleasedSummary total={stats.totalReleased} loading={releaseLedgerLoading}
          error={releaseLedgerError} range={releaseDateRange}
          onRefresh={fetchReleaseLedger} />
        <SummaryCard
          icon={<Layers3 size={18} className="text-orange-600" />}
          label="Outstanding Balance"
          value={formatCurrency(stats.totalOutstanding)}
          bg="bg-orange-50"
        />
      </div>

      <div className="mt-4 mb-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex w-full items-center gap-3 flex-wrap lg:w-auto">
          <div className="relative w-full sm:w-auto">
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
                w-full sm:w-80 bg-white shadow-sm"
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

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#07A04E]"
          >
            {STATUS_FILTER_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
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
        <div className="min-w-0 bg-white rounded-lg border border-gray-200">
          <LoanTable
            loans={pageItems}
            sortConfig={sortConfig}
            onSort={handleSort}
            canEdit={canEdit}
            canApprove={canApproveLoan}
            canDelete={canDelete}
            savingId={statusSavingId}
            onView={loan => navigate(`/loans/${loan.id}`)}
            onEdit={loan => navigate(`/loans/${loan.id}/edit`)}
            onWorkflow={handleWorkflowAction}
            onDelete={setToDelete}
            emptyMessage={search || frequencyFilter !== 'all' || methodFilter !== 'all' || dueFilter !== 'all' || statusFilter !== 'all'
              ? 'No loans match your search/filter.' : 'No loans yet.'}
          />

          {filtered.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-gray-400">
                Showing <span className="font-medium text-gray-600">{filtered.length}</span> of{' '}
                <span className="font-medium text-gray-600">{loans.length}</span> loans
              </p>
              <p className="text-xs font-medium" style={{ color: '#273C2C' }}>
                Total outstanding:{' '}
                {formatCurrency(
                  filtered
                    .filter(isLoanReleased)
                    .reduce((s, l) => s + getLoanBalanceWithInterest(l), 0)
                )}
              </p>
            </div>
          )}

          <Pagination
            page={page}
            totalPages={totalPages}
            totalItems={sorted.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemLabel="loans"
          />
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

        await applyLoanPaymentToSchedule(loan.id, loanPay, paymentDate);
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
        type="text"
        inputMode="decimal"
        value={formatAmountInput(value)}
        onChange={e => onChange(cleanAmountInput(e.target.value))}
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
