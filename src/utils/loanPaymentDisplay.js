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
  const paid = installmentPaid(row);
  if (released && installmentRemaining(row) > 0 && due < today) {
    return paid > 0 ? 'Overdue' : 'Missed';
  }
  return paid > 0 ? 'Partially Paid' : 'Unpaid';
}

function allocationAmount(item) {
  return money(Number(item?.principal || 0) + Number(item?.interest || 0));
}

function historicalReceiptAssignments(schedule, transactions) {
  const legacyRows = schedule.filter(row => installmentPaid(row) > 0
    && !(row.payment_allocations || []).some(item => item.receipt_total != null));
  if (!legacyRows.length) return new Map();

  const groups = new Map();
  transactions.forEach(transaction => {
    if (!['loan_payment', 'loan_interest'].includes(transaction.type)
      || ['void', 'voided', 'cancelled', 'canceled'].includes(String(transaction.status || '').toLowerCase())) return;
    const paidAt = transaction.transaction_date || transaction.payment_date || null;
    if (!paidAt) return;
    const reference = String(transaction.invoice_id || transaction.reference || '').trim();
    const key = reference
      ? `${String(paidAt).slice(0, 10)}|${reference}`
      : `${String(paidAt).slice(0, 10)}|unreferenced`;
    const receipt = groups.get(key) || { key, paidAt, amount: 0, ids: new Set() };
    receipt.amount += Number(transaction.amount || 0);
    if (transaction.id) receipt.ids.add(String(transaction.id));
    if (transaction.invoice_id) receipt.ids.add(String(transaction.invoice_id));
    groups.set(key, receipt);
  });

  const receipts = [...groups.values()]
    .map(receipt => ({ ...receipt, amount: money(receipt.amount) }))
    .filter(receipt => receipt.amount > 0)
    .sort((a, b) => String(a.paidAt).localeCompare(String(b.paidAt)) || a.key.localeCompare(b.key));
  const assignments = new Map();
  const used = new Set();

  for (const row of legacyRows) {
    const allocationIds = new Set((row.payment_allocations || []).map(item => String(item.id || '')).filter(Boolean));
    const linked = receipts.find(receipt => !used.has(receipt.key)
      && [...receipt.ids].some(id => allocationIds.has(id)));
    if (linked) {
      assignments.set(row, linked);
      used.add(linked.key);
    }
  }

  for (const row of legacyRows) {
    if (assignments.has(row)) continue;
    const dueDay = String(row.due_date || '').slice(0, 10);
    const matches = receipts.filter(receipt => !used.has(receipt.key)
      && String(receipt.paidAt).slice(0, 10) === dueDay);
    if (matches.length === 1) {
      assignments.set(row, matches[0]);
      used.add(matches[0].key);
    }
  }

  const unmatchedRows = legacyRows.filter(row => !assignments.has(row));
  const unmatchedReceipts = receipts.filter(receipt => !used.has(receipt.key));
  if (unmatchedRows.length === unmatchedReceipts.length) {
    unmatchedRows
      .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')))
      .forEach((row, index) => assignments.set(row, unmatchedReceipts[index]));
  }
  const assignedReceiptKeys = new Set([...assignments.values()].map(receipt => receipt.key));
  assignments.allReceiptsAssigned = receipts.length > 0
    && receipts.every(receipt => assignedReceiptKeys.has(receipt.key));
  return assignments;
}

