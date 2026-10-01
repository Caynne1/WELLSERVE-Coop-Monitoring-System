import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { exportToCSV } from '../../utils/csvExport';
import { printHtmlDocument, wrapWithLetterhead } from '../../utils/print';
import { getBoosterCollections, recordBoosterInitialDeposit } from '../../services/boosterCollectionService';
import {
  Sprout, Users, CheckCircle, AlertCircle,
  Plus, TrendingUp, X,
  Search, Calendar, Printer, Download, RefreshCw, Wallet,
} from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import Pagination from '../../components/ui/Pagination';
import usePagination from '../../hooks/usePagination';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import {
  SAVINGS_BOOSTER_DEFAULTS,
  calculateSavingsBoosterLedger,
  getBoosterMaturityDate,
} from '../../services/savingsBoosterService';

// ── Product Constants ──────────────────────────────────────────────────────────

const WEEKLY_DEPOSIT   = SAVINGS_BOOSTER_DEFAULTS.weeklyDeposit;
const INITIAL_DEPOSIT  = SAVINGS_BOOSTER_DEFAULTS.initialDeposit;
const TOTAL_SLOTS      = 100;
const MAX_SLOTS_MEMBER = 1;

// ── Enrollment Modal ───────────────────────────────────────────────────────────

function EnrollModal({ open, onClose, onEnrolled, usedSlots, enrollments, existing = null }) {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('invoices', 'create') && (hasPermission('savings_booster', 'create') || (existing && hasPermission('savings_booster', 'edit')));
  const newPayment = () => ({ invoiceNo: '', invoiceDate: '', paymentDate: '', mode: 'Cash', reference: '', oldTransaction: false });
  const [payment, setPayment] = useState(newPayment);
  const requestId = useRef(crypto.randomUUID());
  const busy = useRef(false);

  const [query, setQuery]           = useState('');
  const [results, setResults]       = useState([]);
  const [searching, setSearching]   = useState(false);
  const [selected, setSelected]     = useState(null);
  const [startDate, setStartDate]   = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes]           = useState('');
  const [saving, setSaving]         = useState(false);
  const [eligibility, setEligibility] = useState(null);

  function reset() {
    setPayment(newPayment()); requestId.current = crypto.randomUUID();
    setQuery(''); setResults([]); setSelected(null);
    setStartDate(new Date().toISOString().split('T')[0]);
    setNotes(''); setSaving(false); setEligibility(null);
  }

  function handleClose() { if (busy.current) return; reset(); onClose(); }

  useEffect(() => {
    if (open && existing) {
      setSelected({ ...existing.members, id: existing.member_id });
      setStartDate(existing.start_date);
    }
  }, [open, existing]);

  // Search members
  useEffect(() => {
    if (!query.trim() || query.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await supabase
          .from('members')
          .select('id, first_name, last_name, member_no, membership_type, status')
          .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,member_no.ilike.%${query}%`)
          .limit(10);
        setResults(data || []);
      } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Check eligibility when member selected
  useEffect(() => {
    if (!selected) { setEligibility(null); return; }
    if (existing) {
      setEligibility({ issues: [], warnings: [], eligible: true, nextSlot: existing.slot_number });
      return;
    }

    const issues = [];
    const warnings = [];

    if (selected.status !== 'active') issues.push('Member is not active (MIGS required).');
    if (!['associate', 'regular'].includes(selected.membership_type))
      issues.push('Must be Associate or Regular Member.');

    const memberSlots = enrollments.filter(e => e.member_id === selected.id).length;
    if (memberSlots >= MAX_SLOTS_MEMBER)
      issues.push('This member already has a Savings Booster slot.');

    const totalUsed = enrollments.length;
    if (totalUsed >= TOTAL_SLOTS)
      issues.push(`All ${TOTAL_SLOTS} slots are already filled.`);
    else if (totalUsed >= TOTAL_SLOTS - 5)
      warnings.push(`Only ${TOTAL_SLOTS - totalUsed} slot(s) remaining.`);

    // Slot numbers identify the limited program slots globally.
    const existingSlots = enrollments.map(e => e.slot_number || 0);
    const nextSlot = existingSlots.length > 0 ? Math.max(...existingSlots) + 1 : 1;

    setEligibility({ issues, warnings, eligible: issues.length === 0, nextSlot, memberSlots });
  }, [selected, enrollments, existing]);

  // Compute maturity date
  const maturityDate = useMemo(() => {
    if (!startDate) return null;
    return getBoosterMaturityDate(startDate);
  }, [startDate]);

  async function handleEnroll() {
    if (busy.current) return;
    if (!canCreate) {
      toast.error('You do not have permission to enroll members');
      return;
    }
    if (!selected || !eligibility?.eligible) return;
    if (!payment.invoiceDate || !payment.paymentDate || (!payment.oldTransaction && !payment.invoiceNo.trim())) {
      toast.error('Enter the invoice number, invoice date, and actual payment date.');
      return;
    }
    busy.current = true;
    setSaving(true);
    try {
      await recordBoosterInitialDeposit({
        requestId: requestId.current, memberId: selected.id, slot: existing,
        startDate, payment, notes,
      });
      toast.success('Initial savings deposit recorded.');
      onEnrolled();
      busy.current = false;
      handleClose();
    } catch (err) {
      toast.error(err.message || 'Save could not be confirmed. Refresh and check the enrollment before retrying.');
    } finally {
      setSaving(false);
      busy.current = false;
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={existing ? 'Record Initial Savings Deposit' : 'Enroll Member — Savings Booster'} size="lg">
      <div className="space-y-5">

        {/* Step 1: Search member */}
        {!existing ? <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Search Member</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={e => { setQuery(e.target.value); setSelected(null); }}
              placeholder="Name or Member No."
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#07A04E]"
            />
          </div>

          {/* Search results */}
          {(results.length > 0 || searching) && !selected && (
            <div className="mt-1 border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              {searching && (
                <div className="px-4 py-3 text-sm text-gray-400 flex items-center gap-2">
                  <Sprout size={14} className="animate-pulse" /> Searching…
                </div>
              )}
              {results.map(m => (
                <button
                  key={m.id}
                  onClick={() => { setSelected(m); setQuery(`${m.first_name} ${m.last_name}`); setResults([]); }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-emerald-50 transition-colors text-left border-b border-gray-50 last:border-0"
                >
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {m.first_name?.[0]}{m.last_name?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{m.first_name} {m.last_name}</p>
                    <p className="text-xs text-gray-400">{m.member_no} · {m.membership_type} · {m.status}</p>
                  </div>
                  {m.status === 'active' ? (
                    <CheckCircle size={14} className="text-emerald-500" />
                  ) : (
                    <AlertCircle size={14} className="text-amber-500" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div> : <p className="font-semibold text-gray-800">{existing.members?.first_name} {existing.members?.last_name} · {existing.members?.member_no}</p>}

        {/* Eligibility check */}
        {eligibility && (
          <div className={`rounded-xl border p-4 space-y-2 ${eligibility.eligible ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
            <p className={`text-xs font-semibold flex items-center gap-1.5 ${eligibility.eligible ? 'text-emerald-700' : 'text-red-700'}`}>
              {eligibility.eligible ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
              {eligibility.eligible ? 'Eligible to enroll' : 'Not eligible'}
            </p>
            {eligibility.issues.map((issue, i) => (
              <p key={i} className="text-xs text-red-600 flex items-start gap-1.5">
                <X size={11} className="flex-shrink-0 mt-0.5" /> {issue}
              </p>
            ))}
            {eligibility.warnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-700 flex items-start gap-1.5">
                <AlertCircle size={11} className="flex-shrink-0 mt-0.5" /> {w}
              </p>
            ))}
            {eligibility.eligible && (
              <p className="text-xs text-emerald-700">
                Will be assigned <strong>Slot #{eligibility.nextSlot}</strong>
              </p>
            )}
          </div>
        )}

        {/* Date + Notes */}
        {selected && eligibility?.eligible && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1">
                  <Calendar size={12} /> Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  disabled={!!existing || saving}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#07A04E]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1">
                  <Calendar size={12} /> Maturity Date (13th month)
                </label>
                <input
                  type="date"
                  value={maturityDate || ''}
                  readOnly
                  className="w-full px-3 py-2.5 text-sm border border-gray-100 rounded-xl bg-gray-50 text-gray-500 cursor-not-allowed"
                />
              </div>
            </div>

            <fieldset disabled={saving} className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-100 pt-4">
              <legend className="text-sm font-semibold text-gray-800">Initial Savings Deposit</legend>
              <label className="text-xs font-semibold text-gray-600">Amount
                <input readOnly value={formatCurrency(INITIAL_DEPOSIT)} className="mt-1 w-full p-2.5 border rounded-lg bg-gray-50" />
              </label>
              <label className="text-xs font-semibold text-gray-600">Invoice Number
                <input value={payment.invoiceNo} onChange={e => setPayment(p => ({ ...p, invoiceNo: e.target.value }))} className="mt-1 w-full p-2.5 border rounded-lg" />
              </label>
              <label className="text-xs font-semibold text-gray-600">Invoice Date
                <input type="date" value={payment.invoiceDate} onChange={e => setPayment(p => ({ ...p, invoiceDate: e.target.value }))} className="mt-1 w-full p-2.5 border rounded-lg" />
              </label>
              <label className="text-xs font-semibold text-gray-600">Actual Payment Date
                <input type="date" value={payment.paymentDate} onChange={e => setPayment(p => ({ ...p, paymentDate: e.target.value }))} className="mt-1 w-full p-2.5 border rounded-lg" />
              </label>
              <label className="text-xs font-semibold text-gray-600">Payment Method
                <select value={payment.mode} onChange={e => setPayment(p => ({ ...p, mode: e.target.value }))} className="mt-1 w-full p-2.5 border rounded-lg">
                  <option>Cash</option><option>GCash</option><option>Bank Transfer</option><option>Check</option><option>For Tracing</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-gray-600">Payment Reference
                <input value={payment.reference} onChange={e => setPayment(p => ({ ...p, reference: e.target.value }))} className="mt-1 w-full p-2.5 border rounded-lg" />
              </label>
              <label className="sm:col-span-2 flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={payment.oldTransaction} onChange={e => setPayment(p => ({ ...p, oldTransaction: e.target.checked }))} />Old transaction: original invoice number unavailable</label>
            </fieldset>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="e.g. enrolled via cash, referred by..."
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#07A04E] resize-none"
              />
            </div>

            {/* Summary */}
            <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
              <p className="text-xs font-semibold text-emerald-700 mb-2">Enrollment Summary</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-600">
                <span>Member: <strong>{selected.first_name} {selected.last_name}</strong></span>
                <span>Slot: <strong>#{eligibility.nextSlot}</strong></span>
                <span>Initial Deposit: <strong>{formatCurrency(INITIAL_DEPOSIT)}</strong></span>
                <span>Weekly Deposit: <strong>{formatCurrency(WEEKLY_DEPOSIT)}/week</strong></span>
                <span>Program Weeks: <strong>48 (1 initial + 47 weekly)</strong></span>
                <span>Total Capital: <strong>{formatCurrency(calculateSavingsBoosterLedger().expectedTotal)}</strong></span>
                <span>Maturity Receivable: <strong className="text-emerald-700">{formatCurrency(calculateSavingsBoosterLedger().receivableAtMaturity)}</strong></span>
              </div>
            </div>
          </>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={saving}>Cancel</Button>
          <Button
            variant="green"
            icon={<Sprout size={14} />}
            onClick={handleEnroll}
            loading={saving}
            disabled={!canCreate || !selected || !eligibility?.eligible || saving}
          >
            {existing ? 'Record Initial Deposit' : 'Enroll and Record Deposit'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

const statusVariant = {
  active: 'success',
  matured: 'info',
  forfeited: 'warning',
  released: 'success',
  withdrawn: 'default',
};

function BoosterStatCard({ label, value, icon, tone = 'text-emerald-700 bg-emerald-50', sub }) {
  return <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3 min-w-0">
    <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${tone}`}>{icon}</div>
    <div className="min-w-0">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide break-words">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-0.5 break-words">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  </div>;
}

const escapeReportText = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export default function SavingsBoosterPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('savings_booster', 'create') && hasPermission('invoices', 'create');
  const canPayInitial = hasPermission('invoices', 'create') && (hasPermission('savings_booster', 'create') || hasPermission('savings_booster', 'edit'));
  const [initialSlot, setInitialSlot] = useState(null);
  const [collections, setCollections] = useState(null);
  const [collectionError, setCollectionError] = useState(false);

  const [enrollments, setEnrollments]     = useState([]);
  const [loading, setLoading]             = useState(true);
  const [enrollOpen, setEnrollOpen]       = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [depositFilter, setDepositFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sort, setSort] = useState('newest');

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = enrollments.filter(row => {
      const member = row.members || {};
      const ledger = calculateSavingsBoosterLedger(row);
      return (!query || `${member.first_name || ''} ${member.last_name || ''} ${member.member_no || ''} ${row.slot_number || ''}`.toLowerCase().includes(query))
        && (statusFilter === 'all' || row.status === statusFilter)
        && (typeFilter === 'all' || member.membership_type === typeFilter)
        && (depositFilter === 'all' || (depositFilter === 'paid' ? ledger.initialDepositPaid : !ledger.initialDepositPaid));
    });
    return rows.sort((a, b) => {
      if (sort === 'name') return `${a.members?.first_name || ''} ${a.members?.last_name || ''}`.localeCompare(`${b.members?.first_name || ''} ${b.members?.last_name || ''}`);
      if (sort === 'capital') return Number(b.total_deposited || 0) - Number(a.total_deposited || 0);
      if (sort === 'slot') return Number(a.slot_number || 0) - Number(b.slot_number || 0);
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
  }, [enrollments, search, statusFilter, depositFilter, typeFilter, sort]);

  const { page, setPage, pageSize, setPageSize, pageItems, totalPages } = usePagination(filtered, { pageSize: 25 });
  useEffect(() => { setPage(1); }, [search, statusFilter, depositFilter, typeFilter, sort]);

  function reportRows() {
    return filtered.map(row => {
      const ledger = calculateSavingsBoosterLedger(row);
      return {
        'Member No.': row.members?.member_no || '',
        Member: `${row.members?.first_name || ''} ${row.members?.last_name || ''}`.trim(),
        Type: row.members?.membership_type || '', Slot: row.slot_number || '',
        Status: row.status || '', 'Start Date': row.start_date || '',
        'Maturity Date': ledger.maturityDate || '',
        'Initial Deposit': ledger.initialDepositPaid ? 'Paid' : 'Pending',
        'Initial Capital': Math.min(ledger.totalDeposited, INITIAL_DEPOSIT),
        'Weekly Capital': ledger.weeklyDeposited, 'Total Capital': ledger.totalDeposited,
        'Weeks Paid': ledger.programWeeksPaid, 'Weeks Required': 48,
        'Remaining Capital': ledger.remainingDeposit,
      };
    });
  }

  function handleExport() {
    if (!filtered.length) return toast.error('No matching enrollments to export.');
    // Prevent spreadsheet formulas in member-supplied text fields.
    const rows = reportRows().map(row => Object.fromEntries(Object.entries(row).map(([key, value]) =>
      [key, typeof value === 'string' && /^[\s]*[=+@-]/.test(value) ? "'" + value : value])));
    exportToCSV(`savings-booster-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  function handlePrint() {
    if (!filtered.length) return toast.error('No matching enrollments to print.');
    const rows = reportRows();
    const capital = rows.reduce((sum, row) => sum + row['Total Capital'], 0);
    const html = `<h1 class="report-title">Savings Booster Monitoring</h1>
      <div class="report-meta">${rows.length} enrollments | Recorded capital: ${escapeReportText(formatCurrency(capital))}<br/>
      Search: ${escapeReportText(search || 'All')} | Status: ${escapeReportText(statusFilter)} | Initial deposit: ${escapeReportText(depositFilter)} | Membership: ${escapeReportText(typeFilter)}</div>
      <table><thead><tr><th>Member / No.</th><th>Slot</th><th>Status</th><th>Start / Maturity</th><th>Initial</th><th>Weekly Capital</th><th>Total Capital</th><th>Weeks</th></tr></thead>
      <tbody>${rows.map(row => `<tr><td>${escapeReportText(row.Member)}<br/>${escapeReportText(row['Member No.'])}</td><td>${escapeReportText(row.Slot)}</td><td>${escapeReportText(row.Status)}</td><td>${escapeReportText(row['Start Date'])}<br/>${escapeReportText(row['Maturity Date'])}</td><td>${escapeReportText(row['Initial Deposit'])}</td><td>${escapeReportText(formatCurrency(row['Weekly Capital']))}</td><td>${escapeReportText(formatCurrency(row['Total Capital']))}</td><td>${row['Weeks Paid']}/48</td></tr>`).join('')}</tbody></table>`;
    printHtmlDocument(wrapWithLetterhead(html, { title: 'Savings Booster - WELLSERVE' }), {
      onBlocked: () => toast.error('Pop-up blocked. Please allow pop-ups and try again.'),
    });
  }


  const fetchEnrollments = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('savings_booster')
        .select('*, members(first_name, last_name, member_no, membership_type)')
        .order('created_at', { ascending: false });
      if (error && error.code !== 'PGRST116') throw error;
      setEnrollments(data || []);
    } catch (err) {
      console.warn('[SavingsBooster]', err.message);
      setEnrollments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEnrollments(); }, [fetchEnrollments]);

  const refreshCollections = useCallback(async () => {
    try { setCollections(await getBoosterCollections()); setCollectionError(false); }
    catch { setCollectionError(true); }
  }, []);
  useEffect(() => {
    refreshCollections();
    const refresh = () => { if (document.visibilityState === 'visible') { fetchEnrollments(); refreshCollections(); } };
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [fetchEnrollments, refreshCollections]);

  const activeCount     = enrollments.filter(e => e.status === 'active').length;
  const matureCount     = enrollments.filter(e => ['matured', 'released', 'withdrawn'].includes(e.status)).length;
  const forfeitedCount  = enrollments.filter(e => e.status === 'forfeited').length;
  const totalDeposited  = enrollments.reduce((s, e) => s + calculateSavingsBoosterLedger(e).totalDeposited, 0);
  const usedSlots       = enrollments.length;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader
        title="Savings Booster"
        subtitle="One-year member savings program"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" icon={<Printer size={15} />} disabled={loading || !filtered.length} onClick={handlePrint}>Print</Button>
            <Button variant="outline" icon={<Download size={15} />} disabled={loading || !filtered.length} onClick={handleExport}>Export CSV</Button>
          {canCreate ? (
            <Button icon={<Plus size={15} />} onClick={() => setEnrollOpen(true)}>
              Enroll Member
            </Button>
          ) : null}
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Collected', key: 'total', style: 'text-emerald-700' },
          { label: 'Initial Savings Collected', key: 'initial', style: 'text-blue-700' },
          { label: 'Weekly Savings Collected', key: 'weekly', style: 'text-teal-700' },
        ].map(item => <BoosterStatCard key={item.key} label={item.label} icon={<Wallet size={20} />}
          tone={`${item.style} ${item.key === 'initial' ? 'bg-blue-50' : item.key === 'weekly' ? 'bg-teal-50' : 'bg-emerald-50'}`}
          sub="All-time recorded deposits" value={collectionError ? 'Unavailable' : collections ? formatCurrency(collections[item.key]) : 'Loading...'} />)}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Program Slots', value: `${usedSlots} / ${TOTAL_SLOTS}`, color: 'bg-emerald-50', text: 'text-emerald-700', icon: <Users size={20} /> },
          { label: 'Active Accounts', value: activeCount, color: 'bg-blue-50', text: 'text-blue-700', icon: <Sprout size={20} /> },
          { label: 'Completed', value: matureCount, color: 'bg-violet-50', text: 'text-violet-700', icon: <CheckCircle size={20} /> },
          { label: 'Capital Deposited', value: formatCurrency(totalDeposited), color: forfeitedCount ? 'bg-amber-50' : 'bg-gray-50', text: forfeitedCount ? 'text-amber-700' : 'text-gray-700', icon: <TrendingUp size={20} /> },
        ].map(card => (
          <BoosterStatCard key={card.label} label={card.label} value={card.value} icon={card.icon} tone={`${card.color} ${card.text}`} sub="All enrollments" />
        ))}
      </div>

      {/* Enrollments Table */}
      <div className="flex flex-wrap items-center gap-3 border-y border-gray-200 py-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input aria-label="Search Savings Booster enrollments" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search member name, number, or slot..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg" />
        </div>
        <select aria-label="Account status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
          <option value="all">All Statuses</option>{Object.keys(statusVariant).map(status => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
        </select>
        <select aria-label="Initial deposit status" value={depositFilter} onChange={e => setDepositFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
          <option value="all">All Initial Deposits</option><option value="paid">Initial Deposit Paid</option><option value="pending">Initial Deposit Pending</option>
        </select>
        <select aria-label="Membership type" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
          <option value="all">All Member Types</option><option value="regular">Regular</option><option value="associate">Associate</option>
        </select>
        <select aria-label="Sort enrollments" value={sort} onChange={e => setSort(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
          <option value="newest">Newest First</option><option value="name">Member Name</option><option value="slot">Slot Number</option><option value="capital">Highest Capital</option>
        </select>
        <button type="button" title="Refresh" aria-label="Refresh Savings Booster" disabled={loading} onClick={() => { fetchEnrollments(); refreshCollections(); }} className="h-9 w-9 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 disabled:opacity-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
        {(search || statusFilter !== 'all' || depositFilter !== 'all' || typeFilter !== 'all' || sort !== 'newest') && <button type="button" onClick={() => { setSearch(''); setStatusFilter('all'); setDepositFilter('all'); setTypeFilter('all'); setSort('newest'); }} className="text-sm font-medium text-emerald-700">Clear filters</button>}
      </div>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">Member Enrollments</h2>
          <span className="text-xs text-gray-400">{filtered.length} of {enrollments.length} records</span>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Sprout size={40} className="text-gray-200 mb-3" />
            <p className="text-sm font-medium text-gray-500">{enrollments.length ? 'No matching enrollments' : 'No enrollments yet'}</p>
          </div>
        ) : (
          <div>
            <table className="hidden w-full table-fixed text-sm md:table">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="w-[22%] px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Member</th>
                  <th className="w-[7%] px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Slot</th>
                  <th className="w-[19%] px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Program Period</th>
                  <th className="w-[17%] px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Progress</th>
                  <th className="w-[12%] px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Capital</th>
                  <th className="w-[14%] px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Receivable</th>
                  <th className="w-[9%] px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pageItems.map(e => {
                  const m = e.members;
                  const ledger = calculateSavingsBoosterLedger(e);
                  const maturityDate = ledger.maturityDate;
                  return (
                    <tr key={e.id} className="hover:bg-gray-50/60 align-middle">
                      <td className="px-4 py-3">
                        <Link to={`/members/${e.member_id}`} className="font-medium text-emerald-700 hover:underline break-words">{m ? `${m.first_name} ${m.last_name}` : 'No member record'}</Link>
                        <p className="mt-0.5 text-xs text-gray-400">{m?.member_no || 'No member number'}</p>
                        <p className="mt-1 text-xs text-gray-500">Initial savings: {ledger.initialDepositPaid ? 'Paid' : 'Pending'}</p>
                        {canPayInitial && e.status === 'active' && ledger.totalDeposited === 0 && <button onClick={() => setInitialSlot(e)} className="mt-2 text-xs font-semibold text-emerald-700 hover:underline">Record Initial Deposit</button>}
                      </td>
                      <td className="px-3 py-3 text-gray-600">#{e.slot_number || '—'}</td>
                      <td className="px-3 py-3">
                        <p className="text-gray-700">{formatDate(e.start_date)}</p>
                        <p className="mt-0.5 text-xs text-gray-400">Matures {formatDate(maturityDate)}</p>
                      </td>
                      <td className="px-3 py-3">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                          <div
                            className={`h-full rounded-full ${e.status === 'forfeited' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(100, (ledger.programWeeksPaid / 48) * 100)}%` }}
                          />
                        </div>
                        <p className="mt-1.5 text-xs text-gray-500">{ledger.programWeeksPaid} of 48 weeks</p>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-gray-800">{formatCurrency(ledger.totalDeposited)}</td>
                      <td className="px-3 py-3 text-right">
                        <p className="font-bold text-emerald-700">{formatCurrency(ledger.receivableAtMaturity)}</p>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {e.status === 'forfeited' ? 'Capital only' : `Includes ${formatCurrency(ledger.projectedInterest)} interest`}
                        </p>
                      </td>
                      <td className="px-4 py-3"><Badge variant={statusVariant[e.status] || 'default'}>{e.status || 'active'}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="divide-y divide-gray-100 md:hidden">
              {pageItems.map(e => {
                const m = e.members;
                const ledger = calculateSavingsBoosterLedger(e);
                return (
                  <div key={e.id} className="space-y-4 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {m ? `${m.first_name} ${m.last_name}` : 'No member record'}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-400">{m?.member_no || 'No member number'} · Slot #{e.slot_number || '-'}</p>
                        <Link to={`/members/${e.member_id}`} className="text-xs text-emerald-700 hover:underline">View member</Link>
                      </div>
                      <Badge variant={statusVariant[e.status] || 'default'}>{e.status || 'active'}</Badge>
                    </div>
                    <p className="text-xs text-gray-500">Initial savings: {ledger.initialDepositPaid ? 'Paid' : 'Pending'}</p>
                    {canPayInitial && e.status === 'active' && ledger.totalDeposited === 0 && <button onClick={() => setInitialSlot(e)} className="text-xs font-semibold text-emerald-700 hover:underline">Record Initial Deposit</button>}
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <p className="text-gray-400">Program Period</p>
                        <p className="mt-1 text-gray-700">{formatDate(e.start_date)} to {formatDate(ledger.maturityDate)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-gray-400">Capital</p>
                        <p className="mt-1 font-semibold text-gray-900">{formatCurrency(ledger.totalDeposited)}</p>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-gray-500">Weekly progress</span>
                        <span className="font-medium text-gray-700">{ledger.programWeeksPaid} of 48</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                        <div
                          className={`h-full rounded-full ${e.status === 'forfeited' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(100, (ledger.programWeeksPaid / 48) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-end justify-between gap-3 border-t border-gray-100 pt-3">
                      <span className="text-xs text-gray-400">{e.status === 'forfeited' ? 'Capital-only receivable' : 'Projected maturity receivable'}</span>
                      <span className="text-base font-bold text-emerald-700">{formatCurrency(ledger.receivableAtMaturity)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              totalItems={filtered.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              itemLabel="enrollments"
            />
          </div>
        )}
      </div>

      {/* Enrollment Modal */}
      <EnrollModal
        open={enrollOpen}
        onClose={() => setEnrollOpen(false)}
        onEnrolled={() => { fetchEnrollments(); refreshCollections(); }}
        usedSlots={usedSlots}
        enrollments={enrollments}
      />
      {initialSlot && <EnrollModal open onClose={() => setInitialSlot(null)} existing={initialSlot}
        onEnrolled={() => { fetchEnrollments(); refreshCollections(); }} enrollments={enrollments} usedSlots={usedSlots} />}
    </div>
  );
}
