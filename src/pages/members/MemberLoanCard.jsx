import { useState } from 'react';
import { Wallet, PieChart, Percent, CreditCard, ChevronDown, ChevronUp } from 'lucide-react';
import LoanScheduleTable from '../../components/shared/LoanScheduleTable';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { parseLoanJSON as parseJSONSafe, getLoanFinancials, getLoanRecordDate, isLoanReleased } from '../../utils/loanListState';
import { installmentRemaining, installmentStatus, loanFrequencyLabel, memberLoanCollections } from '../../utils/loanPaymentDisplay';

export default function MemberLoanCard({ loan, navigate, onPay, paymentCount, transactions = [] }) {
  const [showSchedule, setShowSchedule] = useState(false);
  const statusColors = {
    released: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    active: 'text-blue-700 bg-blue-50 border-blue-200',
    paid: 'text-green-700 bg-green-50 border-green-200',
    defaulted: 'text-red-700 bg-red-50 border-red-200',
    pending: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  };

  const summary = parseJSONSafe(loan.preview_summary_json, {});
  const parsedSchedule = parseJSONSafe(loan.preview_schedule_json, []);
  const schedule = Array.isArray(parsedSchedule) ? parsedSchedule : [];
  const nextDue = schedule.find(row => installmentRemaining(row) > 0);
  const collections = memberLoanCollections(loan, transactions, schedule);
  const financials = getLoanFinancials(loan);
  const principalBalance = collections.principal == null ? null
    : !schedule.length && collections.source === 'schedule' ? Number(loan.balance ?? loan.amount ?? 0)
    : Math.max(0, financials.amount - collections.principal);
  const outstanding = collections.source === 'transactions'
    ? Math.max(0, financials.payable - collections.total) : financials.balance;
  const recordDate = getLoanRecordDate(loan);
  const released = isLoanReleased(loan);
  const paidCount = schedule.filter(row => installmentStatus(row) === 'Paid').length;
  const displayStatus = String(loan.status || 'draft').replace(/_/g, ' ');

  return (
    <div className="min-w-0">
      <div
        className="relative grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-center gap-6 rounded-lg border border-gray-200 bg-white p-5 sm:p-6 shadow-sm hover:border-emerald-200 cursor-pointer transition-colors"
        onClick={() => navigate(`/loans/${loan.id}`)}
      >
        <div className="flex items-start gap-4 sm:gap-5 min-w-0 pt-7 lg:pt-0">
          <div className="hidden sm:flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            <Wallet size={34} strokeWidth={1.7} />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-gray-500 mb-1">Loan Amount</p>
            <p className="text-3xl font-bold text-gray-900 tabular-nums break-all">{formatCurrency(loan.amount || 0)}</p>
            <p className="text-sm text-gray-600 mt-2 leading-6">
              {recordDate && <>{recordDate.label}: {formatDate(recordDate.date)} <span className="text-emerald-600 px-1">&bull;</span> </>}
              {loanFrequencyLabel(loan.repayment_frequency)} <span className="text-emerald-600 px-1">&bull;</span> {schedule.length} installments
            </p>
            <p className="text-xs text-gray-500 mt-1">Payments recorded: {paymentCount}</p>
            {released && outstanding > 0 && nextDue && (
              <p className="text-sm text-orange-600 mt-2">
                Next Due: {formatDate(nextDue.due_date)} &bull; {formatCurrency(installmentRemaining(nextDue))}
              </p>
            )}
          </div>
        </div>

        <span className={`absolute right-5 top-4 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border font-medium capitalize ${statusColors[loan.status] || 'text-gray-600 bg-gray-100 border-gray-200'}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />{displayStatus}
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-0 border-t lg:border-t-0 border-gray-100 pt-5 lg:pt-8">
          {[
            { label: 'Principal Balance', value: principalBalance == null ? 'Not recorded' : formatCurrency(principalBalance), Icon: PieChart },
            { label: 'Total Interest', value: formatCurrency(financials.interest), Icon: Percent },
            { label: 'Total Payable', value: formatCurrency(financials.payable), Icon: CreditCard },
          ].map(({ label, value, Icon }) => (
            <div key={label} className="flex sm:flex-col items-center gap-3 sm:gap-2 sm:text-center sm:border-l border-gray-100 sm:px-3 min-w-0">
              <div className="h-11 w-11 flex-shrink-0 flex items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><Icon size={22} strokeWidth={1.7} /></div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-base font-semibold text-gray-900 tabular-nums mt-1 break-all">{value}</p>
              </div>
            </div>
          ))}
          <p className="sm:col-span-3 text-xs text-gray-500 sm:text-right mt-1">
            {released ? 'Outstanding (Principal + Interest)' : 'Scheduled Payable'}: <strong className="text-gray-700 tabular-nums">{formatCurrency(outstanding)}</strong>
          </p>
        </div>
      </div>

      {schedule.length > 0 && (
        <>
          <button
            onClick={e => { e.stopPropagation(); setShowSchedule(v => !v); }}
            className="w-full px-4 py-4 text-sm font-medium text-emerald-700 hover:text-emerald-900 flex items-center justify-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded-md"
          >
            {showSchedule ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            {showSchedule ? 'Hide' : 'View'} Amortization Schedule ({paidCount}/{schedule.length} paid)
          </button>

          {showSchedule && (
            <div className="min-w-0">
              <LoanScheduleTable
                schedule={schedule}
                frequency={loan.repayment_frequency || 'monthly'}
                loanAmount={loan.amount || 0}
                monthlyInterestRate={summary?.monthly_interest_rate ?? loan.interest_rate ?? 0}
                compact={false}
                memberLayout={true}
                defaultOpen={true}
                showPaymentTracking={true}
                released={released}
                collections={collections}
                title=""
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
