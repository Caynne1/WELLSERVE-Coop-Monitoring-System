import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download,
  Eye,
  FileText,
  Filter,
  Printer,
  Search,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import toast from 'react-hot-toast';

import Pagination from '../../components/ui/Pagination';
import Spinner from '../../components/ui/Spinner';
import usePagination from '../../hooks/usePagination';
import { exportToCSV } from '../../utils/csvExport';
import { formatCurrency } from '../../utils/formatters';
import { printHtmlDocument, wrapWithLetterhead } from '../../utils/print';
import {
  getMembershipMonitoringRows,
  summarizeMembershipMonitoring,
} from '../../services/membershipMonitoringService';

const STATUS_META = {
  fully_paid: {
    label: 'Fully Paid',
    className: 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm shadow-emerald-100/50',
  },
  with_balance: {
    label: 'With Balance',
    className: 'bg-amber-50 text-amber-700 border border-amber-200 shadow-sm shadow-amber-100/50',
  },
  no_setup: {
    label: 'No Setup',
    className: 'bg-slate-100 text-slate-700 border border-slate-200 shadow-sm shadow-slate-100/50',
  },
};

const TYPE_META = {
  regular: 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm shadow-emerald-100/50',
  associate: 'bg-sky-50 text-sky-700 border border-sky-200 shadow-sm shadow-sky-100/50',
  kiddy: 'bg-teal-50 text-teal-700 border border-teal-200 shadow-sm shadow-teal-100/50',
};

function formatMemberNo(value) {
  const text = String(value || '').trim();
  if (!text) return '-';
  return /^\d+$/.test(text) ? text.padStart(4, '0') : text;
}

