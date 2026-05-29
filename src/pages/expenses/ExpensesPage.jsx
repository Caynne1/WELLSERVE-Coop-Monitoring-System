import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Search, Plus, Pencil, Ban, DollarSign, Calendar, AlertTriangle, Printer, Download } from 'lucide-react';
import { exportToCSV } from '../../utils/csvExport';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { useAuth } from '../../context/AuthContext';
import { trackActivity } from '../../services/logService';
import {
  getExpenses,
  createExpense,
  updateExpense,
  voidExpense,
} from '../../services/expenseService';
import { formatCurrency, formatDate } from '../../utils/formatters';

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: 'utilities',   label: 'Utilities' },
  { value: 'office',      label: 'Office' },
  { value: 'salaries',    label: 'Salaries' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'others',      label: 'Others' },
];

const CATEGORY_BADGE = {
  utilities:   'info',
  office:      'purple',
  salaries:    'navy',
  maintenance: 'orange',
  others:      'default',
};

const STATUS_BADGE = {
  recorded: 'success',
  voided:   'danger',
};

const EMPTY_FORM = {
  date:        new Date().toISOString().split('T')[0],
  description: '',
  category:    '',
  amount:      '',
  payee:       '',
  notes:       '',
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const { user } = useAuth();

  // Data
  const [expenses, setExpenses]     = useState([]);
  const [loading, setLoading]       = useState(true);

  // Filters
  const [search, setSearch]         = useState('');
  const [catFilter, setCatFilter]   = useState('');
  const [statFilter, setStatFilter] = useState('');

  // Add / Edit modal
  const [modalOpen, setModalOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState(null); // null = new, object = edit
  const [form, setForm]             = useState(EMPTY_FORM);
  const [formErr, setFormErr]       = useState({});
  const [saving, setSaving]         = useState(false);

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

  // ── Client-side filtering ────────────────────────────────────────────────────

  const filtered = expenses.filter(e => {
    const q = search.toLowerCase();
    const matchSearch = !q || (
      e.description?.toLowerCase().includes(q) ||
      e.payee?.toLowerCase().includes(q)
    );
    const matchCat  = !catFilter  || e.category === catFilter;
    const matchStat = !statFilter || e.status   === statFilter;
    return matchSearch && matchCat && matchStat;
  });

  // ── Summary stats ────────────────────────────────────────────────────────────

  const recorded    = expenses.filter(e => e.status === 'recorded');
  const totalAmount = recorded.reduce((s, e) => s + (e.amount || 0), 0);
  const now         = new Date();
  const thisMonth   = recorded
    .filter(e => {
      const d = new Date(e.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, e) => s + (e.amount || 0), 0);
  const voidedCount = expenses.filter(e => e.status === 'voided').length;

  // ── Form helpers ─────────────────────────────────────────────────────────────

  function openAdd() {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().split('T')[0] });
    setFormErr({});
    setModalOpen(true);
  }

  function openEdit(expense) {
    setEditTarget(expense);
    setForm({
      date:        expense.date        || '',
      description: expense.description || '',
      category:    expense.category    || '',
      amount:      expense.amount?.toString() || '',
      payee:       expense.payee       || '',
      notes:       expense.notes       || '',
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
    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0)
      errs.amount = 'Enter a valid amount greater than zero.';
    return errs;
  }

  // ── Save (create or update) ──────────────────────────────────────────────────

  async function handleSave() {
    const errs = validateForm();
    if (Object.keys(errs).length) { setFormErr(errs); return; }

    setSaving(true);
    try {
      const payload = {
        date:        form.date,
        description: form.description.trim(),
        category:    form.category,
        amount:      parseFloat(form.amount),
        payee:       form.payee.trim()  || null,
        notes:       form.notes.trim()  || null,
        created_by:  user?.id           ?? null,
      };

      if (editTarget) {
        await updateExpense(editTarget.id, payload);
        toast.success('Expense updated.');
        trackActivity({ userId: user?.id, module: 'expense', action: 'update', description: `Updated expense: ${form.description.trim()} — ${form.amount}` });
      } else {
        await createExpense(payload);
        toast.success('Expense recorded.');
        trackActivity({ userId: user?.id, module: 'expense', action: 'create', description: `Recorded expense: ${form.description.trim()} — ${form.amount}` });
      }

      setModalOpen(false);
      fetchExpenses();
    } catch (err) {
      toast.error(err.message || 'Failed to save expense.');
    } finally {
      setSaving(false);
    }
  }

  // ── Void ─────────────────────────────────────────────────────────────────────

  async function handleVoid() {
    if (!voidTarget) return;
    setVoiding(true);
    try {
      await voidExpense(voidTarget.id);
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

  function handlePrint() { window.print(); }

  function handleExportCSV() {
    try {
      if (filtered.length === 0) { toast.error('No expenses to export.'); return; }
      const rows = filtered.map(e => ({
        date: e.date || '',
        description: e.description || '',
        category: e.category || '',
        payee: e.payee || '',
        amount: e.amount || 0,
        status: e.status || '',
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
          <Button variant="primary" icon={<Plus size={15} />} onClick={openAdd}>
            Add Expense
          </Button>
        }
      />

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 mb-6">
        <SummaryCard
          icon={<DollarSign size={20} className="text-green-600" />}
          label="Total Recorded"
          value={formatCurrency(totalAmount)}
          bg="bg-green-50"
        />
        <SummaryCard
          icon={<Calendar size={20} className="text-blue-600" />}
          label="This Month"
          value={formatCurrency(thisMonth)}
          bg="bg-blue-50"
        />
        <SummaryCard
          icon={<AlertTriangle size={20} className="text-red-500" />}
          label="Voided"
          value={voidedCount}
          bg="bg-red-50"
        />
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
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
          <option value="recorded">Recorded</option>
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
                  {['Date', 'Description', 'Category', 'Payee', 'Amount', 'Status', 'Actions'].map(h => (
                    <th
                      key={h}
                      className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide ${
                        ['Date', 'Category', 'Amount', 'Status', 'Actions'].includes(h)
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
                    <td colSpan={7} className="text-center py-12 text-gray-400">
                      <TrendingUp size={32} className="mx-auto mb-2 text-gray-200" />
                      {search || catFilter || statFilter
                        ? 'No expenses match your filters.'
                        : 'No expenses recorded yet.'}
                    </td>
                  </tr>
                ) : filtered.map(expense => (
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
                        {expense.category}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{expense.payee || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap text-center">
                      {formatCurrency(expense.amount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={STATUS_BADGE[expense.status] || 'default'} dot>
                        {expense.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {expense.status === 'recorded' && (
                        <div className="flex items-center gap-1 justify-center">
                          <button
                            onClick={() => openEdit(expense)}
                            title="Edit Expense"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-[#000066] hover:bg-blue-50 transition-colors"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => setVoidTarget(expense)}
                            title="Void Expense"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Ban size={15} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Showing {filtered.length} of {expenses.length} expense{expenses.length !== 1 ? 's' : ''}
              </p>
              <p className="text-xs font-medium text-gray-700">
                Filtered total:{' '}
                <span className="text-green-700">
                  {formatCurrency(
                    filtered
                      .filter(e => e.status === 'recorded')
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
              options={CATEGORIES}
              error={formErr.category}
            />
          </div>

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
              type="text"
              placeholder="Who was paid? (optional)"
              value={form.payee}
              onChange={e => setField('payee', e.target.value)}
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