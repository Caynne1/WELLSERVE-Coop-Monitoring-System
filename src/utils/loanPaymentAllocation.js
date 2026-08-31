const cents = value => Math.round((Number(value || 0) + Number.EPSILON) * 100);
const money = value => value / 100;

function amount(value) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) throw new Error('Payment amounts must be non-negative numbers.');
  return cents(number);
}

function normalize(row) {
  const principal = amount(row.principal);
  const interest = amount(row.interest ?? row.interest_amount);
  const paid = row.paid_amount != null ? amount(row.paid_amount)
    : row.paid ? principal + interest : amount(row.partial_paid_amount);
  let interestPaid = row.interest_paid_amount != null ? amount(row.interest_paid_amount)
    : row.paid ? interest : paid === 0 || interest === 0 ? 0 : null;
  let principalPaid = row.principal_paid_amount != null ? amount(row.principal_paid_amount)
    : interestPaid != null ? paid - interestPaid : null;
  if (interestPaid == null && principalPaid != null) interestPaid = paid - principalPaid;
  if (interestPaid == null || principalPaid == null) {
    throw new Error('A historical partial payment has no principal/interest split. Review that record before applying another payment.');
  }
  if (principalPaid < 0 || interestPaid < 0 || principalPaid > principal || interestPaid > interest) {
    throw new Error('The stored payment split does not match the loan schedule. Review the historical payment record.');
  }
  return refresh({ ...row, principal_paid_amount: money(principalPaid), interest_paid_amount: money(interestPaid),
    payment_allocations: (row.payment_allocations || []).map(item => ({ ...item })) });
}

function refresh(row) {
  const principalRemaining = Math.max(0, cents(row.principal) - cents(row.principal_paid_amount));
  const interestRemaining = Math.max(0, cents(row.interest ?? row.interest_amount) - cents(row.interest_paid_amount));
  const paid = cents(row.principal_paid_amount) + cents(row.interest_paid_amount);
  return { ...row, principal_remaining: money(principalRemaining), interest_remaining: money(interestRemaining),
    paid_amount: money(paid), remaining_due: money(principalRemaining + interestRemaining),
    paid: principalRemaining + interestRemaining === 0,
    partial_paid: paid > 0 && principalRemaining + interestRemaining > 0,
    partial_paid_amount: principalRemaining + interestRemaining > 0 ? money(paid) : 0 };
}

export function schedulePaymentBalances(schedule) {
  return schedule.reduce((totals, row) => {
    totals.principal += cents(row.principal_remaining);
    totals.interest += cents(row.interest_remaining);
    return totals;
  }, { principal: 0, interest: 0 });
}

export function applyLoanAllocation(schedule, allocation, paidAt) {
  const principal = amount(allocation.principal);
  const interest = amount(allocation.interest);
  const rows = schedule.map(normalize);
  const existing = rows.flatMap(row => row.payment_allocations).filter(item => allocation.paymentId && item.id === allocation.paymentId);
  if (existing.length) {
    if (existing.reduce((sum, item) => sum + cents(item.principal), 0) !== principal ||
        existing.reduce((sum, item) => sum + cents(item.interest), 0) !== interest) {
      throw new Error('This payment reference already has a different allocation.');
    }
    return rows;
  }
  const balance = schedulePaymentBalances(rows);
  if (principal > balance.principal) throw new Error('Principal payment exceeds the remaining principal balance.');
  if (interest > balance.interest) throw new Error('Interest payment exceeds the remaining scheduled interest.');
  let principalLeft = principal;
  let interestLeft = interest;
  // Apply each component independently, oldest installment first.
  return rows.map(row => {
    const principalNow = Math.min(principalLeft, cents(row.principal_remaining));
    const interestNow = Math.min(interestLeft, cents(row.interest_remaining));
    principalLeft -= principalNow;
    interestLeft -= interestNow;
    if (!principalNow && !interestNow) return row;
    const updated = refresh({ ...row,
      principal_paid_amount: money(cents(row.principal_paid_amount) + principalNow),
      interest_paid_amount: money(cents(row.interest_paid_amount) + interestNow),
    });
    if (allocation.paymentId) updated.payment_allocations.push({ id: allocation.paymentId,
      principal: money(principalNow), interest: money(interestNow), paid_at: paidAt });
    updated.paid_at = updated.paid ? paidAt : null;
    updated.last_partial_paid_at = updated.partial_paid ? paidAt : row.last_partial_paid_at;
    if (interestNow > 0) {
      updated.last_interest_paid_amount = money(interestNow);
      updated.last_interest_paid_at = paidAt;
    }
    return updated;
  });
}

export function reverseLoanAllocation(schedule, allocation) {
  const rows = schedule.map(normalize);
  const tracked = rows.flatMap(row => row.payment_allocations).filter(item => allocation.paymentId && item.id === allocation.paymentId);
  let principalLeft = amount(allocation.principal);
  let interestLeft = amount(allocation.interest);
  if (tracked.length && (tracked.reduce((sum, item) => sum + cents(item.principal), 0) !== principalLeft ||
      tracked.reduce((sum, item) => sum + cents(item.interest), 0) !== interestLeft)) {
    throw new Error('The invoice amounts do not match its stored loan allocation.');
  }
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    const matches = row.payment_allocations.filter(item => allocation.paymentId && item.id === allocation.paymentId);
    // Untagged historical payments may only reverse untagged amounts, not later receipts.
    const availablePrincipal = tracked.length ? matches.reduce((sum, item) => sum + cents(item.principal), 0)
      : Math.max(0, cents(row.principal_paid_amount) - row.payment_allocations.reduce((sum, item) => sum + cents(item.principal), 0));
    const availableInterest = tracked.length ? matches.reduce((sum, item) => sum + cents(item.interest), 0)
      : Math.max(0, cents(row.interest_paid_amount) - row.payment_allocations.reduce((sum, item) => sum + cents(item.interest), 0));
    const principalNow = Math.min(principalLeft, availablePrincipal);
    const interestNow = Math.min(interestLeft, availableInterest);
    principalLeft -= principalNow;
    interestLeft -= interestNow;
    if (!principalNow && !interestNow) continue;
    rows[i] = refresh({ ...row,
      principal_paid_amount: money(cents(row.principal_paid_amount) - principalNow),
      interest_paid_amount: money(cents(row.interest_paid_amount) - interestNow),
      payment_allocations: tracked.length ? row.payment_allocations.filter(item => item.id !== allocation.paymentId) : row.payment_allocations,
      paid_at: null,
      last_interest_paid_amount: interestNow ? 0 : row.last_interest_paid_amount,
    });
    if (!rows[i].paid_amount) rows[i].last_partial_paid_at = null;
  }
  if (principalLeft || interestLeft) throw new Error('The payment could not be safely reversed from the stored schedule.');
  return rows;
}