function title(value) {
  return String(value || '-')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function StatCard({ icon, label, value, sub, tone = 'green' }) {
  const tones = {
    green: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    violet: 'bg-violet-50 text-violet-700',
    slate: 'bg-slate-50 text-slate-700',
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3 min-w-0">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${tones[tone] || tones.green}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold text-gray-900 mt-0.5 truncate">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.no_setup;
  return (
    <span className={`inline-flex min-w-[104px] items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  );
}

export default function MembershipMonitoringPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [recordFilter, setRecordFilter] = useState('all');

  const fetchRows = useCallback(async ({ quiet = false } = {}) => {
    try {
      if (!quiet) setLoading(true);
      const data = await getMembershipMonitoringRows();
      setRows(data);
    } catch (error) {
      toast.error(error.message || 'Failed to load membership monitoring data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(row => {
      const haystack = [
        row.member_no,
        row.member_name,
        row.membership_type,
        row.record_type,
        row.member_status,
        row.recruiter_name,
      ].filter(Boolean).join(' ').toLowerCase();

      return (!q || haystack.includes(q)) &&
        (statusFilter === 'all' || row.status === statusFilter) &&
        (typeFilter === 'all' || row.membership_type === typeFilter) &&
        (recordFilter === 'all' || row.record_type === recordFilter);
    });
  }, [rows, search, statusFilter, typeFilter, recordFilter]);

  const summary = useMemo(() => summarizeMembershipMonitoring(filtered), [filtered]);
  const { page, setPage, pageSize, setPageSize, pageItems, totalPages } =
    usePagination(filtered, { pageSize: 25 });

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, typeFilter, recordFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  function handlePrint() {
    const body = filtered.map(row => `
      <tr>
        <td>${row.member_name}<br/><span style="font-size:8pt;color:#6b7280">${formatMemberNo(row.member_no)}</span></td>
        <td style="text-align:center">${title(row.membership_type)}</td>
        <td style="text-align:right">${formatCurrency(row.membership_fee_paid)}</td>
        <td style="text-align:right">${formatCurrency(row.initial_cbu_paid)}</td>
        <td style="text-align:right">${formatCurrency(row.initial_savings_paid)}</td>
        <td style="text-align:right">${formatCurrency(row.vip_card_paid)}</td>
        <td style="text-align:right">${formatCurrency(row.total_paid)}</td>
        <td style="text-align:right">${formatCurrency(row.balance)}</td>
        <td style="text-align:center">${STATUS_META[row.status]?.label || '-'}</td>
      </tr>
    `).join('');

    const html = `
      <h1 class="report-title">Membership Monitoring</h1>
      <div class="report-meta">${filtered.length} members | Collected: ${formatCurrency(summary.totalPaid)} | Balance: ${formatCurrency(summary.balance)}</div>
      <table>
        <thead>
          <tr>
            <th>Member Name</th><th>Membership Type</th>
            <th style="text-align:right">Membership Fee</th><th style="text-align:right">Initial CBU</th>
            <th style="text-align:right">Initial Savings</th><th style="text-align:right">WELLife VIP</th>
            <th style="text-align:right">Total Paid</th><th style="text-align:right">Balance</th><th>Status</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    `;
    const win = printHtmlDocument(wrapWithLetterhead(html, { title: 'Membership Monitoring - WELLSERVE' }), {
      onBlocked: () => toast.error('Pop-up blocked. Please allow pop-ups and try again.'),
    });
    if (win) toast.success('Print dialog opened.');
  }

  function handleExport() {
    if (!filtered.length) {
      toast.error('No membership records to export.');
      return;
    }

    exportToCSV(`membership-monitoring-${new Date().toISOString().slice(0, 10)}.csv`, filtered.map(row => ({
      member_no: formatMemberNo(row.member_no),
      member_name: row.member_name,
      type: title(row.membership_type),
      record_type: title(row.record_type),
      member_status: title(row.member_status),
      date_joined: row.date_joined || '',
      membership_fee_paid: row.membership_fee_paid,
      initial_cbu_paid: row.initial_cbu_paid,
      initial_savings_paid: row.initial_savings_paid,
      wellife_vip_paid: row.vip_card_paid,
      total_required: row.required_total,
      total_paid: row.total_paid,
      balance: row.balance,
      status: STATUS_META[row.status]?.label || '',
      last_payment_date: row.last_payment_date || '',
      payment_count: row.payment_count,
    })));
  }

  if (loading) {
    return (
      <div className="p-4 md:p-6 bg-gray-50/30 min-h-screen">
        <div className="bg-white border border-gray-200 rounded-2xl p-8 flex items-center justify-center gap-3 text-gray-500">
          <Spinner />
          <span className="text-sm font-medium">Loading membership monitoring...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 bg-gray-50/30 min-h-screen space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Membership Monitoring</h1>
          <p className="text-gray-500 mt-1">Track membership setup, payment breakdown, and balances</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
          >
            <Printer size={14} />
            Print
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={<ShieldCheck size={20} />} label="Membership Setup" value={summary.totalSetup} sub={`${summary.noSetup} without setup`} />
        <StatCard icon={<Wallet size={20} />} label="Total Collected" value={formatCurrency(summary.totalPaid)} sub="All membership package payments" tone="blue" />
        <StatCard icon={<FileText size={20} />} label="Outstanding Balance" value={formatCurrency(summary.balance)} sub={`${summary.withBalance} with balance`} tone="amber" />
        <StatCard icon={<ShieldCheck size={20} />} label="Fully Paid" value={summary.fullyPaid} sub={`${summary.closed} closed accounts included`} tone="violet" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={<Wallet size={20} />} label="Membership Fee" value={formatCurrency(summary.membershipFee)} sub="Fee portion only" tone="violet" />
        <StatCard icon={<Wallet size={20} />} label="Initial CBU" value={formatCurrency(summary.initialCbu)} sub="From membership payments" />
        <StatCard icon={<Wallet size={20} />} label="Initial Savings" value={formatCurrency(summary.initialSavings)} sub="From membership payments" tone="blue" />
        <StatCard icon={<Wallet size={20} />} label="WELLife VIP Card" value={formatCurrency(summary.vipCard)} sub="VIP card payments" tone="slate" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="p-5">
          <div className="flex flex-col lg:flex-row gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search member no., name, type, or referrer..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="relative">
              <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white">
                <option value="all">All Status</option>
                <option value="fully_paid">Fully Paid</option>
                <option value="with_balance">With Balance</option>
                <option value="no_setup">No Setup</option>
              </select>
            </div>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white">
                <option value="all">All Types</option>
                <option value="regular">Regular</option>
                <option value="associate">Associate</option>
                <option value="kiddy">Kiddy</option>
            </select>
            <select value={recordFilter} onChange={e => setRecordFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white">
                <option value="all">Old & New</option>
                <option value="old">Old Membership</option>
                <option value="new">New Membership</option>
            </select>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full min-w-[1380px] table-fixed text-sm">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[10%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[8%]" />
                <col className="w-[9%]" />
                <col className="w-[8%]" />
                <col className="w-[9%]" />
                <col className="w-[5%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-gray-100 bg-gradient-to-r from-gray-50/90 to-emerald-50/40">
                  {[
                    ['Member Name', 'text-left'],
                    ['Membership Type', 'text-center'],
                    ['Membership Fee', 'text-right'],
                    ['Initial CBU', 'text-right'],
                    ['Initial Savings', 'text-right'],
                    ['WELLife VIP', 'text-right'],
                    ['Total Paid', 'text-right'],
                    ['Balance', 'text-right'],
                    ['Status', 'text-center'],
                    ['Actions', 'text-center'],
                  ].map(([label, align]) => (
                    <th key={label} className={`px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap ${align}`}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pageItems.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-16 text-center text-gray-400">
                      No membership records found.
                    </td>
                  </tr>
              ) : pageItems.map(row => (
                  <tr key={row.id} className="transition-colors hover:bg-emerald-50/30">
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-gray-900 truncate">{row.member_name || '-'}</p>
                      <p className="text-xs text-gray-400 font-mono truncate">{formatMemberNo(row.member_no)}</p>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={`inline-flex min-w-[86px] items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold ${TYPE_META[row.membership_type] || TYPE_META.regular}`}>
                        {title(row.membership_type)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold text-gray-800">{formatCurrency(row.membership_fee_paid)}</td>
                    <td className="px-4 py-3.5 text-right font-semibold text-emerald-700">{formatCurrency(row.initial_cbu_paid)}</td>
                    <td className="px-4 py-3.5 text-right font-semibold text-blue-700">{formatCurrency(row.initial_savings_paid)}</td>
                    <td className="px-4 py-3.5 text-right font-semibold text-gray-700">{formatCurrency(row.vip_card_paid)}</td>
                    <td className="px-4 py-3.5 text-right font-bold text-gray-900">{formatCurrency(row.total_paid)}</td>
                    <td className="px-4 py-3.5 text-right font-bold text-amber-700">{formatCurrency(row.balance)}</td>
                    <td className="px-4 py-3.5 text-center"><StatusPill status={row.status} /></td>
                    <td className="px-4 py-3.5 text-center">
                      <button
                        type="button"
                        onClick={() => navigate(`/members/${row.id}?tab=membership`)}
                        className="inline-flex items-center justify-center w-9 h-9 rounded-xl text-gray-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                        title="View membership"
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <Pagination
          page={page}
          totalPages={totalPages}
          totalItems={filtered.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          itemLabel="members"
        />
      </div>
    </div>
  );
}
