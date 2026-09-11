import { installmentPaid, installmentPresentation, installmentRemaining, installmentTotal } from './loanPaymentDisplay.js';
import { getLoanProductCode, getLoanProductLabel } from './loanProducts.js';
import { isLoanReleased, parseLoanJSON } from './loanListState.js';

const DAY_MS = 86400000;
const money = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

function dayNumber(value) {
  const match = String(value || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS;
}

function todayNumber(now) {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS;
}

function remainingComponent(row, component) {
  const scheduled = Number(row?.[component] ?? (component === 'interest' ? row?.interest_amount : 0)) || 0;
  const paid = Number(row?.[`${component}_paid_amount`] || 0);
  return money(Math.max(0, scheduled - paid));
}

export function buildLoanCollectionRows(loans = [], now = new Date()) {
  const today = todayNumber(now);

  return loans.flatMap(loan => {
    if (!isLoanReleased(loan)) return [];
    const schedule = parseLoanJSON(loan.preview_schedule_json, []);
    if (!Array.isArray(schedule)) return [];

    return schedule.flatMap((row, index) => {
      const remainingDue = installmentRemaining(row);
      if (remainingDue <= 0) return [];

      const dueDay = dayNumber(row.due_date);
      if (dueDay == null) return [];
      const presentation = installmentPresentation(row, schedule, true, now);
      const amountApplied = installmentPaid(row);
      const diffDays = dueDay - today;
      let collectionStatus = diffDays < 0 ? 'overdue' : diffDays === 0 ? 'due_today' : 'upcoming';
      if (presentation.status === 'Missed') collectionStatus = 'missed';
      else if (amountApplied > 0) collectionStatus = 'partial';

      return [{
        id: `${loan.id}:${row.period ?? index + 1}`,
        loanId: loan.id,
        memberId: loan.member_id,
        member: loan.members || null,
        loanProductCode: getLoanProductCode(loan),
        loanProduct: getLoanProductLabel(loan),
        period: String(row.period ?? index + 1),
        dueDate: String(row.due_date).slice(0, 10),
        scheduledAmount: installmentTotal(row),
        principalDue: remainingComponent(row, 'principal'),
        interestDue: remainingComponent(row, 'interest'),
        amountApplied,
        remainingDue,
        collectionStatus,
        daysOverdue: diffDays < 0 ? Math.abs(diffDays) : 0,
        daysUntilDue: diffDays > 0 ? diffDays : 0,
        lastPaymentDate: presentation.paidAt || null,
      }];
    });
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate)
    || String(a.member?.last_name || '').localeCompare(String(b.member?.last_name || '')));
}

export function collectionStatusLabel(status) {
  return {
    due_today: 'Due Today',
    upcoming: 'Upcoming',
    overdue: 'Overdue',
    missed: 'Missed',
    partial: 'Partially Paid',
  }[status] || 'Unpaid';
}
