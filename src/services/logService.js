import { supabase } from './supabase';
import { normalizeActivityAction } from '../utils/activityLogActions';

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

function memberName(member) {
  return [
    member?.first_name,
    member?.middle_initial ? `${member.middle_initial}.` : '',
    member?.last_name,
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function idsInLog(log) {
  return [...new Set([
    log.record_id,
    ...(String(log.description || '').match(UUID_PATTERN) || []),
  ].filter(Boolean).map(id => String(id).toLowerCase()))];
}

async function fetchByIds(table, columns, ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const chunks = [];
  for (let index = 0; index < uniqueIds.length; index += 100) {
    chunks.push(uniqueIds.slice(index, index + 100));
  }

  const results = await Promise.all(chunks.map(chunk =>
    supabase.from(table).select(columns).in('id', chunk)
  ));

  return results.flatMap(result => {
    if (result.error) {
      console.warn(`[logService] ${table} member resolution failed:`, result.error.message);
      return [];
    }
    return result.data || [];
  });
}

async function attachAffectedMembers(logs) {
  const logIds = new Map(logs.map(log => [log.id, idsInLog(log)]));
  const candidateIds = [...new Set([...logIds.values()].flat())];
  if (candidateIds.length === 0) return logs;

  const [directMembers, loans, invoices, transactions] = await Promise.all([
    fetchByIds('members', 'id, first_name, middle_initial, last_name, member_no', candidateIds),
    fetchByIds('loans', 'id, member_id', candidateIds),
    fetchByIds('invoices', 'id, member_id, payee', candidateIds),
    fetchByIds('transactions', 'id, member_id', candidateIds),
  ]);

  const entityMemberIds = new Map();
  directMembers.forEach(member => entityMemberIds.set(String(member.id).toLowerCase(), member.id));
  [...loans, ...invoices, ...transactions].forEach(record => {
    if (record.member_id) entityMemberIds.set(String(record.id).toLowerCase(), record.member_id);
  });

  const linkedMemberIds = [...new Set(entityMemberIds.values())];
  const linkedMembers = await fetchByIds(
    'members',
    'id, first_name, middle_initial, last_name, member_no',
    linkedMemberIds
  );
  const membersById = new Map(
    [...directMembers, ...linkedMembers].map(member => [String(member.id).toLowerCase(), member])
  );

  return logs.map(log => {
    const referenceIds = logIds.get(log.id) || [];
    const resolvedReferences = referenceIds.filter(id => entityMemberIds.has(id));
    const resolvedMemberId = resolvedReferences
      .map(id => entityMemberIds.get(id))
      .find(Boolean);
    const member = resolvedMemberId
      ? membersById.get(String(resolvedMemberId).toLowerCase())
      : null;

    return {
      ...log,
      member_id: member?.id || null,
      member_name: memberName(member) || null,
      member_no: member?.member_no || null,
      member_reference_ids: resolvedReferences,
    };
  });
}

// ─── Fetch logs with optional filters ────────────────────────────────────────
// Two-step fetch: get activity_logs first, then resolve user names separately.
// This prevents an RLS block on the join from killing the entire query.
// Server-side filtering and paging. Counts are calculated by PostgreSQL, not the loaded rows.
export async function getLogUsers() {
  const users = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('profiles')
      .select('id, full_name, email').order('full_name', { ascending: true }).range(offset, offset + 499);
    if (error) throw error;
    users.push(...(data || []));
    if ((data || []).length < 500) break;
  }
  return users;
}

export async function getLogs({ page = 1, pageSize = 25, search = '', dateFrom = null,
  dateTo = null, userId = '', module = '', action = '' } = {}) {
  const safeSize = Math.min(500, Math.max(1, Number(pageSize) || 25));
  const safePage = Math.max(1, Number(page) || 1);
  let query = supabase.from('activity_logs')
    .select('id, action, module, description, user_id, created_at, record_id', { count: 'exact' })
    .neq('action', 'view');
  if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
  if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59.999`);
  if (userId) query = query.eq('user_id', userId);
  if (module) query = query.eq('module', module);
  if (action) query = query.eq('action', action);

  // Search is performed BEFORE paging to avoid missing historical matches.
  // User-name searches are mapped to actor IDs; member-name searches to UUIDs
  // embedded in descriptions or referenced by record_id.
  const term = search.trim();
  if (term) {
    const cleaned = term.replace(/[%,().*]/g, ' ').trim();
    if (cleaned) {
      const pattern = `%${cleaned}%`;
      const [profiles, members] = await Promise.all([
        supabase.from('profiles').select('id').or(`full_name.ilike.${pattern},email.ilike.${pattern}`).limit(200),
        supabase.from('members').select('id').or(`first_name.ilike.${pattern},last_name.ilike.${pattern},member_no.ilike.${pattern}`).limit(200),
      ]);
      const searchClauses = [
        `description.ilike.${pattern}`, `module.ilike.${pattern}`, `action.ilike.${pattern}`,
        ...((profiles.data || []).map(p => `user_id.eq.${p.id}`)),
        ...((members.data || []).flatMap(m => [`description.ilike.%${m.id}%`, `record_id.eq.${m.id}`])),
      ];
      query = query.or(searchClauses.join(','));
    }
  }
  const first = (safePage - 1) * safeSize;
  const { data, count, error } = await query.order('created_at', { ascending: false })
    .order('id', { ascending: false }).range(first, first + safeSize - 1);
  if (error) throw error;
  const logs = data || [];
  const userIds = [...new Set(logs.map(l => l.user_id).filter(Boolean))];
  const profileMap = {};
  if (userIds.length) {
    const { data: profiles, error: profileError } = await supabase.from('profiles')
      .select('id, full_name, email').in('id', userIds);
    if (profileError) console.warn('[logService] profiles:', profileError.message);
    (profiles || []).forEach(p => { profileMap[p.id] = p; });
  }
  const rows = await attachAffectedMembers(logs.map(log => ({
    ...log,
    action: normalizeActivityAction(log.action),
    user_name: profileMap[log.user_id]?.full_name || profileMap[log.user_id]?.email || null,
  })));
  return { rows, total: count || 0 };
}

export async function createLog(payload) {
  const normalizedPayload = {
    ...payload,
    action: normalizeActivityAction(payload?.action),
  };
  const { error } = await supabase.from('activity_logs').insert(normalizedPayload);
  if (error) console.warn('[logService] createLog failed:', error.message);
}

async function resolveActivityUserId(userId) {
  if (userId !== undefined) return userId;

  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

// ─── Track user activity ──────────────────────────────────────────────────────
// module: 'loan' | 'cbu' | 'savings' | 'member' | 'voucher' | 'logs' | etc.
// action: 'create' | 'update' | 'delete' | 'view' | 'approve' | 'reject' | 'export'
export async function trackActivity({ userId, module, action, description, recordId = null }) {
  const resolvedUserId = await resolveActivityUserId(userId);
  await createLog({
    user_id: resolvedUserId,
    module: module || 'system',
    action: action || 'activity',
    description: description || '',
    record_id: recordId,
  });
}

// ─── Structured audit event (with before/after values) ───────────────────────
// Use this for critical operations: loan payments, status changes, approvals.
// oldValues / newValues should be plain objects with the relevant changed fields.
export async function trackAuditEvent({
  userId,
  entityType,
  entityId,
  action,
  oldValues = null,
  newValues = null,
  description = '',
}) {
  const resolvedUserId = await resolveActivityUserId(userId);

  let detail = description || `${action} on ${entityType}`;
  if (oldValues || newValues) {
    const changeSummary = [];
    if (oldValues && newValues) {
      for (const key of Object.keys(newValues)) {
        const prev = oldValues[key];
        const next = newValues[key];
        if (prev !== next) {
          changeSummary.push(`${key}: ${prev} → ${next}`);
        }
      }
    }
    if (changeSummary.length > 0) {
      detail = `${detail} | ${changeSummary.join(', ')}`.slice(0, 500);
    }
  }

  await createLog({
    user_id:   resolvedUserId,
    module:    entityType?.toLowerCase() || 'unknown',
    action,
    description: detail,
    record_id: entityId,
  });
}

// ─── Get audit history for a specific record ─────────────────────────────────
export async function getAuditHistory(entityId, entityType = null) {
  let query = supabase
    .from('activity_logs')
    .select('id, action, module, description, user_id, created_at, record_id')
    .eq('record_id', entityId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (entityType) {
    query = query.eq('module', entityType.toLowerCase());
  }

  const { data, error } = await query;
  if (error) throw error;
  const logs = data || [];

  const userIds = [...new Set(logs.map(l => l.user_id).filter(Boolean))];
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds);
    const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
    return logs.map(log => ({
      ...log,
      user_name: profileMap[log.user_id]?.full_name || profileMap[log.user_id]?.email || null,
    }));
  }

  return logs;
}

// ─── Realtime subscription ────────────────────────────────────────────────────
export function subscribeToLogs(onChange) {
  const channel = supabase
    .channel('activity-logs-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'activity_logs' },
      onChange
    )
    .subscribe();
  return channel;
}
