const money = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export function installmentTotal(row) {
  return money(row.total_due ?? row.payment
    ?? (Number(row.principal || 0) + Number(row.interest ?? row.interest_amount ?? 0)));
}

export function installmentPaid(row) {
  return money(row.paid_amount ?? (row.paid ? installmentTotal(row) : row.partial_paid_amount ?? 0));
}

export function installmentRemaining(row) {
  if (row.paid) return 0;
  return money(Math.max(0, row.remaining_due ?? (installmentTotal(row) - installmentPaid(row))));
}

export function installmentStatus(row, released = false, now = new Date()) {
  if (row.paid || (installmentTotal(row) > 0 && installmentRemaining(row) <= 0)) return 'Paid';
  const due = new Date(String(row.due_date || '').split('T')[0] + 'T00:00:00');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (released && installmentRemaining(row) > 0 && due < today) return 'Overdue';
  return installmentPaid(row) > 0 ? 'Partial' : 'Unpaid';
}

export function scheduleCollections(schedule = []) {
  let total = 0;
  let interest = 0;
  let splitKnown = true;
  for (const row of schedule) {
    const paid = installmentPaid(row);
    total += paid;
    if (paid <= 0) continue;
    const storedInterest = row.interest_paid_amount;
    if (storedInterest != null) {
      interest += Number(storedInterest) || 0;
    } else if (row.paid || paid >= installmentTotal(row)) {
      interest += Number(row.interest ?? row.interest_amount ?? 0);
    } else if (Number(row.interest ?? row.interest_amount ?? 0) > 0) {
      // A partial payment without its recorded split must not invent interest collected.
      splitKnown = false;
    }
  }
  return {
    total: money(total),
    principal: splitKnown ? money(total - interest) : null,
    interest: splitKnown ? money(interest) : null,
  };
}

export function memberLoanCollections(loan, transactions = [], schedule = []) {
  const payments = transactions.filter(tx => tx.loan_id === loan.id
    && ['loan_payment', 'loan_interest'].includes(tx.type)
    && !['void', 'voided', 'cancelled', 'canceled'].includes(String(tx.status || '').toLowerCase()));
  if (!payments.length) return { ...scheduleCollections(schedule), source: 'schedule' };
  const principal = money(payments.filter(tx => tx.type === 'loan_payment').reduce((sum, tx) => sum + Number(tx.amount || 0), 0));
  const interest = money(payments.filter(tx => tx.type === 'loan_interest').reduce((sum, tx) => sum + Number(tx.amount || 0), 0));
  const tracked = scheduleCollections(schedule);
  if (tracked.total > money(principal + interest) + 0.01) {
    // Imported history may predate the ledger. Do not drop it or guess its split.
    return { total: tracked.total, principal: null, interest: null, source: 'schedule' };
  }
  return { principal, interest, total: money(principal + interest), source: 'transactions' };
}

export function loanFrequencyLabel(value) {
  const labels = {
    weekly: 'Weekly', weekly_old: 'Weekly', weekly_new: 'Weekly',
    semi_monthly: 'Semi-monthly', semi_monthly_old: 'Semi-monthly',
    monthly: 'Monthly', monthly_old: 'Monthly', quarterly: 'Quarterly',
    yearly: 'Yearly', chattel: 'Chattel',
  };
  return labels[value] || 'Per installment';
}
