import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileText, Search, Plus, Pencil, Ban, Eye,
  DollarSign, CheckCircle, AlertTriangle, Printer, Download,
} from 'lucide-react';
import { exportToCSV } from '../../utils/csvExport';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
import { trackActivity } from '../../services/logService';
import {
  getVouchers,
  createVoucher,
  createMemberWithdrawalVoucher,
  updateVoucher,
  approveVoucher,
  voidVoucher,
} from '../../services/voucherService';
import { getExpenses } from '../../services/expenseService';
import { getMembers } from '../../services/memberService';
import { getAccountsByMemberId } from '../../services/accountService';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';
import { printHtmlDocument, wrapWithLetterhead } from '../../utils/print';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_BADGE = {
  draft: 'warning',
  approved: 'success',
  voided: 'danger',
};

const STATUS_LABEL = {
  draft: 'Draft',
  approved: 'Approved',
  voided: 'Voided',
};

const VOUCHER_KIND_OPTIONS = [
  { value: 'expense', label: 'Expense' },
  { value: 'member_withdrawal', label: 'Member Withdrawal' },
];

const PAYMENT_MODE_OPTIONS = [
  { value: '', label: 'Select mode of payment' },
  { value: 'Cash', label: 'Cash' },
  { value: 'GCash', label: 'GCash' },
  { value: 'Bank Transfer', label: 'Bank Transfer' },
  { value: 'Check', label: 'Check' },
  { value: 'Others', label: 'Others' },
];

