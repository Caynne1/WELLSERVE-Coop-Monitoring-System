import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search, Plus, Pencil, Ban, Calendar, Printer, Download,
  Clock, CheckCircle, ArrowUpDown, ChevronUp, ChevronDown, FileText,
} from 'lucide-react';
import { exportToCSV } from '../../utils/csvExport';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Pagination from '../../components/ui/Pagination';
import usePagination from '../../hooks/usePagination';
import { useAuth } from '../../context/AuthContext';
import { trackActivity } from '../../services/logService';
import {
  getExpenses,
  createExpense,
  updateExpense,
  voidExpense,
  approveExpense,
  linkExpenseVoucher,
} from '../../services/expenseService';
import { createVoucherFromExpense, voidVoucher } from '../../services/voucherService';
import { getLoansForExpenseCreation, buildLoanExpensePayload } from '../../services/loanWorkflowService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { printHtmlDocument, wrapWithLetterhead } from '../../utils/print';

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: 'LOAN RELEASES', label: 'LOAN RELEASES' },
  { value: 'LOAN PAYMENT', label: 'LOAN PAYMENT' },
  { value: 'LOAN ONLY / INTEREST', label: 'LOAN ONLY / INTEREST' },
  { value: 'INTEREST', label: 'INTEREST' },
  { value: 'SERVICE FEE', label: 'SERVICE FEE' },
  { value: 'PENALTY', label: 'PENALTY' },
  { value: 'MEMBERSHIP', label: 'MEMBERSHIP' },
  { value: 'FOR CBU', label: 'FOR CBU' },
  { value: 'FOR SAVINGS', label: 'FOR SAVINGS' },
  { value: 'TIME DEPOSIT', label: 'TIME DEPOSIT' },
  { value: 'COMMISSION FROM WELLIFE', label: 'COMMISSION FROM WELLIFE' },
  { value: 'ADMIN & REGULATORY FEES', label: 'ADMIN & REGULATORY FEES' },
  { value: 'BANK CHARGES / ADJUSTMENTS', label: 'BANK CHARGES / ADJUSTMENTS' },
  { value: 'PAYROLL', label: 'PAYROLL' },
  { value: 'PETTYCASH - OFFICE USE', label: 'PETTYCASH - OFFICE USE' },
  { value: 'GLOBE', label: 'GLOBE' },
  { value: 'LEYECO / UTILITIES', label: 'LEYECO / UTILITIES' },
  { value: 'OFFICE RENTAL', label: 'OFFICE RENTAL' },
  { value: 'OPERATING EXPENSES', label: 'OPERATING EXPENSES' },
  { value: 'CBU AND SAVINGS WITHDRAWAL & TIME DEPOSIT WITHDRAWAL', label: 'CBU AND SAVINGS WITHDRAWAL & TIME DEPOSIT WITHDRAWAL' },
  { value: 'BREAKDOWN OF BANK TRANSFERS', label: 'BREAKDOWN OF BANK TRANSFERS' },
  { value: 'BANK DEPOSIT / BANK TRANSFER', label: 'BANK DEPOSIT / BANK TRANSFER' },
  { value: 'OTHER WITHDRAWAL/EXPENSES', label: 'OTHER WITHDRAWAL/EXPENSES' },
  { value: 'OTHER DEPOSIT', label: 'OTHER DEPOSIT' },
  { value: 'NEEDS MANUAL REVIEW', label: 'NEEDS MANUAL REVIEW' },
];

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]));

// Alphabetical copy used only for the Add/Edit Expense modal's Category
// dropdown, so the filter bar above the table keeps its original order.
const CATEGORIES_ALPHA = [...CATEGORIES].sort((a, b) => a.label.localeCompare(b.label));

const CATEGORY_BADGE = {
  utilities:   'info',
  office:      'purple',
  salaries:    'navy',
  maintenance: 'orange',
  others:      'default',
};

const STATUS_BADGE = {
  pending:  'warning',
  approved: 'success',
  voided:   'danger',
};

const STATUS_LABEL = {
  pending:  'Pending',
  approved: 'Approved',
  voided:   'Voided',
};

