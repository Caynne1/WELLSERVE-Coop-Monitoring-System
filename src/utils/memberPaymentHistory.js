export function paymentDate(row) {
  return row.transaction_date || row.payment_date || null;
}

export function loanPaymentSiNumber(row, invoices = [], loans = []) {
  const clean = value => String(value ?? '').trim().replace(/\bnot\s+traceable\b/gi, 'FOR TRACING');
  const reference = clean(row.reference);
  const invoice = invoices.find(item => item.member_id === row.member_id &&
    (item.id === row.invoice_id || item.id === reference));
  if (invoice) return clean(invoice.invoice_no) || 'FOR TRACING';
  const explicit = clean(row.si_number || row.invoice_no);
  if (explicit) return explicit;
  if (/^for tracing$/i.test(reference)) return 'FOR TRACING';
  if (loans.some(loan => reference === loan.id || reference === loan.loan_no)) return '';
  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(reference)) return '';
  if (!reference && /^for tracing$/i.test(clean(row.payment_mode))) return 'FOR TRACING';
  return reference;
}

export function loanPaymentMode(row) {
  const mode = String(row.payment_mode ?? '').trim()
    .replace(/\bnot\s+traceable\b/gi, 'FOR TRACING')
    .replace(/\u00e2\u20ac\u201d/g, '-')
    .replace(/\u00c3\u00a2\u00e2\u201a\u00ac\u00e2\u20ac\u009d/g, '-');
  return /^[-\u2013\u2014]$/.test(mode) ? '' : mode;
}

export function loanPaymentHistoryRows(transactions, loans = []) {
  const money = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  const loanReferences = new Set(loans.flatMap(loan => [loan.id, loan.loan_no]).filter(Boolean));
  const groups = new Map();
  for (const row of transactions) {
    if (!['loan_payment', 'loan_interest'].includes(row.type) ||
        ['void', 'voided', 'cancelled', 'canceled'].includes(String(row.status || '').toLowerCase())) continue;
    const reference = row.invoice_id || row.reference;
    const validReference = reference && !loanReferences.has(reference) &&
      !/^(?:for tracing|not traceable)$/i.test(String(reference).trim());
    const key = validReference && row.loan_id && paymentDate(row)
      ? `${row.loan_id}|${reference}|${paymentDate(row)}` : `transaction:${row.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const result = [];
  const combine = rows => {
    const principal = money(rows.filter(row => row.type === 'loan_payment').reduce((sum, row) => sum + Number(row.amount || 0), 0));
    const interest = money(rows.filter(row => row.type === 'loan_interest').reduce((sum, row) => sum + Number(row.amount || 0), 0));
    return { ...rows[0], ids: rows.map(row => row.id), loan_amount: principal, interest_amount: interest,
      total_paid: money(principal + interest) };
  };
  for (const rows of groups.values()) {
    const principalRows = rows.filter(row => row.type === 'loan_payment');
    const interestRows = rows.filter(row => row.type === 'loan_interest');
    // Reused references with multiple receipts stay separate rather than guessing a pair.
    if (principalRows.length <= 1 && interestRows.length <= 1) result.push(combine(rows));
    else result.push(...rows.map(row => combine([row])));
  }
  return result.sort((a, b) => String(paymentDate(b) || '').localeCompare(String(paymentDate(a) || '')));
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
