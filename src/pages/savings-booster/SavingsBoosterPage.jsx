import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Sprout, Users, Info, CheckCircle, AlertCircle,
  Plus, ChevronDown, ChevronUp, TrendingUp, X,
  Search, Calendar, Hash,
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
  buildSavingsBoosterSchedule,
  buildSavingsBoosterUpdate,
  calculateSavingsBoosterLedger,
  getBoosterMaturityDate,
} from '../../services/savingsBoosterService';

// ── Product Constants ──────────────────────────────────────────────────────────

const WEEKLY_DEPOSIT   = SAVINGS_BOOSTER_DEFAULTS.weeklyDeposit;
const INITIAL_DEPOSIT  = SAVINGS_BOOSTER_DEFAULTS.initialDeposit;
const TOTAL_MONTHS     = SAVINGS_BOOSTER_DEFAULTS.months;
const TOTAL_SLOTS      = 100;
const MAX_SLOTS_MEMBER = 1;

// ── Computation ────────────────────────────────────────────────────────────────

function computeSavingsBooster() {
  const totalSaved = INITIAL_DEPOSIT + (SAVINGS_BOOSTER_DEFAULTS.weeksRequired * WEEKLY_DEPOSIT);
  const rows = buildSavingsBoosterSchedule();
  const ledger = calculateSavingsBoosterLedger({
    total_deposited: totalSaved,
    weeks_deposited: SAVINGS_BOOSTER_DEFAULTS.weeksRequired,
    status: 'matured',
  });
  return {
    rows,
    totalInterest: ledger.interestEarned,
    totalSaved,
    totalWithdrawable: ledger.withdrawableAmount,
  };
}

// ── Mechanics ─────────────────────────────────────────────────────────────────

const mechanics = [
  { text: 'Member must be MIGS (Member in Good Standing)', highlight: true },
  { text: 'Only one Savings Booster slot is allowed per member' },
  { text: 'Must be an Associate or Regular Member of WELLSERVE Cooperative' },
  { text: 'Must have a minimum loan of ₱7,000.00 for New Regular Members' },
  { text: 'Existing Regular Member (MIGS) without existing loan may participate' },
  { text: 'Initial deposit is ₱350.00, followed by ₱70.00 per week for 48 weeks', highlight: true },
  { text: 'Daily payments of ₱10.00 may be accumulated toward the ₱70.00 weekly requirement' },
  { text: 'A payment made during a fifth week is credited to the next available program week' },
  { text: 'Missing one required week stops the program and forfeits all interest', highlight: true },
  { text: 'A forfeited account receives only its deposited capital after the original 365-day term' },
  { text: 'A completed account earns a fixed 52% of capital after 365 days', highlight: true },
  { text: 'Funds are released during the 13th month after acknowledgment verification' },
  { text: 'Only 100 program slots are available' },
  { text: 'Acknowledgment receipt issued before issuance of calculated amount' },
];

// ── Enrollment Modal ───────────────────────────────────────────────────────────