// Column defs shared by header + body so alignment can never drift between
// the two — this is the same pattern used by the Loans / Vouchers tables.
const COLUMNS = [
  { key: 'date',   label: 'Date',        align: 'center', sortable: true },
  { key: null,     label: 'Description', align: 'left',   sortable: false },
  { key: null,     label: 'Category',    align: 'center', sortable: false },
  { key: null,     label: 'Payee',       align: 'left',   sortable: false },
  { key: 'amount', label: 'Amount',      align: 'center', sortable: true },
  { key: null,     label: 'Status',      align: 'center', sortable: false },
  { key: null,     label: 'Voucher',     align: 'center', sortable: false },
  { key: null,     label: 'Actions',     align: 'center', sortable: false },
];

const EMPTY_FORM = {
  date:          new Date().toISOString().split('T')[0],
  description:   '',
  category:      '',
  categoryOther: '',
  amount:        '',
  payee:         '',
  notes:         '',
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const { user, hasPermission } = useAuth();
  const canCreate = hasPermission('expenses', 'create');
  const canEdit = hasPermission('expenses', 'edit');

  // Data
  const [expenses, setExpenses]     = useState([]);
  const [loanList, setLoanList]     = useState([]);
  const [loading, setLoading]       = useState(true);

  // Filters
  const [search, setSearch]         = useState('');
  const [catFilter, setCatFilter]   = useState('');
  const [statFilter, setStatFilter] = useState('');
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');

  // Sorting
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

  // Add / Edit modal
  const [modalOpen, setModalOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState(null); // null = new, object = edit
  const [form, setForm]             = useState(EMPTY_FORM);
  const [formErr, setFormErr]       = useState({});
  const [saving, setSaving]         = useState(false);

  // Approve confirm modal
  const [approveTarget, setApproveTarget] = useState(null);
  const [approving, setApproving]         = useState(false);

  // Void confirm modal
  const [voidTarget, setVoidTarget] = useState(null);
  const [voiding, setVoiding]       = useState(false);

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchExpenses = useCallback(async () => {
    try {
      setLoading(true);
      setExpenses(await getExpenses());
    } catch {
      toast.error(
        (t) => (
          <span className="flex items-center gap-3 text-sm">
            Failed to load expenses.
            <button
              className="flex-shrink-0 text-xs font-bold underline"
              onClick={() => { toast.dismiss(t.id); fetchExpenses(); }}
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
  }, []);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  useEffect(() => {
    getLoansForExpenseCreation()
      .then(setLoanList)
      .catch(() => setLoanList([]));
  }, []);

  // ── Client-side filtering ────────────────────────────────────────────────────

  const filtered = expenses.filter(e => {
    const q = search.toLowerCase();
    const matchSearch = !q || (
      e.description?.toLowerCase().includes(q) ||
      e.payee?.toLowerCase().includes(q)
    );
    const matchCat  = !catFilter  || e.category === catFilter;
    const matchStat = !statFilter || e.status   === statFilter;
    const matchFrom = !dateFrom   || (e.date && e.date >= dateFrom);
    const matchTo   = !dateTo     || (e.date && e.date <= dateTo);
    return matchSearch && matchCat && matchStat && matchFrom && matchTo;
  });

  // ── Sorting ───────────────────────────────────────────────────────────────────

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
      let aVal, bVal;
      if (key === 'date') {
        aVal = new Date(a.date || 0).getTime();
        bVal = new Date(b.date || 0).getTime();
      } else if (key === 'amount') {
        aVal = Number(a.amount) || 0;
        bVal = Number(b.amount) || 0;
      } else {
        aVal = 0; bVal = 0;
      }
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;
      return 0;
    });

    return arr;
  }, [filtered, sortConfig]);

  const { page, setPage, pageSize, setPageSize, pageItems, totalPages } = usePagination(sorted, { pageSize: 25 });

  useEffect(() => {
    setPage(1);
  }, [search, catFilter, statFilter, dateFrom, dateTo]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Summary stats ────────────────────────────────────────────────────────────

  const pendingList  = expenses.filter(e => e.status === 'pending');
  const approvedList = expenses.filter(e => e.status === 'approved');
  const voidedList    = expenses.filter(e => e.status === 'voided');
  const pendingTotal  = pendingList.reduce((s, e) => s + (e.amount || 0), 0);
  const approvedTotal = approvedList.reduce((s, e) => s + (e.amount || 0), 0);

  // ── Form helpers ─────────────────────────────────────────────────────────────

  function openAdd() {
    if (!canCreate) {
      toast.error('You do not have permission to create expenses');
      return;
    }
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().split('T')[0] });
    setFormErr({});
    setModalOpen(true);
  }

  function openLoanExpense(loan) {
    if (!canCreate) {
      toast.error('You do not have permission to create expenses');
      return;
    }
    setEditTarget(null);
    setFormErr({});
    const payload = buildLoanExpensePayload(loan, user?.id ?? null);
    setForm({
      date: payload.date,
      description: payload.description,
      category: payload.category,
      categoryOther: '',
      amount: String(payload.amount || ''),
      payee: payload.payee,
      notes: payload.notes || '',
    });
    setModalOpen(true);
  }

  function openEdit(expense) {
    if (!canEdit) {
      toast.error('You do not have permission to edit expenses');
      return;
    }
    setEditTarget(expense);
    setForm({
      date:          expense.date          || '',
      description:   expense.description   || '',
      category:      expense.category      || '',
      categoryOther: expense.category_other || '',
      amount:        expense.amount?.toString() || '',
      payee:         expense.payee         || '',
      notes:         expense.notes         || '',
    });
    setFormErr({});
    setModalOpen(true);
  }

  function setField(field, value) {
    setForm(f => ({ ...f, [field]: value }));
    setFormErr(e => ({ ...e, [field]: undefined }));
  }

  function validateForm() {
    const errs = {};
    if (!form.date)               errs.date        = 'Date is required.';
    if (!form.description.trim()) errs.description = 'Description is required.';
    if (!form.category)           errs.category    = 'Category is required.';
    if (form.category === 'others' && !form.categoryOther.trim())
      errs.categoryOther = 'Please specify the category.';
    if (!form.payee.trim())       errs.payee       = 'Payee is required.';
    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0)
      errs.amount = 'Enter a valid amount greater than zero.';
    return errs;
  }

  // ── Save (create or update) ──────────────────────────────────────────────────

  async function handleSave() {
    if (editTarget && !canEdit) {
      return toast.error('You do not have permission to edit expenses');
    }
    if (!editTarget && !canCreate) {
      return toast.error('You do not have permission to create expenses');
    }
    const errs = validateForm();
    if (Object.keys(errs).length) { setFormErr(errs); return; }

    setSaving(true);
    try {
      const payload = {
        date:           form.date,
        description:    form.description.trim(),
        category:       form.category,
        category_other: form.category === 'others' ? form.categoryOther.trim() : undefined,
        amount:         parseFloat(form.amount),
        payee:          form.payee.trim(),
        notes:          form.notes.trim()  || null,
        created_by:     user?.id           ?? null,
      };

      if (editTarget) {
        await updateExpense(editTarget.id, payload);
        toast.success('Expense updated.');
        trackActivity({ userId: user?.id, module: 'expense', action: 'update', description: `Updated expense: ${form.description.trim()} — ${form.amount}` });
      } else {
        payload.status = 'pending';
        await createExpense(payload);
        toast.success('Expense recorded and pending approval.');
        trackActivity({ userId: user?.id, module: 'expense', action: 'create', description: `Recorded expense (pending approval): ${form.description.trim()} — ${form.amount}` });
      }

      setModalOpen(false);
      fetchExpenses();
    } catch (err) {
      toast.error(err.message || 'Failed to save expense.');
    } finally {
      setSaving(false);
    }
  }

  // ── Approve (creates + links a voucher automatically) ────────────────────────

  async function handleApprove() {
    if (!approveTarget) return;
    if (!canEdit) {
      toast.error('You do not have permission to edit expenses');
      setApproveTarget(null);
      return;
    }
    setApproving(true);
    try {
      const approved = await approveExpense(approveTarget.id, user?.id ?? null);
      trackActivity({ userId: user?.id, module: 'expense', action: 'approve', description: `Approved expense: ${approved.description} — ${approved.amount}` });

      let voucherNo = null;
      try {
        const voucher = await createVoucherFromExpense(approved, user?.id ?? null);
        await linkExpenseVoucher(approved.id, voucher.id, voucher.voucher_no);
        voucherNo = voucher.voucher_no;
        trackActivity({ userId: user?.id, module: 'voucher', action: 'create', description: `Auto-created voucher ${voucher.voucher_no} from approved expense: ${approved.description}` });
      } catch (voucherErr) {
        toast.error('Expense approved, but the linked voucher could not be created: ' + (voucherErr.message || 'Unknown error.'));
      }

      toast.success(voucherNo ? `Expense approved. Voucher ${voucherNo} created.` : 'Expense approved.');
      setApproveTarget(null);
      fetchExpenses();
    } catch (err) {
      toast.error(err.message || 'Failed to approve expense.');
    } finally {
      setApproving(false);
    }
  }

  // ── Void ─────────────────────────────────────────────────────────────────────

  async function handleVoid() {
    if (!voidTarget) return;
    if (!canEdit) {
      toast.error('You do not have permission to edit expenses');
      setVoidTarget(null);
      return;
    }
    setVoiding(true);
    try {
      await voidExpense(voidTarget.id);
      if (voidTarget.voucher_id) {
        try { await voidVoucher(voidTarget.voucher_id); } catch { /* best-effort cascade */ }
      }
      toast.success('Expense voided.');
      trackActivity({ userId: user?.id, module: 'expense', action: 'void', description: `Voided expense ID: ${voidTarget.id}` });
      setVoidTarget(null);
      fetchExpenses();
    } catch (err) {
      toast.error(err.message || 'Failed to void expense.');
    } finally {
      setVoiding(false);
    }
  }

  function handlePrint() {
    const fmt = (n) => 'PHP ' + Number(n ?? 0).toLocaleString('en-PH', {minimumFractionDigits:2,maximumFractionDigits:2});
    const total = filtered.reduce((s,e) => s + (e.amount||0), 0);
    const rows = filtered.map(e => `<tr>
      <td style="text-align:center;white-space:nowrap">${e.date||'—'}</td>
      <td>${e.description||'—'}</td>
      <td style="text-align:center">${e.category === 'others' ? (e.category_other || 'Others') : (CATEGORY_LABEL[e.category]||'—')}</td>
      <td>${e.payee||'—'}</td>
      <td style="text-align:right;font-weight:600">${fmt(e.amount)}</td>
      <td style="text-align:center">${STATUS_LABEL[e.status]||e.status||'—'}</td>
      <td style="text-align:center;font-family:monospace">${e.voucher_no||'—'}</td>
    </tr>`).join('');
    const html = `
      <h1 class="report-title">Expenses</h1>
      <div class="report-meta">Cooperative operational expenses &nbsp;|&nbsp; ${filtered.length} records &nbsp;|&nbsp; Total: ${fmt(total)} &nbsp;|&nbsp; Generated: ${new Date().toLocaleString('en-PH')}</div>
      <table>
        <thead><tr><th style="text-align:center">Date</th><th>Description</th><th style="text-align:center">Category</th><th>Payee</th><th style="text-align:right">Amount</th><th style="text-align:center">Status</th><th style="text-align:center">Voucher</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="4" style="text-align:right;font-weight:600;padding:4pt 6pt">Total Expenses</td><td style="text-align:right;font-weight:700;color:#b91c1c;padding:4pt 6pt">${fmt(total)}</td><td></td><td></td></tr></tfoot>
      </table>
      <div class="confidential">WELLSERVE Cooperative Monitoring System — Authorized personnel only.</div>
    `;
    const win = printHtmlDocument(wrapWithLetterhead(html, {title:'Expenses — WELLSERVE'}), {
      onBlocked: () => toast.error('Pop-up blocked. Please allow pop-ups and try again.'),
    });
    if (win) toast.success('Print dialog opened.');
  }

  function handleExportCSV() {
    try {
      if (filtered.length === 0) { toast.error('No expenses to export.'); return; }
      const rows = filtered.map(e => ({
        date: e.date || '',
        description: e.description || '',
        category: e.category === 'others' ? (e.category_other || 'Others') : (CATEGORY_LABEL[e.category] || e.category || ''),
        payee: e.payee || '',
        amount: e.amount || 0,
        status: STATUS_LABEL[e.status] || e.status || '',
        voucher_no: e.voucher_no || '',
        notes: e.notes || '',
      }));
      exportToCSV('expenses_report.csv', rows);
      toast.success('CSV exported successfully');
    } catch (err) {
      toast.error(err.message || 'Failed to export CSV');
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="p-6">
      <PageHeader
        title="Expenses"
        subtitle="Track and manage cooperative operational expenses"
        action={
          <div className="flex items-center gap-2">
            {canCreate && (
              <>
            <select
              value=""
              onChange={e => {
                const loan = loanList.find(l => l.id === e.target.value);
                if (loan) openLoanExpense(loan);
              }}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#7EB751]"
            >
              <option value="">Create Loan Expense</option>
              {loanList.map(loan => (
                <option key={loan.id} value={loan.id}>
                  {loan.loan_no || loan.id} - {loan.payee || `${loan.members?.first_name || ''} ${loan.members?.last_name || ''}`.trim()} - {formatCurrency(loan.net_proceeds || 0)}
                </option>
              ))}
            </select>
            <Button variant="primary" icon={<Plus size={15} />} onClick={openAdd}>
              Add Expense
            </Button>
              </>
            )}
          </div>
        }
      />

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-6 mb-6">
        <SummaryCard
          icon={<Clock size={20} className="text-amber-600" />}
          label="Pending Approval"
          value={pendingList.length}
          sub={formatCurrency(pendingTotal)}
          bg="bg-amber-50"
        />
        <SummaryCard
          icon={<CheckCircle size={20} className="text-green-600" />}
          label="Approved"
          value={approvedList.length}
          sub={formatCurrency(approvedTotal)}
          bg="bg-green-50"
        />
        <SummaryCard
          icon={<CheckCircle size={20} className="text-emerald-600" />}
          label="Total Amount Approved"
          value={formatCurrency(approvedTotal)}
          bg="bg-emerald-50"
        />
        <SummaryCard
          icon={<Ban size={20} className="text-red-500" />}
          label="Void"
          value={voidedList.length}
          bg="bg-red-50"
        />
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by description or payee..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7EB751] transition"
          />
        </div>
        <select
          value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7EB751] bg-white text-gray-700 transition"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <select
          value={statFilter}
          onChange={e => setStatFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7EB751] bg-white text-gray-700 transition"
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="voided">Voided</option>
        </select>
        <div className="flex items-center gap-1.5">
          <Calendar size={14} className="text-gray-400 flex-shrink-0" />
          <input
            type="date"
            title="From date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="px-2.5 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7EB751] bg-white text-gray-700 transition"
          />
          <span className="text-gray-400 text-sm">–</span>
          <input
            type="date"
            title="To date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="px-2.5 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7EB751] bg-white text-gray-700 transition"
          />
        </div>
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

      {/* ── Table ── */}
      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {COLUMNS.map(col => {
                    const isSorted = col.sortable && sortConfig.key === col.key;
                    return (
                      <th
                        key={col.label}
                        onClick={col.sortable ? () => handleSort(col.key) : undefined}
                        className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap ${
                          col.align === 'center' ? 'text-center' : 'text-left'
                        } ${col.sortable ? 'cursor-pointer select-none hover:text-gray-700' : ''}`}
                      >
                        <span className={`inline-flex items-center gap-1 ${col.align === 'center' ? 'justify-center w-full' : ''}`}>
                          {col.label}
                          {col.sortable && (
                            isSorted ? (
                              sortConfig.direction === 'asc'
                                ? <ChevronUp size={12} />
                                : <ChevronDown size={12} />
                            ) : (
                              <ArrowUpDown size={11} className="text-gray-300" />
                            )
                          )}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNS.length} className="text-center py-12 text-gray-400">
                      <FileText size={32} className="mx-auto mb-2 text-gray-200" />
                      {search || catFilter || statFilter || dateFrom || dateTo
                        ? 'No expenses match your filters.'
                        : 'No expenses recorded yet.'}
                    </td>
                  </tr>
                ) : pageItems.map(expense => (
                  <tr
                    key={expense.id}
                    className={`hover:bg-[#D6FADC]/20 transition-colors ${
                      expense.status === 'voided' ? 'opacity-50' : ''
                    }`}
                  >
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-center">
                      {formatDate(expense.date)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{expense.description}</p>
                      {expense.notes && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">
                          {expense.notes}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={CATEGORY_BADGE[expense.category] || 'default'}>
                        {CATEGORY_LABEL[expense.category] || expense.category}
                      </Badge>
                      {expense.category === 'others' && expense.category_other && (
                        <p className="text-xs text-gray-400 mt-1 truncate max-w-[140px] mx-auto">
                          {expense.category_other}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{expense.payee || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap text-center">
                      {formatCurrency(expense.amount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={STATUS_BADGE[expense.status] || 'default'} dot>
                        {STATUS_LABEL[expense.status] || expense.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {expense.voucher_no ? (
                        <span className="font-mono text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                          {expense.voucher_no}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-center">
                        {canEdit && expense.status === 'pending' && (
                          <>
                            <button
                              onClick={() => openEdit(expense)}
                              title="Edit Expense"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-[#000066] hover:bg-blue-50 transition-colors"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => setApproveTarget(expense)}
                              title="Approve Expense"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                            >
                              <CheckCircle size={15} />
                            </button>
                          </>
                        )}
                        {canEdit && expense.status !== 'voided' && expense.source !== 'imported' && expense.record_type !== 'migrated_historical' && (
                          <button
                            onClick={() => setVoidTarget(expense)}
                            title="Void Expense"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Ban size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {sorted.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Showing {sorted.length} of {expenses.length} expense{expenses.length !== 1 ? 's' : ''}
              </p>
              <p className="text-xs font-medium text-gray-700">
                Filtered total:{' '}
                <span className="text-green-700">
                  {formatCurrency(
                    sorted
                      .filter(e => e.status === 'approved')
                      .reduce((s, e) => s + (e.amount || 0), 0)
                  )}
                </span>
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
            itemLabel="expenses"
          />
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? 'Edit Expense' : 'Add Expense'}
        size="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Date"
              required
              type="date"
              value={form.date}
              onChange={e => setField('date', e.target.value)}
              error={formErr.date}
            />
            <Select
              label="Category"
              required
              value={form.category}
              onChange={e => setField('category', e.target.value)}
              placeholder="Select category"
              options={CATEGORIES_ALPHA}
              error={formErr.category}
            />
          </div>

          {form.category === 'others' && (
            <Input
              label="Please specify category"
              required
              type="text"
              placeholder="Enter the expense category"
              value={form.categoryOther}
              onChange={e => setField('categoryOther', e.target.value)}
              error={formErr.categoryOther}
            />
          )}

          <Input
            label="Description"
            required
            type="text"
            placeholder="What was this expense for?"
            value={form.description}
            onChange={e => setField('description', e.target.value)}
            error={formErr.description}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Amount"
              required
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={e => setField('amount', e.target.value)}
              error={formErr.amount}
            />
            <Input
              label="Payee"
              required
              type="text"
              placeholder="Who was paid?"
              value={form.payee}
              onChange={e => setField('payee', e.target.value)}
              error={formErr.payee}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Notes</label>
            <textarea
              rows={2}
              placeholder="Optional notes..."
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7EB751] transition resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={saving}
            onClick={handleSave}
            icon={!saving && <Plus size={15} />}
          >
            {editTarget ? 'Save Changes' : 'Record Expense'}
          </Button>
        </div>
      </Modal>

      {/* ── Approve Confirm Modal ── */}
      <Modal
        open={!!approveTarget}
        onClose={() => setApproveTarget(null)}
        title="Approve Expense"
        size="sm"
      >
        {approveTarget && (
          <>
            <p className="text-sm text-gray-600 mb-3">
              Approve the following expense? A voucher will be created and linked automatically.
            </p>
            <div className="bg-gray-50 rounded-lg px-4 py-3 mb-4 border border-gray-100">
              <p className="font-medium text-gray-900 text-sm">{approveTarget.description}</p>
              <p className="text-xs text-gray-400 mt-1">
                {formatDate(approveTarget.date)}
                {' · '}
                {formatCurrency(approveTarget.amount)}
                {approveTarget.payee ? ` · ${approveTarget.payee}` : ''}
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setApproveTarget(null)}
                disabled={approving}
              >
                Cancel
              </Button>
              <Button
                variant="success"
                loading={approving}
                onClick={handleApprove}
                icon={!approving && <CheckCircle size={15} />}
              >
                Confirm Approval
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* ── Void Confirm Modal ── */}
      <Modal
        open={!!voidTarget}
        onClose={() => setVoidTarget(null)}
        title="Void Expense"
        size="sm"
      >
        {voidTarget && (
          <>
            <p className="text-sm text-gray-600 mb-3">
              You are about to void the following expense:
            </p>
            <div className="bg-gray-50 rounded-lg px-4 py-3 mb-4 border border-gray-100">
              <p className="font-medium text-gray-900 text-sm">{voidTarget.description}</p>
              <p className="text-xs text-gray-400 mt-1">
                {formatDate(voidTarget.date)}
                {' · '}
                {formatCurrency(voidTarget.amount)}
                {voidTarget.payee ? ` · ${voidTarget.payee}` : ''}
              </p>
            </div>
            <p className="text-xs text-gray-400 mb-5">
              This cannot be undone. The record will remain visible but marked as voided.
              {voidTarget.voucher_id ? ' The linked voucher will be voided as well.' : ''}
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setVoidTarget(null)}
                disabled={voiding}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={voiding}
                onClick={handleVoid}
                icon={!voiding && <Ban size={15} />}
              >
                Void Expense
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({ icon, label, value, sub, bg }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-lg font-bold text-gray-900">{value}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}