import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit2 } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import { getLoanById } from '../../services/loanService';
import { formatCurrency, formatDate } from '../../utils/formatters';

const statusVariant = { active: 'success', ongoing: 'success', paid: 'info', defaulted: 'danger', pending: 'warning' };

export default function LoanDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loan, setLoan] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLoanById(id)
      .then(setLoan)
      .catch(() => { toast.error('Loan not found'); navigate('/loans'); })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex justify-center py-24"><Spinner /></div>;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <button onClick={() => navigate('/loans')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors">
        <ArrowLeft size={16} /> Back to Loans
      </button>
      <PageHeader title={`Loan ${loan.loan_no || ''}`}
        subtitle={`${loan.members?.first_name} ${loan.members?.last_name}`}
        action={<Button icon={<Edit2 size={14} />} onClick={() => navigate(`/loans/${id}/edit`)}>Edit</Button>} />

      <div className="mt-6 bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
        {[
          ['Member', `${loan.members?.first_name} ${loan.members?.last_name}`],
          ['Member No.', loan.members?.member_no || '—'],
          ['Loan Amount', formatCurrency(loan.amount)],
          ['Outstanding Balance', formatCurrency(loan.balance ?? loan.amount)],
          ['Interest Rate', loan.interest_rate ? `${loan.interest_rate}% p.a.` : '—'],
          ['Term', loan.term_months ? `${loan.term_months} months` : '—'],
          ['Monthly Amortization', formatCurrency(loan.monthly_amortization)],
          ['Release Date', formatDate(loan.release_date)],
          ['Due Date', formatDate(loan.due_date)],
          ['Status', <Badge key="s" variant={statusVariant[loan.status] || 'default'}>{loan.status}</Badge>],
          ['Purpose', loan.purpose || '—'],
          ['Notes', loan.notes || '—'],
        ].map(([label, value]) => (
          <div key={label} className="flex items-start justify-between px-5 py-3 text-sm">
            <span className="text-gray-400 font-medium w-40 flex-shrink-0">{label}</span>
            <span className="text-gray-900 text-right">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
