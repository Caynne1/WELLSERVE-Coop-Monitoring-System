const cashInCents = row => {
  const amount = Number(row.amount ?? 0);
  if (!Number.isFinite(amount)) throw new Error('Invalid cash-in ledger amount');
  return Math.round((amount + Number.EPSILON) * 100);
};

export function sumCashInLedger(transactions) {
  return transactions.reduce((sum, row) => row.type === 'cash_in' ? sum + cashInCents(row) : sum, 0) / 100;
}

// Input is the existing normalized, deduplicated Fund ledger.
export function groupCashInLedger(transactions, definitions = []) {
  const totals = new Map();
  for (const row of transactions) {
    if (row.type !== 'cash_in') continue;
    const category = String(row.category || '').trim().toLowerCase() || 'uncategorized';
    const key = ['membership_fee', 'admin_regulatory_fees'].includes(category) ? 'membership' : category;
    totals.set(key, (totals.get(key) || 0) + cashInCents(row));
  }
  const labels = new Map(definitions.map(definition => [definition.key, definition]));
  const keys = [...labels.keys(), ...[...totals.keys()].filter(key => !labels.has(key))];
  return keys.filter(key => totals.has(key) && totals.get(key) !== 0).map(key => ({
    ...(labels.get(key) || {
      key,
      label: key === 'uncategorized' ? 'Uncategorized' : key.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()),
      color: '#64748b',
    }),
    value: totals.get(key) / 100,
  }));
}
