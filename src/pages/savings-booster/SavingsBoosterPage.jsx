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
import { formatCurrency, formatDate } from '../../utils/formatters';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

// ── Product Constants ──────────────────────────────────────────────────────────

const WEEKLY_DEPOSIT   = 70;
const MONTHLY_DEPOSIT  = 280;
const TOTAL_MONTHS     = 12;
const INTEREST_RATE    = 0.08;
const TOTAL_SLOTS      = 100;
const MAX_SLOTS_MEMBER = 5;
const MATURITY_MONTHS  = 13;

// ── Computation ────────────────────────────────────────────────────────────────

function computeSavingsBooster() {
  const rows = [];
  let totalInterest = 0;
  for (let month = 1; month <= TOTAL_MONTHS; month++) {
    const interestPerPeriod = MONTHLY_DEPOSIT * INTEREST_RATE;
    const remainingMonths   = TOTAL_MONTHS - month + 1;
    const interestCols = {};
    for (let m = month; m <= TOTAL_MONTHS; m++) interestCols[`m${m}`] = interestPerPeriod;
    totalInterest += interestPerPeriod * remainingMonths;
    rows.push({ month, interestCols, interestPerPeriod });
  }
  return {
    rows,
    totalInterest,
    totalSaved:        MONTHLY_DEPOSIT * TOTAL_MONTHS,
    totalWithdrawable: MONTHLY_DEPOSIT * TOTAL_MONTHS + totalInterest,
  };
}

// ── Mechanics ─────────────────────────────────────────────────────────────────

const mechanics = [
  { text: 'Must be MIGS (Member in Good Standing)',                                           highlight: true },
  { text: 'Only 1 slot per member (maximum 5 for special promo)' },
  { text: 'Must be an Associate or Regular Member of WELLSERVE Cooperative' },
  { text: 'Must have a minimum loan of ₱7,000.00 for New Regular Members' },
  { text: 'Existing Regular Member (MIGS) without existing loan may participate' },
  { text: '₱10.00/day or ₱70.00/week deposit, collected anytime of the week',               highlight: true },
  { text: 'Must NEVER skip a deposit every week for 1 year' },
  { text: 'If depositor skips a single week, must repeat the whole process',                 highlight: true },
  { text: 'Interest accounted every month for 12 months' },
  { text: 'Maturity date on the 13th month or after 365 days',                               highlight: true },
  { text: 'All deposits withdrawn only after 365 days (forfeited = same amount, no interest)' },
  { text: 'Only 100 slots offered; maximum 5 slots per member' },
  { text: 'Acknowledgment receipt issued before issuance of calculated amount' },
];

// ── Enrollment Modal ───────────────────────────────────────────────────────────

