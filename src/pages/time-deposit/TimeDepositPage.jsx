import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Landmark, Plus, Search, Pencil, Trash2, CreditCard,
  ChevronLeft, ChevronRight, RefreshCw, X, Receipt,
  Calendar, TrendingUp, Users, DollarSign, ChevronUp,
  ChevronDown, Ban, Printer, FileDown, TrendingDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import MemberSearchInput from '../../components/shared/MemberSearchInput';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { trackActivity } from '../../services/logService';
import { createInvoice } from '../../services/invoiceService';
import { createTransaction } from '../../services/transactionService';
import {
  getAllTimeDeposits,
  createTimeDeposit,
  updateTimeDeposit,
  deleteTimeDeposit,
  recordTimeDepositPayment,
} from '../../services/timeDepositService';
import { getApprovedWithdrawalVouchers } from '../../services/voucherService';
import { printHtmlDocument, wrapWithLetterhead } from '../../utils/print';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

const EMPTY_FORM = {
  date_applied:      new Date().toISOString().split('T')[0],
  termination_date:  '',
  name:              '',
  age:               '',
  birth_date:        '',
  address:           '',
  spouse_name:       '',
  spouse_age:        '',
  spouse_birth_date: '',
  children_count:    '',
  beneficiary_name:  '',
  employer:          '',
  business:          '',
  business_years:    '',
  terms:             '',
  amount:            '',
  interest_rate:     '',
  si_number:         '',
  payment_mode:      '',
  member_id:         null,
};

const STATUS_STYLES = {
  Active:    'bg-emerald-50 text-emerald-700 border border-emerald-200',
  Inactive:  'bg-gray-50 text-gray-500 border border-gray-200',
  Completed: 'bg-blue-50 text-blue-700 border border-blue-200',
  Cancelled: 'bg-red-50 text-red-600 border border-red-200',
};

const STATUS_TABS = [
  { label: 'All',       value: '' },
  { label: 'Active',    value: 'Active' },
  { label: 'Inactive',  value: 'Inactive' },
  { label: 'Completed', value: 'Completed' },
  { label: 'Cancelled', value: 'Cancelled' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status] || STATUS_STYLES.Active}`}>
      {status}
    </span>
  );
}

function StatCard({ icon, label, value, sub, bg, textColor }) {
  function handlePrint() {
    const fmt = (n) => 'PHP ' + Number(n ?? 0).toLocaleString('en-PH', {minimumFractionDigits:2,maximumFractionDigits:2});
    const rows = filtered.map(td => `<tr>
      <td>${td.name||'—'}</td>
      <td>${td.address||'—'}</td>
      <td style="text-align:right;font-weight:600">${fmt(td.amount)}</td>
      <td style="text-align:center">${td.terms||'—'} mo.</td>
      <td style="text-align:center">${td.interest_rate||'—'}%</td>
      <td style="white-space:nowrap">${td.date_applied||'—'}</td>
      <td style="white-space:nowrap">${td.termination_date||'—'}</td>
      <td style="text-align:center">${td.status||'—'}</td>
    </tr>`).join('');
    const html = `
      <h1 class="report-title">Time Deposits</h1>
      <div class="report-meta">Time deposit register &nbsp;|&nbsp; ${filtered.length} records &nbsp;|&nbsp; Generated: ${new Date().toLocaleString('en-PH')}</div>
      <table>
        <thead><tr><th>Name</th><th>Address</th><th style="text-align:right">Amount</th><th style="text-align:center">Terms</th><th style="text-align:center">Rate</th><th>Date Applied</th><th>Termination</th><th style="text-align:center">Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="confidential">WELLSERVE Cooperative Monitoring System — Authorized personnel only.</div>
    `;
    const win = printHtmlDocument(wrapWithLetterhead(html, {title:'Time Deposits — WELLSERVE'}), {
      onBlocked: () => toast.error('Pop-up blocked. Please allow pop-ups and try again.'),
    });
    if (win) toast.success('Print dialog opened.');
  }

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

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#07A04E] transition-colors bg-white placeholder-gray-300';

function SectionHeading({ children }) {
  return (
    <div className="col-span-2 flex items-center gap-2 pt-2">
      <div className="h-px flex-1 bg-gradient-to-r from-gray-200 to-transparent" />
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-1 whitespace-nowrap">
        {children}
      </span>
      <div className="h-px flex-1 bg-gradient-to-l from-gray-200 to-transparent" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Action button — compact icon-only square
// ─────────────────────────────────────────────────────────────────────────────

const ACTION_BTN_STYLES = {
  indigo: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200',
  amber:  'bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200',
  blue:   'bg-blue-50 text-[#000066] hover:bg-blue-100 border-blue-200',
  orange: 'bg-orange-50 text-orange-700 hover:bg-orange-100 border-orange-200',
  red:    'bg-red-50 text-red-600 hover:bg-red-100 border-red-200',
};

function ActionBtn({ icon, title, color, onClick, disabled }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${ACTION_BTN_STYLES[color]}`}
    >
      {icon}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Application Form (Create & Edit)
