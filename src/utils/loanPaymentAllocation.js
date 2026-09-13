const cents = value => Math.round((Number(value || 0) + Number.EPSILON) * 100);
const money = value => value / 100;

function amount(value) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) throw new Error('Payment amounts must be non-negative numbers.');
  return cents(number);
}

function refresh(row) {
  const principalPaid = cents(row.principal_paid_amount);
  const interestPaid = cents(row.interest_paid_amount);
  const principalGuide = Math.max(principalPaid,
    cents(row.principal) + cents(row.guide_principal_adjustment));
  const interestGuide = Math.max(interestPaid,
    cents(row.interest ?? row.interest_amount) + cents(row.guide_interest_adjustment));
  const guideSatisfied = Boolean(row.schedule_satisfied);
  const principalRemaining = guideSatisfied ? 0 : Math.max(0, principalGuide - principalPaid);
  const interestRemaining = guideSatisfied ? 0 : Math.max(0, interestGuide - interestPaid);
  const paid = principalPaid + interestPaid;
  return {
    ...row,
    principal_remaining: money(principalRemaining),
    interest_remaining: money(interestRemaining),
    paid_amount: money(paid),
    remaining_due: money(principalRemaining + interestRemaining),
    paid: guideSatisfied || principalRemaining + interestRemaining === 0,
    partial_paid: !guideSatisfied && paid > 0 && principalRemaining + interestRemaining > 0,
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
  const principalLimit = Math.max(principal, principal + cents(row.guide_principal_adjustment));
  const interestLimit = Math.max(interest, interest + cents(row.guide_interest_adjustment));
  if (principalPaid < 0 || interestPaid < 0 || principalPaid > principalLimit || interestPaid > interestLimit) {
    throw new Error('The stored payment split does not match the loan schedule. Review the historical payment record.');
  }
  return refresh({
    ...row,
    principal_paid_amount: money(principalPaid),
    interest_paid_amount: money(interestPaid),
    payment_allocations: (row.payment_allocations || []).map(item => ({ ...item })),
  });
}

function isGuidePayment(row, index) {
  if (row.schedule_payment_recorded) return true;
  if (cents(row.paid_amount ?? row.partial_paid_amount) <= 0) return false;
  const period = String(row.period ?? index + 1);
  const allocations = row.payment_allocations || [];
  if (allocations.some(item => ['scheduled', 'advance', 'automatic', 'settlement'].includes(item.application_type)
    && String(item.target_period ?? period) === period)) return true;
  return Boolean(row.partial_paid && (row.last_partial_paid_at || row.paid_at));
}

function removeForeignGuideApplications(schedule) {
  const periods = new Set(schedule.map((row, index) => String(row.period ?? index + 1)));
  return schedule.map((row, index) => {
    if (row.principal_paid_amount == null || row.interest_paid_amount == null) return row;

    const period = String(row.period ?? index + 1);
    const allocations = row.payment_allocations || [];
    const foreign = allocations.filter(item =>
      ['scheduled', 'advance', 'automatic', 'settlement'].includes(item.application_type)
      && item.target_period != null
      && String(item.target_period) !== period
      && periods.has(String(item.target_period)));
    if (!foreign.length) return row;

    const foreignPrincipal = foreign.reduce((sum, item) => sum + cents(item.principal), 0);
    const foreignInterest = foreign.reduce((sum, item) => sum + cents(item.interest), 0);
    const hasLocalGuidePayment = allocations.some(item =>
      ['scheduled', 'advance', 'automatic', 'settlement'].includes(item.application_type)
      && String(item.target_period ?? period) === period);
    return {
      ...row,
      principal_paid_amount: money(Math.max(0, cents(row.principal_paid_amount) - foreignPrincipal)),
      interest_paid_amount: money(Math.max(0, cents(row.interest_paid_amount) - foreignInterest)),
      schedule_payment_recorded: hasLocalGuidePayment,
      schedule_satisfied: hasLocalGuidePayment ? row.schedule_satisfied : false,
    };
  });
}

function reconcileGuideSchedule(schedule) {
  if (!schedule.length) return schedule;
  const lastIndex = schedule.length - 1;
  let rows = removeForeignGuideApplications(schedule).map(row => normalize({
    ...row,
    guide_principal_adjustment: 0,
    guide_interest_adjustment: 0,
  }));

  rows = rows.map((row, index) => {
    if (index === lastIndex || row.paid || !isGuidePayment(row, index)) return row;
    return refresh({
      ...row,
      schedule_payment_recorded: true,
      schedule_satisfied: true,
    });
  });

  const expected = schedulePaymentBalances(rows);
  const shownPrincipal = rows.reduce((sum, row) => sum + cents(row.principal_remaining), 0);
  const shownInterest = rows.reduce((sum, row) => sum + cents(row.interest_remaining), 0);
  const finalRow = rows[lastIndex];
  rows[lastIndex] = refresh({
    ...finalRow,
    guide_principal_adjustment: money(expected.principal - shownPrincipal),
    guide_interest_adjustment: money(expected.interest - shownInterest),
  });
  return rows;
}

export function reconcileSchedulePrincipal(schedule, expectedPrincipal) {
  const rows = (schedule || []).map(row => ({ ...row }));
  if (!rows.length) return rows;
  const expected = cents(expectedPrincipal);
  const scheduled = rows.reduce((sum, row) => sum + cents(row.principal), 0);
  const difference = expected - scheduled;
  // Only reconcile cent-level installment rounding. Larger differences may be
  // intentional imported data and must be reviewed instead of changed here.
  if (!expected || difference === 0 || Math.abs(difference) > 100) {
    return reconcileGuideSchedule(rows);
  }

  let targetIndex = rows.length - 1;
  while (targetIndex > 0 && rows[targetIndex].paid) targetIndex -= 1;
  const row = rows[targetIndex];
  const nextPrincipal = cents(row.principal) + difference;
  if (nextPrincipal < 0) return reconcileGuideSchedule(rows);

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
  return reconcileGuideSchedule(rows);
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
  return [...receipts.entries()].map(([key, receipt]) => ({
    key,
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

export function legacyLedgerOnlyReversalBalances(schedule, current, allocation) {
  const currentPrincipal = Number(current?.principal);
  const currentInterest = Number(current?.interest);
  if (!Number.isFinite(currentPrincipal) || !Number.isFinite(currentInterest)) return null;

  const scheduled = schedulePaymentBalances(schedule);
  const principal = amount(allocation?.principal);
  const interest = amount(allocation?.interest);
  const currentPrincipalCents = cents(currentPrincipal);
  const currentInterestCents = cents(currentInterest);
  const principalGap = scheduled.principal - currentPrincipalCents;
  const interestGap = scheduled.interest - currentInterestCents;
  if (principalGap !== principal || interestGap !== interest) return null;

  return {
    principal: money(currentPrincipalCents + principal),
    interest: money(currentInterestCents + interest),
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
  if (target.type === 'balance') {
    const ledgerIndex = rows.length - 1;
    if (allocation.paymentId) {
      rows[ledgerIndex].payment_allocations.push({
        id: allocation.paymentId,
        principal: 0,
        interest: 0,
        receipt_principal: money(principal),
        receipt_interest: money(interest),
        receipt_total: money(principal + interest),
        paid_at: paidAt,
        application_type: 'balance',
        target_period: null,
        target_due_date: null,
      });
    }
    return reconcileGuideSchedule(rows);
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
  const closesSelectedGuideRow = ['scheduled', 'advance', 'settlement'].includes(target.type)
    && targetIndex < rows.length - 1;
  const updated = refresh({
    ...row,
    principal_paid_amount: money(cents(row.principal_paid_amount) + principalApplied),
    interest_paid_amount: money(cents(row.interest_paid_amount) + interestApplied),
    schedule_payment_recorded: ['scheduled', 'advance', 'settlement'].includes(target.type)
      ? true
      : row.schedule_payment_recorded,
    schedule_satisfied: closesSelectedGuideRow ? true : row.schedule_satisfied,
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
  return reconcileGuideSchedule(rows);
}

export function reverseLoanAllocation(schedule, allocation) {
  const rows = schedule.map(normalize);
  const paymentIds = new Set([allocation.paymentId, ...(allocation.paymentIds || [])].filter(Boolean));
  let trackedReceipts = [...paymentIds].flatMap(paymentId => receiptTotals(rows, paymentId));
  const expectedPrincipal = amount(allocation.principal);
  const expectedInterest = amount(allocation.interest);
  if (!trackedReceipts.length) {
    const candidateIds = [...new Set(rows.flatMap(row =>
      (row.payment_allocations || []).map(item => item.id).filter(Boolean)))];
    const exactCandidates = candidateIds.map(paymentId => ({
      paymentId,
      receipts: receiptTotals(rows, paymentId),
    })).filter(candidate => {
      const totals = candidate.receipts.reduce((sum, receipt) => ({
        principal: sum.principal + receipt.principal,
        interest: sum.interest + receipt.interest,
      }), { principal: 0, interest: 0 });
      return totals.principal === expectedPrincipal && totals.interest === expectedInterest;
    });
    if (exactCandidates.length === 1) {
      paymentIds.add(exactCandidates[0].paymentId);
      trackedReceipts = exactCandidates[0].receipts;
    }
  }
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
  const paymentDay = String(allocation.paidAt || '').slice(0, 10);
  const datedIndexes = !trackedReceipts.length && paymentDay
    ? rows.map((row, index) => ({ row, index })).filter(({ row }) => [
      row.paid_at,
      row.last_partial_paid_at,
      row.last_interest_paid_at,
    ].some(value => String(value || '').slice(0, 10) === paymentDay)).map(({ index }) => index)
    : [];
  const indexes = datedIndexes.length
    ? datedIndexes.sort((a, b) => b - a)
    : rows.map((_, index) => index).reverse();
  for (const i of indexes) {
    const row = rows[i];
    const matches = row.payment_allocations.filter(item => paymentIds.has(item.id));
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
    const remainingAllocations = trackedReceipts.length
      ? row.payment_allocations.filter(item => !paymentIds.has(item.id))
      : row.payment_allocations;
    const stillHasGuidePayment = remainingAllocations.some(item =>
      ['scheduled', 'advance', 'settlement'].includes(item.application_type));
    rows[i] = refresh({
      ...row,
      principal_paid_amount: money(cents(row.principal_paid_amount) - principalNow),
      interest_paid_amount: money(cents(row.interest_paid_amount) - interestNow),
      payment_allocations: remainingAllocations,
      paid_at: null,
      last_interest_paid_amount: interestNow ? 0 : row.last_interest_paid_amount,
      schedule_payment_recorded: stillHasGuidePayment,
      schedule_satisfied: i < rows.length - 1 && stillHasGuidePayment,
    });
    if (!rows[i].paid_amount) rows[i].last_partial_paid_at = null;
  }
  if (principalLeft || interestLeft) throw new Error('The payment could not be safely reversed from the stored schedule.');
  return reconcileGuideSchedule(rows);
}
