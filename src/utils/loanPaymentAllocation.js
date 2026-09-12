const cents = value => Math.round((Number(value || 0) + Number.EPSILON) * 100);
const money = value => value / 100;

function amount(value) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) throw new Error('Payment amounts must be non-negative numbers.');
  return cents(number);
}

function refresh(row) {
  const principalRemaining = Math.max(0, cents(row.principal) - cents(row.principal_paid_amount));
  const interestRemaining = Math.max(0, cents(row.interest ?? row.interest_amount) - cents(row.interest_paid_amount));
  const paid = cents(row.principal_paid_amount) + cents(row.interest_paid_amount);
  return {
    ...row,
    principal_remaining: money(principalRemaining),
    interest_remaining: money(interestRemaining),
    paid_amount: money(paid),
    remaining_due: money(principalRemaining + interestRemaining),
    paid: principalRemaining + interestRemaining === 0,
    partial_paid: paid > 0 && principalRemaining + interestRemaining > 0,
    partial_paid_amount: principalRemaining + interestRemaining > 0 ? money(paid) : 0,
  };
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
  return refresh({
    ...row,
    principal_paid_amount: money(principalPaid),
    interest_paid_amount: money(interestPaid),
    payment_allocations: (row.payment_allocations || []).map(item => ({ ...item })),
  });
}

export function reconcileSchedulePrincipal(schedule, expectedPrincipal) {
  const rows = (schedule || []).map(row => ({ ...row }));
  if (!rows.length) return rows;
  const expected = cents(expectedPrincipal);
  const scheduled = rows.reduce((sum, row) => sum + cents(row.principal), 0);
  const difference = expected - scheduled;
  // Only reconcile cent-level installment rounding. Larger differences may be
  // intentional imported data and must be reviewed instead of changed here.
  if (!expected || difference === 0 || Math.abs(difference) > 100) return rows;

  let targetIndex = rows.length - 1;
  while (targetIndex > 0 && rows[targetIndex].paid) targetIndex -= 1;
  const row = rows[targetIndex];
  const nextPrincipal = cents(row.principal) + difference;
  if (nextPrincipal < 0) return rows;

  const adjustment = money(difference);
  const next = { ...row, principal: money(nextPrincipal) };
  if (next.payment != null) next.payment = money(cents(next.payment) + difference);
  if (next.total_due != null) next.total_due = money(cents(next.total_due) + difference);
  if (!next.paid) {
    if (next.principal_remaining != null) {
      next.principal_remaining = money(Math.max(0, cents(next.principal_remaining) + difference));
    }
    if (next.remaining_due != null) {
      next.remaining_due = money(Math.max(0, cents(next.remaining_due) + difference));
    }
    if (next.partial_paid_amount != null && next.remaining_due != null) {
      next.partial_paid = cents(next.partial_paid_amount) > 0 && cents(next.remaining_due) > 0;
    }
  }
  next.rounding_adjustment = money(cents(next.rounding_adjustment) + cents(adjustment));
  rows[targetIndex] = next;
  return rows;
}

function receiptTotals(rows, paymentId = null) {
  const receipts = new Map();
  rows.forEach((row, rowIndex) => {
    (row.payment_allocations || []).forEach((item, itemIndex) => {
      if (paymentId && item.id !== paymentId) return;
      const key = item.id || `unreferenced:${rowIndex}:${itemIndex}`;
      const receipt = receipts.get(key) || {
        appliedPrincipal: 0,
        appliedInterest: 0,
        explicitPrincipal: null,
        explicitInterest: null,
      };
      receipt.appliedPrincipal += cents(item.principal);
      receipt.appliedInterest += cents(item.interest);
      if (item.receipt_principal != null) receipt.explicitPrincipal = cents(item.receipt_principal);
      if (item.receipt_interest != null) receipt.explicitInterest = cents(item.receipt_interest);
      receipts.set(key, receipt);
    });
  });
  return [...receipts.values()].map(receipt => ({
    principal: receipt.explicitPrincipal ?? receipt.appliedPrincipal,
    interest: receipt.explicitInterest ?? receipt.appliedInterest,
    appliedPrincipal: receipt.appliedPrincipal,
    appliedInterest: receipt.appliedInterest,
  }));
}

