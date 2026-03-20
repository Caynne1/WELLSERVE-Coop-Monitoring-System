import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';
import { getAccountById } from '../../services/accountService';
import { formatCurrency, formatDate } from '../../utils/formatters';

export default function AccountDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAccountById(id)
      .then(setAccount)
      .catch(() => { toast.error('Account not found'); navigate('/'); })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex justify-center py-24"><Spinner /></div>;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <button onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors">
        <ArrowLeft size={16} /> Back
      </button>
      <PageHeader title={`${account.account_type?.toUpperCase()} Account`}
        subtitle={`${account.members?.first_name} ${account.members?.last_name}`} />
      <div className="mt-6 bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
        {[
          ['Account No.', account.account_no || '—'],
          ['Type', account.account_type?.toUpperCase() || '—'],
          ['Balance', formatCurrency(account.balance)],
          ['Total Deposits', formatCurrency(account.total_deposits)],
          ['Total Withdrawals', formatCurrency(account.total_withdrawals)],
          ['Status', <Badge key="s" variant={account.status === 'active' ? 'success' : 'warning'}>{account.status}</Badge>],
          ['Opened', formatDate(account.created_at)],
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
