// Allocate the first ₱350 per member to initial savings across complete history.
// Do not reset the allocation when filtering by date.
export function boosterCollectionAllocations(rows, { from = null, to = null } = {}) {
  const paid = new Map();
  const seen = new Set();
  const allocations = [];
  const sorted = [...rows].sort((a, b) =>
    String(a.transaction_date || '').localeCompare(String(b.transaction_date || '')) ||
    String(a.created_at || '').localeCompare(String(b.created_at || '')) ||
    String(a.id).localeCompare(String(b.id))
  );
  for (const row of sorted) {
    if (row.category !== 'savings_booster' || row.type !== 'deposit' || seen.has(row.id)) continue;
    seen.add(row.id);
    const cents = Math.round(Number(row.amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) continue;
    const key = row.member_id || row.id;
    const before = paid.get(key) || 0;
    const initialCents = Math.min(cents, Math.max(0, 35000 - before));
    paid.set(key, before + cents);
    const date = String(row.transaction_date || '').slice(0, 10);
    if ((from && date < from) || (to && date > to)) continue;
    allocations.push({ ...row, initial_amount: initialCents / 100,
      weekly_amount: (cents - initialCents) / 100 });
  }
  return allocations;
}

export function boosterCollections(rows, range = {}) {
  const allocations = boosterCollectionAllocations(rows, range);
  const initial = allocations.reduce((sum, row) => sum + Math.round(row.initial_amount * 100), 0);
  const weekly = allocations.reduce((sum, row) => sum + Math.round(row.weekly_amount * 100), 0);
  return { initial: initial / 100, weekly: weekly / 100, total: (initial + weekly) / 100 };
}
