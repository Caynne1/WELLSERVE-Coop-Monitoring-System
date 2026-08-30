export function getLoanFilterDate(loan) {
  for (const value of [loan?.release_date, loan?.application_date, loan?.approval_date, loan?.approved_at, loan?.created_at]) {
    if (!value) continue;
    const day = String(value).split('T')[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const parsed = new Date(`${day}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day) return day;
  }
  return null;
}

export function matchesLoanDateRange(loan, { from = '', to = '' } = {}) {
  if (!from && !to) return true;
  if (from && to && from > to) return false;
  const day = getLoanFilterDate(loan);
  return Boolean(day && (!from || day >= from) && (!to || day <= to));
}
