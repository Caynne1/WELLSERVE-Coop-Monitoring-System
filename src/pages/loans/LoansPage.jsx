import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye, Trash2, Search, CreditCard } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import { getLoans, deleteLoan } from '../../services/loanService';
import { formatCurrency, formatDate } from '../../utils/formatters';

// ── Logic unchanged ────────────────────────────────────────────
const statusVariant = {
  active:    'success',
  ongoing:   'success',
  paid:      'info',
  defaulted: 'danger',
  pending:   'warning',
};

export default function LoansPage() {
  const navigate  = useNavigate();
  const [loans, setLoans]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { fetchLoans(); }, []);

  async function fetchLoans() {
    try { setLoading(true); setLoans(await getLoans()); }
    catch { toast.error('Failed to load loans'); }
    finally { setLoading(false); }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteLoan(toDelete.id);
      toast.success('Loan deleted');
      setLoans(p => p.filter(l => l.id !== toDelete.id));
      setToDelete(null);
    } catch { toast.error('Failed to delete loan'); }
    finally { setDeleting(false); }
  }

  const filtered = loans.filter(l => {
    const q = search.toLowerCase();
    return (
      `${l.members?.first_name} ${l.members?.last_name}`.toLowerCase().includes(q) ||
      l.members?.member_no?.toLowerCase().includes(q) ||
      l.loan_no?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6">
      <PageHeader
        title="Loans"
        subtitle="Manage and monitor member loans"
        action={
          <Button icon={<Plus size={15} />} onClick={() => navigate('/loans/new')}>
            New Loan
          </Button>
        }
      />

      {/* Search */}
      <div className="mt-5 mb-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by member, loan no…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl
              focus:outline-none focus:ring-2 focus:ring-[#07A04E] focus:border-transparent
              w-72 bg-white shadow-sm"
          />
        </div>
        {!loading && (
          <p className="text-xs text-gray-400">
            {filtered.length} of {loans.length} loans
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100">
                  {['Member', 'Loan No.', 'Amount', 'Balance', 'Term', 'Released', 'Status', ''].map((h, i) => (
                    <th
                      key={h}
                      className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide
                        ${i >= 2 && i <= 3 ? 'text-right' : i === 7 ? 'text-right' : 'text-left'}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-2 text-gray-400">
                        <CreditCard size={32} className="text-gray-200" />
                        <p className="text-sm">{search ? 'No loans match your search.' : 'No loans yet.'}</p>
                      </div>
                    </td>
                  </tr>
                ) : filtered.map(loan => (
                  <tr key={loan.id} className="hover:bg-[#D6FADC]/25 transition-colors group">
                    {/* Member */}
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">
                        {loan.members?.first_name} {loan.members?.last_name}
                      </p>
                      {loan.members?.member_no && (
                        <p className="text-xs text-gray-400 font-mono mt-0.5">{loan.members.member_no}</p>
                      )}
                    </td>

                    {/* Loan no */}
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded-lg text-gray-600 ring-1 ring-gray-200">
                        {loan.loan_no || '—'}
                      </span>
                    </td>

                    {/* Amount */}
                    <td className="px-4 py-3 text-right">
                      <span className="font-semibold text-gray-900">{formatCurrency(loan.amount)}</span>
                    </td>

                    {/* Balance */}
                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold ${(loan.balance ?? loan.amount) > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                        {formatCurrency(loan.balance ?? loan.amount)}
                      </span>
                    </td>

                    {/* Term */}
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {loan.term_months ? `${loan.term_months} mo.` : '—'}
                    </td>

                    {/* Released */}
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {formatDate(loan.release_date || loan.created_at)}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant[loan.status] || 'default'} dot>
                        {loan.status || '—'}
                      </Badge>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => navigate(`/loans/${loan.id}`)}
                          title="View loan"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={() => setToDelete(loan)}
                          title="Delete loan"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/50 flex items-center justify-between">
              <p className="text-xs text-gray-400">
                Showing <span className="font-medium text-gray-600">{filtered.length}</span> of{' '}
                <span className="font-medium text-gray-600">{loans.length}</span> loans
              </p>
              <p className="text-xs font-medium" style={{ color: "#273C2C" }}>
                Total outstanding:{' '}
                {formatCurrency(filtered.filter(l => l.status === 'active').reduce((s, l) => s + (l.balance || 0), 0))}
              </p>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Loan"
        message="Delete this loan record? This cannot be undone."
      />
    </div>
  );
}