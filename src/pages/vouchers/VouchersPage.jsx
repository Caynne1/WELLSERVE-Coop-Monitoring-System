import { useState, useEffect, useCallback } from 'react';
import {
  FileText, Search, Plus, Pencil, Ban, Eye,
  DollarSign, CheckCircle, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
import {
  getVouchers,
  createVoucher,
  updateVoucher,
  approveVoucher,
  voidVoucher,
} from '../../services/voucherService';
// [ADDED] Load recorded expenses for the optional expense link dropdown
import { getExpenses } from '../../services/expenseService';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_BADGE = {
  draft:    'warning',
  approved: 'success',
  voided:   'danger',
};

const STATUS_LABEL = {
  draft:    'Draft',
  approved: 'Approved',
  voided:   'Voided',
};

const EMPTY_FORM = {
  date:       new Date().toISOString().split('T')[0],
  payee:      '',
  purpose:    '',
  amount:     '',
  notes:      '',
  expense_id: '',   // [ADDED] optional — links voucher to a recorded expense
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VouchersPage() {
  const { user } = useAuth();

  // Data
  const [vouchers, setVouchers]       = useState([]);
  const [loading, setLoading]         = useState(true);

  // [ADDED] Recorded expenses for the optional dropdown in the form
  const [expenseList, setExpenseList] = useState([]);

  // Filters
  const [search, setSearch]           = useState('');
  const [statFilter, setStatFilter]   = useState('');

  // Add / Edit modal
  const [formOpen, setFormOpen]       = useState(false);
  const [editTarget, setEditTarget]   = useState(null);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [formErr, setFormErr]         = useState({});
  const [saving, setSaving]           = useState(false);

  // View detail modal
  const [viewTarget, setViewTarget]   = useState(null);

  // Approve confirm modal
  const [approveTarget, setApproveTarget] = useState(null);
  const [approving, setApproving]         = useState(false);

  // Void confirm modal
  const [voidTarget, setVoidTarget]   = useState(null);
  const [voiding, setVoiding]         = useState(false);

  // ── Fetch ────────────────────────────────────────────────────────────────────

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

  useEffect(() => { fetchVouchers(); }, [fetchVouchers]);

  // [ADDED] Load recorded expenses once on mount for the link dropdown
  useEffect(() => {
    getExpenses({ status: 'recorded' })
      .then(setExpenseList)
      .catch(() => setExpenseList([]));
  }, []);

  // ── Client-side filtering ────────────────────────────────────────────────────

  const filtered = vouchers.filter(v => {
    const q = search.toLowerCase();
    const matchSearch = !q || (
      v.payee?.toLowerCase().includes(q)   ||
      v.purpose?.toLowerCase().includes(q) ||
      v.voucher_no?.toLowerCase().includes(q)
    );
    const matchStat = !statFilter || v.status === statFilter;
    return matchSearch && matchStat;
  });

  // ── Summary stats ────────────────────────────────────────────────────────────

  const active       = vouchers.filter(v => v.status !== 'voided');
  const approvedList = vouchers.filter(v => v.status === 'approved');
  const draftList    = vouchers.filter(v => v.status === 'draft');
  const totalActive  = active.reduce((s, v) => s + (v.amount || 0), 0);

  // ── Form helpers ─────────────────────────────────────────────────────────────

  function openAdd() {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().split('T')[0] });
    setFormErr({});
    setFormOpen(true);
  }

  function openEdit(voucher) {
    setEditTarget(voucher);
    setForm({
      date:       voucher.date       || '',
      payee:      voucher.payee      || '',
      purpose:    voucher.purpose    || '',
      amount:     voucher.amount?.toString() || '',
      notes:      voucher.notes      || '',
      expense_id: voucher.expense_id || '',   // [ADDED]
    });
    setFormErr({});
    setFormOpen(true);
  }

  function setField(field, value) {
    setForm(f => ({ ...f, [field]: value }));
    setFormErr(e => ({ ...e, [field]: undefined }));
  }

  function validateForm() {
    const errs = {};
    if (!form.date)           errs.date    = 'Date is required.';
    if (!form.payee.trim())   errs.payee   = 'Payee is required.';
    if (!form.purpose.trim()) errs.purpose = 'Purpose is required.';
    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0)
      errs.amount = 'Enter a valid amount greater than zero.';
    return errs;
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function handleSave() {
    const errs = validateForm();
    if (Object.keys(errs).length) { setFormErr(errs); return; }

    setSaving(true);
    try {
      const payload = {
        date:       form.date,
        payee:      form.payee.trim(),
        purpose:    form.purpose.trim(),
        amount:     parseFloat(form.amount),
        notes:      form.notes.trim()    || null,
        created_by: user?.id             ?? null,
        expense_id: form.expense_id      || null,   // [ADDED] null when not linked
      };

      if (editTarget) {
        await updateVoucher(editTarget.id, payload);
        toast.success('Voucher updated.');
      } else {
        await createVoucher(payload);
        toast.success('Voucher created.');
      }

      setFormOpen(false);
      fetchVouchers();
    } catch (err) {
      toast.error(err.message || 'Failed to save voucher.');
    } finally {
      setSaving(false);
    }
  }

  // ── Approve ──────────────────────────────────────────────────────────────────

  async function handleApprove() {
    if (!approveTarget) return;
    setApproving(true);
    try {
      await approveVoucher(approveTarget.id);
      toast.success(`Voucher ${approveTarget.voucher_no} approved.`);
      setApproveTarget(null);
      fetchVouchers();
    } catch (err) {
      toast.error(err.message || 'Failed to approve voucher.');
    } finally {
      setApproving(false);
    }
  }

  // ── Void ─────────────────────────────────────────────────────────────────────

  async function handleVoid() {
    if (!voidTarget) return;
    setVoiding(true);
    try {
      await voidVoucher(voidTarget.id);
      toast.success(`Voucher ${voidTarget.voucher_no} voided.`);
      setVoidTarget(null);
      fetchVouchers();
    } catch (err) {
      toast.error(err.message || 'Failed to void voucher.');
    } finally {
      setVoiding(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

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

      {/* ── Summary cards ── */}
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

      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by payee, purpose, or voucher no..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-[#7EB751] transition"
          />
        </div>
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
                  {['Voucher No.', 'Date', 'Payee', 'Purpose', 'Amount', 'Status', ''].map(h => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-400">
                      <FileText size={32} className="mx-auto mb-2 text-gray-200" />
                      {search || statFilter
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
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-gray-700
                        bg-gray-100 px-2 py-0.5 rounded">
                        {voucher.voucher_no}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {formatDate(voucher.date)}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {voucher.payee}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <p className="truncate max-w-[200px]">{voucher.purpose}</p>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">
                      {formatCurrency(voucher.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_BADGE[voucher.status] || 'default'} dot>
                        {STATUS_LABEL[voucher.status] || voucher.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setViewTarget(voucher)}
                          title="View Details"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-[#000066]
                            hover:bg-blue-50 transition-colors"
                        >
                          <Eye size={15} />
                        </button>
                        {voucher.status === 'draft' && (
                          <button
                            onClick={() => openEdit(voucher)}
                            title="Edit Voucher"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-[#000066]
                              hover:bg-blue-50 transition-colors"
                          >
                            <Pencil size={15} />
                          </button>
                        )}
                        {voucher.status === 'draft' && (
                          <button
                            onClick={() => setApproveTarget(voucher)}
                            title="Approve Voucher"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-green-600
                              hover:bg-green-50 transition-colors"
                          >
                            <CheckCircle size={15} />
                          </button>
                        )}
                        {(voucher.status === 'draft' || voucher.status === 'approved') && (
                          <button
                            onClick={() => setVoidTarget(voucher)}
                            title="Void Voucher"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600
                              hover:bg-red-50 transition-colors"
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
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50
              flex items-center justify-between">
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

      {/* ── Add / Edit Modal ── */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editTarget ? 'Edit Voucher' : 'New Voucher'}
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

          {/* [ADDED] Optional expense link ─────────────────────────────────── */}
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

      {/* ── View Detail Modal ── */}
      <Modal
        open={!!viewTarget}
        onClose={() => setViewTarget(null)}
        title="Voucher Details"
        size="md"
      >
        {viewTarget && (
          <>
            <div className="flex items-center justify-between mb-5">
              <span className="font-mono text-sm font-bold text-gray-800
                bg-gray-100 px-3 py-1 rounded-lg">
                {viewTarget.voucher_no}
              </span>
              <Badge variant={STATUS_BADGE[viewTarget.status] || 'default'} dot>
                {STATUS_LABEL[viewTarget.status] || viewTarget.status}
              </Badge>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
              {[
                ['Date',    formatDate(viewTarget.date)],
                ['Payee',   viewTarget.payee],
                ['Purpose', viewTarget.purpose],
                ['Amount',  <span key="amt" className="font-semibold text-gray-900">
                              {formatCurrency(viewTarget.amount)}
                            </span>],
                ['Notes',   viewTarget.notes || '—'],
                ['Created', formatDateTime(viewTarget.created_at)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between px-4 py-3 text-sm">
                  <span className="text-gray-400 font-medium w-28 flex-shrink-0">{label}</span>
                  <span className="text-gray-900 text-right">{value}</span>
                </div>
              ))}

              {/* [ADDED] Linked expense — only rendered when present ─────── */}
              {viewTarget.expenses && (
                <div className="flex items-start justify-between px-4 py-3 text-sm
                  bg-amber-50/40">
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

      {/* ── Approve Confirm Modal ── */}
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

      {/* ── Void Confirm Modal ── */}
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