import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit2, ChevronDown, ChevronUp, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import { getLoanById } from '../../services/loanService';
import { getTransactionsByMemberId } from '../../services/transactionService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  buildScheduleByFrequency,
  computePaymentByFrequency,
  frequencyPeriodLabel,
  computeDisplayPeriods,
} from '../../utils/loanCalculator';

const statusVariant = {
  active:    'success',
  ongoing:   'success',
  paid:      'info',
  defaulted: 'danger',
  pending:   'warning',
};

const FREQ_LABEL = {
  weekly:    'Weekly',
  monthly:   'Monthly',
  quarterly: 'Quarterly',
  chattel:   'Chattel',
};

export default function LoanDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loan, setLoan]             = useState(null);
  const [loading, setLoading]       = useState(true);

  // Loan payment transaction count for this specific loan
  const [paymentCount, setPaymentCount] = useState(0);

  // Schedule section is collapsed by default
  const [scheduleOpen, setScheduleOpen] = useState(false);

  useEffect(() => {
    getLoanById(id)
      .then(async data => {
        setLoan(data);
        // Count loan_payment transactions for this loan — view layer only
        if (data.member_id) {
          const txs = await getTransactionsByMemberId(data.member_id).catch(() => []);
          const count = txs.filter(
            tx => tx.loan_id === id && tx.type === 'loan_payment'
          ).length;
          setPaymentCount(count);
        }
      })
      .catch(() => { toast.error('Loan not found'); navigate('/loans'); })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex justify-center py-24"><Spinner /></div>;

  const freq          = loan.repayment_frequency || 'monthly';
  const displayPeriods = computeDisplayPeriods(loan.term_months || 0, freq);
  const suggested     = computePaymentByFrequency(
    parseFloat(loan.monthly_amortization) || 0, freq
  );

  // Build schedule for the view — no DB write, no balance update
  const { schedule, isManual } = loan.amount && loan.term_months
    ? buildScheduleByFrequency(
        loan.amount,
        (parseFloat(loan.interest_rate) || 0) / 100,
        loan.term_months,
        loan.release_date ? new Date(loan.release_date) : new Date(),
        freq
      )
    : { schedule: [], isManual: false };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <button
        onClick={() => navigate('/loans')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors"
      >
        <ArrowLeft size={16} /> Back to Loans
      </button>

      <PageHeader
        title={`Loan ${loan.loan_no || ''}`}
        subtitle={`${loan.members?.first_name} ${loan.members?.last_name}`}
        action={
          <Button icon={<Edit2 size={14} />} onClick={() => navigate(`/loans/${id}/edit`)}>
            Edit
          </Button>
        }
      />

      {/* ── Existing detail rows — unchanged ── */}
      <div className="mt-6 bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
        {[
          ['Member',               `${loan.members?.first_name} ${loan.members?.last_name}`],
          ['Member No.',           loan.members?.member_no || '—'],
          ['Loan Amount',          formatCurrency(loan.amount)],
          ['Outstanding Balance',  formatCurrency(loan.balance ?? loan.amount)],
          ['Interest Rate',        loan.interest_rate ? `${loan.interest_rate}% p.a.` : '—'],
          ['Term',                 loan.term_months ? `${loan.term_months} months` : '—'],
          ['Monthly Amortization', formatCurrency(loan.monthly_amortization)],
          ['Release Date',         formatDate(loan.release_date)],
          ['Due Date',             formatDate(loan.due_date)],
          ['Status',               <Badge key="s" variant={statusVariant[loan.status] || 'default'}>{loan.status}</Badge>],
          ['Repayment Frequency',  FREQ_LABEL[freq] || freq],
          ['Purpose',              loan.purpose || '—'],
          ['Notes',                loan.notes   || '—'],
        ].map(([label, value]) => (
          <div key={label} className="flex items-start justify-between px-5 py-3 text-sm">
            <span className="text-gray-400 font-medium w-44 flex-shrink-0">{label}</span>
            <span className="text-gray-900 text-right">{value}</span>
          </div>
        ))}
      </div>

      {/* ── Repayment Schedule — view layer only ── */}
      <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Collapsible header */}
        <button
          onClick={() => setScheduleOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-4 text-sm
            hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Calendar size={15} className="text-gray-400" />
            <span className="font-semibold text-gray-700">Repayment Schedule</span>
            <span className="text-xs text-gray-400">
              ({FREQ_LABEL[freq]} · view only)
            </span>
          </div>
          <div className="flex items-center gap-3">
            {paymentCount > 0 && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                ~{paymentCount} payment{paymentCount !== 1 ? 's' : ''} made
              </span>
            )}
            {scheduleOpen
              ? <ChevronUp size={16} className="text-gray-400" />
              : <ChevronDown size={16} className="text-gray-400" />}
          </div>
        </button>

        {scheduleOpen && (
          <div className="border-t border-gray-100">
            {/* Chattel — manual schedule notice */}
            {isManual ? (
              <div className="px-5 py-6 text-center">
                <p className="text-sm font-medium text-amber-700">Chattel Loan</p>
                <p className="text-xs text-gray-400 mt-1">
                  Repayment schedule is manually arranged between the cooperative and the member.
                  No computed schedule is available for chattel loans.
                </p>
              </div>
            ) : schedule.length === 0 ? (
              <div className="px-5 py-6 text-center">
                <p className="text-xs text-gray-400">
                  Not enough loan data to generate a schedule.
                  Ensure amount, interest rate, term, and release date are all set.
                </p>
              </div>
            ) : (
              <>
                {/* Schedule summary row */}
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex flex-wrap gap-4 text-xs text-gray-600">
                  <span>
                    <span className="font-medium text-gray-800">{displayPeriods}</span>
                    {' '}{frequencyPeriodLabel(freq)}s
                  </span>
                  <span>
                    Suggested payment:{' '}
                    <span className="font-medium text-gray-800">
                      {suggested !== null ? formatCurrency(suggested) : '—'}
                    </span>
                    {' '}/ {frequencyPeriodLabel(freq)}
                  </span>
                  <span className="ml-auto text-gray-400 italic">
                    Balances are estimated — actual balance is always from the ledger.
                  </span>
                </div>

                {/* Schedule table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        {['#', 'Due Date', 'Payment', 'Principal', 'Interest', 'Est. Balance', ''].map(h => (
                          <th
                            key={h}
                            className="px-4 py-2.5 text-left font-semibold text-gray-400 uppercase tracking-wide"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {schedule.map((row, idx) => {
                        // Estimate paid periods by count — not matched to specific dates
                        const isPaid = idx < paymentCount;
                        return (
                          <tr
                            key={row.period}
                            className={`transition-colors ${
                              isPaid
                                ? 'bg-green-50/50 text-gray-400'
                                : 'hover:bg-gray-50/60 text-gray-700'
                            }`}
                          >
                            <td className="px-4 py-2.5 font-mono text-gray-400">
                              {row.period}
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              {formatDate(row.dueDate)}
                            </td>
                            <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                              {formatCurrency(row.payment)}
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              {formatCurrency(row.principal)}
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              {formatCurrency(row.interest)}
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              {formatCurrency(row.balance)}
                            </td>
                            <td className="px-4 py-2.5">
                              {isPaid && (
                                <span className="text-green-600 font-medium">✓</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="px-5 py-2.5 border-t border-gray-100 bg-gray-50/50">
                  <p className="text-xs text-gray-400">
                    ✓ rows are estimated paid based on {paymentCount} recorded loan payment
                    transaction{paymentCount !== 1 ? 's' : ''}.
                    Actual repayment history is in the Transactions tab on the member profile.
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}