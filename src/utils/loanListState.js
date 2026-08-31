const RELEASED_STATUSES = new Set(['released', 'active', 'ongoing', 'partial', 'overdue', 'delinquent', 'defaulted', 'paid']);

export function parseLoanJSON(value, fallback = {}) {
  try {
    return typeof value === 'string' ? JSON.parse(value) ?? fallback : value ?? fallback;
  } catch {
    return fallback;
  }
}

export function normalizeLoanStatus(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'pending') return 'draft';
  if (['ongoing', 'partial'].includes(value)) return 'active';
  if (['defaulted', 'overdue'].includes(value)) return 'delinquent';
  return value || 'draft';
}

export function isLoanReleased(loan) {
  // release_date may be planned; only the persisted workflow status establishes release.
  return RELEASED_STATUSES.has(String(loan?.status || '').toLowerCase());
}

export function isLoanWorkflowLocked(loan) {
  return isLoanReleased(loan) || String(loan?.approval_status || '').toLowerCase() === 'released';
}

export function getLoanApprovalStage(loan) {
  if (isLoanWorkflowLocked(loan)) return 'released';
  return normalizeLoanStatus(loan?.status || loan?.approval_status);
}

export function getLoanTypeLabel(loan) {
  const summary = parseLoanJSON(loan?.preview_summary_json);
  const type = loan?.loan_type || summary.loan_type
    || (['weekly', 'monthly_old', 'semi_monthly_old'].includes(loan?.repayment_frequency) ? 'existing' : 'new');
  return type === 'existing' ? 'Old Loan' : 'New Loan';
}

export function getLoanRecordDate(loan) {
  if (isLoanReleased(loan) && loan.release_date) return { label: 'Released', date: loan.release_date };
  const approvalDate = loan.approval_date || loan.approved_at;
  if (normalizeLoanStatus(loan.status) === 'approved' && approvalDate) {
    return { label: 'Approved', date: approvalDate };
  }
  if (loan.release_date) return { label: 'Planned Release', date: loan.release_date };
  if (loan.application_date) return { label: 'Applied', date: loan.application_date };
  return null;
}

export function getLoanBalanceWithInterest(loan) {
  const summary = parseLoanJSON(loan?.preview_summary_json, {});
  const schedule = parseLoanJSON(loan?.preview_schedule_json, []);
  if (Array.isArray(schedule) && schedule.length > 0) {
    const rowTotal = row => Number(
      row?.total_due ??
      row?.payment ??
      ((Number(row?.principal) || 0) + (Number(row?.interest ?? row?.interest_amount) || 0))
    ) || 0;
    const scheduledTotal = schedule.reduce((sum, row) => sum + rowTotal(row), 0);
    const remaining = schedule
      .filter(row => !row?.paid)
      .reduce((sum, row) => sum + (Number(row?.remaining_due ?? rowTotal(row)) || 0), 0);

    if (remaining <= 0) return 0;

    // Keep the exact summary total while schedule rows remain individually rounded.
    const payable = Number(summary?.total_loan_payable ?? loan?.total_loan_payable) || 0;
    const roundingAdjustment = payable > 0 ? payable - scheduledTotal : 0;
    return Math.max(0, remaining + roundingAdjustment);
  }

  const rawBalance = Number(loan?.balance ?? loan?.amount) || 0;
  if (rawBalance <= 0) return 0;

  const principal = Number(loan?.amount) || 0;
  const payable = Number(summary?.total_loan_payable ?? loan?.total_loan_payable) || 0;
  if (payable > principal && principal > 0) {
    const totalInterest = payable - principal;
    return Math.max(0, rawBalance + (totalInterest * (rawBalance / principal)));
  }

  return rawBalance;
}


const money = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export function getLoanFinancials(loan) {
  const summary = parseLoanJSON(loan?.preview_summary_json);
  const schedule = parseLoanJSON(loan?.preview_schedule_json, []);
  const amount = money(loan?.amount);
  const scheduledInterest = Array.isArray(schedule)
    ? schedule.reduce((sum, row) => sum + (Number(row.interest ?? row.interest_amount) || 0), 0)
    : 0;
  const savedPayable = summary.total_loan_payable ?? loan?.total_loan_payable;
  const interest = money(summary.total_interest_earned ?? summary.total_interest
    ?? (scheduledInterest || Math.max(0, (Number(savedPayable) || amount) - amount)));
  const payable = money(savedPayable ?? amount + interest);
  const balance = money(getLoanBalanceWithInterest(loan));
  return { amount, interest, payable, paid: money(Math.max(0, payable - balance)), balance };
}

export function getLoanDueState(loan, now = new Date()) {
  const empty = { dueDate: null, diffDays: null };
  if (!isLoanReleased(loan) || normalizeLoanStatus(loan.status) === 'paid'
    || getLoanBalanceWithInterest(loan) <= 0) return empty;

  const schedule = parseLoanJSON(loan.preview_schedule_json, []);
  const hasSchedule = Array.isArray(schedule) && schedule.length > 0;
  const nextDue = hasSchedule ? schedule.find(row => {
    if (row.paid) return false;
    const total = Number(row.total_due ?? row.payment
      ?? ((Number(row.principal) || 0) + (Number(row.interest ?? row.interest_amount) || 0))) || 0;
    return Number(row.remaining_due ?? Math.max(0, total - (Number(row.paid_amount) || 0))) > 0;
  }) : null;
  const dueDate = hasSchedule ? nextDue?.due_date : loan.due_date;
  if (!dueDate) return empty;
  const due = new Date(String(dueDate).split('T')[0] + 'T00:00:00');
  if (Number.isNaN(due.getTime())) return empty;
  const dueDay = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return { dueDate, diffDays: Math.round((dueDay - today) / 86400000) };
}

export function getLoanWorkflowTarget(loan) {
  const status = normalizeLoanStatus(loan?.status);
  if (status === 'draft') return 'credit_committee_approval';
  if (status === 'credit_committee_approval') return 'approved';
  return null;
}
