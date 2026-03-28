import { useState, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import AddMemberModal from '../../components/members/AddMemberModal';
import { getMembers, deleteMember } from '../../services/memberService';
import { formatDate } from '../../utils/formatters';
import { exportToCSV } from '../../utils/csvExport';

export default function MembersPage() {
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [addMemberOpen, setAddMemberOpen] = useState(false);

  useEffect(() => {
    fetchMembers();
  }, []);

  async function fetchMembers() {
    try {
      setLoading(true);
      const data = await getMembers();
      setMembers(data || []);
    } catch {
      toast.error('Failed to load members');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    try {
      await deleteMember(id);
      setMembers(prev => prev.filter(m => m.id !== id));
      toast.success('Member deleted');
    } catch {
      toast.error('Failed to delete member');
    } finally {
      setConfirmDelete(null);
    }
  }

  function openMemberTab(memberId, tab) {
    navigate(`/members/${memberId}?tab=${tab}`);
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();

    return members.filter(m => {
      const matchesSearch =
        m.first_name?.toLowerCase().includes(q) ||
        m.last_name?.toLowerCase().includes(q) ||
        m.member_no?.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q);

      const memberType = (m.membership_type || '').toLowerCase();
      const matchesType = typeFilter === 'all' ? true : memberType === typeFilter;

      return matchesSearch && matchesType;
    });
  }, [members, search, typeFilter]);

  function handleExportCSV() {
    try {
      const rows = filtered.map(member => ({
        member_no: member.member_no || '',
        first_name: member.first_name || '',
        last_name: member.last_name || '',
        membership_type: member.membership_type || '',
        email: member.email || '',
        mobile_no: member.phone || '',
        status: member.status || '',
        joined: member.created_at ? formatDate(member.created_at) : '',
      }));

      exportToCSV('members_report.csv', rows);
      toast.success('CSV exported successfully');
    } catch (err) {
      toast.error(err.message || 'Failed to export CSV');
    }
  }

  function handlePrint() {
    window.print();
  }

  const statusVariant = {
    active: 'success',
    inactive: 'warning',
    suspended: 'danger',
  };

  const membershipTypeClass = {
    regular: 'bg-blue-50 text-blue-700 border border-blue-200',
    associate: 'bg-purple-50 text-purple-700 border border-purple-200',
  };

  const avatarColors = [
    'bg-[#D6FADC] text-[#07A04E]',
    'bg-[#AEECEF]/40 text-[#000066]',
    'bg-[#D6FADC] text-[#273C2C]',
    'bg-amber-100 text-amber-700',
    'bg-[#D6FADC] text-[#7EB751]',
  ];

  return (
    <div className="p-6 print:p-0">
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-members-area, .print-members-area * {
            visibility: visible;
          }
          .print-members-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white;
            padding: 24px;
          }
        }
      `}</style>

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

      <div className="mt-6 mb-4 flex items-center justify-between gap-4 flex-wrap print:hidden">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder="Search by name, ID, email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl
                focus:outline-none focus:ring-2 focus:ring-[#07A04E] focus:border-transparent
                w-72 bg-white shadow-sm"
            />
          </div>

          <div className="relative">
            <Filter
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-xl bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#07A04E]"
            >
              <option value="all">All Members</option>
              <option value="associate">Associate</option>
              <option value="regular">Regular</option>
            </select>
          </div>

          <Button variant="outline" icon={<Printer size={15} />} onClick={handlePrint}>
            Print
          </Button>

          <Button variant="outline" icon={<Download size={15} />} onClick={handleExportCSV}>
            Export CSV
          </Button>
        </div>

        {!loading && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Users size={14} />
            <span>
              {filtered.length} of {members.length} members
            </span>
          </div>
        )}
      </div>

      <div className="print-members-area">
        <div className="hidden print:flex items-center justify-between mb-6 border-b border-gray-200 pb-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-green-700 text-white flex items-center justify-center font-bold text-xl border-4 border-green-100">
              W
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-wide text-gray-900">WELLSERVE</h1>
              <p className="text-xs tracking-[0.25em] text-green-700 font-semibold">
                CREDIT COOPERATIVE
              </p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-sm font-semibold text-gray-800">Members Report</p>
            <p className="text-xs text-gray-500">
              Type Filter: {typeFilter === 'all' ? 'All Members' : typeFilter}
            </p>
            <p className="text-xs text-gray-500">
              Generated: {new Date().toLocaleString()}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm print:shadow-none print:rounded-none">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-100">
                    {['Member', 'Member No.', 'Contact', 'Joined', 'Status', 'Quick Access', 'Actions'].map((h, i) => (
                      <th
                        key={h}
                        className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide ${
                          i === 6 ? 'text-right print:hidden' : 'text-left'
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
                      <td colSpan={7} className="py-16 text-center">
                        <div className="flex flex-col items-center gap-2 text-gray-400">
                          <Users size={32} className="text-gray-200" />
                          <p className="text-sm">
                            {search || typeFilter !== 'all'
                              ? 'No members match your filter.'
                              : 'No members yet.'}
                          </p>
                          {!search && typeFilter === 'all' && (
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
                    filtered.map((member, i) => (
                      <tr
                        key={member.id}
                        className="hover:bg-[#D6FADC]/30 transition-colors cursor-pointer group print:hover:bg-transparent"
                        onClick={() => navigate(`/members/${member.id}`)}
                      >
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

                        <td className="px-4 py-3">
                          <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded-lg text-gray-700 ring-1 ring-gray-200">
                            {member.member_no || '—'}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-gray-600 text-sm">
                          {member.phone || '—'}
                        </td>

                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {member.created_at ? formatDate(member.created_at) : '—'}
                        </td>

                        <td className="px-4 py-3">
                          <Badge variant={statusVariant[member.status] || 'default'} dot>
                            {member.status || 'active'}
                          </Badge>
                        </td>

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
                            <button
                              onClick={() => setConfirmDelete(member)}
                              title="Delete member"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {filtered.length > 0 && (
              <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/50 flex items-center justify-between print:hidden">
                <p className="text-xs text-gray-400">
                  Showing <span className="font-medium text-gray-600">{filtered.length}</span> of{' '}
                  <span className="font-medium text-gray-600">{members.length}</span> members
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Member"
        message={`Are you sure you want to delete ${confirmDelete?.first_name} ${confirmDelete?.last_name}? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => handleDelete(confirmDelete?.id)}
        onCancel={() => setConfirmDelete(null)}
      />

      <AddMemberModal
        open={addMemberOpen}
        onClose={() => setAddMemberOpen(false)}
        onCreated={() => {
          setAddMemberOpen(false);
          fetchMembers();
        }}
      />
    </div>
  );
} 