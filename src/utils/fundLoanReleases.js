export function isLoanReleaseCategory(category = '') {
  const text = String(category || '').trim().toLowerCase();
  return text === 'loan_release' || text === 'loan release' || text === 'capital';
}

export function parseLedgerDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  if (year < 2023 || year > new Date().getFullYear() + 10) return null;
  return date;
}

export function txDisplayDate(tx) {
  if (parseLedgerDate(tx?.transaction_date)) return tx.transaction_date;
  if (parseLedgerDate(tx?.created_at)) return tx.created_at;
  return null;
}

export function filterFundLedgerByDate(transactions, dateRange = {}) {
  return transactions.filter(tx => {
    const txDate = parseLedgerDate(txDisplayDate(tx));
    if (!txDate) return !dateRange.from && !dateRange.to;
    if (dateRange.from && txDate < new Date(dateRange.from)) return false;
    if (dateRange.to) {
      const toDate = new Date(dateRange.to);
      toDate.setHours(23, 59, 59, 999);
      if (txDate > toDate) return false;
    }
    return true;
  });
}

// Input is the unified Fund ledger, after its existing normalization and deduplication.
export function sumPostedLoanReleases(transactions) {
  const total = transactions
    .filter(tx => tx.type === 'cash_out' && isLoanReleaseCategory(tx.category))
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  return Math.round((total + Number.EPSILON) * 100) / 100;
}
