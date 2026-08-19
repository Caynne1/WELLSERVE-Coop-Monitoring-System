import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search, Printer, Download, Calendar, ArrowDownLeft, ArrowUpRight,
  Wallet, Filter, X, Eye,
} from 'lucide-react';
import { exportToCSV } from '../../utils/csvExport';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Spinner from '../../components/ui/Spinner';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import usePagination from '../../hooks/usePagination';
import { getTransactions, subscribeToTransactions } from '../../services/transactionService';
import { printHtmlDocument, wrapWithLetterhead } from '../../utils/print';
import { supabase } from '../../services/supabase';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';

const CASH_IN_TYPES = new Set([
  'deposit',
  'loan_payment',
  'loan_interest',
  'penalty_payment',
  'membership_payment',
  'service_fee',
  'income',
]);

const CASH_OUT_TYPES = new Set([
  'withdrawal',
  'loan_release',
  'expense',
  'check_release',
]);

function memberName(tx) {
  return [tx.members?.first_name, tx.members?.last_name].filter(Boolean).join(' ') || '-';
}

function txLabel(value) {
  if (String(value || '').toLowerCase() === 'membership_payment') return 'membership';
  return String(value || '-').replace(/_/g, ' ');
}

function isCashIn(tx) {
  const type = String(tx.type || '').toLowerCase();
  if (CASH_IN_TYPES.has(type)) return true;
  if (CASH_OUT_TYPES.has(type)) return false;
  return Number(tx.amount || 0) >= 0;
}

function isCashOut(tx) {
  return !isCashIn(tx);
}

function uniqueOptions(rows, key) {
  return [...new Set(rows.map(row => row[key]).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b)));
}

