import { installmentPresentation } from './loanPaymentDisplay.js';
import { isLoanReleased, parseLoanJSON } from './loanListState.js';

const money = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

function day(value) {
  const match = String(value || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function computeScheduledLoanPerformance(loans = [], transactions = [], now = new Date()) {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const performance = {
    dueInstallments: 0,
    paidOnTime: 0,
    paidLate: 0,
    missed: 0,
    overdue: 0,
    timingUnknown: 0,
    balancePayments: 0,
    balancePaymentAmount: 0,
    onTimeRate: 0,
  };
  const balanceReceipts = new Set();

  for (const loan of loans) {
    const schedule = parseLoanJSON(loan.preview_schedule_json, []);
    if (!Array.isArray(schedule)) continue;
    const loanTransactions = transactions.filter(transaction => transaction.loan_id === loan.id);

    schedule.forEach((row, index) => {
      const dueDay = day(row.due_date);
      const presentation = installmentPresentation(row, schedule, isLoanReleased(loan), now, loanTransactions);
      if (dueDay != null && (dueDay <= today || presentation.status === 'Paid')) {
        performance.dueInstallments += 1;
        if (presentation.status === 'Paid') {
          const paidDay = day(presentation.paidAt);
          if (paidDay == null) performance.timingUnknown += 1;
          else if (paidDay <= dueDay) performance.paidOnTime += 1;
          else performance.paidLate += 1;
        } else if (presentation.status === 'Missed') {
          performance.missed += 1;
        } else if (['Overdue', 'Partially Paid'].includes(presentation.status)) {
          performance.overdue += 1;
        }
      }

      for (const allocation of row.payment_allocations || []) {
        if (allocation.application_type !== 'balance') continue;
        const receiptKey = `${loan.id}:${allocation.id || `${index}:${allocation.paid_at || ''}`}`;
        if (balanceReceipts.has(receiptKey)) continue;
        balanceReceipts.add(receiptKey);
        performance.balancePayments += 1;
        performance.balancePaymentAmount += Number(allocation.receipt_total
          ?? (Number(allocation.receipt_principal || 0) + Number(allocation.receipt_interest || 0))) || 0;
      }
    });
  }

  const ratedInstallments = performance.paidOnTime + performance.paidLate
    + performance.missed + performance.overdue;
  performance.balancePaymentAmount = money(performance.balancePaymentAmount);
  performance.onTimeRate = ratedInstallments > 0
    ? Math.round((performance.paidOnTime / ratedInstallments) * 100)
    : 0;
  return performance;
}
