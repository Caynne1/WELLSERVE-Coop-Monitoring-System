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
  if (!log.member_name) return description.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[reference unavailable]');

  for (const id of log.member_reference_ids || []) {
    // A linked member, loan, invoice or transaction UUID is not useful in the
    // primary description. The original log text remains unchanged in storage.
    description = description.replace(new RegExp(id, 'gi'), log.member_name);

    description = description
      .replace(new RegExp(`member\\s+${id}`, 'gi'), `member ${log.member_name}`)
      .replace(new RegExp(`ID:\\s*${id}`, 'gi'), `Member: ${log.member_name}`);
  }

  description = description.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[reference unavailable]');
  if (description.toLowerCase().includes(log.member_name.toLowerCase())) {
    return description;
  }

  const base = description === '-' ? '' : description.trim();
  const separator = base && !/[.!?]$/.test(base) ? '. ' : base ? ' ' : '';
  return `${base}${separator}Member: ${log.member_name}.`;
}
