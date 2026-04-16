import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye,
  Search,
  UserPlus,
  CreditCard,
  PiggyBank,
  Wallet,
  Pencil,
  Trash2,
  Users,
  Printer,
  Download,
  Filter,
  RotateCcw,
  CheckSquare,
  Square,
  MinusSquare,
  X,
  UserCheck,
  UserX,
  ChevronDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import AddMemberModal from '../../components/members/AddMemberModal';
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

const statusVariant = { active: 'success', inactive: 'warning', suspended: 'danger' };

const membershipTypeClass = {
  regular:   'bg-blue-50 text-blue-700 border border-blue-200',
  associate: 'bg-purple-50 text-purple-700 border border-purple-200',
};

// ─── Bulk Action Toolbar ──────────────────────────────────────────────────────

function BulkToolbar({
  selectedCount,
  totalCount,
  onClearSelection,
  onSelectAll,
  onBulkExport,
  onBulkActivate,
  onBulkDeactivate,
  onBulkDelete,
  statusTab,
}) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  return (
    <div className="flex items-center gap-3 bg-[#07A04E] text-white px-4 py-3 rounded-xl shadow-md animate-in slide-in-from-top-2 duration-200">
      {/* Selection info */}
      <div className="flex items-center gap-2 min-w-0">
        <CheckSquare size={16} className="flex-shrink-0" />
        <span className="text-sm font-semibold whitespace-nowrap">
          {selectedCount} of {totalCount} selected
        </span>
      </div>

      <div className="h-4 w-px bg-white/30 flex-shrink-0" />

      {/* Select all visible */}
      <button
        onClick={onSelectAll}
        className="text-xs font-medium text-white/80 hover:text-white transition-colors whitespace-nowrap"
      >
        Select all {totalCount}
      </button>

      <div className="flex-1" />

      {/* Bulk actions */}
      <div className="flex items-center gap-2 flex-wrap">

        {/* Export selected */}
        <button
          onClick={onBulkExport}
          className="flex items-center gap-1.5 text-xs font-medium bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Download size={13} />
          Export CSV
        </button>

        {/* Status change dropdown */}
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
              </div>
            </>
          )}
        </div>

        {/* Bulk delete */}
        <button
          onClick={onBulkDelete}
          className="flex items-center gap-1.5 text-xs font-medium bg-red-500/80 hover:bg-red-500 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Trash2 size={13} />
          Delete
        </button>
      </div>

      {/* Clear */}
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

// ─── Checkbox Cell ────────────────────────────────────────────────────────────

