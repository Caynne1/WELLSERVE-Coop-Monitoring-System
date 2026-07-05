import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload, Eye, Search, UserPlus, Pencil, Trash2, Users, Printer,
  Download, Filter, RotateCcw, CheckSquare, Square, MinusSquare,
  X, UserCheck, UserX, ChevronDown, CalendarDays, Baby,
} from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import AddMemberModal from '../../components/members/AddMemberModal';
import ImportMembersModal from '../../components/members/ImportMembersModal';
import ImportFinancialModal from '../../components/members/ImportFinancialModal';
import { getMembers, deleteMember, updateMember } from '../../services/memberService';
import { useAuth } from '../../context/AuthContext';
import { trackActivity } from '../../services/logService';
import { formatDate } from '../../utils/formatters';
import { exportToCSV } from '../../utils/csvExport';

// ─── Avatar helpers ───────────────────────────────────────────────────────────

const avatarColors = [
  'bg-[#D6FADC] text-[#07A04E]',
  'bg-[#AEECEF]/40 text-[#000066]',
  'bg-[#D6FADC] text-[#273C2C]',
  'bg-amber-100 text-amber-700',
  'bg-[#D6FADC] text-[#7EB751]',
];

const kiddyAvatarColors = [
  'bg-teal-100 text-teal-700',
  'bg-sky-100 text-sky-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-violet-100 text-violet-700',
];

const statusVariant = { active: 'success', inactive: 'warning', closed: 'dark' };
const statusLabel = { active: 'Active', inactive: 'Inactive', closed: 'Closed Account' };

const membershipTypeClass = {
  regular:   'bg-blue-50 text-blue-700 border border-blue-200',
  associate: 'bg-purple-50 text-purple-700 border border-purple-200',
  kiddy:     'bg-teal-50 text-teal-700 border border-teal-200',
};

// ─── Tab config ───────────────────────────────────────────────────────────────

// memberView controls which members are shown: 'regular' = associate+regular, 'kiddy' = kiddy only
const MEMBER_VIEWS = [
  { id: 'regular', label: 'Members', icon: Users },
  { id: 'kiddy',   label: 'Kiddy & Youth', icon: Baby },
];

// ─── Bulk Action Toolbar ──────────────────────────────────────────────────────