const EMPTY_FORM = {
  voucher_kind: 'expense',
  date: new Date().toISOString().split('T')[0],
  payee: '',
  purpose: '',
  amount: '',
  notes: '',
  expense_id: '',

  member_id: '',
  account_id: '',
  account_type: '',
  payment_mode: '',
  reference: '',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function memberLabel(member) {
  if (!member) return '—';
  return `${member.first_name || ''} ${member.last_name || ''}`.trim();
}

function voucherKindLabel(kind) {
  if (kind === 'member_withdrawal') return 'Member Withdrawal';
  return 'Expense';
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VouchersPage() {
  const { user } = useAuth();

  // Data
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [expenseList, setExpenseList] = useState([]);
  const [memberList, setMemberList] = useState([]);
  const [memberAccounts, setMemberAccounts] = useState([]);

  // Filters
  const [search, setSearch] = useState('');
  const [statFilter, setStatFilter] = useState('');
  const [kindFilter, setKindFilter] = useState('');

  // Add / Edit modal
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErr, setFormErr] = useState({});
  const [saving, setSaving] = useState(false);

  // View detail modal
  const [viewTarget, setViewTarget] = useState(null);

  // Approve confirm modal
  const [approveTarget, setApproveTarget] = useState(null);
  const [approving, setApproving] = useState(false);

  // Void confirm modal
  const [voidTarget, setVoidTarget] = useState(null);
  const [voiding, setVoiding] = useState(false);

  // ── Fetch ───────────────────────────────────────────────────────────────────

  const fetchVouchers = useCallback(async () => {
    try {
      setLoading(true);
      setVouchers(await getVouchers());
    } catch {
      toast.error('Failed to load vouchers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVouchers();
  }, [fetchVouchers]);

  useEffect(() => {
    getExpenses({ status: 'recorded' })
      .then(setExpenseList)
      .catch(() => setExpenseList([]));

    getMembers()
      .then(setMemberList)
      .catch(() => setMemberList([]));
  }, []);

  useEffect(() => {
    async function loadAccounts() {
      if (!form.member_id) {
        setMemberAccounts([]);
        return;
      }

      try {
        const accounts = await getAccountsByMemberId(form.member_id);
        setMemberAccounts(accounts || []);
      } catch {
        setMemberAccounts([]);
      }
    }

    loadAccounts();
  }, [form.member_id]);

  // ── Derived account options ─────────────────────────────────────────────────

  const filteredMemberAccounts = useMemo(() => {
    if (!form.member_id) return [];
    return (memberAccounts || []).filter(acc =>
      !form.account_type || acc.account_type === form.account_type
    );
  }, [memberAccounts, form.member_id, form.account_type]);

  // ── Client-side filtering ───────────────────────────────────────────────────

  const filtered = vouchers.filter(v => {
    const q = search.toLowerCase();
    const matchSearch = !q || (
      v.payee?.toLowerCase().includes(q) ||
      v.purpose?.toLowerCase().includes(q) ||
      v.voucher_no?.toLowerCase().includes(q) ||
      v.members?.first_name?.toLowerCase().includes(q) ||
      v.members?.last_name?.toLowerCase().includes(q) ||
      v.accounts?.account_no?.toLowerCase().includes(q)
    );
    const matchStat = !statFilter || v.status === statFilter;
    const matchKind = !kindFilter || (v.voucher_kind || 'expense') === kindFilter;
    return matchSearch && matchStat && matchKind;
  });

  // ── Summary stats ───────────────────────────────────────────────────────────

  const active = vouchers.filter(v => v.status !== 'voided');
  const approvedList = vouchers.filter(v => v.status === 'approved');
  const draftList = vouchers.filter(v => v.status === 'draft');
  const totalActive = active.reduce((s, v) => s + (v.amount || 0), 0);

  // ── Form helpers ────────────────────────────────────────────────────────────

  function handlePrint() {
    const fmt = (n) => 'PHP ' + Number(n ?? 0).toLocaleString('en-PH', {minimumFractionDigits:2,maximumFractionDigits:2});
    const statusLabel = {draft:'Draft',approved:'Approved',voided:'Voided'};
    const kindLabel = {expense:'Expense',member_withdrawal:'Member Withdrawal'};
    const rows = filtered.map(v => `<tr>
      <td style="text-align:center;font-family:monospace">${v.voucher_no||'—'}</td>
      <td style="text-align:center">${kindLabel[v.voucher_kind]||v.voucher_kind||'—'}</td>
      <td style="text-align:center;white-space:nowrap">${v.date||'—'}</td>
      <td>${v.payee||'—'}</td>
      <td>${v.purpose||'—'}</td>
      <td style="text-align:right;font-weight:600">${fmt(v.amount)}</td>
      <td style="text-align:center">${statusLabel[v.status]||v.status||'—'}</td>
    </tr>`).join('');
    const html = `
      <h1 class="report-title">Vouchers</h1>
      <div class="report-meta">Payment voucher registry &nbsp;|&nbsp; ${filtered.length} records &nbsp;|&nbsp; Generated: ${new Date().toLocaleString('en-PH')}</div>
      <table>
        <thead><tr><th style="text-align:center">Voucher No.</th><th style="text-align:center">Type</th><th style="text-align:center">Date</th><th>Payee</th><th>Purpose</th><th style="text-align:right">Amount</th><th style="text-align:center">Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="confidential">WELLSERVE Cooperative Monitoring System — Authorized personnel only.</div>
    `;
    const win = printHtmlDocument(wrapWithLetterhead(html, {title:'Vouchers — WELLSERVE'}), {
      onBlocked: () => toast.error('Pop-up blocked. Please allow pop-ups and try again.'),
    });
    if (win) toast.success('Print dialog opened.');
  }

  function handleExportCSV() {
    try {
      if (filtered.length === 0) { toast.error('No vouchers to export.'); return; }
      const rows = filtered.map(v => ({
        voucher_no: v.voucher_no || '',
        type: voucherKindLabel(v.voucher_kind),
        date: v.date || '',
        payee: v.payee || '',
        purpose: v.purpose || '',
        amount: v.amount || 0,
        status: STATUS_LABEL[v.status] || v.status || '',
        notes: v.notes || '',
      }));
      exportToCSV('vouchers_report.csv', rows);
      toast.success('CSV exported successfully');
    } catch (err) {
      toast.error(err.message || 'Failed to export CSV');
    }
  }

  function openAdd() {
    setEditTarget(null);
    setForm({
      ...EMPTY_FORM,
      voucher_kind: 'expense',
      date: new Date().toISOString().split('T')[0],
    });
    setFormErr({});
    setMemberAccounts([]);
    setFormOpen(true);
  }

  function openEdit(voucher) {
    setEditTarget(voucher);
    setForm({
      voucher_kind: voucher.voucher_kind || 'expense',
      date: voucher.date || '',
      payee: voucher.payee || '',
      purpose: voucher.purpose || '',
      amount: voucher.amount?.toString() || '',
      notes: voucher.notes || '',
      expense_id: voucher.expense_id || '',

      member_id: voucher.member_id || '',
      account_id: voucher.account_id || '',
      account_type: voucher.account_type || '',
      payment_mode: voucher.payment_mode || '',
      reference: voucher.reference || '',
    });
    setFormErr({});
    setFormOpen(true);
  }

  function setField(field, value) {
    setForm(f => {
      const next = { ...f, [field]: value };

      if (field === 'voucher_kind' && value === 'expense') {
        next.member_id = '';
        next.account_id = '';
        next.account_type = '';
        next.payment_mode = '';
        next.reference = '';
      }

      if (field === 'voucher_kind' && value === 'member_withdrawal') {
        next.expense_id = '';
      }

      if (field === 'member_id') {
        next.account_id = '';
        next.account_type = '';
        next.payee = '';
      }

      if (field === 'account_type') {
        next.account_id = '';
      }

      if (field === 'account_id') {
        const selected = memberAccounts.find(a => a.id === value);
        if (selected) {
          next.account_type = selected.account_type || '';
        }
      }

      return next;
    });

    setFormErr(e => ({ ...e, [field]: undefined }));
  }

  useEffect(() => {
    if (form.voucher_kind !== 'member_withdrawal') return;
    if (!form.member_id) return;

    const selectedMember = memberList.find(m => m.id === form.member_id);
    if (!selectedMember) return;

    const fullName = `${selectedMember.first_name || ''} ${selectedMember.last_name || ''}`.trim();

    setForm(prev => ({
      ...prev,
      payee: prev.payee || fullName,
    }));
  }, [form.voucher_kind, form.member_id, memberList]);

  function validateForm() {
    const errs = {};

    if (!form.date) errs.date = 'Date is required.';

    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0) {
      errs.amount = 'Enter a valid amount greater than zero.';
    }

    if (form.voucher_kind === 'expense') {
      if (!form.payee.trim()) errs.payee = 'Payee is required.';
      if (!form.purpose.trim()) errs.purpose = 'Purpose is required.';
    }

    if (form.voucher_kind === 'member_withdrawal') {
      if (!form.member_id) errs.member_id = 'Member is required.';
      if (!form.account_type) errs.account_type = 'Account type is required.';
      if (form.account_type !== 'time_deposit' && !form.account_id) errs.account_id = 'Account is required.';
      if (!form.payee.trim()) errs.payee = 'Payee is required.';
      if (!form.purpose.trim()) errs.purpose = 'Purpose is required.';
      if (!form.payment_mode) errs.payment_mode = 'Mode of payment is required.';
    }

    return errs;
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  async function handleSave() {
    const errs = validateForm();
    if (Object.keys(errs).length) {
      setFormErr(errs);
      return;
    }

    setSaving(true);
    try {
      const basePayload = {
        date: form.date,
        payee: form.payee.trim(),
        purpose: form.purpose.trim(),
        amount: parseFloat(form.amount),
        notes: form.notes.trim() || null,
        created_by: user?.id ?? null,
      };

      if (form.voucher_kind === 'member_withdrawal') {
        const payload = {
          ...basePayload,
          voucher_kind: 'member_withdrawal',
          member_id: form.member_id,
          account_id: form.account_id,
          account_type: form.account_type,
          payment_mode: form.payment_mode || null,
          reference: form.reference.trim() || null,
          expense_id: null,
        };

        if (editTarget) {
          await updateVoucher(editTarget.id, payload);
          toast.success('Withdrawal voucher updated.');
          trackActivity({ userId: user?.id, module: 'voucher', action: 'update', description: `Updated withdrawal voucher for ${form.payee.trim()}` });
        } else {
          await createMemberWithdrawalVoucher(payload);
          toast.success('Withdrawal voucher created.');
          trackActivity({ userId: user?.id, module: 'voucher', action: 'create', description: `Created withdrawal voucher for ${form.payee.trim()} — ₱${form.amount}` });
        }
      } else {
        const payload = {
          ...basePayload,
          voucher_kind: 'expense',
          expense_id: form.expense_id || null,
          member_id: null,
          account_id: null,
          account_type: null,
          payment_mode: null,
          reference: null,
        };

        if (editTarget) {
          await updateVoucher(editTarget.id, payload);
          toast.success('Voucher updated.');
          trackActivity({ userId: user?.id, module: 'voucher', action: 'update', description: `Updated voucher: ${form.purpose.trim()}` });
        } else {
          await createVoucher(payload);
          toast.success('Voucher created.');
          trackActivity({ userId: user?.id, module: 'voucher', action: 'create', description: `Created voucher: ${form.purpose.trim()} — ₱${form.amount}` });
        }
      }

      setFormOpen(false);
      fetchVouchers();
    } catch (err) {
      toast.error(err.message || 'Failed to save voucher.');
    } finally {
      setSaving(false);
    }
  }

  // ── Approve ─────────────────────────────────────────────────────────────────

  async function handleApprove() {
    if (!approveTarget) return;
    setApproving(true);
    try {
      await approveVoucher(approveTarget.id);
      toast.success(`Voucher ${approveTarget.voucher_no} approved.`);
      trackActivity({ userId: user?.id, module: 'voucher', action: 'approve', description: `Approved voucher ${approveTarget.voucher_no}` });
      setApproveTarget(null);
      fetchVouchers();
    } catch (err) {
      toast.error(err.message || 'Failed to approve voucher.');
    } finally {
      setApproving(false);
    }
  }

  // ── Void ────────────────────────────────────────────────────────────────────

  async function handleVoid() {
    if (!voidTarget) return;
    setVoiding(true);
    try {
      await voidVoucher(voidTarget.id);
      toast.success(`Voucher ${voidTarget.voucher_no} voided.`);
      trackActivity({ userId: user?.id, module: 'voucher', action: 'void', description: `Voided voucher ${voidTarget.voucher_no}` });
      setVoidTarget(null);
      fetchVouchers();
    } catch (err) {
      toast.error(err.message || 'Failed to void voucher.');
    } finally {
      setVoiding(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6">
      <PageHeader
        title="Vouchers"
        subtitle="Manage disbursement vouchers"
        action={
          <Button variant="primary" icon={<Plus size={15} />} onClick={openAdd}>
            New Voucher
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 mb-6">
        <SummaryCard
          icon={<DollarSign size={20} className="text-green-600" />}
          label="Total Amount"
          value={formatCurrency(totalActive)}
          bg="bg-green-50"
        />
        <SummaryCard
          icon={<CheckCircle size={20} className="text-blue-600" />}
          label="Approved"
          value={approvedList.length}
          bg="bg-blue-50"
        />
        <SummaryCard
          icon={<AlertTriangle size={20} className="text-amber-500" />}
          label="Pending Draft"
          value={draftList.length}
          bg="bg-amber-50"
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by payee, purpose, voucher no..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-[#7EB751] transition"
          />
        </div>

        <select
          value={kindFilter}
          onChange={e => setKindFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg
            focus:outline-none focus:ring-2 focus:ring-[#7EB751] bg-white text-gray-700 transition"
        >
          <option value="">All Types</option>
          <option value="expense">Expense</option>
          <option value="member_withdrawal">Member Withdrawal</option>
        </select>

        <select
          value={statFilter}
          onChange={e => setStatFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg
            focus:outline-none focus:ring-2 focus:ring-[#7EB751] bg-white text-gray-700 transition"
        >
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="approved">Approved</option>
          <option value="voided">Voided</option>
        </select>
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

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Voucher No.', 'Type', 'Date', 'Payee', 'Purpose', 'Amount', 'Status', 'Actions'].map(h => (
                    <th
                      key={h}
                      className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide ${
                        ['Voucher No.', 'Type', 'Date', 'Amount', 'Status', 'Actions'].includes(h)
                          ? 'text-center'
                          : 'text-left'
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
                    <td colSpan={8} className="text-center py-12 text-gray-400">
                      <FileText size={32} className="mx-auto mb-2 text-gray-200" />
                      {search || statFilter || kindFilter
                        ? 'No vouchers match your filters.'
                        : 'No vouchers created yet.'}
                    </td>
                  </tr>
                ) : filtered.map(voucher => (
                  <tr
                    key={voucher.id}
                    className={`hover:bg-[#D6FADC]/20 transition-colors ${
                      voucher.status === 'voided' ? 'opacity-50' : ''
                    }`}
                  >
                    <td className="px-4 py-3 text-center">
                      <span className="font-mono text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                        {voucher.voucher_no}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        (voucher.voucher_kind || 'expense') === 'member_withdrawal'
                          ? 'bg-red-50 text-red-700'
                          : 'bg-blue-50 text-blue-700'
                      }`}>
                        {voucherKindLabel(voucher.voucher_kind || 'expense')}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-center">
                      {formatDate(voucher.date)}
                    </td>

                    <td className="px-4 py-3 font-medium text-gray-900">
                      <div>
                        <p>{voucher.payee}</p>
                        {voucher.members?.member_no && (
                          <p className="text-xs text-gray-400 font-mono mt-0.5">
                            {voucher.members.member_no}
                          </p>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-gray-600">
                      <p className="truncate max-w-[240px]">{voucher.purpose}</p>
                      {voucher.accounts?.account_no && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {voucher.account_type?.toUpperCase()} · {voucher.accounts.account_no}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap text-center">
                      {formatCurrency(voucher.amount)}
                    </td>

                    <td className="px-4 py-3 text-center">
                      <Badge variant={STATUS_BADGE[voucher.status] || 'default'} dot>
                        {STATUS_LABEL[voucher.status] || voucher.status}
                      </Badge>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-center">
                        <button
                          onClick={() => setViewTarget(voucher)}
                          title="View Details"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-[#000066] hover:bg-blue-50 transition-colors"
                        >
                          <Eye size={15} />
                        </button>

                        {voucher.status === 'draft' && (
                          <button
                            onClick={() => openEdit(voucher)}
                            title="Edit Voucher"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-[#000066] hover:bg-blue-50 transition-colors"
                          >
                            <Pencil size={15} />
                          </button>
                        )}

                        {voucher.status === 'draft' && (
                          <button
                            onClick={() => setApproveTarget(voucher)}
                            title="Approve Voucher"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                          >
                            <CheckCircle size={15} />
                          </button>
                        )}

                        {(voucher.status === 'draft' || voucher.status === 'approved') && (
                          <button
                            onClick={() => setVoidTarget(voucher)}
                            title="Void Voucher"
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

          {filtered.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Showing {filtered.length} of {vouchers.length} voucher{vouchers.length !== 1 ? 's' : ''}
              </p>
              <p className="text-xs font-medium text-gray-700">
                Filtered total:{' '}
                <span className="text-green-700">
                  {formatCurrency(
                    filtered
                      .filter(v => v.status !== 'voided')
                      .reduce((s, v) => s + (v.amount || 0), 0)
                  )}
                </span>
              </p>
            </div>
          )}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editTarget ? 'Edit Voucher' : 'New Voucher'}
        size="md"
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Voucher Type</label>
            <select
              value={form.voucher_kind}
              onChange={e => setField('voucher_kind', e.target.value)}
              disabled={!!editTarget}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg
                focus:outline-none focus:ring-2 focus:ring-[#7EB751] bg-white text-gray-700 transition disabled:bg-gray-50"
            >
              {VOUCHER_KIND_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {!!editTarget && (
              <p className="text-xs text-gray-400">Voucher type cannot be changed while editing.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Date"
              required
              type="date"
              value={form.date}
              onChange={e => setField('date', e.target.value)}
              error={formErr.date}
            />
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
          </div>

          {form.voucher_kind === 'expense' ? (
            <>
              <Input
                label="Payee"
                required
                type="text"
                placeholder="Who will receive payment?"
                value={form.payee}
                onChange={e => setField('payee', e.target.value)}
                error={formErr.payee}
              />

              <Input
                label="Purpose"
                required
                type="text"
                placeholder="What is this voucher for?"
                value={form.purpose}
                onChange={e => setField('purpose', e.target.value)}
                error={formErr.purpose}
              />

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">
                  Linked Expense
                  <span className="ml-1.5 text-xs font-normal text-gray-400">(optional)</span>
                </label>
                <select
                  value={form.expense_id}
                  onChange={e => setField('expense_id', e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg
                    focus:outline-none focus:ring-2 focus:ring-[#7EB751] bg-white text-gray-700 transition"
                >
                  <option value="">— None —</option>
                  {expenseList.map(exp => (
                    <option key={exp.id} value={exp.id}>
                      {formatDate(exp.date)} · {exp.description} · {formatCurrency(exp.amount)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400">
                  Link this voucher to an existing expense record for documentation.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Member</label>
                  <select
                    value={form.member_id}
                    onChange={e => setField('member_id', e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg
                      focus:outline-none focus:ring-2 focus:ring-[#7EB751] bg-white text-gray-700 transition"
                  >
                    <option value="">Select member</option>
                    {memberList.map(member => (
                      <option key={member.id} value={member.id}>
                        {member.member_no ? `${member.member_no} · ` : ''}{memberLabel(member)}
                      </option>
                    ))}
                  </select>
                  {formErr.member_id && <p className="text-xs text-red-500">{formErr.member_id}</p>}
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Account Type</label>
                  <select
                    value={form.account_type}
                    onChange={e => setField('account_type', e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg
                      focus:outline-none focus:ring-2 focus:ring-[#7EB751] bg-white text-gray-700 transition"
                  >
                    <option value="">Select account type</option>
                    <option value="cbu">CBU</option>
                    <option value="savings">Savings</option>
                    <option value="time_deposit">Time Deposit</option>
                  </select>
                  {formErr.account_type && <p className="text-xs text-red-500">{formErr.account_type}</p>}
                </div>
              </div>

              {form.account_type !== 'time_deposit' && (
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Account</label>
                  <select
                    value={form.account_id}
                    onChange={e => setField('account_id', e.target.value)}
                    disabled={!form.member_id}
                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg
                      focus:outline-none focus:ring-2 focus:ring-[#7EB751] bg-white text-gray-700 transition disabled:bg-gray-50"
                  >
                    <option value="">Select account</option>
                    {filteredMemberAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {(acc.account_type || '').toUpperCase()} · {acc.account_no || acc.id} · Bal {formatCurrency(acc.balance || 0)}
                      </option>
                    ))}
                  </select>
                  {formErr.account_id && <p className="text-xs text-red-500">{formErr.account_id}</p>}
                </div>
              )}

              <Input
                label="Payee"
                required
                type="text"
                placeholder="Who will receive payment?"
                value={form.payee}
                onChange={e => setField('payee', e.target.value)}
                error={formErr.payee}
              />

              <Input
                label="Purpose"
                required
                type="text"
                placeholder="What is this withdrawal for?"
                value={form.purpose}
                onChange={e => setField('purpose', e.target.value)}
                error={formErr.purpose}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Mode of Payment</label>
                  <select
                    value={form.payment_mode}
                    onChange={e => setField('payment_mode', e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg
                      focus:outline-none focus:ring-2 focus:ring-[#7EB751] bg-white text-gray-700 transition"
                  >
                    {PAYMENT_MODE_OPTIONS.map(opt => (
                      <option key={opt.value || 'empty'} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  {formErr.payment_mode && <p className="text-xs text-red-500">{formErr.payment_mode}</p>}
                </div>

                <Input
                  label="Reference"
                  type="text"
                  placeholder="Optional reference / check no."
                  value={form.reference}
                  onChange={e => setField('reference', e.target.value)}
                />
              </div>
            </>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Notes</label>
            <textarea
              rows={2}
              placeholder="Optional notes..."
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg
                focus:outline-none focus:ring-2 focus:ring-[#7EB751] transition resize-none"
            />
          </div>

          {!editTarget && (
            <p className="text-xs text-gray-400">
              Voucher number will be assigned automatically.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={saving}
            onClick={handleSave}
            icon={!saving && <Plus size={15} />}
          >
            {editTarget ? 'Save Changes' : 'Create Voucher'}
          </Button>
        </div>
      </Modal>

      <Modal
        open={!!viewTarget}
        onClose={() => setViewTarget(null)}
        title="Voucher Details"
        size="md"
      >
        {viewTarget && (
          <>
            <div className="flex items-center justify-between mb-5">
              <span className="font-mono text-sm font-bold text-gray-800 bg-gray-100 px-3 py-1 rounded-lg">
                {viewTarget.voucher_no}
              </span>
              <Badge variant={STATUS_BADGE[viewTarget.status] || 'default'} dot>
                {STATUS_LABEL[viewTarget.status] || viewTarget.status}
              </Badge>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
              {[
                ['Type', voucherKindLabel(viewTarget.voucher_kind || 'expense')],
                ['Date', formatDate(viewTarget.date)],
                ['Payee', viewTarget.payee],
                ['Purpose', viewTarget.purpose],
                ['Amount', <span key="amt" className="font-semibold text-gray-900">{formatCurrency(viewTarget.amount)}</span>],
                ['Mode', viewTarget.payment_mode || '—'],
                ['Reference', viewTarget.reference || '—'],
                ['Notes', viewTarget.notes || '—'],
                ['Created', formatDateTime(viewTarget.created_at)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between px-4 py-3 text-sm">
                  <span className="text-gray-400 font-medium w-28 flex-shrink-0">{label}</span>
                  <span className="text-gray-900 text-right">{value}</span>
                </div>
              ))}

              {viewTarget.members && (
                <div className="flex items-start justify-between px-4 py-3 text-sm bg-blue-50/40">
                  <span className="text-gray-400 font-medium w-28 flex-shrink-0">Member</span>
                  <div className="text-right">
                    <p className="text-gray-900 font-medium">{memberLabel(viewTarget.members)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {viewTarget.members.member_no || '—'}
                    </p>
                  </div>
                </div>
              )}

              {viewTarget.accounts && (
                <div className="flex items-start justify-between px-4 py-3 text-sm bg-red-50/40">
                  <span className="text-gray-400 font-medium w-28 flex-shrink-0">Account</span>
                  <div className="text-right">
                    <p className="text-gray-900 font-medium">
                      {(viewTarget.account_type || viewTarget.accounts.account_type || '').toUpperCase()}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {viewTarget.accounts.account_no || '—'}
                    </p>
                  </div>
                </div>
              )}

              {viewTarget.expenses && (
                <div className="flex items-start justify-between px-4 py-3 text-sm bg-amber-50/40">
                  <span className="text-gray-400 font-medium w-28 flex-shrink-0">
                    Expense Ref
                  </span>
                  <div className="text-right">
                    <p className="text-gray-900 font-medium">
                      {viewTarget.expenses.description}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatDate(viewTarget.expenses.date)}
                      {' · '}
                      {formatCurrency(viewTarget.expenses.amount)}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {(viewTarget.status === 'draft' || viewTarget.status === 'approved') && (
              <div className="flex justify-end gap-3 mt-5">
                {viewTarget.status === 'draft' && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<Pencil size={13} />}
                      onClick={() => { setViewTarget(null); openEdit(viewTarget); }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="success"
                      size="sm"
                      icon={<CheckCircle size={13} />}
                      onClick={() => { setViewTarget(null); setApproveTarget(viewTarget); }}
                    >
                      Approve
                    </Button>
                  </>
                )}
                <Button
                  variant="danger"
                  size="sm"
                  icon={<Ban size={13} />}
                  onClick={() => { setViewTarget(null); setVoidTarget(viewTarget); }}
                >
                  Void
                </Button>
              </div>
            )}
          </>
        )}
      </Modal>

      <Modal
        open={!!approveTarget}
        onClose={() => setApproveTarget(null)}
        title="Approve Voucher"
        size="sm"
      >
        {approveTarget && (
          <>
            <p className="text-sm text-gray-600 mb-3">Approve the following voucher?</p>
            <div className="bg-gray-50 rounded-lg px-4 py-3 mb-4 border border-gray-100">
              <p className="font-mono text-xs font-bold text-gray-600 mb-1">
                {approveTarget.voucher_no}
              </p>
              <p className="font-medium text-gray-900 text-sm">{approveTarget.payee}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {approveTarget.purpose} · {formatCurrency(approveTarget.amount)}
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

      <Modal
        open={!!voidTarget}
        onClose={() => setVoidTarget(null)}
        title="Void Voucher"
        size="sm"
      >
        {voidTarget && (
          <>
            <p className="text-sm text-gray-600 mb-3">
              You are about to void the following voucher:
            </p>
            <div className="bg-gray-50 rounded-lg px-4 py-3 mb-4 border border-gray-100">
              <p className="font-mono text-xs font-bold text-gray-600 mb-1">
                {voidTarget.voucher_no}
              </p>
              <p className="font-medium text-gray-900 text-sm">{voidTarget.payee}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {formatDate(voidTarget.date)} · {formatCurrency(voidTarget.amount)}
              </p>
            </div>
            <p className="text-xs text-gray-400 mb-5">
              This cannot be undone. The record will remain visible but marked as voided.
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
                Void Voucher
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

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