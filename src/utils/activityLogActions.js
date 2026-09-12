const ACTION_ALIASES = Object.freeze({
  approved: 'approve',
  created: 'create',
  deleted: 'delete',
  rejected: 'reject',
  released: 'release',
  updated: 'update',
  voided: 'void',
});

export const STANDARD_ACTIVITY_ACTIONS = Object.freeze([
  'approve',
  'create',
  'delete',
  'deposit',
  'export',
  'import',
  'login',
  'logout',
  'payment',
  'reject',
  'release',
  'update',
  'void',
  'withdrawal',
]);

export function normalizeActivityAction(action) {
  const normalized = String(action || 'activity').trim().toLowerCase();
  return ACTION_ALIASES[normalized] || normalized;
}

export function activityActionOptions(logs = []) {
  const recordedActions = logs
    .map(log => normalizeActivityAction(log?.action))
    .filter(Boolean);

  return [...new Set([...STANDARD_ACTIVITY_ACTIONS, ...recordedActions])]
    .sort((a, b) => a.localeCompare(b));
}

export function formatActivityLogDescription(log = {}) {
  let description = String(log.description || '-');
  if (!log.member_name) return description;

  for (const id of log.member_reference_ids || []) {
    description = description
      .replace(new RegExp(`member\\s+${id}`, 'gi'), `member ${log.member_name}`)
      .replace(new RegExp(`ID:\\s*${id}`, 'gi'), `Member: ${log.member_name}`);
  }

  if (description.toLowerCase().includes(log.member_name.toLowerCase())) {
    return description;
  }

  const base = description === '-' ? '' : description.trim();
  const separator = base && !/[.!?]$/.test(base) ? '. ' : base ? ' ' : '';
  return `${base}${separator}Member: ${log.member_name}.`;
}
