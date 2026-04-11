import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Printer,
  Search,
  User,
  PiggyBank,
  Wallet,
  CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';

import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import { supabase } from '../../services/supabase';
import { formatCurrency, formatDate } from '../../utils/formatters';

const REGISTRY_STATUS_OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 'claimed', label: 'Claimed' },
  { value: 'unclaimed', label: 'Unclaimed' },
];

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
  const [selectedPassbookType, setSelectedPassbookType] = useState('savings');
  const [passbookSearch, setPassbookSearch] = useState('');

  useEffect(() => {
    fetchPassbookData();
  }, []);

  async function fetchPassbookData() {
    try {
      setLoading(true);

      const [
        membersRes,
        accountsRes,
        transactionsRes,
      ] = await Promise.all([
        supabase
          .from('members')
          .select(`
            id,
            member_no,
            first_name,
            last_name,
            middle_initial,
            date_joined,
            recruiter_name,
            passbook_status,
            passbook_print_status,
            created_at,
            status
          `)
          .order('created_at', { ascending: true }),

        supabase
          .from('accounts')
          .select(`
            id,
            member_id,
            account_no,
            account_type,
            balance,
            created_at
          `),

        supabase
          .from('transactions')
          .select(`
            id,
            member_id,
            account_id,
            category,
            type,
            amount,
            reference,
            created_at
          `)
          .order('created_at', { ascending: true }),
      ]);

      if (membersRes.error) throw membersRes.error;
      if (accountsRes.error) throw accountsRes.error;
      if (transactionsRes.error) throw transactionsRes.error;

      const normalizedMembers = (membersRes.data || []).map((member, index) => ({
        ...member,
        registry_no: index + 1,
        recruiter_name: member.recruiter_name?.trim() || 'Self',
        passbook_status: member.passbook_status || 'unclaimed',
        passbook_print_status: member.passbook_print_status || 'not_yet',
      }));

      setMembers(normalizedMembers);
      setAccounts(accountsRes.data || []);
      setTransactions(transactionsRes.data || []);

      if (normalizedMembers.length > 0) {
        setSelectedMemberId(normalizedMembers[0].id);
      }
    } catch (error) {
      toast.error(error.message || 'Failed to load passbook data.');
    } finally {
      setLoading(false);
    }
  }

  const accountMap = useMemo(() => {
    const map = new Map();

    for (const account of accounts) {
      if (!map.has(account.member_id)) {
        map.set(account.member_id, {});
      }
      map.get(account.member_id)[String(account.account_type).toLowerCase()] = account;
    }

    return map;
  }, [accounts]);

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

    return transactions.filter(tx => {
      if (tx.member_id !== selectedMemberId) return false;

      if (selectedPassbookType === 'savings') {
        return tx.category === 'savings' || tx.category === 'loan';
      }

      return tx.category === 'cbu';
    });
  }, [transactions, selectedMemberId, selectedPassbookType]);

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

    const rows = passbookTransactions.map((tx, index) => {
      const date = formatDate(tx.created_at);
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

    const printWindow = window.open('', '_blank', 'width=900,height=1000');
    if (!printWindow) {
      toast.error('Unable to open print preview.');
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 28px; color: #222; }
            h1 { font-size: 22px; margin: 0 0 6px; }
            h2 { font-size: 14px; margin: 18px 0 8px; }
            .meta { margin: 0 0 14px; font-size: 12px; color: #555; }
            .box { border: 1px solid #ddd; padding: 12px; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 8px; vertical-align: top; }
            th { background: #f6f6f6; text-align: left; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <p class="meta">Printed: ${new Date().toLocaleString()}</p>

          <div class="box">
            <p><strong>Name:</strong> ${plainFullName(selectedMember)}</p>
            <p><strong>Member No.:</strong> ${selectedMember.member_no || '—'}</p>
            <p><strong>Inviter / Recruiter:</strong> ${selectedMember.recruiter_name || 'Self'}</p>
            <p><strong>Account No.:</strong> ${accountNo}</p>
            <p><strong>Date Joined:</strong> ${formatDate(selectedMember.date_joined || selectedMember.created_at)}</p>
          </div>

          <h2>Passbook Transactions</h2>
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
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
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
            </div>

            <div className="overflow-x-auto border border-gray-100 rounded-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {[
                      'Invite / Recruiter',
                      'Status',
                      'Print Passbook',
                      'CBU Account',
                      'Savings Account',
                      'No.',
                      'Surname',
                      'First Name',
                      'Middle Name',
                    ].map(h => (
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
                  {registryRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-16 text-gray-400">
                        No passbook registry rows found.
                      </td>
                    </tr>
                  ) : (
                    registryRows.map(row => (
                      <tr key={row.id} className="hover:bg-emerald-50/30">
                        <td className="px-4 py-3">{row.recruiter_name || 'Self'}</td>
                        <td className="px-4 py-3">
                          <Badge variant={getBadgeVariant(row.passbook_status)}>
                            {row.passbook_status === 'claimed' ? 'Claimed' : 'Unclaimed'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={getPrintBadgeVariant(row.passbook_print_status)}>
                            {row.passbook_print_status === 'done' ? 'Done' : 'Not Yet'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{row.cbu_account_no}</td>
                        <td className="px-4 py-3 font-mono text-xs">{row.savings_account_no}</td>
                        <td className="px-4 py-3">{row.registry_no}</td>
                        <td className="px-4 py-3">{row.last_name || '—'}</td>
                        <td className="px-4 py-3">{row.first_name || '—'}</td>
                        <td className="px-4 py-3">{row.middle_initial || '—'}</td>
                      </tr>
                    ))
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
                            <p>Inviter / Recruiter: <span className="font-medium text-gray-800">{selectedMember.recruiter_name || 'Self'}</span></p>
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
                                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(tx.created_at)}</td>
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
                        value={selectedMember.passbook_status === 'claimed' ? 'Claimed' : 'Unclaimed'}
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