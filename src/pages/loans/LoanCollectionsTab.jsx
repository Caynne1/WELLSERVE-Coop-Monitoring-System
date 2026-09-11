import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarClock, Eye, Receipt, Search, Wallet } from 'lucide-react';
import Pagination from '../../components/ui/Pagination';
import usePagination from '../../hooks/usePagination';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { LOAN_PRODUCT_FILTER_OPTIONS } from '../../utils/loanProducts';
import { buildLoanCollectionRows, collectionStatusLabel } from '../../utils/loanCollections';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Collection Status' },
  { value: 'due_today', label: 'Due Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'missed', label: 'Missed' },
  { value: 'partial', label: 'Partially Paid' },
];

const STATUS_CLASSES = {
  due_today: 'bg-amber-50 text-amber-700 border-amber-200',
  upcoming: 'bg-blue-50 text-blue-700 border-blue-200',
  overdue: 'bg-red-50 text-red-700 border-red-200',
  missed: 'bg-red-50 text-red-700 border-red-200',
  partial: 'bg-orange-50 text-orange-700 border-orange-200',
};

function SummaryCard({ icon, label, value, detail, tone }) {
  return (
    <div className="min-w-0 border border-gray-200 bg-white rounded-lg px-4 py-4 flex items-start gap-3">
      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${tone}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className="mt-1 text-lg font-semibold text-gray-800 tabular-nums break-words">{value}</p>
        <p className="mt-0.5 text-[11px] text-gray-400">{detail}</p>
      </div>
    </div>
  );
}

