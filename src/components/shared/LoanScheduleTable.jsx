import { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle, XCircle, AlertCircle, Banknote, Percent, Wallet } from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { installmentPaid, installmentStatus, scheduleCollections } from '../../utils/loanPaymentDisplay';

function StatusPill({ status }) {
  if (status === 'Paid') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">
        <CheckCircle size={10} /> Paid
      </span>
    );
  }

  if (status === 'Overdue') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700">
        <AlertCircle size={10} /> Overdue
      </span>
    );
  }

  if (status === 'Partial') {
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
  loanAmount = 0,
  monthlyInterestRate = 0,
  compact = false,
  memberLayout = false,
  defaultOpen = true,
  showPaymentTracking = false,
  released = false,
  collections = null,
  title = 'Amortization Schedule',
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (!schedule || schedule.length === 0) return null;

  const displaySchedule = schedule.map((row, idx) => {
    const storedInterest = Number(row.interest ?? row.interest_amount ?? 0);
    const shouldComputeWeeklyInterest =
      frequency === 'weekly' &&
      storedInterest <= 0 &&
      Number(monthlyInterestRate || 0) > 0 &&
      Number(loanAmount || 0) > 0;

    if (!shouldComputeWeeklyInterest) {
      return { ...row, displayInterest: storedInterest };
    }

    const previousRow = idx > 0 ? schedule[idx - 1] : null;
    const beginningBalance = Number(
      row.beginning_balance ??
      previousRow?.balance ??
      previousRow?.ending_balance ??
      (idx === 0 ? loanAmount : 0)
    );
    const weeklyRate = Number(monthlyInterestRate || 0) / 100 / 4;
    const displayInterest = Math.round((beginningBalance * weeklyRate + Number.EPSILON) * 100) / 100;

    return {
      ...row,
      displayInterest,
    };
  });

  const rawTotalPrincipalAmort = displaySchedule.reduce((s, r) => s + (r.principal || 0), 0);
  const totalPrincipalAmort = frequency === 'weekly' && Number(loanAmount || 0) > 0 && Math.abs(rawTotalPrincipalAmort - Number(loanAmount || 0)) <= 0.1
    ? Number(loanAmount || 0)
    : rawTotalPrincipalAmort;
  const totalInterest = displaySchedule.reduce((s, r) => s + (r.displayInterest || 0), 0);
  const totalLoanPayment = totalPrincipalAmort + totalInterest;
  const paidCount = schedule.filter(r => installmentStatus(r) === 'Paid').length;
  const collected = collections ?? scheduleCollections(schedule);
  const collectedValue = value => value == null ? 'Not recorded' : formatCurrency(value);

  const textSize = memberLayout ? 'text-sm' : compact ? 'text-[11px]' : 'text-xs';
  const cellPad = memberLayout ? 'px-3 py-2.5' : compact ? 'px-2 py-1.5' : 'px-3 py-2';
  const headerPad = memberLayout ? 'px-3 py-3' : compact ? 'px-2 py-1.5' : 'px-3 py-2.5';

  return (
    <div className={memberLayout ? 'min-w-0 space-y-4' : 'bg-white rounded-xl border border-gray-200 overflow-hidden'}>
      {!memberLayout && <button
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
      </button>}

      {open && (
        <>
        <div className={memberLayout ? 'rounded-lg border border-gray-200 bg-white shadow-sm overflow-x-auto' : 'border-t border-gray-100 overflow-x-auto'}>
          <table className={`w-full ${textSize} tabular-nums`}>
            <thead>
              <tr className="bg-[#07A04E] text-white">
                <th className={`${headerPad} text-left font-semibold whitespace-nowrap`}>No.</th>
                <th className={`${headerPad} text-left font-semibold whitespace-nowrap`}>Due Date</th>
                <th className={`${headerPad} text-right font-semibold`}>Remaining Principal</th>
                <th className={`${headerPad} text-right font-semibold`}>Principal Payment</th>
                <th className={`${headerPad} text-right font-semibold whitespace-nowrap`}>Interest</th>
                {memberLayout && showPaymentTracking && <th className={`${headerPad} text-right font-semibold whitespace-nowrap`}>Amount Paid</th>}
                <th className={`${headerPad} text-center font-semibold`}>Payment Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {displaySchedule.map((row, idx) => {
                const paidAmount = installmentPaid(row);

                return (
                  <tr
                    key={row.period || idx}
                    className={`hover:bg-gray-50/60 ${row.paid ? 'text-gray-400' : 'text-gray-700'}`}
                  >
                    <td className={`${cellPad} font-mono font-medium`}>{row.period}</td>
                    <td className={`${cellPad} text-left whitespace-nowrap`}>{formatDate(row.due_date) || '-'}</td>
                    <td className={`${cellPad} text-right`}>{formatCurrency(row.balance || 0)}</td>
                    <td className={`${cellPad} text-right`}>{formatCurrency(row.principal || 0)}</td>
                    <td className={`${cellPad} text-right`}>{formatCurrency(row.displayInterest || 0)}</td>
                    {memberLayout && showPaymentTracking && <td className={`${cellPad} text-right`}>{formatCurrency(paidAmount)}</td>}
                    <td className={`${cellPad} text-center`}>
                      <StatusPill status={installmentStatus(row, released)} />
                      {!memberLayout && showPaymentTracking && paidAmount > 0 && (
                        <p className="mt-1 text-[10px] text-gray-500 whitespace-nowrap">{formatCurrency(paidAmount)} paid</p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-emerald-50/50 border-t border-gray-200 font-semibold text-gray-700">
                <td className={`${cellPad}`} colSpan={3}>Totals ({schedule.length} payments)</td>
                <td className={`${cellPad} text-right`}>{formatCurrency(totalPrincipalAmort)}</td>
                <td className={`${cellPad} text-right`}>{formatCurrency(totalInterest)}</td>
                {memberLayout && showPaymentTracking && <td className={`${cellPad} text-right`}>{formatCurrency(collected.total)}</td>}
                <td className={`${cellPad} text-center`}>
                  <span className="text-[10px] text-gray-400">{paidCount}/{schedule.length}</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

          <div className="px-4 py-2.5 border-t border-gray-100 bg-emerald-50/50 flex flex-wrap gap-x-6 gap-y-1">
            <span className={textSize}><span className="text-gray-500">Scheduled Principal:</span> <strong className="text-gray-700">{formatCurrency(totalPrincipalAmort)}</strong></span>
            <span className={textSize}><span className="text-gray-500">Scheduled Interest:</span> <strong className="text-gray-700">{formatCurrency(totalInterest)}</strong></span>
            <span className={textSize}><span className="text-gray-500">Total Payable:</span> <strong className="text-gray-700">{formatCurrency(totalLoanPayment)}</strong></span>
          </div>
          {showPaymentTracking && <div className={memberLayout ? 'grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-0 rounded-lg border border-emerald-100 bg-emerald-50/40 py-5 px-5 md:divide-x divide-emerald-100' : 'px-4 py-2.5 border-t border-gray-100 flex flex-wrap gap-x-6 gap-y-1'}>
            {[
              { label: 'Principal Collected:', value: collectedValue(collected.principal), Icon: Banknote },
              { label: 'Interest Collected:', value: collectedValue(collected.interest), Icon: Percent },
              { label: 'Total Collected:', value: formatCurrency(collected.total), Icon: Wallet },
            ].map(({ label, value, Icon }) => (
              <div key={label} className={memberLayout ? 'flex items-center md:justify-center gap-4 md:px-4 min-w-0' : textSize}>
                {memberLayout && <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-white border border-emerald-100 text-emerald-700"><Icon size={23} strokeWidth={1.7} /></span>}
                <div className={memberLayout ? 'text-sm min-w-0' : 'flex gap-1'}>
                  <span className="text-gray-500">{label}</span>
                  <strong className={memberLayout ? 'block text-base text-gray-800 mt-1 tabular-nums break-all' : 'text-gray-700'}>{value}</strong>
                </div>
              </div>
            ))}
          </div>}
        </>
      )}
    </div>
  );
}
