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

function allocationAmount(item) {
  return money(Number(item?.principal || 0) + Number(item?.interest || 0));
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
  }

  for (const scheduleRow of schedule) {
    for (const item of scheduleRow?.payment_allocations || []) {
      const hasScheduleAssignment = ['scheduled', 'advance'].includes(item.application_type);
      if (scheduleRow === row && hasScheduleAssignment) taggedOnRow += allocationAmount(item);
      if (scheduleRow === row && !hasScheduleAssignment) hasUnassignedAllocationOnRow = true;
      if (item.application_type !== 'scheduled' || String(item.target_period ?? '') !== period) continue;

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
      status: assignedAmount >= installmentTotal(row) ? 'Paid' : 'Partial',
      assigned: true,
    };
  }

  const advanceAllocations = (row.payment_allocations || [])
    .filter(item => item.application_type === 'advance');
  if (advanceAllocations.length) {
    const paidAt = advanceAllocations
      .map(item => transactionByPaymentId.get(String(item.id || '')) || item.paid_at)
      .filter(Boolean)
      .sort()
      .at(-1) || null;
    const dueDay = String(row.due_date || '').slice(0, 10);
    const paidDay = String(paidAt || '').slice(0, 10);
    const prepaid = paidDay && dueDay && paidDay < dueDay;
    return {
      actualPaid: money(advanceAllocations.reduce((sum, item) => sum + allocationAmount(item), 0)),
      paidAt,
      status: prepaid
        ? (installmentRemaining(row) <= 0 ? 'Prepaid' : 'Partially Prepaid')
        : installmentStatus(row, released, now),
      assigned: true,
    };
  }

  const rowIndex = schedule.indexOf(row);
  const carriedForwardAllocations = (row.payment_allocations || [])
    .filter(item => {
      if (item.application_type !== 'scheduled' || String(item.target_period ?? '') === period) return false;
      const targetIndex = schedule.findIndex((scheduleRow, index) =>
        String(scheduleRow.period ?? index + 1) === String(item.target_period ?? ''));
      return targetIndex >= 0 && rowIndex > targetIndex;
    });
  if (carriedForwardAllocations.length) {
    const paidAt = carriedForwardAllocations
      .map(item => transactionByPaymentId.get(String(item.id || '')) || item.paid_at)
      .filter(Boolean)
      .sort()
      .at(-1) || null;
    return {
      actualPaid: 0,
      paidAt,
      status: installmentRemaining(row) <= 0 ? 'Prepaid' : 'Partially Prepaid',
      assigned: true,
    };
  }

  const internallyPaid = installmentPaid(row);
  const legacyPaid = hasUnassignedAllocationOnRow || internallyPaid - taggedOnRow > 0.009;
  if (legacyPaid || taggedOnRow <= 0) {
    const linkedPaymentDate = (row.payment_allocations || [])
      .map(item => transactionByPaymentId.get(String(item.id || '')))
      .find(Boolean) || null;
    const dueDay = String(row.due_date || '').slice(0, 10);
    const exactScheduleDatePayment = transactionDates.find(date => String(date).slice(0, 10) === dueDay) || null;
    return {
      actualPaid: internallyPaid,
      // Historical row timestamps may be the import/entry date. Only show a
      // date here when a payment transaction provides the actual credited date.
      paidAt: linkedPaymentDate || exactScheduleDatePayment,
      status: installmentStatus(row, released, now),
      assigned: false,
    };
  }

  const ordinaryStatus = installmentStatus({ ...row, paid: false, paid_amount: 0, remaining_due: installmentTotal(row) }, released, now);
  return {
    actualPaid: 0,
    paidAt: null,
    status: ordinaryStatus === 'Overdue' ? 'Missed' : 'Unpaid',
    assigned: false,
  };
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
