// Allocate initial capital before weekly contributions across the complete history,
// then apply date filters. A date filter must not restart the initial 350 allocation.
export function boosterCollections(rows, { from = null, to = null } = {}) {
  const paid = new Map();
  const seen = new Set();
  let initial = 0;
  let weekly = 0;
  for (const row of [...rows].sort((a, b) => String(a.transaction_date || '').localeCompare(String(b.transaction_date || ''))
    || String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id)))) {
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
    initial += initialCents;
    weekly += cents - initialCents;
  }
  return { initial: initial / 100, weekly: weekly / 100, total: (initial + weekly) / 100 };
}
