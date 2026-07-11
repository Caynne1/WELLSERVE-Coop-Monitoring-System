import { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';

function interestColLabel(freq) {
  switch (freq) {
    case 'weekly': return 'Weekly';
    case 'semi_monthly': return 'Quencena';
    case 'monthly': return 'Monthly';
    case 'chattel': return 'Chattel';
    case 'quarterly': return 'Quarterly';
    case 'yearly': return 'Yearly';
    default: return 'Interest';
  }
}

function StatusPill({ paid, paidAmount, totalDue }) {
  if (paid) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">
        <CheckCircle size={10} /> Paid
      </span>
    );
  }

  if (paidAmount > 0 && paidAmount < totalDue) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">
        <AlertCircle size={10} /> Partial
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500">
      <XCircle size={10} /> Unpaid
    </span>
  );
}

export default function LoanScheduleTable({
  schedule = [],
  frequency = 'monthly',
  compact = false,
  defaultOpen = true,
  showPaymentTracking = false,
  title = 'Amortization Schedule',
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (!schedule || schedule.length === 0) return null;

  const freqLabel = interestColLabel(frequency);
  const totalPrincipalAmort = schedule.reduce((s, r) => s + (r.principal || 0), 0);
  const totalInterest = schedule.reduce((s, r) => s + (r.interest || 0), 0);
  const totalLoanPayment = schedule.reduce((s, r) => s + (r.payment || 0), 0);
  const paidCount = schedule.filter(r => r.paid).length;
  const totalPaidAmount = schedule.reduce((s, r) => s + (r.paid_amount || 0), 0);

  const textSize = compact ? 'text-[11px]' : 'text-xs';
  const cellPad = compact ? 'px-2 py-1.5' : 'px-3 py-2';
  const headerPad = compact ? 'px-2 py-1.5' : 'px-3 py-2.5';

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-gray-700`}>{title}</span>
          <span className="text-[10px] text-gray-400 uppercase tracking-wide">
            {schedule.length} payments | {paidCount} paid
          </span>
        </div>
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 overflow-x-auto">
          <table className={`w-full ${textSize}`}>
            <thead>
              <tr className="bg-[#07A04E] text-white">
                <th className={`${headerPad} text-left font-semibold whitespace-nowrap`}>No.</th>
                <th className={`${headerPad} text-right font-semibold whitespace-nowrap`}>Principal</th>
                <th className={`${headerPad} text-right font-semibold whitespace-nowrap`}>Principal Amort.</th>
                <th className={`${headerPad} text-right font-semibold whitespace-nowrap`}>{freqLabel}</th>
                <th className={`${headerPad} text-left font-semibold whitespace-nowrap`}>Due Date</th>
                {showPaymentTracking && (
                  <th className={`${headerPad} text-right font-semibold whitespace-nowrap bg-blue-600`}>Paid</th>
                )}
                <th className={`${headerPad} text-center font-semibold whitespace-nowrap`}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {schedule.map((row, idx) => {
                const loanTotal = row.payment || (row.principal + row.interest);

                return (
                  <tr
                    key={row.period || idx}
                    className={`hover:bg-gray-50/60 ${row.paid ? 'text-gray-400' : 'text-gray-700'}`}
                  >
                    <td className={`${cellPad} font-mono font-medium`}>{row.period}</td>
                    <td className={`${cellPad} text-right`}>{formatCurrency(row.balance || 0)}</td>
                    <td className={`${cellPad} text-right`}>{formatCurrency(row.principal || 0)}</td>
                    <td className={`${cellPad} text-right`}>{formatCurrency(row.interest || 0)}</td>
                    <td className={`${cellPad} text-left whitespace-nowrap`}>{formatDate(row.due_date) || '-'}</td>
                    {showPaymentTracking && (
                      <td className={`${cellPad} text-right bg-blue-50/50 ${row.paid_amount > 0 ? 'font-medium text-blue-700' : ''}`}>
                        {(row.paid_amount || 0) > 0 ? formatCurrency(row.paid_amount) : '-'}
                      </td>
                    )}
                    <td className={`${cellPad} text-center`}>
                      <StatusPill paid={row.paid} paidAmount={row.paid_amount || 0} totalDue={loanTotal} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold text-gray-700">
                <td className={`${cellPad}`} colSpan={2}>Totals ({schedule.length} payments)</td>
                <td className={`${cellPad} text-right`}>{formatCurrency(totalPrincipalAmort)}</td>
                <td className={`${cellPad} text-right`}>{formatCurrency(totalInterest)}</td>
                <td className={`${cellPad}`}></td>
                {showPaymentTracking && (
                  <td className={`${cellPad} text-right bg-blue-50/50 text-blue-700`}>{totalPaidAmount > 0 ? formatCurrency(totalPaidAmount) : '-'}</td>
                )}
                <td className={`${cellPad} text-center`}>
                  <span className="text-[10px] text-gray-400">{paidCount}/{schedule.length}</span>
                </td>
              </tr>
            </tfoot>
          </table>

          <div className="px-4 py-2.5 border-t border-gray-100 bg-emerald-50/50 flex flex-wrap gap-x-6 gap-y-1">
            <span className={textSize}><span className="text-gray-400">Principal Collected:</span> <strong className="text-gray-700">{formatCurrency(totalPrincipalAmort)}</strong></span>
            <span className={textSize}><span className="text-gray-400">Interest Earned:</span> <strong className="text-emerald-700">{formatCurrency(totalInterest)}</strong></span>
            <span className={textSize}><span className="text-gray-400">Total Collected:</span> <strong className="text-gray-700">{formatCurrency(totalLoanPayment)}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}
