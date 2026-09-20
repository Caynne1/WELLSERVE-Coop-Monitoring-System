export const OTHER_CHARGE_CATEGORIES = [
  { value: 'service_fee', label: 'Service Fee', transactionCategory: 'service_fee' },
  { value: 'legal_fees', label: 'Legal Fees', transactionCategory: 'legal_fees' },
  { value: 'clpi_insurance', label: 'CLPI / Insurance', transactionCategory: 'insurance' },
  { value: 'cbu_retention', label: 'CBU Retention', transactionCategory: 'cbu' },
  { value: 'cbu_completion', label: 'CBU Completion', transactionCategory: 'cbu' },
  { value: 'regular_savings', label: 'Regular Savings', transactionCategory: 'savings' },
  { value: 'penalty_due', label: 'Penalty', transactionCategory: 'penalty' },
  { value: 'annual_dues', label: 'Annual Dues', transactionCategory: 'annual_dues' },
  { value: 'petty_cash', label: 'Petty Cash', transactionCategory: 'petty_cash' },
  { value: 'other_charges', label: 'Other Charges', transactionCategory: 'loan_deduction' },
];

export function otherChargeCategory(value) {
  return OTHER_CHARGE_CATEGORIES.find(category => category.value === value);
}

export function customChargeBreakdown(transactions) {
  const groups = new Map();
  for (const tx of transactions) {
    if (tx.type !== 'loan_deduction' || recordedOtherCharge(tx.notes)?.value !== 'other_charges') continue;
    const label = String(tx.notes || '').replace(/\[Other charge: [a-z_]+; id: [a-zA-Z0-9_-]+\]/g, '').trim().replace(/\s+/g, ' ') || 'Other Charges';
    const key = label.toLowerCase();
    const amount = Number(tx.amount);
    if (!Number.isFinite(amount)) continue;
    const group = groups.get(key) || { key, label, cents: 0 };
    group.cents += Math.round(amount * 100);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key))
    .map(({ key, label, cents }) => ({ key, label, amount: cents / 100 }));
}

export function recordedOtherCharge(notes) {
  const match = String(notes || '').match(/\[Other charge: ([a-z_]+); id: ([a-zA-Z0-9_-]+)\]/);
  const category = otherChargeCategory(match?.[1]);
  return category ? { ...category, id: match[2] } : null;
}

// Preview items are authoritative; flat fields are fallbacks, not extra charges.
export function mergeDeductionItems(items, fallbacks) {
  const result = [...items];
  const baseKinds = new Set(items.filter(item => !item.other_charge_id).map(item => item.kind));
  for (const item of fallbacks) {
    if (!baseKinds.has(item.kind)) {
      result.push(item);
      baseKinds.add(item.kind);
    }
  }
  return result;
}