export function installmentPresentation(row, schedule = [], released = false, now = new Date(), transactions = []) {
  const period = String(row?.period ?? '');
  const receipts = new Map();
  let taggedOnRow = 0;
  let hasUnassignedAllocationOnRow = false;
  const transactionByPaymentId = new Map();
  const transactionDates = [];
  for (const transaction of transactions) {
    const paymentDate = transaction.transaction_date || transaction.payment_date || null;
    if (!paymentDate) continue;
    transactionDates.push(paymentDate);
    if (transaction.id) transactionByPaymentId.set(String(transaction.id), paymentDate);
    if (transaction.invoice_id) transactionByPaymentId.set(String(transaction.invoice_id), paymentDate);
    if (transaction.reference) transactionByPaymentId.set(String(transaction.reference), paymentDate);
  }

  for (const scheduleRow of schedule) {
    for (const item of scheduleRow?.payment_allocations || []) {
      const isBalanceReceipt = scheduleRow === row && item.application_type === 'balance';
      const hasScheduleAssignment = ['scheduled', 'advance', 'settlement', 'automatic'].includes(item.application_type)
        && item.target_period != null;
      if (isBalanceReceipt) {
        const key = item.id || `${item.paid_at || ''}|balance`;
        if (!receipts.has(key)) {
          receipts.set(key, {
            amount: money(item.receipt_total ?? Number(item.receipt_principal || 0)
              + Number(item.receipt_interest || 0)),
            paidAt: transactionByPaymentId.get(String(item.id || '')) || item.paid_at || null,
          });
        }
        continue;
      }
      if (scheduleRow === row && hasScheduleAssignment) taggedOnRow += allocationAmount(item);
      if (scheduleRow === row && !hasScheduleAssignment) hasUnassignedAllocationOnRow = true;
      if (!hasScheduleAssignment || String(item.target_period) !== period) continue;

      const key = item.id || `${item.paid_at || ''}|${item.target_period || ''}`;
      if (!receipts.has(key)) {
        receipts.set(key, {
          amount: money(item.receipt_total ?? allocationAmount(item)),
          paidAt: transactionByPaymentId.get(String(item.id || '')) || item.paid_at || null,
        });
      }
    }
  }

  const assignedAmount = money([...receipts.values()].reduce((sum, receipt) => sum + receipt.amount, 0));
  const paidDates = [...receipts.values()].map(receipt => receipt.paidAt).filter(Boolean).sort();
  if (assignedAmount > 0) {
    return {
      actualPaid: assignedAmount,
      paidAt: paidDates.at(-1) || null,
      status: installmentStatus(row, released, now),
      assigned: true,
    };
  }

  const rowIndex = schedule.indexOf(row);
  const allocationsAssignedElsewhere = (row.payment_allocations || [])
    .filter(item => {
      if (item.target_period == null || String(item.target_period) === period) return false;
      const targetIndex = schedule.findIndex((scheduleRow, index) =>
        String(scheduleRow.period ?? index + 1) === String(item.target_period ?? ''));
      return targetIndex >= 0;
    });
  if (allocationsAssignedElsewhere.length) {
    const targetIndex = schedule.findIndex((scheduleRow, index) =>
      String(scheduleRow.period ?? index + 1) === String(allocationsAssignedElsewhere[0].target_period ?? ''));
    const ordinary = { ...row, paid: false, paid_amount: 0, remaining_due: installmentTotal(row) };
    return {
      actualPaid: 0,
      paidAt: null,
      status: rowIndex < targetIndex ? installmentStatus(ordinary, released, now) : installmentStatus(row, released, now),
      assigned: false,
    };
  }

  const internallyPaid = installmentPaid(row);
  const legacyPaid = hasUnassignedAllocationOnRow || internallyPaid - taggedOnRow > 0.009;
  if (legacyPaid || taggedOnRow <= 0) {
    const historicalAssignments = historicalReceiptAssignments(schedule, transactions);
    const historicalReceipt = historicalAssignments.get(row);
    const carriedWithoutReceipt = !historicalReceipt
      && historicalAssignments.allReceiptsAssigned
      && (row.payment_allocations || []).length > 0;
    const linkedPaymentDate = (row.payment_allocations || [])
      .map(item => transactionByPaymentId.get(String(item.id || '')))
      .find(Boolean) || null;
    const dueDay = String(row.due_date || '').slice(0, 10);
    const exactScheduleDatePayment = transactionDates.find(date => String(date).slice(0, 10) === dueDay) || null;
    return {
      actualPaid: historicalReceipt?.amount ?? (carriedWithoutReceipt ? 0 : internallyPaid),
      // Historical row timestamps may be the import/entry date. Only show a
      // date here when a payment transaction provides the actual credited date.
      paidAt: historicalReceipt?.paidAt
        || (carriedWithoutReceipt ? null : (linkedPaymentDate || exactScheduleDatePayment)),
      status: installmentStatus(row, released, now),
      assigned: false,
    };
  }

  return {
    actualPaid: 0,
    paidAt: null,
    status: installmentStatus({ ...row, paid: false, paid_amount: 0, remaining_due: installmentTotal(row) }, released, now),
    assigned: false,
  };
}

export function scheduleCollections(schedule = []) {
  let principal = 0;
  let interest = 0;
  let unknownSplit = 0;
  let splitKnown = true;
  const receipts = new Map();

  schedule.forEach((row, rowIndex) => {
    const allocations = row.payment_allocations || [];
    const trackedPrincipal = allocations.reduce((sum, item) => sum + Number(item.principal || 0), 0);
    const trackedInterest = allocations.reduce((sum, item) => sum + Number(item.interest || 0), 0);
    const paid = installmentPaid(row);
    const storedInterest = row.interest_paid_amount;
    if (storedInterest != null) {
      const untrackedInterest = Math.max(0, Number(storedInterest) - trackedInterest);
      const untrackedPrincipal = Math.max(0, paid - trackedPrincipal - trackedInterest - untrackedInterest);
      principal += untrackedPrincipal;
      interest += untrackedInterest;
    } else if (paid - trackedPrincipal - trackedInterest > 0.009) {
      if (row.paid || paid >= installmentTotal(row)) {
        const rowInterest = Number(row.interest ?? row.interest_amount ?? 0);
        interest += rowInterest;
        principal += Math.max(0, paid - rowInterest);
      } else {
        splitKnown = false;
        unknownSplit += Math.max(0, paid - trackedPrincipal - trackedInterest);
      }
    }

    allocations.forEach((item, itemIndex) => {
      const key = item.id || `unreferenced:${rowIndex}:${itemIndex}`;
      const receipt = receipts.get(key) || {
        appliedPrincipal: 0,
        appliedInterest: 0,
        principal: null,
        interest: null,
      };
      receipt.appliedPrincipal += Number(item.principal || 0);
      receipt.appliedInterest += Number(item.interest || 0);
      if (item.receipt_principal != null) receipt.principal = Number(item.receipt_principal) || 0;
      if (item.receipt_interest != null) receipt.interest = Number(item.receipt_interest) || 0;
      receipts.set(key, receipt);
    });
  });
  for (const receipt of receipts.values()) {
    principal += receipt.principal ?? receipt.appliedPrincipal;
    interest += receipt.interest ?? receipt.appliedInterest;
  }
  const total = principal + interest + unknownSplit;
  return {
    total: money(total),
    principal: splitKnown ? money(principal) : null,
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
