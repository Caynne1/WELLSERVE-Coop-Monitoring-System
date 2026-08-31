function inPaymentPeriod(value, from, to) {
  if (!from && !to) return true;
  if (!value) return false;
  const day = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(day + 'T00:00:00Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) return false;
  return (!from || day >= from) && (!to || day <= to);
}

export function loanInterestForPeriod(loans = [], interestPayments = [], { from = null, to = null } = {}) {
  const loanIds = new Set(loans.map(loan => loan.id));
  const payments = interestPayments.filter(tx => tx.type === 'loan_interest' && loanIds.has(tx.loan_id));
  // Determine ownership from all periods so another year's receipt cannot cause a schedule fallback.
  const invoiceLoanIds = new Set(payments.map(tx => tx.loan_id));
  let total = payments.reduce((sum, tx) =>
    sum + (inPaymentPeriod(tx.transaction_date, from, to) ? Number(tx.amount || 0) : 0), 0);

  // Preserve legacy schedule reporting only for loans without explicit interest transactions.
  for (const loan of loans) {
    if (invoiceLoanIds.has(loan.id)) continue;
    try {
      const schedule = typeof loan.preview_schedule_json === 'string'
        ? JSON.parse(loan.preview_schedule_json) : (loan.preview_schedule_json || []);
      if (!Array.isArray(schedule)) continue;
      for (const row of schedule) {
        const paidDate = row.last_interest_paid_at || row.paid_at || row.last_partial_paid_at || null;
        if (!(row.paid || row.partial_paid) || !inPaymentPeriod(paidDate, from, to)) continue;
        const fullInterest = Number(row.interest || row.interest_amount || 0);
        const totalDue = Number(row.total_due || row.payment || ((row.principal || 0) + fullInterest));
        const proportionalInterest = totalDue > 0
          ? Math.min(fullInterest, fullInterest * (Number(row.paid_amount || 0) / totalDue)) : fullInterest;
        total += Number(
          (from || to) && row.last_interest_paid_amount != null ? row.last_interest_paid_amount
            : row.interest_paid_amount != null ? row.interest_paid_amount
              : row.paid ? fullInterest : proportionalInterest
        );
      }
    } catch { /* Preserve the existing malformed-schedule fallback. */ }
  }
  return Math.round(total * 100) / 100;
}
