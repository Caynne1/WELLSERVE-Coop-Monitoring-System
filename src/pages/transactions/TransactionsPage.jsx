import { useState, useEffect, useCallback } from 'react';
import { ArrowDownLeft, ArrowUpRight, Search, Printer, Download } from 'lucide-react';
import { exportToCSV } from '../../utils/csvExport';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Spinner from '../../components/ui/Spinner';
import { getTransactions, subscribeToTransactions } from '../../services/transactionService';
import { supabase } from '../../services/supabase';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';

const INFLOW_TYPES = ['deposit', 'loan_release', 'membership_payment'];

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchTransactions = useCallback(async () => {
    try {
      const data = await getTransactions();
      setTransactions(data);
    } catch {
      toast.error('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTransactions();

    const channel = subscribeToTransactions(() => fetchTransactions());
    return () => supabase.removeChannel(channel);
  }, [fetchTransactions]);

  const filtered = transactions.filter(t => {
    const q = search.toLowerCase();
    const name = `${t.members?.first_name || ''} ${t.members?.last_name || ''}`.toLowerCase();
    return (
      name.includes(q) ||
      t.reference?.toLowerCase().includes(q) ||
      t.notes?.toLowerCase().includes(q) ||
      t.payment_mode?.toLowerCase().includes(q) ||
      t.payment_mode_note?.toLowerCase().includes(q) ||
      t.type?.toLowerCase().includes(q) ||
      t.category?.toLowerCase().includes(q)
    );
  });

  function handlePrint() { window.print(); }

  function handleExportCSV() {
    try {
      if (filtered.length === 0) { toast.error('No transactions to export.'); return; }
      const rows = filtered.map(tx => ({
        type: (tx.type || '').replace(/_/g, ' '),
        category: tx.category || '',
        member: `${tx.members?.first_name || ''} ${tx.members?.last_name || ''}`.trim(),
        member_no: tx.members?.member_no || '',
        amount: tx.amount || 0,
        payment_mode: tx.payment_mode || '',
        reference: tx.reference || '',
        notes: tx.notes || tx.payment_mode_note || '',
        transaction_date: tx.transaction_date ? formatDate(tx.transaction_date) : '',
        created_at: formatDateTime(tx.created_at),
      }));
      exportToCSV('transactions_report.csv', rows);
      toast.success('CSV exported successfully');
    } catch (err) {
      toast.error(err.message || 'Failed to export CSV');
    }
  }

  return (
    <div className="p-6">
      <PageHeader title="Transactions" subtitle="All financial transactions" />

      <div className="mt-5 mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by member, type, reference, notes..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
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
                    'Type',
                    'Category',
                    'Member',
                    'Amount',
                    'Mode',
                    'Assisted By',
                    'Notes',
                    'Created',
                  ].map(h => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-400">
                      {search ? 'No transactions match your search.' : 'No transactions yet.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map(tx => {
                    const isInflow = INFLOW_TYPES.includes(tx.type);
                    return (
                      <tr key={tx.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {isInflow ? (
                              <ArrowDownLeft size={16} className="text-green-500 flex-shrink-0" />
                            ) : (
                              <ArrowUpRight size={16} className="text-red-500 flex-shrink-0" />
                            )}
                            <span className="capitalize text-gray-700">
                              {tx.type?.replace(/_/g, ' ') || '—'}
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <span className="capitalize text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                            {tx.category || '—'}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">
                            {tx.members?.first_name} {tx.members?.last_name}
                          </p>
                          {tx.members?.member_no && (
                            <p className="text-xs text-gray-400 font-mono">{tx.members.member_no}</p>
                          )}
                        </td>

                        <td className={`px-4 py-3 font-semibold ${isInflow ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(tx.amount)}
                        </td>

                        <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                          {tx.payment_mode || '—'}
                        </td>

                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {tx.created_by_name || '—'}
                        </td>

                        <td className="px-4 py-3 text-xs text-gray-500 max-w-[280px]">
                          <div className="truncate" title={tx.notes || tx.payment_mode_note || ''}>
                            {tx.notes || tx.payment_mode_note || '—'}
                          </div>
                        </td>

                        <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                          {formatDateTime(tx.created_at)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50">
              <p className="text-xs text-gray-500">
                Showing {filtered.length} of {transactions.length} transactions
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}