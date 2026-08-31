export function paymentDate(row) {
  return row.transaction_date || row.payment_date || null;
}

export function loanPaymentHistoryRows(transactions) {
  return transactions.filter(row => row.type === 'loan_payment')
    .map(row => ({ ...row, loan_amount: Number(row.amount || 0) }))
    .sort((a, b) => String(paymentDate(b) || '').localeCompare(String(paymentDate(a) || '')));
}

export function findPaymentInvoices(row, invoices, memberId) {
  const scoped = invoices.filter(invoice => invoice.member_id === memberId);
  if (row.is_stored_payment) return { exact: [], candidates: [] };
  if (row.invoice_id) return { exact: scoped.filter(invoice => invoice.id === row.invoice_id), candidates: [] };
  const references = [row.invoice_no, row.reference, row.si_number]
    .filter(Boolean).map(String).filter(value => !/^(?:not traceable|for tracing)$/i.test(value.trim()));
  const exact = scoped.filter(invoice => references.includes(String(invoice.id)) ||
    (invoice.invoice_no && references.includes(String(invoice.invoice_no))));
  if (exact.length) return { exact, candidates: [] };

  // Legacy date matches are suggestions only, never automatic invoice links.
  const day = String(paymentDate(row) || '').slice(0, 10);
  if (!day) return { exact: [], candidates: [] };
  const candidates = scoped.filter(invoice => {
    if (String(invoice.payment_date || invoice.date || '').slice(0, 10) !== day) return false;
    if (Number(invoice.amount) < Number(row.amount || 0)) return false;
    const expectedType = row.member_membership_id ? 'membership' : row.loan_id ? 'loan_payment' : row.category;
    if (expectedType && invoice.payment_type && invoice.payment_type !== expectedType && invoice.purpose !== 'Combined Payment') return false;
    if (row.loan_id && invoice.ref_id && invoice.ref_id !== row.loan_id) return false;
    if (row.member_membership_id && invoice.ref_id && invoice.ref_id !== row.member_membership_id) return false;
    if (row.account_id && invoice.account_id && invoice.account_id !== row.account_id) return false;
    return true;
  });
  return { exact: [], candidates };
}
