import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, Search, Plus, Pencil, Ban, Eye,
  CheckCircle, Hash, Printer, Download,
} from 'lucide-react';
import PesoSign from '../../components/shared/PesoSign';
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
  getCheckbookEntries,
  createCheckbookEntry,
  updateCheckbookEntry,
  clearCheck,
  voidCheck,
} from '../../services/checkbookService';
// [ADDED] Load approved vouchers for the optional voucher link dropdown
import { getVouchers } from '../../services/voucherService';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';
import { printHtmlDocument, wrapWithLetterhead } from '../../utils/print';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_BADGE = {
  issued:  'warning',
  cleared: 'success',
  voided:  'danger',
};

const STATUS_LABEL = {
  issued:  'Issued',
  cleared: 'Cleared',
  voided:  'Voided',
};

const EMPTY_FORM = {
  check_no:   '',
  date:       new Date().toISOString().split('T')[0],
  payee:      '',
  amount:     '',
  purpose:    '',
  bank:       '',
  notes:      '',
  voucher_id: '',   // [ADDED] optional — links check to the voucher it fulfills
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CheckbookPage() {
  const { user } = useAuth();

  // Data
  const [entries, setEntries]         = useState([]);
  const [loading, setLoading]         = useState(true);

  // [ADDED] Approved vouchers for the optional dropdown in the form
  const [voucherList, setVoucherList] = useState([]);

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

  // Clear confirm modal
  const [clearTarget, setClearTarget] = useState(null);
  const [clearing, setClearing]       = useState(false);

  // Void confirm modal
  const [voidTarget, setVoidTarget]   = useState(null);
  const [voiding, setVoiding]         = useState(false);

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchEntries = useCallback(async () => {
    try {
      setLoading(true);
      setEntries(await getCheckbookEntries());
    } catch {
      toast.error(
        (t) => (
          <span className="flex items-center gap-3 text-sm">
            Failed to load checkbook entries.
            <button
              className="flex-shrink-0 text-xs font-bold underline"
              onClick={() => { toast.dismiss(t.id); fetchEntries(); }}
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

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  // [ADDED] Load approved vouchers once on mount for the link dropdown
  useEffect(() => {
    getVouchers({ status: 'approved' })
      .then(setVoucherList)
      .catch(() => setVoucherList([]));
  }, []);

  // ── Client-side filtering ────────────────────────────────────────────────────

  const filtered = entries.filter(e => {
    const q = search.toLowerCase();
    const matchSearch = !q || (
      e.check_no?.toLowerCase().includes(q) ||
      e.payee?.toLowerCase().includes(q)    ||
      e.purpose?.toLowerCase().includes(q)  ||
      e.bank?.toLowerCase().includes(q)
    );
    const matchStat = !statFilter || e.status === statFilter;
    return matchSearch && matchStat;
  });

  // ── Summary stats ────────────────────────────────────────────────────────────

  const issuedList   = entries.filter(e => e.status === 'issued');
  const clearedList  = entries.filter(e => e.status === 'cleared');
  const totalIssued  = issuedList.reduce((s, e)  => s + (e.amount || 0), 0);
  const totalCleared = clearedList.reduce((s, e) => s + (e.amount || 0), 0);

  // ── Form helpers ─────────────────────────────────────────────────────────────

  function openAdd() {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().split('T')[0] });
    setFormErr({});
    setFormOpen(true);
  }

  function openEdit(entry) {
    setEditTarget(entry);
    setForm({
      check_no:   entry.check_no   || '',
      date:       entry.date       || '',
      payee:      entry.payee      || '',
      amount:     entry.amount?.toString() || '',
      purpose:    entry.purpose    || '',
      bank:       entry.bank       || '',
      notes:      entry.notes      || '',
      voucher_id: entry.voucher_id || '',   // [ADDED]
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
    if (!form.check_no.trim()) errs.check_no = 'Check number is required.';
    if (!form.date)            errs.date     = 'Date is required.';
    if (!form.payee.trim())    errs.payee    = 'Payee is required.';
    if (!form.purpose.trim())  errs.purpose  = 'Purpose is required.';
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
        check_no:   form.check_no.trim(),
        date:       form.date,
        payee:      form.payee.trim(),
        amount:     parseFloat(form.amount),
        purpose:    form.purpose.trim(),
        bank:       form.bank.trim()  || null,
        notes:      form.notes.trim() || null,
        created_by: user?.id          ?? null,
        voucher_id: form.voucher_id   || null,   // [ADDED] null when not linked
      };

      if (editTarget) {
        await updateCheckbookEntry(editTarget.id, payload);
        toast.success('Checkbook entry updated.');
        trackActivity({ userId: user?.id, module: 'checkbook', action: 'update', description: `Updated check #${form.check_no.trim()} payable to ${form.payee.trim()}` });
      } else {
        await createCheckbookEntry(payload);
        toast.success('Check recorded.');
        trackActivity({ userId: user?.id, module: 'checkbook', action: 'create', description: `Recorded check #${form.check_no.trim()} — ₱${form.amount} to ${form.payee.trim()}` });
      }

      setFormOpen(false);
      fetchEntries();
    } catch (err) {
      const isDuplicate = err.message?.includes('unique') || err.code === '23505';
      toast.error(
        isDuplicate
          ? `Check number "${form.check_no}" already exists.`
          : err.message || 'Failed to save entry.'
      );
    } finally {
      setSaving(false);
    }
  }

  // ── Clear ─────────────────────────────────────────────────────────────────────

  async function handleClear() {
    if (!clearTarget) return;
    setClearing(true);
    try {
      await clearCheck(clearTarget.id);
      toast.success(`Check ${clearTarget.check_no} marked as cleared.`);
      trackActivity({ userId: user?.id, module: 'checkbook', action: 'clear', description: `Cleared check #${clearTarget.check_no}` });
      setClearTarget(null);
      fetchEntries();
    } catch (err) {
      toast.error(err.message || 'Failed to clear check.');
    } finally {
      setClearing(false);
    }
  }

  // ── Void ─────────────────────────────────────────────────────────────────────

  async function handleVoid() {
    if (!voidTarget) return;
    setVoiding(true);
    try {
      await voidCheck(voidTarget.id);
      toast.success(`Check ${voidTarget.check_no} voided.`);
      trackActivity({ userId: user?.id, module: 'checkbook', action: 'void', description: `Voided check #${voidTarget.check_no}` });
      setVoidTarget(null);
      fetchEntries();
    } catch (err) {
      toast.error(err.message || 'Failed to void check.');
    } finally {
      setVoiding(false);
    }
  }

  function handlePrint() {
    const fmt = (n) => 'PHP ' + Number(n ?? 0).toLocaleString('en-PH', {minimumFractionDigits:2,maximumFractionDigits:2});
    const statusLabel = {issued:'Issued',cleared:'Cleared',voided:'Voided'};
    const rows = filtered.map(e => `<tr>
      <td style="font-family:monospace">${e.check_no||'—'}</td>
      <td style="white-space:nowrap">${e.date||'—'}</td>
      <td>${e.payee||'—'}</td>
      <td>${e.purpose||'—'}</td>
      <td>${e.bank||'—'}</td>
      <td style="text-align:right;font-weight:600">${fmt(e.amount)}</td>
      <td style="text-align:center">${statusLabel[e.status]||e.status||'—'}</td>
    </tr>`).join('');
    const total = filtered.reduce((s,e)=>s+(e.amount||0),0);
    const html = `
      <h1 class="report-title">Checkbook</h1>
      <div class="report-meta">Issued checks register &nbsp;|&nbsp; ${filtered.length} entries &nbsp;|&nbsp; Generated: ${new Date().toLocaleString('en-PH')}</div>
      <table>
        <thead><tr><th>Check No.</th><th>Date</th><th>Payee</th><th>Purpose</th><th>Bank</th><th style="text-align:right">Amount</th><th style="text-align:center">Status</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="5" style="text-align:right;font-weight:600;padding:4pt 6pt">Total</td><td style="text-align:right;font-weight:700;padding:4pt 6pt">${fmt(total)}</td><td></td></tr></tfoot>
      </table>
      <div class="confidential">WELLSERVE Cooperative Monitoring System — Authorized personnel only.</div>
    `;
    const win = printHtmlDocument(wrapWithLetterhead(html, {title:'Checkbook — WELLSERVE'}), {
      onBlocked: () => toast.error('Pop-up blocked. Please allow pop-ups and try again.'),
    });
    if (win) toast.success('Print dialog opened.');
  }

  function handleExportCSV() {
    try {
      if (filtered.length === 0) { toast.error('No entries to export.'); return; }
      const rows = filtered.map(e => ({
        check_no: e.check_no || '',
        date: e.date || '',
        payee: e.payee || '',
        purpose: e.purpose || '',
        bank: e.bank || '',
        amount: e.amount || 0,
        status: e.status || '',
        notes: e.notes || '',
      }));
      exportToCSV('checkbook_report.csv', rows);
      toast.success('CSV exported successfully');
    } catch (err) {
      toast.error(err.message || 'Failed to export CSV');
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="p-6">
      <PageHeader
        title="Checkbook"
        subtitle="Track issued checks and monitor clearings"
        action={
          <Button variant="primary" icon={<Plus size={15} />} onClick={openAdd}>
            Record Check
          </Button>
        }
      />

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 mb-6">
        <SummaryCard
          icon={<Hash size={20} className="text-amber-500" />}
          label="Issued"
          value={`${issuedList.length} check${issuedList.length !== 1 ? 's' : ''}`}
          sub={formatCurrency(totalIssued)}
          bg="bg-amber-50"
        />
        <SummaryCard
          icon={<CheckCircle size={20} className="text-green-600" />}
          label="Cleared"
          value={`${clearedList.length} check${clearedList.length !== 1 ? 's' : ''}`}
          sub={formatCurrency(totalCleared)}
          bg="bg-green-50"
        />
        <SummaryCard
          icon={<PesoSign size={20} className="text-blue-600" />}
          label="Total Outstanding"
          value={formatCurrency(totalIssued)}
          bg="bg-blue-50"
        />
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by check no, payee, purpose, or bank..."
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
          <option value="issued">Issued</option>
          <option value="cleared">Cleared</option>
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

      {/* ── Table ── */}
      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Check No.', 'Date', 'Payee', 'Purpose', 'Bank', 'Amount', 'Status', ''].map(h => (
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
                    <td colSpan={8} className="text-center py-12 text-gray-400">
                      <BookOpen size={32} className="mx-auto mb-2 text-gray-200" />
                      {search || statFilter
                        ? 'No entries match your filters.'
                        : 'No checks recorded yet.'}
                    </td>
                  </tr>
                ) : filtered.map(entry => (
                  <tr
                    key={entry.id}
                    className={`hover:bg-[#D6FADC]/20 transition-colors ${
                      entry.status === 'voided' ? 'opacity-50' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-gray-700
                        bg-gray-100 px-2 py-0.5 rounded">
                        {entry.check_no}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {formatDate(entry.date)}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {entry.payee}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <p className="truncate max-w-[180px]">{entry.purpose}</p>
                      {/* [ADDED] Show linked voucher number below purpose when present */}
                      {entry.vouchers && (
                        <p className="text-xs font-mono text-[#07A04E] mt-0.5">
                          {entry.vouchers.voucher_no}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {entry.bank || '—'}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">
                      {formatCurrency(entry.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_BADGE[entry.status] || 'default'} dot>
                        {STATUS_LABEL[entry.status] || entry.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setViewTarget(entry)}
                          title="View Details"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-[#000066]
                            hover:bg-blue-50 transition-colors"
                        >
                          <Eye size={15} />
                        </button>
                        {entry.status === 'issued' && (
                          <button
                            onClick={() => openEdit(entry)}
                            title="Edit Entry"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-[#000066]
                              hover:bg-blue-50 transition-colors"
                          >
                            <Pencil size={15} />
                          </button>
                        )}
                        {entry.status === 'issued' && (
                          <button
                            onClick={() => setClearTarget(entry)}
                            title="Mark as Cleared"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-green-600
                              hover:bg-green-50 transition-colors"
                          >
                            <CheckCircle size={15} />
                          </button>
                        )}
                        {entry.status === 'issued' && (
                          <button
                            onClick={() => setVoidTarget(entry)}
                            title="Void Check"
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
                Showing {filtered.length} of {entries.length} entr{entries.length !== 1 ? 'ies' : 'y'}
              </p>
              <p className="text-xs font-medium text-gray-700">
                Filtered issued:{' '}
                <span className="text-amber-600">
                  {formatCurrency(
                    filtered
                      .filter(e => e.status === 'issued')
                      .reduce((s, e) => s + (e.amount || 0), 0)
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
        title={editTarget ? 'Edit Checkbook Entry' : 'Record Check'}
        size="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Check No."
              required
              type="text"
              placeholder="e.g. 001234"
              value={form.check_no}
              onChange={e => setField('check_no', e.target.value)}
              error={formErr.check_no}
              disabled={!!editTarget}
            />
            <Input
              label="Date"
              required
              type="date"
              value={form.date}
              onChange={e => setField('date', e.target.value)}
              error={formErr.date}
            />
          </div>

          <Input
            label="Payee"
            required
            type="text"
            placeholder="Who is the check payable to?"
            value={form.payee}
            onChange={e => setField('payee', e.target.value)}
            error={formErr.payee}
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
              label="Bank"
              type="text"
              placeholder="e.g. BDO, Landbank (optional)"
              value={form.bank}
              onChange={e => setField('bank', e.target.value)}
            />
          </div>

          <Input
            label="Purpose"
            required
            type="text"
            placeholder="What is this check for?"
            value={form.purpose}
            onChange={e => setField('purpose', e.target.value)}
            error={formErr.purpose}
          />

          {/* [ADDED] Optional voucher link ──────────────────────────────────── */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Linked Voucher
              <span className="ml-1.5 text-xs font-normal text-gray-400">(optional)</span>
            </label>
            <select
              value={form.voucher_id}
              onChange={e => setField('voucher_id', e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg
                focus:outline-none focus:ring-2 focus:ring-[#7EB751] bg-white text-gray-700 transition"
            >
              <option value="">— None —</option>
              {voucherList.map(v => (
                <option key={v.id} value={v.id}>
                  {v.voucher_no} · {v.payee} · {formatCurrency(v.amount)}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400">
              Link this check to an approved voucher for documentation.
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

          {editTarget && (
            <p className="text-xs text-gray-400">
              Check number cannot be changed after recording.
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
            {editTarget ? 'Save Changes' : 'Record Check'}
          </Button>
        </div>
      </Modal>

      {/* ── View Detail Modal ── */}
      <Modal
        open={!!viewTarget}
        onClose={() => setViewTarget(null)}
        title="Check Details"
        size="md"
      >
        {viewTarget && (
          <>
            <div className="flex items-center justify-between mb-5">
              <span className="font-mono text-sm font-bold text-gray-800
                bg-gray-100 px-3 py-1 rounded-lg">
                {viewTarget.check_no}
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
                ['Bank',    viewTarget.bank || '—'],
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

              {/* [ADDED] Linked voucher row — only rendered when present ──── */}
              {viewTarget.vouchers && (
                <div className="flex items-start justify-between px-4 py-3 text-sm
                  bg-blue-50/30">
                  <span className="text-gray-400 font-medium w-28 flex-shrink-0">
                    Voucher Ref
                  </span>
                  <div className="text-right">
                    <p className="font-mono text-xs font-bold text-gray-700">
                      {viewTarget.vouchers.voucher_no}
                    </p>
                    <p className="text-gray-900 text-sm mt-0.5">
                      {viewTarget.vouchers.payee}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatCurrency(viewTarget.vouchers.amount)}
                      {' · '}
                      <span className="capitalize">{viewTarget.vouchers.status}</span>
                    </p>
                  </div>
                </div>
              )}
            </div>

            {viewTarget.status === 'issued' && (
              <div className="flex justify-end gap-3 mt-5">
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
                  onClick={() => { setViewTarget(null); setClearTarget(viewTarget); }}
                >
                  Mark Cleared
                </Button>
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

      {/* ── Clear Confirm Modal ── */}
      <Modal
        open={!!clearTarget}
        onClose={() => setClearTarget(null)}
        title="Mark Check as Cleared"
        size="sm"
      >
        {clearTarget && (
          <>
            <p className="text-sm text-gray-600 mb-3">
              Confirm that this check has cleared the bank?
            </p>
            <div className="bg-gray-50 rounded-lg px-4 py-3 mb-4 border border-gray-100">
              <p className="font-mono text-xs font-bold text-gray-600 mb-1">
                {clearTarget.check_no}
              </p>
              <p className="font-medium text-gray-900 text-sm">{clearTarget.payee}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {clearTarget.purpose}
                {' · '}
                {formatCurrency(clearTarget.amount)}
                {clearTarget.bank ? ` · ${clearTarget.bank}` : ''}
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setClearTarget(null)}
                disabled={clearing}
              >
                Cancel
              </Button>
              <Button
                variant="success"
                loading={clearing}
                onClick={handleClear}
                icon={!clearing && <CheckCircle size={15} />}
              >
                Confirm Cleared
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* ── Void Confirm Modal ── */}
      <Modal
        open={!!voidTarget}
        onClose={() => setVoidTarget(null)}
        title="Void Check"
        size="sm"
      >
        {voidTarget && (
          <>
            <p className="text-sm text-gray-600 mb-3">
              You are about to void the following check:
            </p>
            <div className="bg-gray-50 rounded-lg px-4 py-3 mb-4 border border-gray-100">
              <p className="font-mono text-xs font-bold text-gray-600 mb-1">
                {voidTarget.check_no}
              </p>
              <p className="font-medium text-gray-900 text-sm">{voidTarget.payee}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {formatDate(voidTarget.date)}
                {' · '}
                {formatCurrency(voidTarget.amount)}
                {voidTarget.bank ? ` · ${voidTarget.bank}` : ''}
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
                Void Check
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
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}