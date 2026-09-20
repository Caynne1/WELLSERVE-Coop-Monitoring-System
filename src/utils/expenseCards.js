const clean = value => String(value || '').trim().replace(/\s+/g, ' ');
const generic = value => ['', 'other', 'others', 'expense', 'expenses', 'other expenses', 'other_expenses', 'other withdrawal/expenses', 'needs manual review'].includes(clean(value).toLowerCase());

export function expenseCardCategory(tx) {
  const notes = [tx.notes, tx.note, tx.description].filter(Boolean).join('\n');
  const original = clean(notes.match(/Original expense category:\s*([^\n\r|]+)/i)?.[1]);
  const detail = clean(tx.category_other || notes.match(/Category detail:\s*([^\n\r|]+)/i)?.[1]);
  if (original && !generic(original)) return original;
  if (detail && !generic(detail)) return detail;
  return generic(tx.category) ? 'Unspecified Expenses' : clean(tx.category);
}

export function groupExpenseCards(rows) {
  const groups = new Map();
  for (const tx of rows) {
    const category = expenseCardCategory(tx);
    const key = category.toLowerCase();
    const amount = Number(tx.amount || 0);
    if (!Number.isFinite(amount)) continue;
    const group = groups.get(key) || { key, category, cents: 0 };
    group.cents += Math.round(amount * 100);
    groups.set(key, group);
  }
  return [...groups.values()].map(({ cents, ...group }) => ({ ...group, value: cents / 100 }));
}