export function schedulePaymentBalances(schedule) {
  const rows = schedule.map(normalize);
  let totalPrincipal = 0;
  let totalInterest = 0;
  let untrackedPrincipalPaid = 0;
  let untrackedInterestPaid = 0;

  for (const row of rows) {
    totalPrincipal += cents(row.principal);
    totalInterest += cents(row.interest ?? row.interest_amount);
    const trackedPrincipal = row.payment_allocations.reduce((sum, item) => sum + cents(item.principal), 0);
    const trackedInterest = row.payment_allocations.reduce((sum, item) => sum + cents(item.interest), 0);
    untrackedPrincipalPaid += Math.max(0, cents(row.principal_paid_amount) - trackedPrincipal);
    untrackedInterestPaid += Math.max(0, cents(row.interest_paid_amount) - trackedInterest);
  }

  const tracked = receiptTotals(rows).reduce((totals, receipt) => ({
    principal: totals.principal + receipt.principal,
    interest: totals.interest + receipt.interest,
  }), { principal: 0, interest: 0 });
  return {
    principal: Math.max(0, totalPrincipal - untrackedPrincipalPaid - tracked.principal),
    interest: Math.max(0, totalInterest - untrackedInterestPaid - tracked.interest),
  };
}

function targetIndexFor(rows, target, paidAt) {
  if (target?.type === 'scheduled') {
    return rows.findIndex((row, index) => String(row.period ?? index + 1) === String(target.period));
  }
  const paymentDay = String(paidAt || '').slice(0, 10);
  return rows.findIndex(row => {
    const remaining = cents(row.principal_remaining) + cents(row.interest_remaining);
    if (remaining <= 0) return false;
    return !['advance', 'automatic'].includes(target?.type)
      || String(row.due_date || '').slice(0, 10) >= paymentDay;
  });
}

export function applyLoanAllocation(schedule, allocation, paidAt) {
  const principal = amount(allocation.principal);
  const interest = amount(allocation.interest);
  const rows = schedule.map(normalize);
  const existing = allocation.paymentId ? receiptTotals(rows, allocation.paymentId) : [];
  if (existing.length) {
    const recorded = existing.reduce((totals, receipt) => ({
      principal: totals.principal + receipt.principal,
      interest: totals.interest + receipt.interest,
    }), { principal: 0, interest: 0 });
    if (recorded.principal !== principal || recorded.interest !== interest) {
      throw new Error('This payment reference already has a different allocation.');
    }
    return rows;
  }

  const balance = schedulePaymentBalances(rows);
  if (principal > balance.principal) throw new Error('Principal payment exceeds the remaining principal balance.');
  if (interest > balance.interest) throw new Error('Interest payment exceeds the remaining fixed interest balance.');

  const target = allocation.scheduleTarget || { type: 'automatic' };
  if (target.type === 'settlement' && (principal !== balance.principal || interest !== balance.interest)) {
    throw new Error('Full Settlement must equal the remaining principal and fixed interest balance.');
  }
  const targetIndex = targetIndexFor(rows, target, paidAt);
  if (targetIndex < 0) {
    throw new Error(target.type === 'advance'
      ? 'No upcoming scheduled due date is available for this payment.'
      : 'The selected scheduled due date is no longer available.');
  }

  const row = rows[targetIndex];
  if (cents(row.principal_remaining) + cents(row.interest_remaining) <= 0) {
    throw new Error('The selected scheduled due date is already paid.');
  }
  const principalApplied = Math.min(principal, cents(row.principal_remaining));
  const interestApplied = Math.min(interest, cents(row.interest_remaining));
  const updated = refresh({
    ...row,
    principal_paid_amount: money(cents(row.principal_paid_amount) + principalApplied),
    interest_paid_amount: money(cents(row.interest_paid_amount) + interestApplied),
  });
  if (allocation.paymentId) {
    updated.payment_allocations.push({
      id: allocation.paymentId,
      principal: money(principalApplied),
      interest: money(interestApplied),
      receipt_principal: money(principal),
      receipt_interest: money(interest),
      receipt_total: money(principal + interest),
      paid_at: paidAt,
      application_type: target.type,
      target_period: target.type === 'scheduled' ? target.period : (row.period ?? targetIndex + 1),
      target_due_date: row.due_date ?? null,
    });
  }
  updated.paid_at = updated.paid ? paidAt : null;
  updated.last_partial_paid_at = updated.partial_paid ? paidAt : row.last_partial_paid_at;
  if (interest > 0) {
    updated.last_interest_paid_amount = money(interest);
    updated.last_interest_paid_at = paidAt;
  }
  rows[targetIndex] = updated;
  return rows;
}