function EnrollModal({ open, onClose, onEnrolled, usedSlots, enrollments }) {
  const { user, hasPermission } = useAuth();
  const canCreate = hasPermission('savings_booster', 'create');

  const [query, setQuery]           = useState('');
  const [results, setResults]       = useState([]);
  const [searching, setSearching]   = useState(false);
  const [selected, setSelected]     = useState(null);
  const [startDate, setStartDate]   = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes]           = useState('');
  const [saving, setSaving]         = useState(false);
  const [eligibility, setEligibility] = useState(null);

  function reset() {
    setQuery(''); setResults([]); setSelected(null);
    setStartDate(new Date().toISOString().split('T')[0]);
    setNotes(''); setSaving(false); setEligibility(null);
  }

  function handleClose() { reset(); onClose(); }

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
  }, [selected, enrollments]);

  // Compute maturity date
  const maturityDate = useMemo(() => {
    if (!startDate) return null;
    return getBoosterMaturityDate(startDate);
  }, [startDate]);

  async function handleEnroll() {
    if (!canCreate) {
      toast.error('You do not have permission to enroll members');
      return;
    }
    if (!selected || !eligibility?.eligible) return;
    setSaving(true);
    try {
      const basePayload = {
        member_id:         selected.id,
        slot_number:       eligibility.nextSlot,
        start_date:        startDate,
        status:            'active',
        total_deposited:   0,
        interest_earned:   0,
        weeks_deposited:   0,
        last_deposit_date: null,
        notes:             notes.trim() || null,
        created_by:        user?.id || null,
      };
      const { error } = await supabase.from('savings_booster').insert({
        ...basePayload,
        ...buildSavingsBoosterUpdate(basePayload),
      });
      if (error) throw error;
      toast.success(`${selected.first_name} ${selected.last_name} enrolled in Savings Booster (Slot #${eligibility.nextSlot})!`);
      onEnrolled();
      handleClose();
    } catch (err) {
      toast.error('Enrollment failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Enroll Member — Savings Booster" size="lg">
      <div className="space-y-5">

        {/* Step 1: Search member */}
        <div>
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
        </div>

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
                <span>Initial Deposit: <strong>{formatCurrency(INITIAL_DEPOSIT)}</strong></span>
                <span>Required Weeks: <strong>{SAVINGS_BOOSTER_DEFAULTS.weeksRequired}</strong></span>
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
            disabled={!selected || !eligibility?.eligible || saving}
          >
            Confirm Enrollment
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

export default function SavingsBoosterPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('savings_booster', 'create');

  const [showMechanics, setShowMechanics] = useState(true);
  const [showTable, setShowTable]         = useState(false);
  const [enrollments, setEnrollments]     = useState([]);
  const [loading, setLoading]             = useState(true);
  const [enrollOpen, setEnrollOpen]       = useState(false);

  const { page, setPage, pageSize, setPageSize, pageItems, totalPages } = usePagination(enrollments, { pageSize: 25 });

  const { rows, totalInterest, totalSaved, totalWithdrawable } = useMemo(computeSavingsBooster, []);

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
          canCreate ? (
            <Button icon={<Plus size={15} />} onClick={() => setEnrollOpen(true)}>
              Enroll Member
            </Button>
          ) : null
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Program Slots', value: `${usedSlots} / ${TOTAL_SLOTS}`, color: 'bg-emerald-50', text: 'text-emerald-700', icon: <Users size={20} /> },
          { label: 'Active Accounts', value: activeCount, color: 'bg-blue-50', text: 'text-blue-700', icon: <Sprout size={20} /> },
          { label: 'Completed', value: matureCount, color: 'bg-violet-50', text: 'text-violet-700', icon: <CheckCircle size={20} /> },
          { label: 'Capital Deposited', value: formatCurrency(totalDeposited), color: forfeitedCount ? 'bg-amber-50' : 'bg-gray-50', text: forfeitedCount ? 'text-amber-700' : 'text-gray-700', icon: <TrendingUp size={20} /> },
        ].map(card => (
          <div key={card.label} className={`rounded-lg p-4 flex items-center gap-3 ${card.color} border border-gray-100`}>
            <span className={card.text}>{card.icon}</span>
            <div>
              <p className="text-xs text-gray-500 font-medium">{card.label}</p>
              <p className={`text-lg font-bold ${card.text}`}>{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Mechanics */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <button onClick={() => setShowMechanics(v => !v)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-2">
            <Info size={16} className="text-emerald-600" />
            <span className="text-sm font-semibold text-gray-700">Savings Booster Mechanics</span>
          </div>
          {showMechanics ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </button>
        {showMechanics && (
          <div className="border-t border-gray-100 px-5 py-4">
            <ul className="space-y-2">
              {mechanics.map((m, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <CheckCircle size={14} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span className={`text-sm ${m.highlight ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>{m.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Program computation */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <button onClick={() => setShowTable(v => !v)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-600" />
            <span className="text-sm font-semibold text-gray-700">Program Computation</span>
            <span className="hidden sm:inline text-xs text-gray-400 ml-1">48 weekly deposits over 12 months</span>
          </div>
          {showTable ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </button>
        {showTable && (
          <div className="border-t border-gray-100">
            <div className="grid grid-cols-1 sm:grid-cols-3 border-b border-gray-100 bg-emerald-50">
              <div className="px-5 py-4">
                <p className="text-xs text-gray-500">Capital at Completion</p>
                <p className="mt-1 text-lg font-bold text-gray-900">{formatCurrency(totalSaved)}</p>
              </div>
              <div className="px-5 py-4 sm:border-l border-gray-200">
                <p className="text-xs text-gray-500">Interest at 52%</p>
                <p className="mt-1 text-lg font-bold text-emerald-700">{formatCurrency(totalInterest)}</p>
              </div>
              <div className="px-5 py-4 sm:border-l border-gray-200">
                <p className="text-xs text-gray-500">Receivable at Maturity</p>
                <p className="mt-1 text-lg font-bold text-emerald-700">{formatCurrency(totalWithdrawable)}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Month</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Weekly Target</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Monthly Contribution</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Cumulative Capital</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(row => (
                  <tr key={row.month} className="hover:bg-emerald-50/30">
                    <td className="px-5 py-2.5 font-medium text-gray-700">Month {row.month}</td>
                    <td className="px-5 py-2.5 text-right text-gray-600">{row.weeklyPayments} × {formatCurrency(WEEKLY_DEPOSIT)}</td>
                    <td className="px-5 py-2.5 text-right text-gray-700">{formatCurrency(row.weeklyContribution)}</td>
                    <td className="px-5 py-2.5 text-right font-semibold text-gray-900">{formatCurrency(row.cumulativeCapital)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-200 font-semibold">
                  <td className="px-5 py-3 text-gray-700">Plan Total</td>
                  <td className="px-5 py-3 text-right text-gray-600">{SAVINGS_BOOSTER_DEFAULTS.weeksRequired} weeks</td>
                  <td className="px-5 py-3 text-right text-gray-600">{formatCurrency(SAVINGS_BOOSTER_DEFAULTS.weeksRequired * WEEKLY_DEPOSIT)}</td>
                  <td className="px-5 py-3 text-right text-emerald-700">{formatCurrency(totalSaved)}</td>
                </tr>
              </tfoot>
            </table>
            </div>
            <p className="px-5 py-3 text-xs text-gray-500 border-t border-gray-100">
              Includes the {formatCurrency(INITIAL_DEPOSIT)} initial deposit. Interest is credited only after successful completion and maturity. A forfeited account receives capital only.
            </p>
          </div>
        )}
      </div>

      {/* Slot Bar */}
      <div className="flex items-center gap-4 px-5 py-3 bg-amber-50 rounded-lg border border-amber-200">
        <AlertCircle size={18} className="text-amber-600 flex-shrink-0" />
        <div className="flex-1 text-sm text-amber-800">
          <strong>{TOTAL_SLOTS} slots total</strong> — {usedSlots} used · {Math.max(0, TOTAL_SLOTS - usedSlots)} remaining
        </div>
        <div className="w-48 h-2 bg-amber-200 rounded-full overflow-hidden">
          <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${Math.min(100, (usedSlots / TOTAL_SLOTS) * 100)}%` }} />
        </div>
      </div>

      {/* Enrollments Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">Member Enrollments</h2>
          <span className="text-xs text-gray-400">{enrollments.length} records</span>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : enrollments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Sprout size={40} className="text-gray-200 mb-3" />
            <p className="text-sm font-medium text-gray-500">No enrollments yet</p>
            <p className="text-xs text-gray-400 mt-1">Click <strong>+ Enroll Member</strong> to get started</p>
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
                        <p className="font-medium text-gray-800 truncate">{m ? `${m.first_name} ${m.last_name}` : 'No member record'}</p>
                        <p className="mt-0.5 text-xs text-gray-400">{m?.member_no || 'No member number'}</p>
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
                            style={{ width: `${Math.min(100, (ledger.weeksDeposited / SAVINGS_BOOSTER_DEFAULTS.weeksRequired) * 100)}%` }}
                          />
                        </div>
                        <p className="mt-1.5 text-xs text-gray-500">{ledger.weeksDeposited} of {SAVINGS_BOOSTER_DEFAULTS.weeksRequired} weeks</p>
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
                      </div>
                      <Badge variant={statusVariant[e.status] || 'default'}>{e.status || 'active'}</Badge>
                    </div>
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
                        <span className="font-medium text-gray-700">{ledger.weeksDeposited} of {SAVINGS_BOOSTER_DEFAULTS.weeksRequired}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                        <div
                          className={`h-full rounded-full ${e.status === 'forfeited' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(100, (ledger.weeksDeposited / SAVINGS_BOOSTER_DEFAULTS.weeksRequired) * 100)}%` }}
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
              totalItems={enrollments.length}
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
        onEnrolled={fetchEnrollments}
        usedSlots={usedSlots}
        enrollments={enrollments}
      />
    </div>
  );
}
