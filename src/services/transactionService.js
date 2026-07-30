import { notifyPayment } from './notificationService';
import { supabase } from './supabase';
import { trackActivity } from './logService';

async function getCurrentUserId() {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

function formatMoney(value) {
  return `PHP ${Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function transactionDirection(type = '') {
  const normalized = String(type || '').toLowerCase();
  if (['withdrawal', 'loan_release', 'expense', 'check_release'].includes(normalized)) return 'OUT';
  return 'IN';
}

function buildTransactionAuditDescription(tx, action = 'recorded') {
  const parts = [
    `${transactionDirection(tx.type)} ${String(tx.type || 'transaction').replace(/_/g, ' ')}`,
    tx.category ? `category ${tx.category}` : null,
    `amount ${formatMoney(tx.amount)}`,
    tx.member_id ? `member ${tx.member_id}` : null,
    tx.reference ? `reference ${tx.reference}` : null,
    tx.payment_mode ? `mode ${tx.payment_mode}` : null,
    tx.transaction_date ? `date ${tx.transaction_date}` : null,
  ].filter(Boolean);

  return `Financial transaction ${action}: ${parts.join(' | ')}.`;
}

export async function getTransactions(filters = {}) {
  let query = supabase
    .from('transactions')
    .select('*')
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters.type) query = query.eq('type', filters.type);
  if (filters.category) query = query.eq('category', filters.category);
  if (filters.payment_mode) query = query.eq('payment_mode', filters.payment_mode);
  if (filters.from) query = query.gte('transaction_date', filters.from);
  if (filters.to) query = query.lte('transaction_date', filters.to);

  const { data: transactions, error } = await query;
  if (error) throw error;

  const txList = transactions || [];

  const memberIds = [...new Set(txList.map(t => t.member_id).filter(Boolean))];
  const createdByIds = [...new Set(txList.map(t => t.created_by).filter(Boolean))];

  const [membersResult, profilesResult] = await Promise.all([
    memberIds.length > 0
      ? supabase.from('members').select('id, first_name, last_name, middle_initial, member_no').in('id', memberIds)
      : Promise.resolve({ data: [] }),
    createdByIds.length > 0
      ? supabase.from('profiles').select('id, full_name, email').in('id', createdByIds)
      : Promise.resolve({ data: [] }),
  ]);

  const memberMap = Object.fromEntries((membersResult.data || []).map(m => [m.id, m]));
  const profileMap = Object.fromEntries((profilesResult.data || []).map(p => [p.id, p.full_name || p.email]));

  return txList.map(t => ({
    ...t,
    members: memberMap[t.member_id] || null,
    created_by_name: t.created_by ? (profileMap[t.created_by] || t.created_by) : 'System',
  }));
}

export async function getTransactionsByMemberId(memberId) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('member_id', memberId)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  const txList = data || [];

  // Resolve created_by UUIDs to user full names
  const createdByIds = [...new Set(txList.map(t => t.created_by).filter(Boolean))];
  if (createdByIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', createdByIds);
    const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p.full_name || p.email]));
    return txList.map(t => ({
      ...t,
      created_by_name: t.created_by ? (profileMap[t.created_by] || t.created_by) : 'System',
    }));
  }

  return txList.map(t => ({ ...t, created_by_name: 'System' }));
}

export async function createTransaction(payload) {
  const currentUserId = payload.created_by || await getCurrentUserId();
  const finalPayload = {
    ...payload,
    created_by: currentUserId,
    transaction_date:
      payload.transaction_date ||
      new Date().toISOString().split('T')[0],
    payment_mode: payload.payment_mode || null,
    payment_mode_note: payload.payment_mode_note || null,
    reference: payload.reference || null,
    notes: payload.notes || null,
  };

  console.log('[createTransaction] inserting:', JSON.stringify(finalPayload, null, 2));

  const { data, error } = await supabase
    .from('transactions')
    .insert(finalPayload)
    .select()
    .maybeSingle();

  if (error) {
    console.error('[createTransaction] FAILED');
    console.error('  message :', error.message);
    console.error('  code    :', error.code);
    console.error('  details :', error.details);
    console.error('  hint    :', error.hint);
    console.error('  payload :', JSON.stringify(finalPayload, null, 2));
    throw error;
  }
  if (!data) {
    throw new Error('The transaction was not recorded — no row was returned after insert.');
  }

  console.log('[createTransaction] success → id:', data.id);

  await trackActivity({
    userId: data.created_by,
    module: 'transaction',
    action: data.type || 'create',
    description: buildTransactionAuditDescription(data, 'recorded'),
    recordId: data.id,
  });

  // Fire payment notification (non-blocking)
  try {
    const amt = Number(data.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 });
    const category = data.category || data.type || 'transaction';
    notifyPayment({
      message: `${category.charAt(0).toUpperCase() + category.slice(1)} of ₱${amt} recorded successfully.`,
      reference_id: data.id,
    }).catch(() => {});
  } catch (_) {}

  return data;
}

export async function deleteTransaction(id, { deletedBy = undefined, reason = '' } = {}) {
  const { data: existing } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id);

  if (error) throw error;

  if (existing) {
    await trackActivity({
      userId: deletedBy ?? existing.created_by,
      module: 'transaction',
      action: 'delete',
      description: `${buildTransactionAuditDescription(existing, 'deleted')}${reason ? ` Reason: ${reason}.` : ''}`,
      recordId: id,
    });
  }
}

export function subscribeToTransactions(onChange) {
  const channel = supabase
    .channel('transactions-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'transactions' },
      onChange
    )
    .subscribe();

  return channel;
}