function CheckboxCell({ checked, indeterminate, onChange, onClick }) {
  return (
    <td
      className="pl-4 pr-2 py-3 w-10"
      onClick={e => { e.stopPropagation(); onClick?.(); }}
    >
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onChange(); }}
        className="text-gray-400 hover:text-[#07A04E] transition-colors"
      >
        {indeterminate
          ? <MinusSquare size={16} className="text-[#07A04E]" />
          : checked
            ? <CheckSquare size={16} className="text-[#07A04E]" />
            : <Square size={16} />}
      </button>
    </td>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MembersPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Data
  const [members, setMembers]           = useState([]);
  const [loading, setLoading]           = useState(true);

  // Filters
  const [search, setSearch]             = useState('');
  const [typeFilter, setTypeFilter]     = useState('all');
  const [statusTab, setStatusTab]       = useState('active');

  // Selection
  const [selectedIds, setSelectedIds]   = useState(new Set());

  // Dialogs
  const [confirmDelete, setConfirmDelete]         = useState(null);   // single member
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [confirmBulkStatus, setConfirmBulkStatus] = useState(null);  // 'active' | 'inactive'
  const [addMemberOpen, setAddMemberOpen]         = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchMembers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getMembers();
      setMembers(data || []);
    } catch {
      toast.error('Failed to load members');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  // Clear selection when tab or filters change
  useEffect(() => { setSelectedIds(new Set()); }, [statusTab, typeFilter, search]);

  // ── Filtered list ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return members.filter(m => {
      const matchesSearch =
        m.first_name?.toLowerCase().includes(q) ||
        m.last_name?.toLowerCase().includes(q) ||
        m.member_no?.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q) ||
        m.phone?.toLowerCase().includes(q) ||
        (m.recruiter_name || '').toLowerCase().includes(q);

      const matchesType =
        typeFilter === 'all' ? true : (m.membership_type || '').toLowerCase() === typeFilter;

      const matchesStatus =
        statusTab === 'active'
          ? (m.status || 'active') === 'active'
          : m.status === 'inactive';

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [members, search, typeFilter, statusTab]);

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
      // Deselect all filtered
      setSelectedIds(prev => {
        const next = new Set(prev);
        filtered.forEach(m => next.delete(m.id));
        return next;
      });
    } else {
      // Select all filtered
      setSelectedIds(prev => {
        const next = new Set(prev);
        filtered.forEach(m => next.add(m.id));
        return next;
      });
    }
  }

  function selectAll() {
    setSelectedIds(new Set(filtered.map(m => m.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  // ── Selected member objects (from filtered) ────────────────────────────────

  const selectedMembers = useMemo(
    () => filtered.filter(m => selectedIds.has(m.id)),
    [filtered, selectedIds]
  );

  // ── Single-row actions ─────────────────────────────────────────────────────

  async function handleDelete(id) {
    try {
      const result = await deleteMember(id);
      toast.success(result?.message || 'Member deleted');
      trackActivity({ userId: user?.id, module: 'member', action: 'delete', description: `Deleted member ID: ${id}` });
      await fetchMembers();
    } catch (err) {
      toast.error(err.message || 'Failed to delete member');
    } finally {
      setConfirmDelete(null);
    }
  }

  async function handleReactivate(member) {
    try {
      await updateMember(member.id, { status: 'active' });
      toast.success('Member reactivated');
      trackActivity({ userId: user?.id, module: 'member', action: 'reactivate', description: `Reactivated member: ${member.first_name} ${member.last_name}` });
      await fetchMembers();
    } catch (err) {
      toast.error(err.message || 'Failed to reactivate member');
    }
  }

  function openMemberTab(memberId, tab) {
    navigate(`/members/${memberId}?tab=${tab}`);
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
        email:           m.email           || '',
        mobile_no:       m.phone           || '',
        recruiter_name:  m.recruiter_name  || 'Self',
        status:          m.status          || '',
        joined:          m.created_at ? formatDate(m.created_at) : '',
      }));
      exportToCSV(`members_export_${new Date().toISOString().slice(0, 10)}.csv`, rows);
      toast.success(`${rows.length} member${rows.length !== 1 ? 's' : ''} exported.`);
    } catch (err) {
      toast.error(err.message || 'Failed to export.');
    }
  }

  async function executeBulkStatusChange(newStatus) {
    const ids = selectedMembers.map(m => m.id);
    let successCount = 0;
    let failCount = 0;

    await Promise.allSettled(
      ids.map(id =>
        updateMember(id, { status: newStatus })
          .then(() => successCount++)
          .catch(() => failCount++)
      )
    );

    if (successCount > 0) {
      toast.success(`${successCount} member${successCount !== 1 ? 's' : ''} set to ${newStatus}.`);
      trackActivity({ userId: user?.id, module: 'member', action: newStatus === 'active' ? 'reactivate' : 'deactivate', description: `Bulk status change: ${successCount} member(s) set to ${newStatus}.` });
    }
    if (failCount > 0) toast.error(`${failCount} update${failCount !== 1 ? 's' : ''} failed.`);

    clearSelection();
    setConfirmBulkStatus(null);
    await fetchMembers();
  }

  async function executeBulkDelete() {
    const ids = selectedMembers.map(m => m.id);
    let successCount = 0;
    let failCount = 0;

    await Promise.allSettled(
      ids.map(id =>
        deleteMember(id)
          .then(() => successCount++)
          .catch(() => failCount++)
      )
    );

    if (successCount > 0) {
      toast.success(`${successCount} member${successCount !== 1 ? 's' : ''} deleted/archived.`);
      trackActivity({ userId: user?.id, module: 'member', action: 'delete', description: `Bulk deleted ${successCount} member(s).` });
    }
    if (failCount > 0) toast.error(`${failCount} deletion${failCount !== 1 ? 's' : ''} failed.`);

    clearSelection();
    setConfirmBulkDelete(false);
    await fetchMembers();
  }

  // ── Single export / print ──────────────────────────────────────────────────

  function handleExportCSV() {
    try {
      const rows = filtered.map(m => ({
        member_no:       m.member_no       || '',
        first_name:      m.first_name      || '',
        last_name:       m.last_name       || '',
        membership_type: m.membership_type || '',
        email:           m.email           || '',
        mobile_no:       m.phone           || '',
        recruiter_name:  m.recruiter_name  || 'Self',
        status:          m.status          || '',
        joined:          m.created_at ? formatDate(m.created_at) : '',
      }));
      exportToCSV(
        statusTab === 'inactive' ? 'inactive_members_report.csv' : 'members_report.csv',
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
          .print-members-area {
            position: absolute; left: 0; top: 0;
            width: 100%; background: white; padding: 24px;
          }
        }
      `}</style>

      {/* ── Header ── */}
      <div className="print:hidden">
        <PageHeader
          title="Members"
          subtitle="Manage cooperative members and their financial accounts"
          action={
            <Button onClick={() => setAddMemberOpen(true)} icon={<UserPlus size={16} />}>
              Add Member
            </Button>
          }
        />
      </div>

      {/* ── Status Tabs ── */}
      <div className="mt-4 flex gap-2 print:hidden">
        {['active', 'inactive'].map(tab => (
          <button
            key={tab}
            onClick={() => setStatusTab(tab)}
            className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition-colors ${
              statusTab === tab
                ? 'bg-[#07A04E] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab === 'active' ? 'Active Members' : 'Inactive Members'}
          </button>
        ))}
      </div>

      {/* ── Filters & Toolbar ── */}
      <div className="mt-6 mb-4 flex flex-col gap-3 print:hidden">

        {/* Filter row */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">

            {/* Search */}
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, ID, email, recruiter…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl
                  focus:outline-none focus:ring-2 focus:ring-[#07A04E] focus:border-transparent
                  w-72 bg-white shadow-sm"
              />
            </div>

            {/* Type filter */}
            <div className="relative">
              <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-xl bg-white shadow-sm
                  focus:outline-none focus:ring-2 focus:ring-[#07A04E]"
              >
                <option value="all">All Members</option>
                <option value="associate">Associate</option>
                <option value="regular">Regular</option>
              </select>
            </div>

            <Button variant="outline" icon={<Printer size={15} />} onClick={handlePrint}>Print</Button>
            <Button variant="outline" icon={<Download size={15} />} onClick={handleExportCSV}>Export All</Button>
          </div>

          {!loading && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Users size={14} />
              <span>{filtered.length} of {members.length} members</span>
            </div>
          )}
        </div>

        {/* Bulk toolbar — shown only when something is selected */}
        {selectedCount > 0 && (
          <BulkToolbar
            selectedCount={selectedCount}
            totalCount={filtered.length}
            onClearSelection={clearSelection}
            onSelectAll={selectAll}
            onBulkExport={handleBulkExport}
            onBulkActivate={() => setConfirmBulkStatus('active')}
            onBulkDeactivate={() => setConfirmBulkStatus('inactive')}
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
            <p className="text-sm font-semibold text-gray-800">Members Report</p>
            <p className="text-xs text-gray-500">Status: {statusTab === 'active' ? 'Active' : 'Inactive'}</p>
            <p className="text-xs text-gray-500">Type: {typeFilter === 'all' ? 'All' : typeFilter}</p>
            <p className="text-xs text-gray-500">Generated: {new Date().toLocaleString()}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm print:shadow-none print:rounded-none">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-100">

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

                    {[
                      'Member',
                      'Member No.',
                      'Contact',
                      'Inviter / Recruiter',
                      'Joined',
                      'Status',
                      'Quick Access',
                      'Actions',
                    ].map((h, i) => (
                      <th
                        key={h}
                        className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide ${
                          i === 7 ? 'text-right print:hidden' : 'text-left'
                        } ${h === 'Quick Access' ? 'print:hidden' : ''}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-50">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-16 text-center">
                        <div className="flex flex-col items-center gap-2 text-gray-400">
                          <Users size={32} className="text-gray-200" />
                          <p className="text-sm">
                            {search || typeFilter !== 'all'
                              ? 'No members match your filter.'
                              : statusTab === 'inactive'
                                ? 'No inactive members.'
                                : 'No members yet.'}
                          </p>
                          {!search && typeFilter === 'all' && statusTab === 'active' && (
                            <Button
                              size="sm"
                              onClick={() => setAddMemberOpen(true)}
                              icon={<UserPlus size={13} />}
                              className="print:hidden"
                            >
                              Add First Member
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((member, i) => {
                      const isSelected = selectedIds.has(member.id);
                      return (
                        <tr
                          key={member.id}
                          className={`transition-colors cursor-pointer group print:hover:bg-transparent ${
                            isSelected
                              ? 'bg-emerald-50/60 hover:bg-emerald-50'
                              : 'hover:bg-[#D6FADC]/30'
                          }`}
                          onClick={() => navigate(`/members/${member.id}`)}
                        >
                          {/* Row checkbox */}
                          <td
                            className="pl-4 pr-2 py-3 w-10 print:hidden"
                            onClick={e => { e.stopPropagation(); toggleOne(member.id); }}
                          >
                            <button
                              type="button"
                              className="text-gray-400 hover:text-[#07A04E] transition-colors"
                            >
                              {isSelected
                                ? <CheckSquare size={16} className="text-[#07A04E]" />
                                : <Square size={16} />}
                            </button>
                          </td>

                          {/* Member name + type */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                                  avatarColors[i % avatarColors.length]
                                }`}
                              >
                                {(member.first_name?.[0] || '') + (member.last_name?.[0] || '')}
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-semibold text-gray-900 leading-tight group-hover:text-[#07A04E] transition-colors">
                                    {member.first_name} {member.last_name}
                                  </p>
                                  {member.membership_type && (
                                    <span
                                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                        membershipTypeClass[member.membership_type] ||
                                        'bg-gray-100 text-gray-700 border border-gray-200'
                                      }`}
                                    >
                                      {member.membership_type}
                                    </span>
                                  )}
                                </div>
                                {member.email && (
                                  <p className="text-xs text-gray-400 mt-0.5">{member.email}</p>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Member No. */}
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded-lg text-gray-700 ring-1 ring-gray-200">
                              {member.member_no || '—'}
                            </span>
                          </td>

                          {/* Contact */}
                          <td className="px-4 py-3 text-gray-600 text-sm">{member.phone || '—'}</td>

                          {/* Recruiter */}
                          <td className="px-4 py-3 text-gray-600 text-sm">{member.recruiter_name || 'Self'}</td>

                          {/* Joined */}
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {member.created_at ? formatDate(member.created_at) : '—'}
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3">
                            <Badge variant={statusVariant[member.status] || 'default'} dot>
                              {member.status || 'active'}
                            </Badge>
                          </td>

                          {/* Quick Access */}
                          <td className="px-4 py-3 print:hidden" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => openMemberTab(member.id, 'loan')}
                                className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg
                                  bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 transition-colors"
                              >
                                <CreditCard size={11} /> Loan
                              </button>
                              <button
                                onClick={() => openMemberTab(member.id, 'cbu')}
                                className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg
                                  bg-[#D6FADC] text-[#07A04E] hover:bg-[#c0f5c8] border border-[#07A04E]/20 transition-colors"
                              >
                                <PiggyBank size={11} /> CBU
                              </button>
                              <button
                                onClick={() => openMemberTab(member.id, 'savings')}
                                className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg
                                  bg-[#AEECEF]/30 text-[#000066] hover:bg-[#AEECEF]/50 border border-[#000066]/15 transition-colors"
                              >
                                <Wallet size={11} /> Savings
                              </button>
                            </div>
                          </td>

                          {/* Row Actions */}
                          <td className="px-4 py-3 print:hidden" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
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
                                className="p-1.5 rounded-lg text-gray-400 hover:text-[#07A04E] hover:bg-[#D6FADC] transition-colors"
                              >
                                <Pencil size={15} />
                              </button>
                              {member.status === 'inactive' && (
                                <button
                                  onClick={() => handleReactivate(member)}
                                  title="Reactivate member"
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                                >
                                  <RotateCcw size={15} />
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
                  <span className="font-medium text-gray-600">{members.length}</span> members
                  {selectedCount > 0 && (
                    <span className="ml-2 font-medium text-[#07A04E]">
                      · {selectedCount} selected
                    </span>
                  )}
                </p>
                {selectedCount > 0 && (
                  <button
                    onClick={clearSelection}
                    className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                  >
                    Clear selection
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Single delete confirm ── */}
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
        onConfirm={() => handleDelete(confirmDelete?.id)}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* ── Bulk delete confirm ── */}
      <ConfirmDialog
        open={confirmBulkDelete}
        title={`Delete ${selectedCount} Member${selectedCount !== 1 ? 's' : ''}`}
        message={`Are you sure you want to delete ${selectedCount} selected member${selectedCount !== 1 ? 's' : ''}? Members with existing records will be archived. This cannot be undone for permanent deletions.`}
        confirmLabel={`Delete ${selectedCount} Member${selectedCount !== 1 ? 's' : ''}`}
        confirmVariant="danger"
        onConfirm={executeBulkDelete}
        onCancel={() => setConfirmBulkDelete(false)}
      />

      {/* ── Bulk status change confirm ── */}
      <ConfirmDialog
        open={!!confirmBulkStatus}
        title={`Set ${selectedCount} Member${selectedCount !== 1 ? 's' : ''} to ${confirmBulkStatus === 'active' ? 'Active' : 'Inactive'}`}
        message={`Change the status of ${selectedCount} selected member${selectedCount !== 1 ? 's' : ''} to "${confirmBulkStatus}"?`}
        confirmLabel={`Set ${confirmBulkStatus === 'active' ? 'Active' : 'Inactive'}`}
        confirmVariant={confirmBulkStatus === 'active' ? 'success' : 'warning'}
        onConfirm={() => executeBulkStatusChange(confirmBulkStatus)}
        onCancel={() => setConfirmBulkStatus(null)}
      />

      {/* ── Add Member Modal ── */}
      <AddMemberModal
        open={addMemberOpen}
        onClose={() => setAddMemberOpen(false)}
        onCreated={() => { setAddMemberOpen(false); fetchMembers(); }}
      />
    </div>
  );
}