// ─────────────────────────────────────────────────────────────────────────────

function TimeDepositForm({ form, onChange, showSiNumber }) {
  const set = (k) => (e) => onChange({ ...form, [k]: e.target.value });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">

      <SectionHeading>Application Info</SectionHeading>
      <Field label="Date Applied" required>
        <input type="date" value={form.date_applied} onChange={set('date_applied')} className={inputCls} />
      </Field>
      <Field label="Termination Date">
        <input type="date" value={form.termination_date} onChange={set('termination_date')} className={inputCls} />
      </Field>

      <SectionHeading>Link to Member (optional)</SectionHeading>
      <div className="col-span-full">
        <MemberSearchInput
          value={form.member_id || null}
          onChange={(member) =>
            onChange({
              ...form,
              member_id: member?.id || null,
              name: form.name || (member ? `${member.first_name || ''} ${member.last_name || ''}`.trim() : ''),
            })
          }
          placeholder="Search member to link this deposit…"
        />
        {form.member_id && (
          <p className="text-xs text-emerald-600 mt-1">
            ✓ This deposit will appear in the linked member's Time Deposit tab.
          </p>
        )}
      </div>

      <SectionHeading>Personal Info</SectionHeading>
      <Field label="Full Name" required>
        <input type="text" value={form.name} onChange={set('name')} placeholder="Your Full Name" className={inputCls} />
      </Field>
      <Field label="Age">
        <input type="number" min="0" value={form.age} onChange={set('age')} placeholder="Your Age" className={inputCls} />
      </Field>
      <Field label="Birth Date">
        <input type="date" value={form.birth_date} onChange={set('birth_date')} className={inputCls} />
      </Field>
      <Field label="Address">
        <input type="text" value={form.address} onChange={set('address')} placeholder="Barangay, City, Province" className={inputCls} />
      </Field>

      <SectionHeading>Spouse Info</SectionHeading>
      <Field label="Spouse Name">
        <input type="text" value={form.spouse_name} onChange={set('spouse_name')} placeholder="Spouse's Full Name" className={inputCls} />
      </Field>
      <Field label="Spouse Age">
        <input type="number" min="0" value={form.spouse_age} onChange={set('spouse_age')} placeholder="Spouse's Age" className={inputCls} />
      </Field>
      <Field label="Spouse Birth Date">
        <input type="date" value={form.spouse_birth_date} onChange={set('spouse_birth_date')} className={inputCls} />
      </Field>
      <Field label="Number of Children">
        <input type="number" min="0" value={form.children_count} onChange={set('children_count')} placeholder="0" className={inputCls} />
      </Field>

      <SectionHeading>Beneficiary &amp; Employment</SectionHeading>
      <Field label="Name of Beneficiary">
        <input type="text" value={form.beneficiary_name} onChange={set('beneficiary_name')} placeholder="Beneficiary full name" className={inputCls} />
      </Field>
      <Field label="Employer">
        <input type="text" value={form.employer} onChange={set('employer')} placeholder="Company / Government Agency" className={inputCls} />
      </Field>
      <Field label="Business">
        <input type="text" value={form.business} onChange={set('business')} placeholder="Type of business" className={inputCls} />
      </Field>
      <Field label="Years in Business">
        <input type="number" min="0" value={form.business_years} onChange={set('business_years')} placeholder="0" className={inputCls} />
      </Field>

      <SectionHeading>Deposit Terms</SectionHeading>

      {showSiNumber && (
        <>
          <Field label="SI#" required>
            <input
              type="text"
              value={form.si_number}
              onChange={set('si_number')}
              placeholder="e.g. TD-20260424-0001"
              className={inputCls}
            />
          </Field>
          <Field label="Mode of Payment" required>
            <select value={form.payment_mode} onChange={set('payment_mode')} className={inputCls}>
              <option value="">Select mode of payment</option>
              <option value="Cash">Cash</option>
              <option value="GCash">GCash</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Check">Check</option>
              <option value="Others">Others</option>
            </select>
          </Field>
        </>
      )}

      <Field label="Terms (months)" required>
        <input type="number" min="1" value={form.terms} onChange={set('terms')} placeholder="12" className={inputCls} />
      </Field>
      <Field label="Amount (₱)" required>
        <input type="number" min="0" step="0.01" value={form.amount} onChange={set('amount')} placeholder="0.00" className={inputCls} />
      </Field>
      <Field label="Interest Rate (%)" required>
        <input type="number" min="0" step="0.01" value={form.interest_rate} onChange={set('interest_rate')} placeholder="5.00" className={inputCls} />
      </Field>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sortable Column Header
// ─────────────────────────────────────────────────────────────────────────────

function SortTh({ label, field, sortField, sortDir, onSort }) {
  const active = sortField === field;
  return (
    <th
      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:bg-gray-100 transition-colors"
      onClick={() => onSort(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        {active
          ? sortDir === 'asc'
            ? <ChevronUp size={11} className="text-[#07A04E]" />
            : <ChevronDown size={11} className="text-[#07A04E]" />
          : <ChevronUp size={11} className="text-gray-300" />}
      </span>
    </th>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV Export Helper
// ─────────────────────────────────────────────────────────────────────────────

function exportToCSV(data) {
  const headers = ['Name', 'Address', 'Amount', 'Terms (months)', 'Interest Rate (%)', 'Date Applied', 'Termination Date', 'Status'];
  const rows = data.map(r => [
    r.name || '',
    r.address || '',
    r.amount || '',
    r.terms || '',
    r.interest_rate || '',
    r.date_applied || '',
    r.termination_date || '',
    r.status || '',
  ]);
  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `time-deposits-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function TimeDepositPage() {
  const { user } = useAuth();

  // ── Data ──────────────────────────────────────────────────────────────────
  const [records, setRecords]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Application Modal ─────────────────────────────────────────────────────
  const [appModalOpen, setAppModalOpen] = useState(false);
  const [editTarget,   setEditTarget]   = useState(null);
  const [form,         setForm]         = useState(EMPTY_FORM);
  const [saving,       setSaving]       = useState(false);

  // ── Delete confirm ────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting,     setDeleting]     = useState(false);

  // ── Cancel confirm ────────────────────────────────────────────────────────
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling,   setCancelling]   = useState(false);

  // ── Payment Modal ─────────────────────────────────────────────────────────
  const [payTarget, setPayTarget] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payDate,   setPayDate]   = useState(new Date().toISOString().split('T')[0]);
  const [paySiNo,   setPaySiNo]   = useState('');
  const [payMode,   setPayMode]   = useState('');
  const [paying,    setPaying]    = useState(false);

  // ── History Modal ─────────────────────────────────────────────────────────
  const [historyTarget, setHistoryTarget] = useState(null);

  // ── Withdrawal Modal ──────────────────────────────────────────────────────
  const [withdrawTarget,    setWithdrawTarget]    = useState(null);
  const [withdrawVouchers,  setWithdrawVouchers]  = useState([]);
  const [withdrawLoading,   setWithdrawLoading]   = useState(false);
  const [withdrawVoucherId, setWithdrawVoucherId] = useState('');
  const [withdrawPosting,   setWithdrawPosting]   = useState(false);

  // ── Table controls ────────────────────────────────────────────────────────
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');
  const [sortField,    setSortField]    = useState('created_at');
  const [sortDir,      setSortDir]      = useState('desc');
  const [page,         setPage]         = useState(1);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setRecords(await getAllTimeDeposits());
    } catch (err) {
      toast.error('Failed to load Time Deposit records.');
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Derived / filtered data ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return records
      .filter(r => {
        if (statusFilter && r.status !== statusFilter) return false;
        if (dateFrom && r.date_applied && r.date_applied < dateFrom) return false;
        if (dateTo   && r.date_applied && r.date_applied > dateTo)   return false;
        if (!q) return true;
        return (
          r.name?.toLowerCase().includes(q) ||
          r.employer?.toLowerCase().includes(q) ||
          r.business?.toLowerCase().includes(q) ||
          r.address?.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        let va = a[sortField], vb = b[sortField];
        if (typeof va === 'string') va = va.toLowerCase();
        if (typeof vb === 'string') vb = vb.toLowerCase();
        if (va == null) return 1;
        if (vb == null) return -1;
        return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
      });
  }, [records, search, statusFilter, dateFrom, dateTo, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, statusFilter, dateFrom, dateTo, sortField, sortDir]);

  // ── Summary stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:     records.length,
    active:    records.filter(r => r.status === 'Active').length,
    totalAmt:  records.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0),
    totalPaid: records.reduce((s, r) =>
      s + (r.time_deposit_payments || []).reduce((ps, p) => ps + (parseFloat(p.amount) || 0), 0), 0),
  }), [records]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const counts = { '': records.length };
    for (const r of records) {
      counts[r.status] = (counts[r.status] || 0) + 1;
    }
    return counts;
  }, [records]);

  // ── Sort handler ──────────────────────────────────────────────────────────
  function handleSort(field) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  }

  // ── Application Modal handlers ────────────────────────────────────────────
  function openCreate() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setAppModalOpen(true);
  }

  function openEdit(record) {
    setEditTarget(record);
    setForm({
      date_applied:      record.date_applied      || '',
      termination_date:  record.termination_date  || '',
      name:              record.name              || '',
      age:               record.age         != null ? String(record.age)         : '',
      birth_date:        record.birth_date        || '',
      address:           record.address           || '',
      spouse_name:       record.spouse_name       || '',
      spouse_age:        record.spouse_age  != null ? String(record.spouse_age)  : '',
      spouse_birth_date: record.spouse_birth_date || '',
      children_count:    record.children_count != null ? String(record.children_count) : '',
      beneficiary_name:  record.beneficiary_name  || '',
      employer:          record.employer          || '',
      business:          record.business          || '',
      business_years:    record.business_years != null ? String(record.business_years) : '',
      terms:             String(record.terms      || ''),
      amount:            String(record.amount     || ''),
      interest_rate:     String(record.interest_rate || ''),
      status:            record.status            || 'Active',
      si_number:         '',
    });
    setAppModalOpen(true);
  }

  async function handleSave() {
    if (!editTarget && !form.si_number?.trim()) {
      return toast.error('SI# is required for new applications.');
    }
    if (!editTarget && !form.payment_mode) {
      return toast.error('Mode of payment is required for new applications.');
    }

    setSaving(true);
    try {
      if (editTarget) {
        await updateTimeDeposit(editTarget.id, { ...form, status: form.status || editTarget.status });
        trackActivity({
          userId: user?.id,
          module: 'time_deposit',
          action: 'update',
          description: `Updated time deposit for ${form.name}`,
        });
        toast.success('Time Deposit updated successfully.');
      } else {
        const newTD = await createTimeDeposit(form);
        const siNo  = form.si_number.trim();
        const amt   = parseFloat(form.amount);

        // Close modal & refresh immediately — prevents re-submission if secondary steps fail
        setAppModalOpen(false);
        await fetchData(true);
        toast.success('Time Deposit application saved.');

        // Invoice → Invoice Page + Account Monitoring (cash_in)
        try {
          await createInvoice({
            invoice_no:   siNo,
            date:         form.date_applied,
            payee:        form.name,
            purpose:      `New Time Deposit — ${form.name}`,
            amount:       amt,
            status:       'paid',
            payment_type: 'time_deposit',
            payment_mode: form.payment_mode || null,
            created_by:   user?.id ?? null,
            member_id:    null,
            ref_id:       newTD.id,
            account_id:   null,
            fund_added:   false,
          });
        } catch (invErr) {
          toast.error(`Invoice not created: ${invErr.message}`, { duration: 8000 });
        }

        // Transaction → Transactions Page
        try {
          await createTransaction({
            category:         'time_deposit',
            type:             'deposit',
            amount:           amt,
            transaction_date: form.date_applied,
            created_by:       user?.id ?? null,
            reference:        siNo,
            notes:            `New Time Deposit — ${form.name}`,
          });
        } catch (txErr) {
          toast.error(`Transaction not recorded: ${txErr.message}`, { duration: 8000 });
        }

        trackActivity({
          userId: user?.id,
          module: 'time_deposit',
          action: 'create',
          description: `New time deposit registered: ${form.name} — SI# ${siNo}, ${formatCurrency(amt)}`,
        });
        return; // already closed + refreshed above
      }
      setAppModalOpen(false);
      await fetchData(true);
    } catch (err) {
      toast.error(err.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  // ── Delete handlers ───────────────────────────────────────────────────────
  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteTimeDeposit(deleteTarget.id);
      trackActivity({
        userId: user?.id,
        module: 'time_deposit',
        action: 'delete',
        description: `Deleted time deposit for ${deleteTarget.name}`,
      });
      toast.success('Time Deposit deleted.');
      setDeleteTarget(null);
      await fetchData(true);
    } catch (err) {
      toast.error(err.message || 'Failed to delete.');
    } finally {
      setDeleting(false);
    }
  }

  // ── Cancel handlers ───────────────────────────────────────────────────────
  async function handleCancel() {
    setCancelling(true);
    try {
      await updateTimeDeposit(cancelTarget.id, {
        ...cancelTarget,
        age:            cancelTarget.age         != null ? String(cancelTarget.age)         : '',
        spouse_age:     cancelTarget.spouse_age  != null ? String(cancelTarget.spouse_age)  : '',
        children_count: cancelTarget.children_count != null ? String(cancelTarget.children_count) : '',
        business_years: cancelTarget.business_years != null ? String(cancelTarget.business_years) : '',
        terms:          String(cancelTarget.terms  || ''),
        amount:         String(cancelTarget.amount || ''),
        interest_rate:  String(cancelTarget.interest_rate || ''),
        status:         'Cancelled',
      });
      trackActivity({
        userId: user?.id,
        module: 'time_deposit',
        action: 'update',
        description: `Cancelled time deposit for ${cancelTarget.name}`,
      });
      toast.success('Time Deposit cancelled.');
      setCancelTarget(null);
      await fetchData(true);
    } catch (err) {
      toast.error(err.message || 'Failed to cancel.');
    } finally {
      setCancelling(false);
    }
  }

  // ── Payment handlers ──────────────────────────────────────────────────────
  function openPay(record) {
    setPayTarget(record);
    setPayAmount('');
    setPayDate(new Date().toISOString().split('T')[0]);
    setPaySiNo('');
    setPayMode('');
  }

  async function handlePay() {
    const value = parseFloat(payAmount) || 0;
    const siNo  = paySiNo.trim();
    if (!siNo)      return toast.error('SI# is required.');
    if (value <= 0) return toast.error('Enter a valid payment amount.');
    if (!payDate)   return toast.error('Payment date is required.');
    if (!payMode)   return toast.error('Mode of payment is required.');

    setPaying(true);
    try {
      // 1. Save payment record
      const result = await recordTimeDepositPayment({
        time_deposit_id: payTarget.id,
        amount:          value,
        payment_date:    payDate,
        si_number:       siNo,
        created_by:      user?.id ?? null,
      });
      const memberName = result.memberName || payTarget.name;

      // Close modal & refresh immediately — prevents re-submission if secondary steps fail
      setPayTarget(null);
      await fetchData(true);
      toast.success(`Payment recorded! SI# ${siNo}`);

      // 2. Invoice → Invoice Page + Account Monitoring (cash_in)
      try {
        await createInvoice({
          invoice_no:    siNo,
          date:          payDate,
          payee:         memberName,
          purpose:       `Time Deposit Payment — ${memberName}`,
          amount:        value,
          status:        'paid',
          payment_type:  'time_deposit',
          created_by:    user?.id ?? null,
          member_id:     null,
          ref_id:        payTarget.id,
          account_id:    null,
          fund_added:    false,
          payment_mode:  payMode,
        });
      } catch (invErr) {
        toast.error(`Invoice not created: ${invErr.message}`, { duration: 8000 });
      }

      // 3. Transaction → Transactions Page
      try {
        await createTransaction({
          category:         'time_deposit',
          type:             'deposit',
          amount:           value,
          transaction_date: payDate,
          created_by:       user?.id ?? null,
          reference:        siNo,
          notes:            `Time Deposit Payment — ${memberName}`,
          payment_mode:     payMode,
        });
      } catch (txErr) {
        toast.error(`Transaction not recorded: ${txErr.message}`, { duration: 8000 });
      }

      // 4. Activity log
      trackActivity({
        userId: user?.id,
        module: 'time_deposit',
        action: 'create',
        description: `Time deposit payment recorded for ${memberName} — SI# ${siNo}, ${formatCurrency(value)}`,
      });
    } catch (err) {
      toast.error(err.message || 'Failed to record payment.');
    } finally {
      setPaying(false);
    }
  }

  // ── Withdrawal handlers ───────────────────────────────────────────────────
  async function openWithdraw(record) {
    setWithdrawTarget(record);
    setWithdrawVoucherId('');
    setWithdrawLoading(true);
    try {
      const filters = { account_type: 'time_deposit' };
      if (record.member_id) filters.member_id = record.member_id;
      const vouchers = await getApprovedWithdrawalVouchers(filters);
      setWithdrawVouchers(vouchers || []);
    } catch (err) {
      toast.error('Failed to load withdrawal vouchers.');
      setWithdrawVouchers([]);
    } finally {
      setWithdrawLoading(false);
    }
  }

  async function handleWithdraw() {
    const voucher = withdrawVouchers.find(v => v.id === withdrawVoucherId);
    if (!voucher) return toast.error('Select an approved withdrawal voucher first.');
    const value = parseFloat(voucher.amount) || 0;
    if (value <= 0) return toast.error('Voucher amount must be greater than zero.');

    setWithdrawPosting(true);
    try {
      await createTransaction({
        category:         'time_deposit',
        type:             'withdrawal',
        amount:           value,
        transaction_date: voucher.date || new Date().toISOString().split('T')[0],
        created_by:       user?.id ?? null,
        reference:        voucher.voucher_no,
        notes:            [
          `Voucher: ${voucher.voucher_no}`,
          voucher.purpose ? `Purpose: ${voucher.purpose}` : null,
        ].filter(Boolean).join(' | '),
        payment_mode:     voucher.payment_mode || null,
        ...(withdrawTarget.member_id ? { member_id: withdrawTarget.member_id } : {}),
      });

      trackActivity({
        userId: user?.id,
        module: 'time_deposit',
        action: 'withdrawal',
        description: `Time Deposit withdrawal of ${formatCurrency(value)} via voucher ${voucher.voucher_no} for ${withdrawTarget.name}`,
      });

      toast.success(`Time Deposit withdrawal posted from voucher ${voucher.voucher_no}.`);
      setWithdrawTarget(null);
      await fetchData(true);
    } catch (err) {
      toast.error(err.message || 'Failed to post withdrawal.');
    } finally {
      setWithdrawPosting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <PageHeader
        title="Time Deposit"
        subtitle="Manage time deposit applications, payments, and records"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="primary" icon={<Plus size={14} />} onClick={openCreate}>
              New Application
            </Button>
            <Button
              variant="outline"
              icon={<Printer size={14} />}
              onClick={handlePrint}
            >
              Print
            </Button>
            <Button
              variant="outline"
              icon={<FileDown size={14} />}
              onClick={() => exportToCSV(filtered)}
            >
              Export CSV
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
          {/* ── Stats ───────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 mb-6">
            <StatCard
              icon={<Users size={22} className="text-indigo-600" />}
              label="Total Records"
              value={stats.total}
              sub="All time deposit applications"
              bg="bg-indigo-50"
              textColor="text-indigo-700"
            />
            <StatCard
              icon={<TrendingUp size={22} className="text-emerald-600" />}
              label="Active Deposits"
              value={stats.active}
              sub="Currently earning interest"
              bg="bg-emerald-50"
              textColor="text-emerald-700"
            />
            <StatCard
              icon={<DollarSign size={22} className="text-blue-600" />}
              label="Total Deposit Amount"
              value={formatCurrency(stats.totalAmt)}
              sub="Sum of all amounts"
              bg="bg-blue-50"
              textColor="text-blue-700"
            />
            <StatCard
              icon={<Receipt size={22} className="text-amber-600" />}
              label="Total Payments Collected"
              value={formatCurrency(stats.totalPaid)}
              sub="Across all records"
              bg="bg-amber-50"
              textColor="text-amber-600"
            />
          </div>

          {/* ── Status Tabs ─────────────────────────────────────────────── */}
          <div className="flex items-center gap-1 mb-4 border-b border-gray-100 overflow-x-auto pb-px">
            {STATUS_TABS.map(tab => {
              const count = tabCounts[tab.value] ?? 0;
              const active = statusFilter === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => setStatusFilter(tab.value)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px ${
                    active
                      ? 'border-[#07A04E] text-[#07A04E]'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                    active ? 'bg-[#07A04E]/10 text-[#07A04E]' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ── Table Controls ───────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search name, address, employer…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#07A04E] bg-white"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Date range */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Calendar size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  title="Date Applied from"
                  className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#07A04E] bg-white text-gray-700"
                />
              </div>
              <span className="text-xs text-gray-400">to</span>
              <div className="relative">
                <Calendar size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  title="Date Applied to"
                  className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#07A04E] bg-white text-gray-700"
                />
              </div>
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => { setDateFrom(''); setDateTo(''); }}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                  title="Clear date filter"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <p className="ml-auto text-xs text-gray-400 self-center">
              {filtered.length} record{filtered.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* ── Table ───────────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-100">
                    <SortTh label="Name"          field="name"             sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="Amount"        field="amount"           sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="Terms"         field="terms"            sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="Interest Rate" field="interest_rate"    sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="Date Applied"  field="date_applied"     sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="Termination"   field="termination_date" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="Status"        field="status"           sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-50">
                  {paginated.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-16 text-center">
                        <div className="flex flex-col items-center gap-2 text-gray-400">
                          <Landmark size={36} className="text-gray-200" />
                          <p className="text-sm font-medium">No time deposit records found.</p>
                          <p className="text-xs text-gray-400">Click "New Application" to get started.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginated.map(record => {
                      const isActive = record.status === 'Active';
                      const isCancellable = record.status === 'Active' || record.status === 'Inactive';

                      return (
                        <tr key={record.id} className="hover:bg-gray-50/60 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-gray-800 text-sm">{record.name}</div>
                            {record.address && (
                              <div className="text-xs text-gray-400 truncate max-w-[160px]">{record.address}</div>
                            )}
                          </td>

                          <td className="px-4 py-3 font-semibold text-gray-700">
                            {formatCurrency(record.amount)}
                          </td>

                          <td className="px-4 py-3 text-gray-600">
                            {record.terms} mo{record.terms !== 1 ? 's' : ''}
                          </td>

                          <td className="px-4 py-3 text-gray-600">
                            {parseFloat(record.interest_rate || 0).toFixed(2)}%
                          </td>

                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                            {formatDate(record.date_applied)}
                          </td>

                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                            {record.termination_date ? formatDate(record.termination_date) : '—'}
                          </td>

                          <td className="px-4 py-3">
                            <StatusBadge status={record.status} />
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1">
                              <ActionBtn
                                icon={<CreditCard size={13} />}
                                title="Record Payment"
                                color="indigo"
                                onClick={() => openPay(record)}
                                disabled={!isActive}
                              />
                              <ActionBtn
                                icon={<TrendingDown size={13} />}
                                title="Withdraw"
                                color="red"
                                onClick={() => openWithdraw(record)}
                              />
                              <ActionBtn
                                icon={<Receipt size={13} />}
                                title="Payment History"
                                color="amber"
                                onClick={() => setHistoryTarget(record)}
                              />
                              <ActionBtn
                                icon={<Pencil size={13} />}
                                title="Edit"
                                color="blue"
                                onClick={() => openEdit(record)}
                              />
                              <ActionBtn
                                icon={<Ban size={13} />}
                                title="Cancel Deposit"
                                color="orange"
                                onClick={() => setCancelTarget(record)}
                                disabled={!isCancellable}
                              />
                              <ActionBtn
                                icon={<Trash2 size={13} />}
                                title="Delete"
                                color="red"
                                onClick={() => setDeleteTarget(record)}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {filtered.length > PAGE_SIZE && (
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  Showing{' '}
                  <span className="font-medium text-gray-600">
                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)}
                  </span>{' '}
                  of <span className="font-medium text-gray-600">{filtered.length}</span> records
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
                    .reduce((acc, n, i, arr) => {
                      if (i > 0 && n - arr[i - 1] > 1) acc.push('...');
                      acc.push(n);
                      return acc;
                    }, [])
                    .map((n, i) =>
                      n === '...'
                        ? <span key={`ellipsis-${i}`} className="px-1 text-gray-400 text-xs">…</span>
                        : (
                          <button
                            key={n}
                            onClick={() => setPage(n)}
                            className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${
                              n === page
                                ? 'bg-[#07A04E] text-white'
                                : 'border border-gray-200 text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            {n}
                          </button>
                        )
                    )
                  }
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Application Modal (Create / Edit)                                 */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <Modal
        open={appModalOpen}
        onClose={() => setAppModalOpen(false)}
        title={editTarget ? 'Edit Time Deposit' : 'New Time Deposit Application'}
        size="xl"
      >
        {editTarget && (
          <div className="mb-4 p-3 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Current Status</span>
            <select
              value={form.status || 'Active'}
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#07A04E] bg-white font-medium"
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
        )}

        <TimeDepositForm form={form} onChange={setForm} showSiNumber={!editTarget} />

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
          <Button variant="outline" onClick={() => setAppModalOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={saving}
            onClick={handleSave}
            icon={<Plus size={14} />}
          >
            {editTarget ? 'Save Changes' : 'Submit Application'}
          </Button>
        </div>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Delete Confirm Modal                                              */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Time Deposit"
        size="sm"
      >
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
            <Trash2 size={26} className="text-red-500" />
          </div>
          <div>
            <p className="font-semibold text-gray-800 text-base">
              Delete &ldquo;{deleteTarget?.name}&rdquo;?
            </p>
            <p className="text-sm text-gray-500 mt-1">
              This will permanently remove the record and all its payment history. This action cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            loading={deleting}
            onClick={handleDelete}
            icon={<Trash2 size={14} />}
          >
            Delete
          </Button>
        </div>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Cancel Confirm Modal                                              */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <Modal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Cancel Time Deposit"
        size="sm"
      >
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center">
            <Ban size={26} className="text-orange-500" />
          </div>
          <div>
            <p className="font-semibold text-gray-800 text-base">
              Cancel &ldquo;{cancelTarget?.name}&rdquo;?
            </p>
            <p className="text-sm text-gray-500 mt-1">
              This will mark the deposit as Cancelled. You can reactivate it via Edit if needed.
            </p>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <Button variant="outline" className="flex-1" onClick={() => setCancelTarget(null)}>
            Go Back
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            loading={cancelling}
            onClick={handleCancel}
            icon={<Ban size={14} />}
          >
            Confirm Cancel
          </Button>
        </div>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Payment Modal                                                     */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <Modal
        open={!!payTarget}
        onClose={() => setPayTarget(null)}
        title="Record Payment"
        size="sm"
      >
        {payTarget && (
          <>
            {/* Deposit Summary Card */}
            <div className="mb-5 p-4 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl border border-indigo-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Landmark size={18} className="text-indigo-600" />
                </div>
                <div>
                  <p className="font-bold text-gray-800 text-sm">{payTarget.name}</p>
                  <p className="text-xs text-gray-500">Time Deposit Account</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white/70 rounded-lg p-2.5 text-center">
                  <p className="text-xs text-gray-400 mb-0.5">Deposit Amount</p>
                  <p className="text-sm font-bold text-indigo-700">{formatCurrency(payTarget.amount)}</p>
                </div>
                <div className="bg-white/70 rounded-lg p-2.5 text-center">
                  <p className="text-xs text-gray-400 mb-0.5">Terms</p>
                  <p className="text-sm font-bold text-gray-700">{payTarget.terms} mo{payTarget.terms !== 1 ? 's' : ''}</p>
                </div>
                <div className="bg-white/70 rounded-lg p-2.5 text-center">
                  <p className="text-xs text-gray-400 mb-0.5">Interest</p>
                  <p className="text-sm font-bold text-emerald-700">{parseFloat(payTarget.interest_rate || 0).toFixed(2)}%</p>
                </div>
              </div>
            </div>

            {/* Payment fields */}
            <div className="space-y-4">
              <Field label="SI#" required>
                <div className="relative">
                  <Receipt size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={paySiNo}
                    onChange={e => setPaySiNo(e.target.value)}
                    placeholder="Enter SI# manually"
                    className={`${inputCls} pl-9`}
                    autoFocus
                  />
                </div>
              </Field>
              <Field label="Amount Paid (₱)" required>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  placeholder="0.00"
                  className={inputCls}
                />
              </Field>
              <Field label="Payment Date" required>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="date"
                    value={payDate}
                    onChange={e => setPayDate(e.target.value)}
                    className={`${inputCls} pl-9`}
                  />
                </div>
              </Field>
              <Field label="Mode of Payment" required>
                <select
                  value={payMode}
                  onChange={e => setPayMode(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Select mode of payment</option>
                  <option value="Cash">Cash</option>
                  <option value="GCash">GCash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Check">Check</option>
                  <option value="Others">Others</option>
                </select>
              </Field>
            </div>

            <div className="flex gap-3 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => setPayTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="finance"
                className="flex-1"
                loading={paying}
                onClick={handlePay}
                icon={<CreditCard size={14} />}
              >
                Record Payment
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Payment History Modal                                             */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <Modal
        open={!!historyTarget}
        onClose={() => setHistoryTarget(null)}
        title="Payment History"
        size="md"
      >
        {historyTarget && (
          <>
            <div className="mb-4 flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
              <div className="w-9 h-9 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <Landmark size={16} className="text-indigo-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-800 text-sm">{historyTarget.name}</p>
                <p className="text-xs text-gray-500">
                  {formatCurrency(historyTarget.amount)} · {historyTarget.terms} month{historyTarget.terms !== 1 ? 's' : ''} · {parseFloat(historyTarget.interest_rate || 0).toFixed(2)}% interest
                </p>
              </div>
              <StatusBadge status={historyTarget.status} />
            </div>

            {(!historyTarget.time_deposit_payments || historyTarget.time_deposit_payments.length === 0) ? (
              <div className="py-10 text-center">
                <Receipt size={32} className="text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No payments recorded yet.</p>
                <p className="text-xs text-gray-300 mt-1">Use the Pay button to record the first payment.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">SI#</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount Paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {[...historyTarget.time_deposit_payments]
                      .sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date))
                      .map(p => (
                        <tr key={p.id} className="hover:bg-gray-50/60 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-indigo-700 font-semibold">{p.si_number}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">{formatDate(p.payment_date)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-700">{formatCurrency(p.amount)}</td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-emerald-50/60 border-t border-emerald-100">
                      <td colSpan={2} className="px-4 py-3 text-xs font-semibold text-emerald-700">
                        Total Payments ({historyTarget.time_deposit_payments.length})
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-emerald-700">
                        {formatCurrency(
                          historyTarget.time_deposit_payments.reduce(
                            (s, p) => s + (parseFloat(p.amount) || 0), 0
                          )
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <div className="flex justify-end mt-4">
              <Button variant="outline" onClick={() => setHistoryTarget(null)}>
                Close
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* Withdrawal Modal                                                   */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <Modal
        open={!!withdrawTarget}
        onClose={() => setWithdrawTarget(null)}
        title="Time Deposit Withdrawal from Approved Voucher"
        size="sm"
      >
        {withdrawTarget && (
          <>
            <div className="mb-4 flex items-center gap-3 p-3 bg-red-50 rounded-xl border border-red-100">
              <div className="w-9 h-9 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Landmark size={16} className="text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-800 text-sm">{withdrawTarget.name}</p>
                <p className="text-xs text-gray-500">
                  {formatCurrency(withdrawTarget.amount)} · {withdrawTarget.terms} month{withdrawTarget.terms !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            <p className="text-xs text-gray-500 mb-3">
              Create a <span className="font-semibold">Time Deposit withdrawal voucher</span> in the Vouchers page and get it approved first before posting here.
            </p>

            {withdrawLoading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : withdrawVouchers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                No approved Time Deposit withdrawal vouchers found. Create and approve one in the Vouchers page first.
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Approved Voucher</label>
                  <select
                    value={withdrawVoucherId}
                    onChange={e => setWithdrawVoucherId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="">Select approved voucher</option>
                    {withdrawVouchers.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.voucher_no} · {formatCurrency(v.amount)} · {v.purpose}
                      </option>
                    ))}
                  </select>
                </div>

                {withdrawVoucherId && (() => {
                  const v = withdrawVouchers.find(x => x.id === withdrawVoucherId);
                  if (!v) return null;
                  return (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                        <p className="text-gray-400 mb-0.5">Amount</p>
                        <p className="font-semibold text-gray-800">{formatCurrency(v.amount)}</p>
                      </div>
                      <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                        <p className="text-gray-400 mb-0.5">Date</p>
                        <p className="font-semibold text-gray-800">{formatDate(v.date)}</p>
                      </div>
                      <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                        <p className="text-gray-400 mb-0.5">Mode</p>
                        <p className="font-semibold text-gray-800">{v.payment_mode || '—'}</p>
                      </div>
                      <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                        <p className="text-gray-400 mb-0.5">Reference</p>
                        <p className="font-semibold text-gray-800 break-all">{v.reference || '—'}</p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => setWithdrawTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                loading={withdrawPosting}
                onClick={handleWithdraw}
                disabled={!withdrawVoucherId || withdrawLoading || withdrawVouchers.length === 0}
                icon={<TrendingDown size={14} />}
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