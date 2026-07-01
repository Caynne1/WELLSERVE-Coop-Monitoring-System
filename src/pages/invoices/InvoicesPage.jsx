import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Receipt, Search, Plus, Pencil, Ban, Eye,
  CheckCircle, Clock, X, Printer, Download,
} from 'lucide-react';
import PesoSign from '../../components/shared/PesoSign';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import MemberSearchInput from '../../components/shared/MemberSearchInput';
import { useAuth } from '../../context/AuthContext';
import {
  getInvoices,
  createInvoice,
  updateInvoice,
  markInvoicePaid,
  voidInvoice,
} from '../../services/invoiceService';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';
import { printHtmlDocument, wrapWithLetterhead } from '../../utils/print';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_BADGE = {
  unpaid: 'warning',
  paid: 'success',
  voided: 'danger',
};

const STATUS_LABEL = {
  unpaid: 'Unpaid',
  paid: 'Paid',
  voided: 'Voided',
};

const PAYMENT_TYPE_OPTIONS = [
  { value: '', label: 'Others' },
  { value: 'loan_payment', label: 'Loan Payment' },
  { value: 'cbu', label: 'CBU Deposit' },
  { value: 'savings', label: 'Savings Deposit' },
  { value: 'time_deposit', label: 'Time Deposit' },
];

const PAYMENT_TYPE_LABEL = {
  loan_payment: 'Loan Payment',
  cbu: 'CBU Deposit',
  savings: 'Savings Deposit',
  membership: 'Membership Fee',
  capital: 'Manual Fund Deposit',
  time_deposit: 'Time Deposit',
};

const PAYMENT_TYPE_STYLE = {
  loan_payment: 'bg-orange-100 text-orange-700',
  cbu: 'bg-green-100 text-green-700',
  savings: 'bg-blue-100 text-blue-700',
  membership: 'bg-purple-100 text-purple-700',
  capital: 'bg-indigo-100 text-indigo-700',
  time_deposit: 'bg-violet-100 text-violet-700',
};

const EMPTY_FORM = {
  date: new Date().toISOString().split('T')[0],
  payee: '',
  purpose: '',
  amount: '',
  notes: '',
  payment_type: '',
};

function getAccountNoDisplay(invoice) {
  if (invoice.payment_type === 'cbu' || invoice.payment_type === 'savings') {
    return invoice.accounts?.account_no || '—';
  }
  if (invoice.payment_type === 'capital') {
    return 'COOP FUND';
  }
  return '—';
}

function getPaymentMode(invoice) {
  return invoice.payment_mode || '—';
}