function StatCard({ icon, label, value, sub, tone = 'gray' }) {
  const tones = {
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-red-700',
    blue: 'bg-blue-50 text-blue-700',
    gray: 'bg-gray-50 text-gray-700',
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${tones[tone] || tones.gray}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold text-gray-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [directionFilter, setDirectionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [detailTarget, setDetailTarget] = useState(null);

  const fetchTransactions = useCallback(async ({ quiet = false } = {}) => {
    try {
      if (!quiet) setLoading(true);
      const data = await getTransactions({
        from: dateFrom || undefined,
        to: dateTo || undefined,
      });
      setTransactions(data);
    } catch {
      toast.error('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    const channel = subscribeToTransactions(() => fetchTransactions({ quiet: true }));
    return () => supabase.removeChannel(channel);
  }, [fetchTransactions]);

  const typeOptions = useMemo(() => uniqueOptions(transactions, 'type'), [transactions]);
  const categoryOptions = useMemo(() => {
    const options = uniqueOptions(transactions, 'category');
    if (!options.includes('others')) {
      const otherIndex = options.findIndex(category => String(category).toLowerCase() === 'other');
      options.splice(otherIndex >= 0 ? otherIndex + 1 : options.length, 0, 'others');
    }
    return options;
  }, [transactions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter(tx => {
      const haystack = [
        memberName(tx),
        tx.members?.member_no,
        tx.reference,
        tx.notes,
        tx.payment_mode,
        tx.payment_mode_note,
        tx.type,
        tx.category,
        tx.created_by_name,
      ].filter(Boolean).join(' ').toLowerCase();

      const matchesSearch = !q || haystack.includes(q);
      const matchesType = !typeFilter || tx.type === typeFilter;
      const matchesCategory = !categoryFilter || tx.category === categoryFilter;
      const matchesDirection =
        !directionFilter ||
        (directionFilter === 'in' && isCashIn(tx)) ||
        (directionFilter === 'out' && isCashOut(tx));

      return matchesSearch && matchesType && matchesCategory && matchesDirection;
    });
  }, [transactions, search, typeFilter, categoryFilter, directionFilter]);

  const totals = useMemo(() => {
    const cashIn = filtered.filter(isCashIn).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const cashOut = filtered.filter(isCashOut).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    return {
      cashIn,
      cashOut,
      net: cashIn - cashOut,
      inCount: filtered.filter(isCashIn).length,
      outCount: filtered.filter(isCashOut).length,
    };
  }, [filtered]);

  const hasFilters = search || typeFilter || categoryFilter || directionFilter || dateFrom || dateTo;
  const { page, setPage, pageSize, setPageSize, pageItems, totalPages } = usePagination(filtered, { pageSize: 25 });

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, categoryFilter, directionFilter, dateFrom, dateTo]); // eslint-disable-line react-hooks/exhaustive-deps

  function clearFilters() {
    setSearch('');
    setTypeFilter('');
    setCategoryFilter('');
    setDirectionFilter('');
    setDateFrom('');
    setDateTo('');
  }

  function handlePrint() {
    const fmt = (n) => 'PHP ' + Number(n ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const rows = filtered.map(tx => {
      const direction = isCashIn(tx) ? 'IN' : 'OUT';
      return `<tr>
        <td style="white-space:nowrap">${tx.transaction_date ? formatDateTime(tx.transaction_date) : '-'}</td>
        <td>${direction}</td>
        <td style="text-transform:capitalize">${txLabel(tx.type)}</td>
        <td>${tx.category || '-'}</td>
        <td>${memberName(tx)}</td>
        <td style="text-align:right;font-weight:600;color:${direction === 'IN' ? '#065f46' : '#b91c1c'}">${fmt(tx.amount)}</td>
        <td>${tx.payment_mode || '-'}</td>
        <td>${tx.created_by_name || '-'}</td>
        <td style="max-width:180px;overflow:hidden">${tx.notes || tx.payment_mode_note || '-'}</td>
      </tr>`;
    }).join('');
    const html = `
      <h1 class="report-title">Transactions</h1>
      <div class="report-meta">Financial transaction ledger | ${filtered.length} records | Cash In: ${fmt(totals.cashIn)} | Cash Out: ${fmt(totals.cashOut)} | Net: ${fmt(totals.net)}</div>
      <table>
        <thead><tr><th>Date &amp; Time</th><th>Direction</th><th>Type</th><th>Category</th><th>Member</th><th style="text-align:right">Amount</th><th>Mode</th><th>Recorded By</th><th>Notes</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="confidential">WELLSERVE Cooperative Monitoring System - Authorized personnel only.</div>
    `;
    const win = printHtmlDocument(wrapWithLetterhead(html, { title: 'Transactions - WELLSERVE' }), {
      onBlocked: () => toast.error('Pop-up blocked. Please allow pop-ups and try again.'),
    });
    if (win) toast.success('Print dialog opened.');
  }

  function handleExportCSV() {
    try {
      if (filtered.length === 0) { toast.error('No transactions to export.'); return; }
      const rows = filtered.map(tx => ({
        date_time: tx.transaction_date ? formatDateTime(tx.transaction_date) : '',
        direction: isCashIn(tx) ? 'IN' : 'OUT',
        type: txLabel(tx.type),
        category: tx.category || '',
        member: memberName(tx),
        member_no: tx.members?.member_no || '',
        amount: tx.amount || 0,
        payment_mode: tx.payment_mode || '',
        reference: tx.reference || '',
        notes: tx.notes || tx.payment_mode_note || '',
        recorded_by: tx.created_by_name || '',
      }));
      exportToCSV('transactions_report.csv', rows);
      toast.success('CSV exported successfully');
    } catch (err) {
      toast.error(err.message || 'Failed to export CSV');
    }
  }

  return (
    <div className="p-6">
      <PageHeader title="Transactions" subtitle="Live ledger of member and cooperative transactions" />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-5">
        <StatCard
          icon={<Wallet size={20} />}
          label="Filtered Transactions"
          value={filtered.length.toLocaleString('en-PH')}
          sub={`${transactions.length.toLocaleString('en-PH')} total loaded`}
          tone="blue"
        />
        <StatCard
          icon={<ArrowDownLeft size={20} />}
          label="Cash In"
          value={formatCurrency(totals.cashIn)}
          sub={`${totals.inCount} transaction${totals.inCount !== 1 ? 's' : ''}`}
          tone="green"
        />
        <StatCard
          icon={<ArrowUpRight size={20} />}
          label="Cash Out"
          value={formatCurrency(totals.cashOut)}
          sub={`${totals.outCount} transaction${totals.outCount !== 1 ? 's' : ''}`}
          tone="red"
        />
        <StatCard
          icon={<Filter size={20} />}
          label="Net Movement"
          value={formatCurrency(totals.net)}
          sub={hasFilters ? 'Based on active filters' : 'All loaded transactions'}
          tone={totals.net >= 0 ? 'green' : 'red'}
        />
      </div>

      <div className="mt-5 mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search member, type, reference, notes..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <select
          value={directionFilter}
          onChange={e => setDirectionFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Directions</option>
          <option value="in">Cash In</option>
          <option value="out">Cash Out</option>
        </select>

        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="w-32 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Types</option>
          {typeOptions.map(type => <option key={type} value={type}>{txLabel(type)}</option>)}
        </select>

        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Categories</option>
          {categoryOptions.map(category => <option key={category} value={category}>{category}</option>)}
        </select>

        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-gray-400" />
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={e => setDateTo(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <X size={14} />
            Clear
          </button>
        )}

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

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {[
                    'Date & Time',
                    'Direction',
                    'Type',
                    'Category',
                    'Member',
                    'Amount',
                    'Mode',
                    'Reference',
                    'Recorded By',
                    'Notes',
                  ].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-gray-400">
                      {hasFilters ? 'No transactions match your filters.' : 'No transactions yet.'}
                    </td>
                  </tr>
                ) : (
                  pageItems.map(tx => {
                    const cashIn = isCashIn(tx);
                    return (
                      <tr key={tx.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {tx.transaction_date ? formatDateTime(tx.transaction_date) : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cashIn ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                            {cashIn ? 'IN' : 'OUT'}
                          </span>
                        </td>
                        <td className="px-4 py-3 capitalize text-gray-700 whitespace-nowrap">
                          {txLabel(tx.type)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                            {tx.category || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{memberName(tx)}</p>
                          {tx.members?.member_no && (
                            <p className="text-xs text-gray-400 font-mono">{tx.members.member_no}</p>
                          )}
                        </td>
                        <td className={`px-4 py-3 font-semibold whitespace-nowrap ${cashIn ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(tx.amount)}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                          {tx.payment_mode || '-'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 font-mono max-w-[160px] truncate" title={tx.reference || ''}>
                          {tx.reference || '-'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {tx.created_by_name || '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => setDetailTarget(tx)}
                            title="View transaction details"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Eye size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Showing {filtered.length} of {transactions.length} transactions
              </p>
              <p className="text-xs text-gray-500">
                Cash In {formatCurrency(totals.cashIn)} | Cash Out {formatCurrency(totals.cashOut)} | Net {formatCurrency(totals.net)}
              </p>
            </div>
          )}

          <Pagination
            page={page}
            totalPages={totalPages}
            totalItems={filtered.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemLabel="transactions"
          />
        </div>
      )}

      <Modal
        open={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        title="Transaction Details"
        size="md"
      >
        {detailTarget && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <DetailItem label="Date & Time" value={detailTarget.transaction_date ? formatDateTime(detailTarget.transaction_date) : '-'} />
              <DetailItem label="Direction" value={isCashIn(detailTarget) ? 'IN' : 'OUT'} />
              <DetailItem label="Type" value={txLabel(detailTarget.type)} />
              <DetailItem label="Category" value={detailTarget.category || '-'} />
              <DetailItem label="Member" value={memberName(detailTarget)} />
              <DetailItem label="Amount" value={formatCurrency(detailTarget.amount)} />
              <DetailItem label="Mode" value={detailTarget.payment_mode || '-'} />
              <DetailItem label="Reference" value={detailTarget.reference || '-'} />
              <DetailItem label="Recorded By" value={detailTarget.created_by_name || '-'} />
            </div>

            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Notes</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
                {detailTarget.notes || detailTarget.payment_mode_note || 'No notes recorded.'}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function DetailItem({ label, value }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-800 break-words">{value}</p>
    </div>
  );
}
