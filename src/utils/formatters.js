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

export function formatPercent(n) {
  if (n == null || isNaN(n)) return '0%';
  return `${Number(n).toFixed(2)}%`;
}

export function fullName(member) {
  if (!member) return 'Unknown';
  return [member.first_name, member.last_name].filter(Boolean).join(' ');
}