export default function InvoicesPage() {
  const { user } = useAuth();

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [statFilter, setStatFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErr, setFormErr] = useState({});
  const [saving, setSaving] = useState(false);

  const [selectedMember, setSelectedMember] = useState(null);

  const [viewTarget, setViewTarget] = useState(null);

  const [paidTarget, setPaidTarget] = useState(null);
  const [marking, setMarking] = useState(false);

  const [voidTarget, setVoidTarget] = useState(null);
  const [voiding, setVoiding] = useState(false);

  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getInvoices({
        from: dateFrom || undefined,
        to: dateTo || undefined,
      });
      setInvoices(data);
    } catch {
      toast.error(
        (t) => (
          <span className="flex items-center gap-3 text-sm">
            Failed to load invoices.
            <button
              className="flex-shrink-0 text-xs font-bold underline"
              onClick={() => { toast.dismiss(t.id); fetchInvoices(); }}
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
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      const q = search.toLowerCase();

      const matchSearch = !q || (
        inv.payee?.toLowerCase().includes(q) ||
        inv.purpose?.toLowerCase().includes(q) ||
        inv.invoice_no?.toLowerCase().includes(q) ||
        `${inv.members?.first_name || ''} ${inv.members?.last_name || ''}`.toLowerCase().includes(q) ||
        getAccountNoDisplay(inv).toLowerCase().includes(q)
      );

      const matchStat = !statFilter || inv.status === statFilter;

      const matchType =
        !typeFilter
          ? true
          : typeFilter === 'others'
            ? !['loan_payment', 'cbu', 'savings'].includes(inv.payment_type || '')
            : (inv.payment_type || '') === typeFilter;

      return matchSearch && matchStat && matchType;
    });
  }, [invoices, search, statFilter, typeFilter]);

  const unpaidList = invoices.filter(inv => inv.status === 'unpaid');
  const paidList = invoices.filter(inv => inv.status === 'paid');
  const totalUnpaid = unpaidList.reduce((s, inv) => s + (inv.amount || 0), 0);
  const totalPaid = paidList.reduce((s, inv) => s + (inv.amount || 0), 0);

  function openAdd() {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().split('T')[0] });
    setSelectedMember(null);
    setFormErr({});
    setFormOpen(true);
  }

  function openEdit(invoice) {
    setEditTarget(invoice);
    setForm({
      date: invoice.date || '',
      payee: invoice.payee || '',
      purpose: invoice.purpose || '',
      amount: invoice.amount?.toString() || '',
      notes: invoice.notes || '',
      payment_type: ['loan_payment', 'cbu', 'savings'].includes(invoice.payment_type || '')
        ? invoice.payment_type
        : '',
    });
    setSelectedMember(invoice.members || null);
    setFormErr({});
    setFormOpen(true);
  }

  function setField(field, value) {
    setForm(f => ({ ...f, [field]: value }));
    setFormErr(e => ({ ...e, [field]: undefined }));
  }

  function validateForm() {
    const errs = {};
    if (!form.date) errs.date = 'Date is required.';
    if (!form.payee.trim()) errs.payee = 'Payee is required.';
    if (!form.purpose.trim()) errs.purpose = 'Purpose is required.';
    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0) {
      errs.amount = 'Enter a valid amount greater than zero.';
    }
    return errs;
  }

  async function handleSave() {
    const errs = validateForm();
    if (Object.keys(errs).length) {
      setFormErr(errs);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        date: form.date,
        payee: form.payee.trim(),
        purpose: form.purpose.trim(),
        amount: parseFloat(form.amount),
        notes: form.notes.trim() || null,
        payment_type: form.payment_type || null,
        created_by: user?.id ?? null,
        member_id: selectedMember?.id || null,
      };

      if (editTarget) {
        await updateInvoice(editTarget.id, payload);
        toast.success('Invoice updated.');
      } else {
        await createInvoice({
          ...payload,
          status: 'unpaid',
        });
        toast.success('Invoice created.');
      }

      setFormOpen(false);
      fetchInvoices();
    } catch (err) {
      toast.error(err.message || 'Failed to save invoice.');
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkPaid() {
    if (!paidTarget) return;
    setMarking(true);
    try {
      await markInvoicePaid(paidTarget.id);
      toast.success(`Invoice ${paidTarget.invoice_no} marked as paid.`);
      setPaidTarget(null);
      fetchInvoices();
    } catch (err) {
      toast.error(err.message || 'Failed to mark invoice as paid.');
    } finally {
      setMarking(false);
    }
  }

  async function handleVoid() {
    if (!voidTarget) return;
    setVoiding(true);
    try {
      await voidInvoice(voidTarget.id);
      toast.success(`Invoice ${voidTarget.invoice_no} voided.`);
      setVoidTarget(null);
      fetchInvoices();
    } catch (err) {
      toast.error(err.message || 'Failed to void invoice.');
    } finally {
      setVoiding(false);
    }
  }

  function handlePrintPreview() {
    const fmt = (n) => 'PHP ' + Number(n ?? 0).toLocaleString('en-PH', {minimumFractionDigits:2,maximumFractionDigits:2});
    const totalAmount = filtered.reduce((s, inv) => s + (inv.amount || 0), 0);
    const unpaidTotal = filtered.filter(inv => inv.status === 'unpaid').reduce((s, inv) => s + (inv.amount || 0), 0);
    const paidTotal   = filtered.filter(inv => inv.status === 'paid').reduce((s, inv) => s + (inv.amount || 0), 0);

    const rows = filtered.map(invoice => {
      const memberLine = invoice.members
        ? `<br/><span style="font-size:8pt;color:#07A04E;font-family:monospace">${invoice.members.first_name||''} ${invoice.members.last_name||''}${invoice.members.member_no ? ' · ' + invoice.members.member_no : ''}</span>`
        : '';
      const statusColor = invoice.status === 'paid' ? '#065f46' : invoice.status === 'voided' ? '#6b7280' : '#b45309';
      return `<tr${invoice.status === 'voided' ? ' style="opacity:0.5"' : ''}>
        <td style="font-family:monospace;font-size:8.5pt;font-weight:600">${invoice.invoice_no||'—'}</td>
        <td style="white-space:nowrap">${formatDate(invoice.date)}</td>
        <td style="font-family:monospace;font-size:8.5pt">${getAccountNoDisplay(invoice)}</td>
        <td>${invoice.payee||'—'}${memberLine}</td>
        <td style="max-width:160px">${invoice.purpose||'—'}</td>
        <td style="white-space:nowrap">${PAYMENT_TYPE_LABEL[invoice.payment_type]||'Others'}</td>
        <td>${getPaymentMode(invoice)}</td>
        <td style="text-align:right;font-weight:600">${fmt(invoice.amount)}</td>
        <td style="text-align:center;font-weight:600;color:${statusColor}">${STATUS_LABEL[invoice.status]||invoice.status}</td>
      </tr>`;
    }).join('');

    const html = `
      <h1 class="report-title">Sales Invoice Report</h1>
      <div class="report-meta">
        ${filtered.length} invoice${filtered.length !== 1 ? 's' : ''} &nbsp;|&nbsp;
        Generated: ${new Date().toLocaleString('en-PH')} &nbsp;|&nbsp;
        <strong style="color:#b91c1c">CONFIDENTIAL — AUTHORIZED USE ONLY</strong>
      </div>

      <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:5mm">
        <div class="stat-box">
          <div class="stat-label">Total Invoiced</div>
          <div class="stat-value" style="font-size:11pt">${fmt(totalAmount)}</div>
          <div class="stat-sub">${filtered.length} records</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Total Collected</div>
          <div class="stat-value" style="font-size:11pt;color:#065f46">${fmt(paidTotal)}</div>
          <div class="stat-sub">${filtered.filter(i=>i.status==='paid').length} paid</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Total Unpaid</div>
          <div class="stat-value" style="font-size:11pt;color:#b45309">${fmt(unpaidTotal)}</div>
          <div class="stat-sub">${filtered.filter(i=>i.status==='unpaid').length} pending</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Invoice No.</th>
            <th>Date</th>
            <th>Account No.</th>
            <th>Payee / Member</th>
            <th>Purpose</th>
            <th>Payment Type</th>
            <th>Mode of Payment</th>
            <th style="text-align:right">Amount</th>
            <th style="text-align:center">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="9" style="text-align:center;padding:8pt;color:#9ca3af">No invoices found.</td></tr>'}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="7" style="text-align:right;font-weight:700;padding:4pt 6pt;border-top:1.5pt solid #1a3d2b">Grand Total</td>
            <td style="text-align:right;font-weight:700;padding:4pt 6pt;border-top:1.5pt solid #1a3d2b">${fmt(totalAmount)}</td>
            <td style="border-top:1.5pt solid #1a3d2b"></td>
          </tr>
        </tfoot>
      </table>

      <div class="confidential">WELLSERVE Cooperative Monitoring System — Authorized personnel only.</div>
    `;

    const win = printHtmlDocument(wrapWithLetterhead(html, { title: 'Sales Invoice Report — WELLSERVE' }), {
      width: 1100,
      height: 900,
      delay: 900,
      onBlocked: () => toast.error('Pop-up blocked. Please allow pop-ups for this site and try again.'),
    });
    if (win) toast.success('Print dialog opened.');
  }

  function handleExportCSV() {
    try {
      const headers = [
        'Invoice No.',
        'Date',
        'Account No.',
        'Payee',
        'Purpose',
        'Payment Type',
        'Mode of Payment',
        'Amount',
        'Status',
      ];

      const rows = filtered.map(invoice => [
        invoice.invoice_no || '',
        formatDate(invoice.date),
        getAccountNoDisplay(invoice),
        invoice.payee || '',
        invoice.purpose || '',
        PAYMENT_TYPE_LABEL[invoice.payment_type] || 'Others',
        getPaymentMode(invoice),
        invoice.amount || 0,
        STATUS_LABEL[invoice.status] || invoice.status || '',
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row =>
          row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')
        ),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `invoices_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('Invoice export generated.');
    } catch {
      toast.error('Failed to export invoice report.');
    }
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Invoices"
        subtitle="Manage cooperative invoices and track payments"
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" icon={<Printer size={15} />} onClick={handlePrintPreview}>
              Print
            </Button>
            <Button variant="outline" icon={<Download size={15} />} onClick={handleExportCSV}>
              Export
            </Button>
            <Button variant="primary" icon={<Plus size={15} />} onClick={openAdd}>
              New Invoice
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 mb-6">
        <SummaryCard
          icon={<Clock size={20} className="text-amber-500" />}
          label="Total Unpaid"
          value={formatCurrency(totalUnpaid)}
          bg="bg-amber-50"
        />
        <SummaryCard
          icon={<CheckCircle size={20} className="text-green-600" />}
          label="Total Collected"
          value={formatCurrency(totalPaid)}
          bg="bg-green-50"
        />
        <SummaryCard
          icon={<PesoSign size={20} className="text-red-500" />}
          label="Paid Records"
          value={paidList.length}
          bg="bg-red-50"
        />
      </div>

      <div className="flex flex-col lg:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by payee, purpose, member, invoice no, or account no..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7EB751] transition"
          />
        </div>

        <select
          value={statFilter}
          onChange={e => setStatFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7EB751] bg-white text-gray-700 transition"
        >
          <option value="">All Status</option>
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid</option>
        </select>

        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7EB751] bg-white text-gray-700 transition"
        >
          <option value="">All Type</option>
          <option value="loan_payment">Loan Payment</option>
          <option value="cbu">CBU Deposit</option>
          <option value="savings">Savings Deposit</option>
          <option value="others">Others</option>
        </select>

        <Input
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
        />
        <Input
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Sales Invoice No.', 'Date', 'Account No.', 'Payee', 'Purpose', 'Payment Type', 'Mode of Payment', 'Amount', 'Status', ''].map(h => (
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
                    <td colSpan={10} className="text-center py-12 text-gray-400">
                      <Receipt size={32} className="mx-auto mb-2 text-gray-200" />
                      {search || statFilter || typeFilter || dateFrom || dateTo
                        ? 'No invoices match your filters.'
                        : 'No invoices created yet.'}
                    </td>
                  </tr>
                ) : filtered.map(invoice => (
                  <tr
                    key={invoice.id}
                    className={`hover:bg-[#D6FADC]/20 transition-colors ${
                      invoice.status === 'voided' ? 'opacity-50' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                        {invoice.invoice_no}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {formatDate(invoice.date)}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs text-gray-700">
                        {getAccountNoDisplay(invoice)}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{invoice.payee}</p>
                      {invoice.members && (
                        <p className="text-xs text-[#07A04E] font-mono mt-0.5">
                          {invoice.members.first_name} {invoice.members.last_name}
                          {invoice.members.member_no && ` · ${invoice.members.member_no}`}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-3 text-gray-600">
                      <p className="truncate max-w-[220px]">{invoice.purpose}</p>
                    </td>

                    <td className="px-4 py-3">
                      {invoice.payment_type ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${PAYMENT_TYPE_STYLE[invoice.payment_type] || 'bg-gray-100 text-gray-600'}`}>
                          {PAYMENT_TYPE_LABEL[invoice.payment_type] || 'Others'}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">Others</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {getPaymentMode(invoice)}
                    </td>

                    <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">
                      {formatCurrency(invoice.amount)}
                    </td>

                    <td className="px-4 py-3">
                      <Badge variant={STATUS_BADGE[invoice.status] || 'default'} dot>
                        {STATUS_LABEL[invoice.status] || invoice.status}
                      </Badge>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setViewTarget(invoice)}
                          title="View Details"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-[#000066] hover:bg-blue-50 transition-colors"
                        >
                          <Eye size={15} />
                        </button>

                        {invoice.status === 'unpaid' && (
                          <button
                            onClick={() => openEdit(invoice)}
                            title="Edit Invoice"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-[#000066] hover:bg-blue-50 transition-colors"
                          >
                            <Pencil size={15} />
                          </button>
                        )}

                        {invoice.status === 'unpaid' && (
                          <button
                            onClick={() => setPaidTarget(invoice)}
                            title="Mark as Paid"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                          >
                            <CheckCircle size={15} />
                          </button>
                        )}

                        {invoice.status === 'unpaid' && (
                          <button
                            onClick={() => setVoidTarget(invoice)}
                            title="Void Invoice"
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
                Showing {filtered.length} of {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
              </p>
              <p className="text-xs font-medium text-gray-700">
                Filtered unpaid:{' '}
                <span className="text-amber-600">
                  {formatCurrency(
                    filtered
                      .filter(inv => inv.status === 'unpaid')
                      .reduce((s, inv) => s + (inv.amount || 0), 0)
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
        title={editTarget ? 'Edit Invoice' : 'New Invoice'}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Invoice Date"
            required
            type="date"
            value={form.date}
            onChange={e => setField('date', e.target.value)}
            error={formErr.date}
          />

          <SelectLike
            label="Payment Type"
            value={form.payment_type}
            onChange={value => setField('payment_type', value)}
            options={PAYMENT_TYPE_OPTIONS}
          />

          <Input
            label="Payee"
            required
            type="text"
            placeholder="Billed to (person or organization)"
            value={form.payee}
            onChange={e => setField('payee', e.target.value)}
            error={formErr.payee}
          />

          <Input
            label="Purpose"
            required
            type="text"
            placeholder="What is this invoice for?"
            value={form.purpose}
            onChange={e => setField('purpose', e.target.value)}
            error={formErr.purpose}
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

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Linked Member
              <span className="ml-1.5 text-xs font-normal text-gray-400">(optional)</span>
            </label>
            {selectedMember ? (
              <div className="flex items-center justify-between px-3 py-2 text-sm border border-[#07A04E]/40 rounded-lg bg-[#D6FADC]/30">
                <div>
                  <span className="font-medium text-gray-900">
                    {selectedMember.first_name} {selectedMember.last_name}
                  </span>
                  {selectedMember.member_no && (
                    <span className="ml-2 text-xs font-mono text-gray-400">
                      {selectedMember.member_no}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setSelectedMember(null)}
                  className="p-1 rounded text-gray-400 hover:text-red-500 transition-colors"
                  title="Remove member link"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <MemberSearchInput
                value={null}
                onChange={m => setSelectedMember(m)}
                placeholder="Search member to link (optional)..."
              />
            )}
            <p className="text-xs text-gray-400">
              Link this invoice to a member for traceability.
            </p>
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

          {!editTarget && (
            <p className="text-xs text-gray-400">
              Invoice number will be assigned automatically.
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
            {editTarget ? 'Save Changes' : 'Create Invoice'}
          </Button>
        </div>
      </Modal>

      <Modal
        open={!!viewTarget}
        onClose={() => setViewTarget(null)}
        title="Invoice Details"
        size="md"
      >
        {viewTarget && (
          <>
            <div className="flex items-center justify-between mb-5">
              <span className="font-mono text-sm font-bold text-gray-800 bg-gray-100 px-3 py-1 rounded-lg">
                {viewTarget.invoice_no}
              </span>
              <div className="flex items-center gap-2">
                <Badge variant={STATUS_BADGE[viewTarget.status] || 'default'} dot>
                  {STATUS_LABEL[viewTarget.status] || viewTarget.status}
                </Badge>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
              {[
                ['Invoice Date', formatDate(viewTarget.date)],
                ['Account No.', getAccountNoDisplay(viewTarget)],
                ['Payee', viewTarget.payee],
                ['Purpose', viewTarget.purpose],
                ['Amount', <span key="amt" className="font-semibold text-gray-900">{formatCurrency(viewTarget.amount)}</span>],
                ['Mode of Payment', viewTarget.payment_mode || '—'],
                ['Notes', viewTarget.notes || '—'],
                ['Created', formatDateTime(viewTarget.created_at)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between px-4 py-3 text-sm">
                  <span className="text-gray-400 font-medium w-28 flex-shrink-0">{label}</span>
                  <span className="text-gray-900 text-right">{value}</span>
                </div>
              ))}

              <div className="flex items-start justify-between px-4 py-3 text-sm">
                <span className="text-gray-400 font-medium w-28 flex-shrink-0">Payment Type</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PAYMENT_TYPE_STYLE[viewTarget.payment_type] || 'bg-gray-100 text-gray-600'}`}>
                  {PAYMENT_TYPE_LABEL[viewTarget.payment_type] || 'Others'}
                </span>
              </div>

              {viewTarget.members && (
                <div className="flex items-start justify-between px-4 py-3 text-sm bg-[#D6FADC]/30">
                  <span className="text-gray-400 font-medium w-28 flex-shrink-0">
                    Member
                  </span>
                  <div className="text-right">
                    <p className="text-gray-900 font-medium">
                      {viewTarget.members.first_name} {viewTarget.members.last_name}
                    </p>
                    {viewTarget.members.member_no && (
                      <p className="text-xs font-mono text-gray-400 mt-0.5">
                        {viewTarget.members.member_no}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {viewTarget.status === 'unpaid' && (
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
                  onClick={() => { setViewTarget(null); setPaidTarget(viewTarget); }}
                >
                  Mark Paid
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

      <Modal
        open={!!paidTarget}
        onClose={() => setPaidTarget(null)}
        title="Mark Invoice as Paid"
        size="sm"
      >
        {paidTarget && (
          <>
            <p className="text-sm text-gray-600 mb-3">
              Mark the following invoice as paid?
            </p>
            <div className="bg-gray-50 rounded-lg px-4 py-3 mb-4 border border-gray-100">
              <p className="font-mono text-xs font-bold text-gray-600 mb-1">
                {paidTarget.invoice_no}
              </p>
              <p className="font-medium text-gray-900 text-sm">{paidTarget.payee}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {paidTarget.purpose} · {formatCurrency(paidTarget.amount)}
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setPaidTarget(null)}
                disabled={marking}
              >
                Cancel
              </Button>
              <Button
                variant="success"
                loading={marking}
                onClick={handleMarkPaid}
                icon={!marking && <CheckCircle size={15} />}
              >
                Confirm Payment
              </Button>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={!!voidTarget}
        onClose={() => setVoidTarget(null)}
        title="Void Invoice"
        size="sm"
      >
        {voidTarget && (
          <>
            <p className="text-sm text-gray-600 mb-3">
              You are about to void the following invoice:
            </p>
            <div className="bg-gray-50 rounded-lg px-4 py-3 mb-4 border border-gray-100">
              <p className="font-mono text-xs font-bold text-gray-600 mb-1">
                {voidTarget.invoice_no}
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
                Void Invoice
              </Button>
            </div>
          </>
        )}
      </Modal>
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

function SelectLike({ label, value, onChange, options }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7EB751] bg-white text-gray-700 transition"
      >
        {options.map(opt => (
          <option key={`${opt.value}-${opt.label}`} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}