export function reverseLoanAllocation(schedule, allocation) {
  const rows = schedule.map(normalize);
  const trackedReceipts = allocation.paymentId ? receiptTotals(rows, allocation.paymentId) : [];
  const expectedPrincipal = amount(allocation.principal);
  const expectedInterest = amount(allocation.interest);
  if (trackedReceipts.length) {
    const recorded = trackedReceipts.reduce((totals, receipt) => ({
      principal: totals.principal + receipt.principal,
      interest: totals.interest + receipt.interest,
    }), { principal: 0, interest: 0 });
    if (recorded.principal !== expectedPrincipal || recorded.interest !== expectedInterest) {
      throw new Error('The invoice amounts do not match its stored loan allocation.');
    }
  }

  let principalLeft = trackedReceipts.length
    ? trackedReceipts.reduce((sum, receipt) => sum + receipt.appliedPrincipal, 0)
    : expectedPrincipal;
  let interestLeft = trackedReceipts.length
    ? trackedReceipts.reduce((sum, receipt) => sum + receipt.appliedInterest, 0)
    : expectedInterest;
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    const matches = row.payment_allocations.filter(item => allocation.paymentId && item.id === allocation.paymentId);
    const availablePrincipal = trackedReceipts.length
      ? matches.reduce((sum, item) => sum + cents(item.principal), 0)
      : Math.max(0, cents(row.principal_paid_amount)
        - row.payment_allocations.reduce((sum, item) => sum + cents(item.principal), 0));
    const availableInterest = trackedReceipts.length
      ? matches.reduce((sum, item) => sum + cents(item.interest), 0)
      : Math.max(0, cents(row.interest_paid_amount)
        - row.payment_allocations.reduce((sum, item) => sum + cents(item.interest), 0));
    const principalNow = Math.min(principalLeft, availablePrincipal);
    const interestNow = Math.min(interestLeft, availableInterest);
    principalLeft -= principalNow;
    interestLeft -= interestNow;
    if (!principalNow && !interestNow && !matches.length) continue;
    rows[i] = refresh({
      ...row,
      principal_paid_amount: money(cents(row.principal_paid_amount) - principalNow),
      interest_paid_amount: money(cents(row.interest_paid_amount) - interestNow),
      payment_allocations: trackedReceipts.length
        ? row.payment_allocations.filter(item => item.id !== allocation.paymentId)
        : row.payment_allocations,
      paid_at: null,
      last_interest_paid_amount: interestNow ? 0 : row.last_interest_paid_amount,
    });
    if (!rows[i].paid_amount) rows[i].last_partial_paid_at = null;
  }
  if (principalLeft || interestLeft) throw new Error('The payment could not be safely reversed from the stored schedule.');
  return rows;
}