function EnrollModal({ open, onClose, onEnrolled, usedSlots, enrollments }) {
  const { user } = useAuth();

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

    const memberSlots = enrollments.filter(
      e => e.member_id === selected.id && e.status !== 'withdrawn'
    ).length;
    if (memberSlots >= MAX_SLOTS_MEMBER)
      issues.push(`Already has ${memberSlots} slot(s) — maximum ${MAX_SLOTS_MEMBER} per member.`);
    else if (memberSlots > 0)
      warnings.push(`Already has ${memberSlots} active slot(s). Adding slot #${memberSlots + 1}.`);

    const totalUsed = enrollments.filter(e => e.status !== 'withdrawn').length;
    if (totalUsed >= TOTAL_SLOTS)
      issues.push(`All ${TOTAL_SLOTS} slots are already filled.`);
    else if (totalUsed >= TOTAL_SLOTS - 5)
      warnings.push(`Only ${TOTAL_SLOTS - totalUsed} slot(s) remaining.`);

    // Compute next slot number for this member
    const existingSlots = enrollments
      .filter(e => e.member_id === selected.id)
      .map(e => e.slot_number || 0);
    const nextSlot = existingSlots.length > 0 ? Math.max(...existingSlots) + 1 : 1;

    setEligibility({ issues, warnings, eligible: issues.length === 0, nextSlot, memberSlots });
  }, [selected, enrollments]);

  // Compute maturity date
  const maturityDate = useMemo(() => {
    if (!startDate) return null;
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + MATURITY_MONTHS);
    return d.toISOString().split('T')[0];
  }, [startDate]);

  async function handleEnroll() {
    if (!selected || !eligibility?.eligible) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('savings_booster').insert({
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
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1">
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
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1">
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
                <span>Weekly Deposit: <strong>₱{WEEKLY_DEPOSIT}/week</strong></span>
                <span>Duration: <strong>52 weeks (1 year)</strong></span>
                <span>Total to Save: <strong>{formatCurrency(MONTHLY_DEPOSIT * TOTAL_MONTHS)}</strong></span>
                <span>Total Withdrawable: <strong className="text-emerald-700">{formatCurrency(MONTHLY_DEPOSIT * TOTAL_MONTHS + 1747.20)}</strong></span>
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

const statusVariant = { active: 'success', matured: 'info', forfeited: 'warning', withdrawn: 'default' };

export default function SavingsBoosterPage() {
  const [showMechanics, setShowMechanics] = useState(true);
  const [showTable, setShowTable]         = useState(false);
  const [enrollments, setEnrollments]     = useState([]);
  const [loading, setLoading]             = useState(true);
  const [enrollOpen, setEnrollOpen]       = useState(false);

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
  const matureCount     = enrollments.filter(e => e.status === 'matured').length;
  const totalDeposited  = enrollments.reduce((s, e) => s + (e.total_deposited || 0), 0);
  const usedSlots       = enrollments.filter(e => e.status !== 'withdrawn').length;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Savings Booster"
        subtitle="P10/day Special Promo — 100 Slots Only"
        action={
          <Button icon={<Plus size={15} />} onClick={() => setEnrollOpen(true)}>
            Enroll Member
          </Button>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Enrollments', value: enrollments.length, color: 'bg-emerald-50', text: 'text-emerald-700', icon: <Users size={20} /> },
          { label: 'Active',            value: activeCount,         color: 'bg-blue-50',    text: 'text-blue-700',    icon: <Sprout size={20} /> },
          { label: 'Matured',           value: matureCount,         color: 'bg-violet-50',  text: 'text-violet-700',  icon: <CheckCircle size={20} /> },
          { label: 'Total Deposited',   value: formatCurrency(totalDeposited), color: 'bg-amber-50', text: 'text-amber-700', icon: <TrendingUp size={20} /> },
        ].map(card => (
          <div key={card.label} className={`rounded-xl p-4 flex items-center gap-3 ${card.color} border border-gray-100`}>
            <span className={card.text}>{card.icon}</span>
            <div>
              <p className="text-xs text-gray-500 font-medium">{card.label}</p>
              <p className={`text-lg font-bold ${card.text}`}>{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Mechanics */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
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

      {/* Computation Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <button onClick={() => setShowTable(v => !v)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-600" />
            <span className="text-sm font-semibold text-gray-700">P10/day Savings Booster Computation Table</span>
            <span className="text-xs text-gray-400 ml-1">— 8% monthly interest for 12 months</span>
          </div>
          {showTable ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </button>
        {showTable && (
          <div className="border-t border-gray-100 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#07A04E] text-white">
                  <th className="px-3 py-2.5 text-left font-semibold">Month</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Wk 1</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Wk 2</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Wk 3</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Wk 4</th>
                  <th className="px-3 py-2.5 text-right font-semibold border-l border-emerald-400">Total</th>
                  {Array.from({ length: TOTAL_MONTHS }, (_, i) => (
                    <th key={i} className="px-2 py-2.5 text-right font-semibold whitespace-nowrap">M{i+1}</th>
                  ))}
                  <th className="px-3 py-2.5 text-right font-semibold border-l border-emerald-400">13th m</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(row => (
                  <tr key={row.month} className="hover:bg-emerald-50/30">
                    <td className="px-3 py-2 font-medium text-gray-700">{row.month}{['st','nd','rd'][row.month-1]||'th'} month</td>
                    {[70,70,70,70].map((v,i) => <td key={i} className="px-3 py-2 text-right text-gray-600">{v}</td>)}
                    <td className="px-3 py-2 text-right font-semibold text-gray-800 border-l border-gray-100">{formatCurrency(MONTHLY_DEPOSIT)}</td>
                    {Array.from({ length: TOTAL_MONTHS }, (_, i) => {
                      const m = i + 1;
                      const earned = row.interestCols[`m${m}`];
                      return <td key={m} className={`px-2 py-2 text-right ${earned ? 'text-emerald-600' : 'text-gray-200'}`}>{earned ? earned.toFixed(2) : '—'}</td>;
                    })}
                    <td className="px-3 py-2 text-right border-l border-gray-100">
                      {row.month === TOTAL_MONTHS && <span className="font-bold text-emerald-700">{formatCurrency(totalWithdrawable)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold text-gray-700">
                  <td className="px-3 py-2.5" colSpan={5}>Total</td>
                  <td className="px-3 py-2.5 text-right border-l border-gray-200">{formatCurrency(totalSaved)}</td>
                  <td className="px-3 py-2.5 text-right text-xs text-gray-500 font-normal" colSpan={TOTAL_MONTHS - 1}>Interest earned (12 months completed):</td>
                  <td className="px-3 py-2.5 text-right text-emerald-700">{formatCurrency(totalInterest)}</td>
                  <td className="px-3 py-2.5 text-right border-l border-gray-200">
                    <span className="px-2 py-1 bg-emerald-600 text-white rounded-lg text-[10px] font-bold whitespace-nowrap">
                      {formatCurrency(totalWithdrawable)}
                    </span>
                  </td>
                </tr>
                <tr className="bg-emerald-50 text-xs text-gray-500">
                  <td className="px-3 py-2" colSpan={6}>Interest/month: <strong>8%</strong> · Total: <strong>52%</strong></td>
                  <td className="px-3 py-2 text-right" colSpan={TOTAL_MONTHS + 1}>
                    <strong className="text-emerald-700">TOTAL WITHDRAWABLE: {formatCurrency(totalWithdrawable)}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Slot Bar */}
      <div className="flex items-center gap-4 px-5 py-3 bg-amber-50 rounded-xl border border-amber-200">
        <AlertCircle size={18} className="text-amber-600 flex-shrink-0" />
        <div className="flex-1 text-sm text-amber-800">
          <strong>{TOTAL_SLOTS} slots total</strong> — {usedSlots} used · {Math.max(0, TOTAL_SLOTS - usedSlots)} remaining
        </div>
        <div className="w-48 h-2 bg-amber-200 rounded-full overflow-hidden">
          <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${Math.min(100, (usedSlots / TOTAL_SLOTS) * 100)}%` }} />
        </div>
      </div>

      {/* Enrollments Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Member','No.','Slot','Start Date','Maturity','Deposited','Interest','Withdrawable','Status'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {enrollments.map(e => {
                  const m = e.members;
                  const maturityDate = e.start_date
                    ? (() => { const d = new Date(e.start_date); d.setMonth(d.getMonth() + MATURITY_MONTHS); return d.toISOString().split('T')[0]; })()
                    : null;
                  return (
                    <tr key={e.id} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3 font-medium text-gray-800">{m ? `${m.first_name} ${m.last_name}` : '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{m?.member_no || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">#{e.slot_number || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(e.start_date)}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(maturityDate)}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{formatCurrency(e.total_deposited || 0)}</td>
                      <td className="px-4 py-3 text-emerald-600 font-medium">{formatCurrency(e.interest_earned || 0)}</td>
                      <td className="px-4 py-3 font-bold text-emerald-700">{formatCurrency((e.total_deposited || 0) + (e.interest_earned || 0))}</td>
                      <td className="px-4 py-3"><Badge variant={statusVariant[e.status] || 'default'}>{e.status || 'active'}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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