export default function LoanCollectionsTab({ loans, navigate, canRecordPayment }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [product, setProduct] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const rows = useMemo(() => buildLoanCollectionRows(loans), [loans]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter(row => {
      const memberName = `${row.member?.first_name || ''} ${row.member?.last_name || ''}`.trim().toLowerCase();
      const matchesSearch = !query || memberName.includes(query)
        || String(row.member?.member_no || '').toLowerCase().includes(query)
        || row.loanProduct.toLowerCase().includes(query);
      const matchesStatus = status === 'all' || row.collectionStatus === status;
      const matchesProduct = product === 'all'
        || (product === 'unspecified' ? !row.loanProductCode : row.loanProductCode === product);
      const matchesDate = (!from || row.dueDate >= from) && (!to || row.dueDate <= to);
      return matchesSearch && matchesStatus && matchesProduct && matchesDate;
    });
  }, [rows, search, status, product, from, to]);

  const summary = useMemo(() => ({
    dueToday: rows.filter(row => row.collectionStatus === 'due_today'),
    upcoming: rows.filter(row => row.collectionStatus === 'upcoming'),
    overdue: rows.filter(row => ['overdue', 'missed'].includes(row.collectionStatus)),
    partial: rows.filter(row => row.collectionStatus === 'partial'),
  }), [rows]);

  const { page, setPage, pageSize, setPageSize, pageItems, totalPages } = usePagination(filtered, { pageSize: 25 });
  useEffect(() => setPage(1), [search, status, product, from, to, setPage]);

  function recordPayment(row) {
    const params = new URLSearchParams({
      new: '1',
      member: row.memberId,
      loan: row.loanId,
      period: row.period,
    });
    navigate(`/invoices?${params.toString()}`);
  }

  return (
    <div className="mt-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <SummaryCard icon={<CalendarClock size={18} />} label="Due Today"
          value={formatCurrency(summary.dueToday.reduce((sum, row) => sum + row.remainingDue, 0))}
          detail={`${summary.dueToday.length} installment${summary.dueToday.length === 1 ? '' : 's'}`} tone="bg-amber-50 text-amber-700" />
        <SummaryCard icon={<Wallet size={18} />} label="Upcoming"
          value={formatCurrency(summary.upcoming.reduce((sum, row) => sum + row.remainingDue, 0))}
          detail={`${summary.upcoming.length} installment${summary.upcoming.length === 1 ? '' : 's'}`} tone="bg-blue-50 text-blue-700" />
        <SummaryCard icon={<AlertCircle size={18} />} label="Overdue and Missed"
          value={formatCurrency(summary.overdue.reduce((sum, row) => sum + row.remainingDue, 0))}
          detail={`${summary.overdue.length} installment${summary.overdue.length === 1 ? '' : 's'}`} tone="bg-red-50 text-red-700" />
        <SummaryCard icon={<Receipt size={18} />} label="Partially Paid"
          value={formatCurrency(summary.partial.reduce((sum, row) => sum + row.remainingDue, 0))}
          detail={`${summary.partial.length} installment${summary.partial.length === 1 ? '' : 's'}`} tone="bg-orange-50 text-orange-700" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={event => setSearch(event.target.value)}
            placeholder="Search member, number, or product"
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#07A04E]" />
        </div>
        <select value={status} onChange={event => setStatus(event.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#07A04E]">
          {STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <select value={product} onChange={event => setProduct(event.target.value)}
          className="w-full sm:w-56 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#07A04E]">
          <option value="all">All Loan Products</option>
          {LOAN_PRODUCT_FILTER_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          <option value="unspecified">Unspecified</option>
        </select>
        <input type="date" aria-label="Due date from" value={from} onChange={event => setFrom(event.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#07A04E]" />
        <span className="text-gray-300">to</span>
        <input type="date" aria-label="Due date to" value={to} onChange={event => setTo(event.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#07A04E]" />
        <span className="ml-auto text-xs text-gray-400">{filtered.length} installment{filtered.length === 1 ? '' : 's'}</span>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-sm tabular-nums">
            <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Member</th>
                <th className="px-4 py-3 text-left font-semibold">Loan Product</th>
                <th className="px-4 py-3 text-left font-semibold">Due Date</th>
                <th className="px-4 py-3 text-right font-semibold">Principal Due</th>
                <th className="px-4 py-3 text-right font-semibold">Interest Due</th>
                <th className="px-4 py-3 text-right font-semibold">Remaining Due</th>
                <th className="px-4 py-3 text-center font-semibold">Days Overdue</th>
                <th className="px-4 py-3 text-center font-semibold">Status</th>
                <th className="px-4 py-3 text-center font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageItems.map(row => {
                const memberName = `${row.member?.first_name || ''} ${row.member?.last_name || ''}`.trim() || 'Unknown Member';
                return (
                  <tr key={row.id} className="text-gray-700 hover:bg-gray-50/70">
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => navigate(`/members/${row.memberId}`)} className="text-left hover:text-[#07A04E]">
                        <span className="block font-medium text-gray-800">{memberName}</span>
                        <span className="block text-xs text-gray-400">{row.member?.member_no || 'No member number'}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3">{row.loanProduct}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-medium">{formatDate(row.dueDate)}</span>
                      <span className="block text-xs text-gray-400">Payment {row.period}</span>
                    </td>
                    <td className="px-4 py-3 text-right">{formatCurrency(row.principalDue)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(row.interestDue)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(row.remainingDue)}</td>
                    <td className="px-4 py-3 text-center">{row.daysOverdue || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${STATUS_CLASSES[row.collectionStatus] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                        {collectionStatusLabel(row.collectionStatus)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button type="button" title="View loan" onClick={() => navigate(`/loans/${row.loanId}`)}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-[#000066]">
                          <Eye size={15} />
                        </button>
                        <button type="button" title={canRecordPayment ? 'Record payment' : 'Invoice permission required'}
                          disabled={!canRecordPayment} onClick={() => recordPayment(row)}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40">
                          <Receipt size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!pageItems.length && (
                <tr><td colSpan="9" className="px-4 py-14 text-center text-sm text-gray-400">No collection records match the selected filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} pageSize={pageSize}
          onPageChange={setPage} onPageSizeChange={setPageSize} itemLabel="installments" />
      </div>
    </div>
  );
}