function BulkToolbar({
  selectedCount, totalCount, onClearSelection, onSelectAll,
  onBulkExport, onBulkActivate, onBulkDeactivate, onBulkClose, onBulkDelete, statusTab,
}) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  return (
    <div className="flex items-center gap-3 bg-[#07A04E] text-white px-4 py-3 rounded-xl shadow-md animate-in slide-in-from-top-2 duration-200">
      <div className="flex items-center gap-2 min-w-0">
        <CheckSquare size={16} className="flex-shrink-0" />
        <span className="text-sm font-semibold whitespace-nowrap">
          {selectedCount} of {totalCount} selected
        </span>
      </div>
      <div className="h-4 w-px bg-white/30 flex-shrink-0" />
      <button
        onClick={onSelectAll}
        className="text-xs font-medium text-white/80 hover:text-white transition-colors whitespace-nowrap"
      >
        Select all {totalCount}
      </button>
      <div className="flex-1" />
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onBulkExport}
          className="flex items-center gap-1.5 text-xs font-medium bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Download size={13} />
          Export CSV
        </button>
        <div className="relative">
          <button
            onClick={() => setShowStatusMenu(v => !v)}
            className="flex items-center gap-1.5 text-xs font-medium bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg transition-colors"
          >
            <UserCheck size={13} />
            Change Status
            <ChevronDown size={12} />
          </button>
          {showStatusMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowStatusMenu(false)} />
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-20 overflow-hidden min-w-[160px]">
                <button
                  onClick={() => { onBulkActivate(); setShowStatusMenu(false); }}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left text-emerald-700 hover:bg-emerald-50 transition-colors"
                >
                  <UserCheck size={14} /> Set Active
                </button>
                <button
                  onClick={() => { onBulkDeactivate(); setShowStatusMenu(false); }}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left text-amber-700 hover:bg-amber-50 transition-colors"
                >
                  <UserX size={14} /> Set Inactive
                </button>
                <button
                  onClick={() => { onBulkClose(); setShowStatusMenu(false); }}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <UserX size={14} /> Set Closed Account
                </button>
              </div>
            </>
          )}
        </div>
        <button
          onClick={onBulkDelete}
          className="flex items-center gap-1.5 text-xs font-medium bg-red-500/80 hover:bg-red-500 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Trash2 size={13} />
          Delete
        </button>
      </div>
      <button
        onClick={onClearSelection}
        className="ml-1 p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/15 transition-colors flex-shrink-0"
        title="Clear selection"
      >
        <X size={15} />
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MembersPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Data
  const [members, setMembers]           = useState([]);
  const [loading, setLoading]           = useState(true);

  // View: 'regular' (associate + regular) | 'kiddy'
  const [memberView, setMemberView]     = useState('regular');

  // Filters
  const [search, setSearch]             = useState('');
  const [typeFilter, setTypeFilter]     = useState('all');
  const [statusTab, setStatusTab]       = useState('active');
  const [yearFilter, setYearFilter]     = useState('all');

  // Selection
  const [selectedIds, setSelectedIds]   = useState(new Set());

  // Dialogs
  const [confirmDelete, setConfirmDelete]             = useState(null);
  const [confirmBulkDelete, setConfirmBulkDelete]     = useState(false);
  const [confirmBulkStatus, setConfirmBulkStatus]     = useState(null);
  const [addMemberOpen, setAddMemberOpen]             = useState(false);
  const [importOpen, setImportOpen]                   = useState(false);
  const [importFinancialOpen, setImportFinancialOpen] = useState(false);

  // Action loading states
  const [deleting, setDeleting]                       = useState(false);
  const [reactivatingId, setReactivatingId]           = useState(null);
  const [bulkDeleting, setBulkDeleting]               = useState(false);
  const [bulkStatusChanging, setBulkStatusChanging]   = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchMembers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getMembers();
      setMembers(data || []);
    } catch {
      toast.error(
        (t) => (
          <span className="flex items-center gap-3 text-sm">
            Failed to load members
            <button
              className="flex-shrink-0 text-xs font-bold underline"
              onClick={() => { toast.dismiss(t.id); fetchMembers(); }}
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

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  // Clear selection when view/tab/filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [memberView, statusTab, typeFilter, search, yearFilter]);

  // Reset typeFilter when switching views (kiddy view has no type sub-filter)
  useEffect(() => {
    setTypeFilter('all');
    setSearch('');
    setYearFilter('all');
    setStatusTab('active');
  }, [memberView]);

  // ── Split members by view ──────────────────────────────────────────────────

  const isKiddyView = memberView === 'kiddy';

  // Counts for tab badges
  const regularMemberCount = useMemo(
    () => members.filter(m => m.membership_type !== 'kiddy' && (m.status || 'active') === 'active').length,
    [members]
  );
  const kiddyMemberCount = useMemo(
    () => members.filter(m => m.membership_type === 'kiddy' && (m.status || 'active') === 'active').length,
    [members]
  );

  // ── Available join years ───────────────────────────────────────────────────

  const availableYears = useMemo(() => {
    const yearSet = new Set();
    members
      .filter(m => isKiddyView ? m.membership_type === 'kiddy' : m.membership_type !== 'kiddy')
      .forEach(m => {
        const raw = m.date_joined || m.created_at;
        if (!raw) return;
        const yr = new Date(raw).getFullYear();
        if (!isNaN(yr)) yearSet.add(yr);
      });
    return [...yearSet].sort((a, b) => b - a);
  }, [members, isKiddyView]);

  // ── Filtered list ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return members.filter(m => {
      // Split by view first
      if (isKiddyView && m.membership_type !== 'kiddy') return false;
      if (!isKiddyView && m.membership_type === 'kiddy') return false;

      const matchesSearch =
        m.first_name?.toLowerCase().includes(q) ||
        m.last_name?.toLowerCase().includes(q) ||
        m.member_no?.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q) ||
        m.phone?.toLowerCase().includes(q) ||
        (m.recruiter_name || '').toLowerCase().includes(q);

      const matchesType =
        typeFilter === 'all'
          ? true
          : isKiddyView
            ? (m.kiddy_savings_type || 'regular_savings') === typeFilter
            : (m.membership_type || '').toLowerCase() === typeFilter;

      const matchesStatus =
        statusTab === 'active'
          ? (m.status || 'active') === 'active'
          : m.status === statusTab;

      let matchesYear = true;
      if (yearFilter !== 'all') {
        const raw = m.date_joined || m.created_at;
        const yr  = raw ? new Date(raw).getFullYear() : null;
        matchesYear = yr === Number(yearFilter);
      }

      return matchesSearch && matchesType && matchesStatus && matchesYear;
    });
  }, [members, search, typeFilter, statusTab, yearFilter, isKiddyView]);

  // ── Selection helpers ──────────────────────────────────────────────────────

  const allFilteredSelected = filtered.length > 0 && filtered.every(m => selectedIds.has(m.id));
  const someFilteredSelected = filtered.some(m => selectedIds.has(m.id));
  const selectedCount = [...selectedIds].filter(id => filtered.some(m => m.id === id)).length;

  function toggleOne(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allFilteredSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filtered.forEach(m => next.delete(m.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filtered.forEach(m => next.add(m.id));
        return next;
      });
    }
  }

  function selectAll() { setSelectedIds(new Set(filtered.map(m => m.id))); }
  function clearSelection() { setSelectedIds(new Set()); }

  const selectedMembers = useMemo(
    () => filtered.filter(m => selectedIds.has(m.id)),
    [filtered, selectedIds]
  );

  // ── Single-row actions ─────────────────────────────────────────────────────

  async function handleDelete(id) {
    if (deleting) return;
    const memberName = confirmDelete
      ? `${confirmDelete.first_name ?? ''} ${confirmDelete.last_name ?? ''}`.trim()
      : null;
    setDeleting(true);
    try {
      const result = await deleteMember(id);
      toast.success(result?.message || 'Member deleted');
      trackActivity({
        userId: user?.id, module: 'member', action: 'delete',
        description: memberName ? `Deleted member: ${memberName}` : `Deleted member ID: ${id}`,
      });
      setConfirmDelete(null);
      await fetchMembers();
    } catch (err) {
      toast.error(err.message || 'Failed to delete member');
    } finally {
      setDeleting(false);
    }
  }

  async function handleReactivate(member) {
    if (reactivatingId) return;
    setReactivatingId(member.id);
    try {
      await updateMember(member.id, { status: 'active' });
      toast.success('Member reactivated');
      trackActivity({ userId: user?.id, module: 'member', action: 'reactivate', description: `Reactivated member: ${member.first_name} ${member.last_name}` });
      await fetchMembers();
    } catch (err) {
      toast.error(err.message || 'Failed to reactivate member');
    } finally {
      setReactivatingId(null);
    }
  }

  // ── Bulk actions ───────────────────────────────────────────────────────────

  function handleBulkExport() {
    try {
      if (selectedMembers.length === 0) { toast.error('No members selected.'); return; }
      const rows = selectedMembers.map(m => ({
        member_no:       m.member_no       || '',
        first_name:      m.first_name      || '',
        last_name:       m.last_name       || '',
        membership_type: m.membership_type || '',
        kiddy_savings_type: m.membership_type === 'kiddy' ? (m.kiddy_savings_type || 'regular_savings') : '',
        email:           m.email           || '',
        mobile_no:       m.phone           || '',
        recruiter_name:  m.recruiter_name  || 'Self',
        status:          m.status          || '',
        joined:          m.date_joined ? formatDate(m.date_joined) : (m.created_at ? formatDate(m.created_at) : ''),
      }));
      exportToCSV(`${isKiddyView ? 'kiddy_' : ''}members_export_${new Date().toISOString().slice(0, 10)}.csv`, rows);
      toast.success(`${rows.length} member${rows.length !== 1 ? 's' : ''} exported.`);
    } catch (err) {
      toast.error(err.message || 'Failed to export.');
    }
  }

  async function executeBulkStatusChange(newStatus) {
    if (bulkStatusChanging) return;
    const ids = selectedMembers.map(m => m.id);
    let successCount = 0; let failCount = 0;
    setBulkStatusChanging(true);
    await Promise.allSettled(ids.map(id => updateMember(id, { status: newStatus }).then(() => successCount++).catch(() => failCount++)));
    if (successCount > 0) {
      toast.success(`${successCount} member${successCount !== 1 ? 's' : ''} set to ${newStatus}.`);
      trackActivity({ userId: user?.id, module: 'member', action: newStatus === 'active' ? 'reactivate' : 'deactivate', description: `Bulk status change: ${successCount} member(s) set to ${newStatus}.` });
    }
    if (failCount > 0) toast.error(`${failCount} update${failCount !== 1 ? 's' : ''} failed.`);
    clearSelection(); setConfirmBulkStatus(null); setBulkStatusChanging(false);
    await fetchMembers();
  }

  async function executeBulkDelete() {
    if (bulkDeleting) return;
    const ids = selectedMembers.map(m => m.id);
    let successCount = 0; let failCount = 0;
    setBulkDeleting(true);
    await Promise.allSettled(ids.map(id => deleteMember(id).then(() => successCount++).catch(() => failCount++)));
    if (successCount > 0) {
      toast.success(`${successCount} member${successCount !== 1 ? 's' : ''} deleted/archived.`);
      trackActivity({ userId: user?.id, module: 'member', action: 'delete', description: `Bulk deleted ${successCount} member(s).` });
    }
    if (failCount > 0) toast.error(`${failCount} deletion${failCount !== 1 ? 's' : ''} failed.`);
    clearSelection(); setConfirmBulkDelete(false); setBulkDeleting(false);
    await fetchMembers();
  }

  function handleExportCSV() {
    try {
      const rows = filtered.map(m => ({
        member_no:       m.member_no       || '',
        first_name:      m.first_name      || '',
        last_name:       m.last_name       || '',
        membership_type: m.membership_type || '',
        kiddy_savings_type: m.membership_type === 'kiddy' ? (m.kiddy_savings_type || 'regular_savings') : '',
        email:           m.email           || '',
        mobile_no:       m.phone           || '',
        recruiter_name:  m.recruiter_name  || 'Self',
        status:          m.status          || '',
        joined:          m.date_joined ? formatDate(m.date_joined) : (m.created_at ? formatDate(m.created_at) : ''),
      }));
      exportToCSV(
        isKiddyView
          ? 'kiddy_members_report.csv'
          : (statusTab === 'inactive' ? 'inactive_members_report.csv' : 'members_report.csv'),
        rows
      );
      toast.success('CSV exported successfully');
    } catch (err) {
      toast.error(err.message || 'Failed to export CSV');
    }
  }

  function handlePrint() { window.print(); }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 print:p-0">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-members-area, .print-members-area * { visibility: visible; }
          .print-members-area { position: absolute; left: 0; top: 0; width: 100%; background: white; padding: 24px; }
        }
      `}</style>

      {/* ── Header ── */}
      <div className="print:hidden">
        <PageHeader
          title="Members"
          subtitle="Manage cooperative members and their financial accounts"
          action={
            <div className="flex items-center gap-2">
              {!isKiddyView && (
                <>
                  <Button variant="outline" onClick={() => setImportFinancialOpen(true)} icon={<Upload size={16} />}>
                    Import Financial
                  </Button>
                  <Button variant="outline" onClick={() => setImportOpen(true)} icon={<Upload size={16} />}>
                    Import Members
                  </Button>
                </>
              )}
              <Button onClick={() => setAddMemberOpen(true)} icon={<UserPlus size={16} />}>
                Add Member
              </Button>
            </div>
          }
        />
      </div>

      {/* ── View Tabs: Members | Kiddy & Youth ── */}
      <div className="mt-4 flex gap-2 print:hidden">
        {MEMBER_VIEWS.map(view => {
          const Icon = view.icon;
          const count = view.id === 'kiddy' ? kiddyMemberCount : regularMemberCount;
          const isActive = memberView === view.id;
          return (
            <button
              key={view.id}
              onClick={() => setMemberView(view.id)}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all
                ${isActive
                  ? view.id === 'kiddy'
                    ? 'bg-teal-600 text-white shadow-sm shadow-teal-200'
                    : 'bg-[#07A04E] text-white shadow-sm shadow-green-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }
              `}
            >
              <Icon size={15} />
              {view.label}
              <span className={`
                text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center
                ${isActive
                  ? 'bg-white/20 text-white'
                  : 'bg-gray-200 text-gray-500'
                }
              `}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Status Tabs: Active | Inactive | Closed Account (below view tabs) ── */}
      <div className="mt-3 flex gap-2 print:hidden">
        {['active', 'inactive', 'closed'].map(tab => (
          <button
            key={tab}
            onClick={() => setStatusTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
              statusTab === tab
                ? isKiddyView
                  ? 'bg-teal-50 text-teal-700 border border-teal-200'
                  : 'bg-[#D6FADC] text-[#07A04E] border border-[#07A04E]/20'
                : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
            }`}
          >
            {statusLabel[tab]}
          </button>
        ))}
      </div>

      {/* ── Kiddy info banner ── */}
      {isKiddyView && (
        <div className="mt-4 flex items-start gap-3 p-3.5 bg-gradient-to-r from-teal-50 via-sky-50 to-amber-50 border border-teal-100 rounded-xl print:hidden">
          <Baby size={16} className="text-teal-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-teal-800 leading-relaxed">
            <strong>Kiddy & Youth Savings</strong> members are managed separately.
            Their member numbers use the <span className="font-mono font-semibold">KY-</span> prefix
            to avoid conflicts with regular member numbers.
          </div>
        </div>
      )}

      {/* ── Filters & Toolbar ── */}
      <div className="mt-4 mb-4 flex flex-col gap-3 print:hidden">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">

            {/* Search */}
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder={isKiddyView ? 'Search kiddy members…' : 'Search by name, ID, email, recruiter…'}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl
                  focus:outline-none focus:ring-2 focus:ring-[#07A04E] focus:border-transparent
                  w-72 bg-white shadow-sm"
              />
            </div>

            {/* Type filter — Associate/Regular for the regular view,
                Regular Savings Account/Educational Savings Account for the Kiddy view */}
            <div className="relative">
              <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-xl bg-white shadow-sm
                  focus:outline-none focus:ring-2 focus:ring-[#07A04E]"
              >
                {isKiddyView ? (
                  <>
                    <option value="all">All Savings Types</option>
                    <option value="regular_savings">Regular Savings Account</option>
                    <option value="educational_savings">Educational Savings Account</option>
                  </>
                ) : (
                  <>
                    <option value="all">All Types</option>
                    <option value="associate">Associate</option>
                    <option value="regular">Regular</option>
                  </>
                )}
              </select>
            </div>

            {/* Year filter */}
            <div className="relative">
              <CalendarDays size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <select
                value={yearFilter}
                onChange={e => setYearFilter(e.target.value)}
                className={`pl-9 pr-8 py-2 text-sm border rounded-xl bg-white shadow-sm
                  focus:outline-none focus:ring-2 focus:ring-[#07A04E] transition-colors
                  ${yearFilter !== 'all'
                    ? 'border-[#07A04E] ring-1 ring-[#07A04E] text-[#07A04E] font-medium'
                    : 'border-gray-200 text-gray-700'
                  }`}
              >
                <option value="all">All Years</option>
                {availableYears.map(yr => (
                  <option key={yr} value={yr}>{yr}</option>
                ))}
              </select>
            </div>

            {yearFilter !== 'all' && (
              <button
                onClick={() => setYearFilter('all')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium
                  bg-[#D6FADC] text-[#07A04E] border border-[#07A04E]/20 rounded-lg
                  hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors group"
                title="Clear year filter"
              >
                <CalendarDays size={12} />
                {yearFilter}
                <X size={11} className="group-hover:scale-110 transition-transform" />
              </button>
            )}

            <Button variant="outline" icon={<Printer size={15} />} onClick={handlePrint}>Print</Button>
            <Button variant="outline" icon={<Download size={15} />} onClick={handleExportCSV}>Export All</Button>
          </div>

          {!loading && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              {isKiddyView ? <Baby size={14} /> : <Users size={14} />}
              <span>{filtered.length} of {members.filter(m => isKiddyView ? m.membership_type === 'kiddy' : m.membership_type !== 'kiddy').length} {isKiddyView ? 'kiddy members' : 'members'}</span>
            </div>
          )}
        </div>

        {/* Bulk toolbar */}
        {selectedCount > 0 && (
          <BulkToolbar
            selectedCount={selectedCount}
            totalCount={filtered.length}
            onClearSelection={clearSelection}
            onSelectAll={selectAll}
            onBulkExport={handleBulkExport}
            onBulkActivate={() => setConfirmBulkStatus('active')}
            onBulkDeactivate={() => setConfirmBulkStatus('inactive')}
            onBulkClose={() => setConfirmBulkStatus('closed')}
            onBulkDelete={() => setConfirmBulkDelete(true)}
            statusTab={statusTab}
          />
        )}
      </div>

      {/* ── Table ── */}
      <div className="print-members-area">

        {/* Print header */}
        <div className="hidden print:flex items-center justify-between mb-6 border-b border-gray-200 pb-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-green-700 text-white flex items-center justify-center font-bold text-xl border-4 border-green-100">W</div>
            <div>
              <h1 className="text-2xl font-bold tracking-wide text-gray-900">WELLSERVE</h1>
              <p className="text-xs tracking-[0.25em] text-green-700 font-semibold">CREDIT COOPERATIVE</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-gray-800">{isKiddyView ? 'Kiddy & Youth Members Report' : 'Members Report'}</p>
            <p className="text-xs text-gray-500">Status: {statusLabel[statusTab]}</p>
            <p className="text-xs text-gray-500">
              {isKiddyView ? 'Savings Type' : 'Type'}: {
                typeFilter === 'all'
                  ? 'All'
                  : isKiddyView
                    ? (typeFilter === 'educational_savings' ? 'Educational Savings Account' : 'Regular Savings Account')
                    : typeFilter
              }
            </p>
            <p className="text-xs text-gray-500">Year Joined: {yearFilter === 'all' ? 'All Years' : yearFilter}</p>
            <p className="text-xs text-gray-500">Generated: {new Date().toLocaleString()}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : (
          <div className={`bg-white rounded-2xl border overflow-hidden shadow-sm print:shadow-none print:rounded-none ${isKiddyView ? 'border-teal-100' : 'border-gray-100'}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b ${isKiddyView ? 'bg-teal-50/70 border-teal-100' : 'bg-gray-50/80 border-gray-100'}`}>
                    {/* Select-all checkbox */}
                    <th className="pl-4 pr-2 py-3 w-10 print:hidden">
                      <button
                        type="button"
                        onClick={toggleAll}
                        className="text-gray-400 hover:text-[#07A04E] transition-colors"
                        title={allFilteredSelected ? 'Deselect all' : 'Select all'}
                      >
                        {allFilteredSelected
                          ? <CheckSquare size={16} className="text-[#07A04E]" />
                          : someFilteredSelected
                            ? <MinusSquare size={16} className="text-[#07A04E]" />
                            : <Square size={16} />}
                      </button>
                    </th>

                    {(isKiddyView
                      ? ['Member', 'Member No.', 'Savings Type', 'Guardian', 'Contact', 'Date of Birth', 'Status', 'Actions']
                      : ['Member', 'Member No.', 'Contact', 'Referrer', 'Joined', 'Status', 'Actions']
                    ).map((h) => (
                      <th
                        key={h}
                        className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide ${
                          isKiddyView ? 'text-teal-600' : 'text-gray-500'
                        } ${
                          ['Member No.', 'Joined', 'Status', 'Actions', 'Date of Birth'].includes(h)
                            ? 'text-center'
                            : 'text-left'
                        } ${h === 'Actions' ? 'print:hidden' : ''}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-50">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-16 text-center">
                        <div className="flex flex-col items-center gap-2 text-gray-400">
                          {isKiddyView
                            ? <Baby size={32} className="text-teal-200" />
                            : <Users size={32} className="text-gray-200" />
                          }
                          <p className="text-sm">
                            {search || typeFilter !== 'all' || yearFilter !== 'all'
                              ? 'No members match your filters.'
                              : statusTab === 'inactive'
                                ? `No inactive ${isKiddyView ? 'Kiddy & Youth' : ''} members.`
                                : statusTab === 'closed'
                                  ? `No closed account ${isKiddyView ? 'Kiddy & Youth' : ''} members.`
                                  : isKiddyView
                                    ? 'No Kiddy & Youth members yet.'
                                    : 'No members yet.'
                            }
                          </p>
                          {!search && typeFilter === 'all' && yearFilter === 'all' && statusTab === 'active' && (
                            <Button
                              size="sm"
                              onClick={() => setAddMemberOpen(true)}
                              icon={<UserPlus size={13} />}
                              className="print:hidden"
                            >
                              Add {isKiddyView ? 'Kiddy Member' : 'First Member'}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((member, i) => {
                      const isSelected = selectedIds.has(member.id);
                      const colors = isKiddyView ? kiddyAvatarColors : avatarColors;
                      return (
                        <tr
                          key={member.id}
                          className={`transition-colors cursor-pointer group print:hover:bg-transparent ${
                            isSelected
                              ? isKiddyView ? 'bg-teal-50/70 hover:bg-teal-50' : 'bg-emerald-50/60 hover:bg-emerald-50'
                              : isKiddyView ? 'hover:bg-teal-50/40' : 'hover:bg-[#D6FADC]/30'
                          }`}
                          onClick={() => navigate(`/members/${member.id}`)}
                        >
                          {/* Checkbox */}
                          <td
                            className="pl-4 pr-2 py-3 w-10 print:hidden"
                            onClick={e => { e.stopPropagation(); toggleOne(member.id); }}
                          >
                            <button type="button" className="text-gray-400 hover:text-[#07A04E] transition-colors">
                              {isSelected
                                ? <CheckSquare size={16} className="text-[#07A04E]" />
                                : <Square size={16} />}
                            </button>
                          </td>

                          {/* Member name + type */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold ${colors[i % colors.length]}`}>
                                {(member.first_name?.[0] || '') + (member.last_name?.[0] || '')}
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className={`font-semibold text-gray-900 leading-tight transition-colors ${isKiddyView ? 'group-hover:text-teal-700' : 'group-hover:text-[#07A04E]'}`}>
                                    {member.first_name} {member.last_name}
                                  </p>
                                  {member.membership_type && (
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${membershipTypeClass[member.membership_type] || 'bg-gray-100 text-gray-700 border border-gray-200'}`}>
                                      {member.membership_type}
                                    </span>
                                  )}
                                  {member.record_type === 'old_member' && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 border border-amber-200">
                                      Historical
                                    </span>
                                  )}
                                </div>
                                {member.email && (
                                  <p className="text-xs text-gray-400 mt-0.5">{member.email}</p>
                                )}
                                {/* School info for kiddy */}
                                {isKiddyView && member.occupation && (
                                  <p className="text-xs text-sky-600 mt-0.5">{member.occupation}</p>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Member No. */}
                          <td className="px-4 py-3 text-center">
                            <span className={`font-mono text-xs px-2 py-1 rounded-lg ring-1 ${
                              isKiddyView
                                ? 'bg-teal-50 text-teal-700 ring-teal-200'
                                : 'bg-gray-100 text-gray-700 ring-gray-200'
                            }`}>
                              {member.member_no || '—'}
                            </span>
                          </td>

                          {/* Savings Type (kiddy only) */}
                          {isKiddyView && (
                            <td className="px-4 py-3 text-left">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                member.kiddy_savings_type === 'educational_savings'
                                  ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                  : 'bg-teal-100 text-teal-700 border border-teal-200'
                              }`}>
                                {member.kiddy_savings_type === 'educational_savings'
                                  ? 'Educational Savings Account'
                                  : 'Regular Savings Account'}
                              </span>
                            </td>
                          )}

                          {/* Guardian (kiddy) | Contact (regular) */}
                          {isKiddyView ? (
                            <td className="px-4 py-3 text-gray-600 text-sm">
                              {member.guardian_name
                                ? <span>{member.guardian_name} <span className="text-xs text-gray-400">({member.guardian_relationship || 'Guardian'})</span></span>
                                : <span className="text-gray-400">—</span>
                              }
                            </td>
                          ) : (
                            <td className="px-4 py-3 text-gray-600 text-sm">{member.phone || '—'}</td>
                          )}

                          {/* Contact (kiddy) | Referrer (regular) */}
                          {isKiddyView ? (
                            <td className="px-4 py-3 text-gray-600 text-sm">{member.phone || '—'}</td>
                          ) : (
                            <td className="px-4 py-3 text-gray-600 text-sm">{member.recruiter_name || 'Self'}</td>
                          )}

                          {/* DOB (kiddy) | Joined (regular) */}
                          <td className="px-4 py-3 text-gray-500 text-xs text-center">
                            {isKiddyView
                              ? (member.date_of_birth ? formatDate(member.date_of_birth) : '—')
                              : (member.date_joined ? formatDate(member.date_joined) : (member.created_at ? formatDate(member.created_at) : '—'))
                            }
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3 text-center">
                            <Badge variant={statusVariant[member.status] || 'default'} dot>
                              {statusLabel[member.status] || 'Active'}
                            </Badge>
                          </td>

                          {/* Row Actions */}
                          <td className="px-4 py-3 print:hidden" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => navigate(`/members/${member.id}`)}
                                title="View profile"
                                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              >
                                <Eye size={15} />
                              </button>
                              <button
                                onClick={() => navigate(`/members/${member.id}/edit`)}
                                title="Edit member"
                                className={`p-1.5 rounded-lg text-gray-400 transition-colors ${isKiddyView ? 'hover:text-teal-700 hover:bg-teal-50' : 'hover:text-[#07A04E] hover:bg-[#D6FADC]'}`}
                              >
                                <Pencil size={15} />
                              </button>
                              {(member.status === 'inactive' || member.status === 'closed') && (
                                <button
                                  onClick={() => handleReactivate(member)}
                                  disabled={reactivatingId === member.id}
                                  title="Reactivate member"
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {reactivatingId === member.id
                                    ? <span className="inline-block w-[15px] h-[15px] border-2 border-green-400/40 border-t-green-600 rounded-full animate-spin" />
                                    : <RotateCcw size={15} />
                                  }
                                </button>
                              )}
                              <button
                                onClick={() => setConfirmDelete(member)}
                                title={member.status === 'inactive' ? 'Delete permanently' : 'Delete member'}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Table footer */}
            {filtered.length > 0 && (
              <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/50 flex items-center justify-between print:hidden">
                <p className="text-xs text-gray-400">
                  Showing{' '}
                  <span className="font-medium text-gray-600">{filtered.length}</span> of{' '}
                  <span className="font-medium text-gray-600">
                    {members.filter(m => isKiddyView ? m.membership_type === 'kiddy' : m.membership_type !== 'kiddy').length}
                  </span> {isKiddyView ? 'kiddy members' : 'members'}
                  {yearFilter !== 'all' && <span className="ml-2 font-medium text-[#07A04E]">· joined {yearFilter}</span>}
                  {selectedCount > 0 && <span className="ml-2 font-medium text-[#07A04E]">· {selectedCount} selected</span>}
                </p>
                {selectedCount > 0 && (
                  <button onClick={clearSelection} className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
                    Clear selection
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Dialogs ── */}
      <ConfirmDialog
        open={!!confirmDelete}
        title={confirmDelete?.status === 'inactive' ? 'Delete Permanently' : 'Delete Member'}
        message={
          confirmDelete?.status === 'inactive'
            ? `Permanently delete ${confirmDelete?.first_name} ${confirmDelete?.last_name}? This is only for mistakenly added members with no protected records.`
            : `Delete ${confirmDelete?.first_name} ${confirmDelete?.last_name}? Members with existing records will be archived instead of permanently deleted.`
        }
        confirmLabel={confirmDelete?.status === 'inactive' ? 'Delete Permanently' : 'Delete'}
        confirmVariant="danger"
        loading={deleting}
        onConfirm={() => handleDelete(confirmDelete?.id)}
        onCancel={() => { if (!deleting) setConfirmDelete(null); }}
      />

      <ConfirmDialog
        open={confirmBulkDelete}
        title={`Delete ${selectedCount} Member${selectedCount !== 1 ? 's' : ''}`}
        message={`Are you sure you want to delete ${selectedCount} selected member${selectedCount !== 1 ? 's' : ''}? Members with existing records will be archived. This cannot be undone for permanent deletions.`}
        confirmLabel={`Delete ${selectedCount} Member${selectedCount !== 1 ? 's' : ''}`}
        confirmVariant="danger"
        loading={bulkDeleting}
        onConfirm={executeBulkDelete}
        onCancel={() => { if (!bulkDeleting) setConfirmBulkDelete(false); }}
      />

      <ConfirmDialog
        open={!!confirmBulkStatus}
        title={`Set ${selectedCount} Member${selectedCount !== 1 ? 's' : ''} to ${statusLabel[confirmBulkStatus] || confirmBulkStatus}`}
        message={`Change the status of ${selectedCount} selected member${selectedCount !== 1 ? 's' : ''} to "${statusLabel[confirmBulkStatus] || confirmBulkStatus}"?`}
        confirmLabel={`Set ${statusLabel[confirmBulkStatus] || confirmBulkStatus}`}
        confirmVariant={confirmBulkStatus === 'active' ? 'success' : confirmBulkStatus === 'closed' ? 'finance' : 'warning'}
        loading={bulkStatusChanging}
        onConfirm={() => executeBulkStatusChange(confirmBulkStatus)}
        onCancel={() => { if (!bulkStatusChanging) setConfirmBulkStatus(null); }}
      />

      <AddMemberModal
        open={addMemberOpen}
        onClose={() => setAddMemberOpen(false)}
        onCreated={() => { setAddMemberOpen(false); fetchMembers(); }}
      />

      {importOpen && (
        <ImportMembersModal
          onClose={() => setImportOpen(false)}
          onImported={() => { fetchMembers(); }}
        />
      )}

      {importFinancialOpen && (
        <ImportFinancialModal
          onClose={() => setImportFinancialOpen(false)}
          onImported={() => { fetchMembers(); }}
        />
      )}
    </div>
  );
}