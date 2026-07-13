import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen,
  Printer,
  Download,
  Search,
  User,
  PiggyBank,
  Wallet,
  CheckCircle2,
  ChevronDown,
  Truck,
} from 'lucide-react';
import { exportToCSV } from '../../utils/csvExport';
import toast from 'react-hot-toast';

import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import {
  getPassbookData,
  buildPassbookLedger,
  computeAccountMap,
  updatePassbookStatus,
} from '../../services/passbookService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { printHtmlDocument, wrapWithLetterhead } from '../../utils/print';

const REGISTRY_STATUS_OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 'claimed', label: 'Claimed' },
  { value: 'unclaimed', label: 'Unclaimed' },
  { value: 'delivered', label: 'Delivered' },
];

const PASSBOOK_STATUS_CYCLE = ['unclaimed', 'claimed', 'delivered'];

const STATUS_META = {
  unclaimed: { label: 'Unclaimed', color: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-400' },
  claimed:   { label: 'Claimed',   color: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-400' },
  delivered: { label: 'Delivered', color: 'bg-blue-100 text-blue-700 border-blue-200', dot: 'bg-blue-400' },
};

const PRINT_STATUS_OPTIONS = [
  { value: '', label: 'All Print Status' },
  { value: 'done', label: 'Done' },
  { value: 'not_yet', label: 'Not Yet' },
];

const PASSBOOK_VARIANTS = {
  savings: 'Regular Savings Passbook',
  cbu: 'Share Capital Passbook',
};

function fullName(member) {
  return [member?.last_name, member?.first_name, member?.middle_initial]
    .filter(Boolean)
    .join(', ');
}

function plainFullName(member) {
  const mi = member?.middle_initial ? `${member.middle_initial}.` : '';
  return [member?.first_name, mi, member?.last_name].filter(Boolean).join(' ');
}

function getBadgeVariant(status) {
  if (status === 'claimed') return 'success';
  if (status === 'unclaimed') return 'warning';
  if (status === 'delivered') return 'info';
  return 'default';
}

function getPrintBadgeVariant(status) {
  if (status === 'done') return 'success';
  if (status === 'not_yet') return 'warning';
  return 'default';
}

export default function PassbookPage() {
  const [activeTab, setActiveTab] = useState('registry');
  const [loading, setLoading] = useState(true);

  const [members, setMembers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);

  const [registrySearch, setRegistrySearch] = useState('');
  const [registryStatusFilter, setRegistryStatusFilter] = useState('');
  const [printStatusFilter, setPrintStatusFilter] = useState('');

  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [statusUpdating, setStatusUpdating] = useState(null);
  const [openStatusMenu, setOpenStatusMenu] = useState(null);
  const [dropdownAnchor, setDropdownAnchor] = useState({ top: 0, right: 0 });
  const [selectedPassbookType, setSelectedPassbookType] = useState('savings');
  const [passbookSearch, setPassbookSearch] = useState('');

  useEffect(() => {
    fetchPassbookData();
  }, []);

  async function fetchPassbookData() {
    try {
      setLoading(true);

      // getPassbookData() transparently pages through members, accounts, and
      // transactions in chunks of 1000 rows so that no member or transaction
      // silently drops off the passbook once the coop grows past Supabase's
      // default 1000-row query cap.
      const { members: memberRows, accounts: accountRows, transactions: transactionRows } =
        await getPassbookData();

      const normalizedMembers = memberRows.map((member, index) => ({
        ...member,
        registry_no: index + 1,
        recruiter_name: member.recruiter_name?.trim() || 'Self',
        passbook_status: member.passbook_status || 'unclaimed',
        passbook_print_status: member.passbook_print_status || 'not_yet',
      }));

      setMembers(normalizedMembers);
      setAccounts(accountRows);
      setTransactions(transactionRows);

      if (normalizedMembers.length > 0) {
        setSelectedMemberId(normalizedMembers[0].id);
      }
    } catch (error) {
      toast.error(
        (t) => (
          <span className="flex items-center gap-3 text-sm">
            {error.message || 'Failed to load passbook data.'}
            <button
              className="flex-shrink-0 text-xs font-bold underline"
              onClick={() => { toast.dismiss(t.id); fetchPassbookData(); }}
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
  }

  const accountMap = useMemo(() => computeAccountMap(accounts), [accounts]);

  const registryRows = useMemo(() => {
    return members
      .map(member => {
        const linked = accountMap.get(member.id) || {};
        return {
          ...member,
          cbu_account_no: linked.cbu?.account_no || '—',
          savings_account_no: linked.savings?.account_no || '—',
        };
      })
      .filter(row => {
        const q = registrySearch.trim().toLowerCase();
        const matchesSearch =
          !q ||
          fullName(row).toLowerCase().includes(q) ||
          plainFullName(row).toLowerCase().includes(q) ||
          (row.member_no || '').toLowerCase().includes(q) ||
          (row.cbu_account_no || '').toLowerCase().includes(q) ||
          (row.savings_account_no || '').toLowerCase().includes(q) ||
          (row.recruiter_name || 'self').toLowerCase().includes(q);

        const matchesStatus =
          !registryStatusFilter || row.passbook_status === registryStatusFilter;

        const matchesPrint =
          !printStatusFilter || row.passbook_print_status === printStatusFilter;

        return matchesSearch && matchesStatus && matchesPrint;
      });
  }, [members, accountMap, registrySearch, registryStatusFilter, printStatusFilter]);

  const filteredPassbookMembers = useMemo(() => {
    const q = passbookSearch.trim().toLowerCase();

    return members.filter(member => {
      const linked = accountMap.get(member.id) || {};
      return (
        !q ||
        fullName(member).toLowerCase().includes(q) ||
        plainFullName(member).toLowerCase().includes(q) ||
        (member.member_no || '').toLowerCase().includes(q) ||
        (member.recruiter_name || 'self').toLowerCase().includes(q) ||
        (linked.cbu?.account_no || '').toLowerCase().includes(q) ||
        (linked.savings?.account_no || '').toLowerCase().includes(q)
      );
    });
  }, [members, accountMap, passbookSearch]);

  const selectedMember = useMemo(
    () => members.find(m => m.id === selectedMemberId) || null,
    [members, selectedMemberId]
  );

  const selectedAccounts = useMemo(
    () => accountMap.get(selectedMemberId) || {},
    [accountMap, selectedMemberId]
  );

  const passbookTransactions = useMemo(() => {
    if (!selectedMemberId) return [];

    const linked = accountMap.get(selectedMemberId) || {};
    const targetAccount = linked[selectedPassbookType];

    const matched = buildPassbookLedger({
      transactions,
      memberId: selectedMemberId,
      accountType: selectedPassbookType,
      accountId: targetAccount?.id || null,
    });

    // Most recent entry first for on-screen review; print view re-numbers
    // chronologically (oldest first) to read like a physical passbook.
    return [...matched].sort((a, b) => {
      const dateA = new Date(a.transaction_date || a.created_at).getTime();
      const dateB = new Date(b.transaction_date || b.created_at).getTime();
      return dateB - dateA;
    });
  }, [transactions, accountMap, selectedMemberId, selectedPassbookType]);

  async function handleUpdatePassbookStatus(memberId, newStatus) {
    setStatusUpdating(memberId);
    setOpenStatusMenu(null);
    try {
      await updatePassbookStatus(memberId, newStatus);

      setMembers(prev =>
        prev.map(m => m.id === memberId ? { ...m, passbook_status: newStatus } : m)
      );
      toast.success(`Status updated to ${STATUS_META[newStatus]?.label || newStatus}`);
    } catch (err) {
      toast.error(err.message || 'Failed to update status');
    } finally {
      setStatusUpdating(null);
    }
  }

  function handleExportRegistryCSV() {
    try {
      if (registryRows.length === 0) { toast.error('No data to export.'); return; }
      const rows = registryRows.map(r => ({
        no: r.registry_no,
        surname: r.last_name || '',
        first_name: r.first_name || '',
        middle_initial: r.middle_initial || '',
        cbu_account_no: r.cbu_account_no || '—',
        savings_account_no: r.savings_account_no || '—',
        passbook_status: r.passbook_status || '',
        print_status: r.passbook_print_status || '',
        recruiter: r.recruiter_name || 'Self',
      }));
      exportToCSV('passbook_registry.csv', rows);
      toast.success('CSV exported successfully');
    } catch (err) {
      toast.error(err.message || 'Failed to export CSV');
    }
  }

  function handlePrintRegistry() {
    const rows = registryRows.map(row => `
      <tr>
        <td>${row.recruiter_name || 'Self'}</td>
        <td>${STATUS_META[row.passbook_status]?.label || row.passbook_status || '—'}</td>
        <td>${row.passbook_print_status === 'done' ? 'Done' : 'Not Yet'}</td>
        <td>${row.cbu_account_no || '—'}</td>
        <td>${row.savings_account_no || '—'}</td>
        <td style="text-align:center;">${row.registry_no || '—'}</td>
        <td>${row.last_name || '—'}</td>
        <td>${row.first_name || '—'}</td>
        <td>${row.middle_initial || '—'}</td>
      </tr>
    `).join('');

    const html = `
      <h1 class="report-title">Passbook Registry</h1>
      <div class="report-meta">Generated: ${new Date().toLocaleString()} &nbsp;|&nbsp; ${registryRows.length} record${registryRows.length === 1 ? '' : 's'}</div>
      <table>
        <thead>
          <tr>
            <th>Referred By</th>
            <th>Status</th>
            <th>Print Passbook</th>
            <th>CBU Account</th>
            <th>Savings Account</th>
            <th style="text-align:center;">No.</th>
            <th>Surname</th>
            <th>First Name</th>
            <th>Middle Name</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="9" style="text-align:center; padding:16px;">No passbook registry rows found.</td></tr>'}
        </tbody>
      </table>
      <div class="confidential">WELLSERVE Cooperative Monitoring System — Authorized personnel only.</div>
    `;

    printHtmlDocument(wrapWithLetterhead(html, { title: 'Passbook Registry' }), {
      width: 1200,
      height: 900,
      onBlocked: () => toast.error('Unable to open print preview.'),
    });
  }

  function handlePrintPassbook(type) {
    if (!selectedMember) {
      toast.error('Please select a member first.');
      return;
    }

    const title = PASSBOOK_VARIANTS[type];
    const accountNo =
      type === 'savings'
        ? selectedAccounts.savings?.account_no || '—'
        : selectedAccounts.cbu?.account_no || '—';

    const chronological = [...passbookTransactions].sort((a, b) => {
      const dateA = new Date(a.transaction_date || a.created_at).getTime();
      const dateB = new Date(b.transaction_date || b.created_at).getTime();
      return dateA - dateB;
    });

    const rows = chronological.map((tx, index) => {
      const date = formatDate(tx.transaction_date || tx.created_at);
      const particulars =
        tx.category === 'loan'
          ? 'Loan Deduction / Payment'
          : tx.type === 'deposit'
            ? 'Deposit'
            : tx.type === 'withdrawal'
              ? 'Withdrawal'
              : tx.type || 'Transaction';

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${date}</td>
          <td>${particulars}</td>
          <td style="text-align:right;">${formatCurrency(tx.amount)}</td>
          <td>${tx.reference || '—'}</td>
        </tr>
      `;
    }).join('');

    const html = `
      <h1 class="report-title">${title}</h1>
      <div class="report-meta">Printed: ${new Date().toLocaleString()}</div>
      <div class="section-heading">Member Information</div>
      <div class="stats-grid" style="grid-template-columns:repeat(2,1fr)">
        <div class="stat-box"><div class="stat-label">Name</div><div class="stat-value" style="font-size:12pt">${plainFullName(selectedMember)}</div></div>
        <div class="stat-box"><div class="stat-label">Member No.</div><div class="stat-value" style="font-size:12pt">${selectedMember.member_no || '—'}</div></div>
        <div class="stat-box"><div class="stat-label">Referred By</div><div class="stat-value" style="font-size:11pt">${selectedMember.recruiter_name || 'Self'}</div></div>
        <div class="stat-box"><div class="stat-label">Account No.</div><div class="stat-value" style="font-size:11pt">${accountNo}</div></div>
        <div class="stat-box"><div class="stat-label">Date Joined</div><div class="stat-value" style="font-size:11pt">${formatDate(selectedMember.date_joined || selectedMember.created_at)}</div></div>
      </div>
      <div class="section-heading">Passbook Transactions</div>
      <table>
        <thead>
          <tr>
            <th>No.</th>
            <th>Date</th>
            <th>Particulars</th>
            <th>Amount</th>
            <th>Reference</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="5">No transactions found.</td></tr>'}
        </tbody>
      </table>
      <div class="confidential">WELLSERVE Cooperative Monitoring System — Authorized personnel only.</div>
    `;

    printHtmlDocument(wrapWithLetterhead(html, { title }), {
      width: 900,
      height: 1000,
      onBlocked: () => toast.error('Unable to open print preview.'),
    });
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Passbook"
        subtitle="Manage passbook registry and member passbook records"
      />

      <div className="mt-6 bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setActiveTab('registry')}
            className={`px-5 py-3 text-sm font-semibold transition-colors ${
              activeTab === 'registry'
                ? 'text-emerald-700 border-b-2 border-emerald-600 bg-emerald-50/50'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Passbook Registry
          </button>

          <button
            onClick={() => setActiveTab('member')}
            className={`px-5 py-3 text-sm font-semibold transition-colors ${
              activeTab === 'member'
                ? 'text-emerald-700 border-b-2 border-emerald-600 bg-emerald-50/50'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Member Passbook
          </button>
        </div>

        {activeTab === 'registry' && (
          <div className="p-5">
            <div className="flex flex-col lg:flex-row gap-3 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search member, account no., recruiter..."
                  value={registrySearch}
                  onChange={e => setRegistrySearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <select
                value={registryStatusFilter}
                onChange={e => setRegistryStatusFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                {REGISTRY_STATUS_OPTIONS.map(opt => (
                  <option key={opt.value || 'all'} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <select
                value={printStatusFilter}
                onChange={e => setPrintStatusFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                {PRINT_STATUS_OPTIONS.map(opt => (
                  <option key={opt.value || 'all'} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <div className="flex gap-2 ml-auto">
                <button
                  onClick={handlePrintRegistry}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  <Printer size={14} />
                  Print
                </button>
                <button
                  onClick={handleExportRegistryCSV}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  <Download size={14} />
                  Export CSV
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-gray-100 rounded-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {[
                      'Referred By',
                      'Status',
                      'Print Passbook',
                      'CBU Account',
                      'Savings Account',
                      'No.',
                      'Surname',
                      'First Name',
                      'Middle Name',
                      'Action',
                    ].map(h => (
                      <th
                        key={h}
                        className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap ${
                          ['Status', 'Print Passbook', 'CBU Account', 'Savings Account', 'No.', 'Action'].includes(h)
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
                  {registryRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-center py-16 text-gray-400">
                        No passbook registry rows found.
                      </td>
                    </tr>
                  ) : (
                    registryRows.map(row => {
                      const meta = STATUS_META[row.passbook_status] || STATUS_META.unclaimed;
                      const isUpdating = statusUpdating === row.id;
                      const isOpen = openStatusMenu === row.id;
                      return (
                      <tr key={row.id} className="hover:bg-emerald-50/30">
                        <td className="px-4 py-3">{row.recruiter_name || 'Self'}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={getBadgeVariant(row.passbook_status)}>
                            {row.passbook_status === 'claimed' ? 'Claimed' : row.passbook_status === 'delivered' ? 'Delivered' : 'Unclaimed'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={getPrintBadgeVariant(row.passbook_print_status)}>
                            {row.passbook_print_status === 'done' ? 'Done' : 'Not Yet'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-center">{row.cbu_account_no}</td>
                        <td className="px-4 py-3 font-mono text-xs text-center">{row.savings_account_no}</td>
                        <td className="px-4 py-3 text-center">{row.registry_no}</td>
                        <td className="px-4 py-3">{row.last_name || '—'}</td>
                        <td className="px-4 py-3">{row.first_name || '—'}</td>
                        <td className="px-4 py-3">{row.middle_initial || '—'}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            disabled={isUpdating}
                            onClick={(e) => {
                              if (isOpen) { setOpenStatusMenu(null); return; }
                              const rect = e.currentTarget.getBoundingClientRect();
                              setDropdownAnchor({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                              setOpenStatusMenu(row.id);
                            }}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${meta.color} ${isUpdating ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80 cursor-pointer'}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot} shrink-0`} />
                            {isUpdating ? 'Saving…' : meta.label}
                            {!isUpdating && <ChevronDown size={11} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
                          </button>

                          {isOpen && createPortal(
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setOpenStatusMenu(null)} />
                              <div
                                style={{ position: 'fixed', top: dropdownAnchor.top, right: dropdownAnchor.right, zIndex: 50 }}
                                className="bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 min-w-[140px]"
                              >
                                <p className="px-3 pb-1 pt-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Set Status</p>
                                {PASSBOOK_STATUS_CYCLE.map(s => {
                                  const sm = STATUS_META[s];
                                  const isCurrent = row.passbook_status === s;
                                  return (
                                    <button
                                      key={s}
                                      disabled={isCurrent}
                                      onClick={() => handleUpdatePassbookStatus(row.id, s)}
                                      className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors ${
                                        isCurrent
                                          ? 'text-gray-300 cursor-default'
                                          : 'text-gray-700 hover:bg-gray-50 cursor-pointer'
                                      }`}
                                    >
                                      <span className={`w-2 h-2 rounded-full ${sm.dot}`} />
                                      {sm.label}
                                      {isCurrent && <span className="ml-auto text-[10px] text-gray-300">current</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            </>,
                            document.body
                          )}
                        </td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'member' && (
          <div className="p-5">
            <div className="grid grid-cols-1 xl:grid-cols-[320px,1fr] gap-5">
              <div className="border border-gray-100 rounded-2xl p-4 bg-gray-50/40">
                <div className="relative mb-3">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={passbookSearch}
                    onChange={e => setPassbookSearch(e.target.value)}
                    placeholder="Search member..."
                    className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  />
                </div>

                <div className="space-y-2 max-h-[520px] overflow-y-auto">
                  {filteredPassbookMembers.map(member => {
                    const linked = accountMap.get(member.id) || {};
                    return (
                      <button
                        key={member.id}
                        onClick={() => setSelectedMemberId(member.id)}
                        className={`w-full text-left rounded-xl border px-3 py-3 transition ${
                          selectedMemberId === member.id
                            ? 'border-emerald-300 bg-emerald-50'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <p className="font-semibold text-sm text-gray-900">
                          {plainFullName(member)}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {member.member_no || 'No Member No.'}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-1">
                          Recruiter: <span className="font-medium">{member.recruiter_name || 'Self'}</span>
                        </p>
                        <div className="mt-2 space-y-1">
                          <p className="text-[11px] text-gray-500">
                            CBU: <span className="font-mono">{linked.cbu?.account_no || '—'}</span>
                          </p>
                          <p className="text-[11px] text-gray-500">
                            Savings: <span className="font-mono">{linked.savings?.account_no || '—'}</span>
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-5">
                {!selectedMember ? (
                  <div className="border border-dashed border-gray-300 rounded-2xl py-20 text-center text-gray-400">
                    Select a member to view passbook.
                  </div>
                ) : (
                  <>
                    <div className="bg-white border border-gray-200 rounded-2xl p-5">
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <User size={18} />
                            {plainFullName(selectedMember)}
                          </h3>
                          <div className="mt-2 space-y-1 text-sm text-gray-500">
                            <p>Member No.: <span className="font-medium text-gray-800">{selectedMember.member_no || '—'}</span></p>
                            <p>Referred By: <span className="font-medium text-gray-800">{selectedMember.recruiter_name || 'Self'}</span></p>
                            <p>Date Joined: <span className="font-medium text-gray-800">{formatDate(selectedMember.date_joined || selectedMember.created_at)}</span></p>
                            <p>CBU Account No.: <span className="font-mono text-gray-800">{selectedAccounts.cbu?.account_no || '—'}</span></p>
                            <p>Savings Account No.: <span className="font-mono text-gray-800">{selectedAccounts.savings?.account_no || '—'}</span></p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant={selectedPassbookType === 'savings' ? 'primary' : 'outline'}
                            icon={<Wallet size={14} />}
                            onClick={() => setSelectedPassbookType('savings')}
                          >
                            Savings Passbook
                          </Button>

                          <Button
                            variant={selectedPassbookType === 'cbu' ? 'primary' : 'outline'}
                            icon={<PiggyBank size={14} />}
                            onClick={() => setSelectedPassbookType('cbu')}
                          >
                            Share Capital Passbook
                          </Button>

                          <Button
                            variant="outline"
                            icon={<Printer size={14} />}
                            onClick={() => handlePrintPassbook(selectedPassbookType)}
                          >
                            Print
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                        {selectedPassbookType === 'savings' ? (
                          <Wallet size={16} className="text-blue-600" />
                        ) : (
                          <PiggyBank size={16} className="text-emerald-600" />
                        )}
                        <h4 className="text-sm font-semibold text-gray-700">
                          {PASSBOOK_VARIANTS[selectedPassbookType]}
                        </h4>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                              {['No.', 'Date', 'Particulars', 'Amount', 'Reference'].map(h => (
                                <th
                                  key={h}
                                  className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {passbookTransactions.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="text-center py-16 text-gray-400">
                                  No passbook entries found.
                                </td>
                              </tr>
                            ) : (
                              passbookTransactions.map((tx, index) => (
                                <tr key={tx.id} className="hover:bg-gray-50/60">
                                  <td className="px-4 py-3">{index + 1}</td>
                                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(tx.transaction_date || tx.created_at)}</td>
                                  <td className="px-4 py-3">
                                    {tx.category === 'loan'
                                      ? 'Loan Deduction / Payment'
                                      : tx.type === 'deposit'
                                        ? 'Deposit'
                                        : tx.type === 'withdrawal'
                                          ? 'Withdrawal'
                                          : tx.type || 'Transaction'}
                                  </td>
                                  <td className="px-4 py-3 font-semibold whitespace-nowrap">
                                    {formatCurrency(tx.amount)}
                                  </td>
                                  <td className="px-4 py-3 text-gray-500">{tx.reference || '—'}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <StatCard
                        icon={<BookOpen size={16} className="text-emerald-600" />}
                        label="Passbook Status"
                        value={
                          selectedMember.passbook_status === 'claimed'
                            ? 'Claimed'
                            : selectedMember.passbook_status === 'delivered'
                              ? 'Delivered'
                              : 'Unclaimed'
                        }
                      />
                      <StatCard
                        icon={<CheckCircle2 size={16} className="text-blue-600" />}
                        label="Print Status"
                        value={selectedMember.passbook_print_status === 'done' ? 'Done' : 'Not Yet'}
                      />
                      <StatCard
                        icon={selectedPassbookType === 'savings'
                          ? <Wallet size={16} className="text-indigo-600" />
                          : <PiggyBank size={16} className="text-amber-600" />}
                        label="Current Balance"
                        value={formatCurrency(
                          selectedPassbookType === 'savings'
                            ? selectedAccounts.savings?.balance || 0
                            : selectedAccounts.cbu?.balance || 0
                        )}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-semibold text-gray-900">{value}</p>
      </div>
    </div>
  );
}