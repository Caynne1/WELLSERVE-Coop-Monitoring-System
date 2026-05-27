import { supabase } from './supabase';

// ─── Fetch logs with optional filters ────────────────────────────────────────
// Two-step fetch: get activity_logs first, then resolve user names separately.
// This prevents an RLS block on the join from killing the entire query.
export async function getLogs({ limit = 200, search = '', dateFrom = null, dateTo = null } = {}) {
  let query = supabase
    .from('activity_logs')
    .select('id, action, module, description, user_id, created_at, record_id')
    .order('created_at', { ascending: false })
    .limit(limit);

  // Date range filter — uses the btree index on created_at
  if (dateFrom) {
    query = query.gte('created_at', new Date(dateFrom).toISOString());
  }
  if (dateTo) {
    const end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);
    query = query.lte('created_at', end.toISOString());
  }

  const { data, error } = await query;
  if (error) {
    console.error('[logService] getLogs error:', error.code, error.message, error.hint);
    throw error;
  }

  const logs = data || [];

  // ── Resolve user names in one extra query ──────────────────────────────────
  const userIds = [...new Set(logs.map(l => l.user_id).filter(Boolean))];
  let profileMap = {};

  if (userIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds);

    if (profileError) {
      // Non-fatal — rows will show UID fallback instead of name
      console.warn('[logService] profiles fetch error (check RLS):', profileError.message);
    } else {
      (profiles || []).forEach(p => { profileMap[p.id] = p; });
    }
  }

  // Attach resolved name to each log row
  const rows = logs.map(log => ({
    ...log,
    user_name: profileMap[log.user_id]?.full_name
            || profileMap[log.user_id]?.email
            || null,
  }));

  // Client-side text search across action, module, description, user_name
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    return rows.filter(log =>
      (log.action      || '').toLowerCase().includes(q) ||
      (log.module      || '').toLowerCase().includes(q) ||
      (log.description || '').toLowerCase().includes(q) ||
      (log.user_name   || '').toLowerCase().includes(q)
    );
  }

  return rows;
}

export async function createLog(payload) {
  const { error } = await supabase.from('activity_logs').insert(payload);
  if (error) console.warn('[logService] createLog failed:', error.message);
}

// ─── Track user activity ──────────────────────────────────────────────────────
// module: 'loan' | 'cbu' | 'savings' | 'member' | 'voucher' | 'logs' | etc.
// action: 'create' | 'update' | 'delete' | 'view' | 'approve' | 'reject' | 'export'
export async function trackActivity({ userId, module, action, description, recordId = null }) {
  if (!userId) return;
  await createLog({ user_id: userId, module, action, description, record_id: recordId });
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
  if (!userId) return;

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
    user_id:   userId,
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
      { event: 'INSERT', schema: 'public', table: 'activity_logs' },
      onChange
    )
    .subscribe();
  return channel;
}