import { format, formatDistanceToNow } from 'date-fns';

export function formatCurrency(amount, currency = 'PHP') {
  if (amount == null || isNaN(amount)) return '₱0.00';
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date) {
  if (!date) return '—';
  try {
    return format(new Date(date), 'MMM d, yyyy');
  } catch {
    return '—';
  }
}

export function formatDateTime(date) {
  if (!date) return '—';
  try {
    return format(new Date(date), 'MMM d, yyyy h:mm a');
  } catch {
    return '—';
  }
}

export function formatRelativeTime(date) {
  if (!date) return '—';
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  } catch {
    return '—';
  }
}

export function formatNumber(n) {
  if (n == null) return '0';
  return new Intl.NumberFormat('en-PH').format(n);
}

// ── Live-typing amount formatting ───────────────────────────────────────────
// Used by "type=text" money inputs so the user sees thousand separators
// while typing (e.g. "1000000" -> "1,000,000"), while the underlying form
// state stays a clean numeric string ("1000000") for parseFloat/validation.

// Strips everything except digits and a single decimal point, so pasted or
// typed junk (extra commas, letters, extra dots) never breaks the field.
export function cleanAmountInput(raw) {
  let value = String(raw ?? '').replace(/[^0-9.]/g, '');
  const firstDot = value.indexOf('.');
  if (firstDot !== -1) {
    value = value.slice(0, firstDot + 1) + value.slice(firstDot + 1).replace(/\./g, '');
  }
  return value;
}

// Adds thousand separators to the integer part for display, e.g. "1234.5" -> "1,234.5".
export function formatAmountInput(raw) {
  if (!raw) return '';
  const [intPart, ...rest] = String(raw).split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rest.length ? `${withCommas}.${rest.join('')}` : withCommas;
}

export function formatPercent(n) {
  if (n == null || isNaN(n)) return '0%';
  return `${Number(n).toFixed(2)}%`;
}

export function fullName(member) {
  if (!member) return 'Unknown';
  return [member.first_name, member.last_name].filter(Boolean).join(' ');
}