import { supabase } from './supabase';

export async function getTransactions(filters = {}) {
  let query = supabase
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters.type)     query = query.eq('type', filters.type);
  if (filters.category) query = query.eq('category', filters.category);
  if (filters.from)     query = query.gte('created_at', filters.from);
  if (filters.to)       query = query.lte('created_at', filters.to);

  const { data: transactions, error } = await query;
  if (error) throw error;

  const memberIds = [...new Set(transactions.map(t => t.member_id).filter(Boolean))];
  if (memberIds.length === 0) return transactions;

  const { data: members } = await supabase
    .from('members')
    .select('id, first_name, last_name, member_no')
    .in('id', memberIds);

  const memberMap = Object.fromEntries((members || []).map(m => [m.id, m]));
  return transactions.map(t => ({ ...t, members: memberMap[t.member_id] || null }));
}

export async function getTransactionsByMemberId(memberId) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createTransaction(payload) {
  // ── Debug: log every payload so we can trace exactly what hits the DB
  console.log('[createTransaction] inserting:', JSON.stringify(payload, null, 2));

  const { data, error } = await supabase
    .from('transactions')
    .insert(payload)
    .select()
    .single();

  if (error) {
    // Log the full Supabase error object — this surfaces trigger exceptions,
    // RLS violations, and NOT NULL constraint failures in the browser console.
    console.error('[createTransaction] FAILED');
    console.error('  message :', error.message);
    console.error('  code    :', error.code);
    console.error('  details :', error.details);
    console.error('  hint    :', error.hint);
    console.error('  payload :', JSON.stringify(payload, null, 2));
    throw error;
  }

  console.log('[createTransaction] success → id:', data.id);
  return data;
}

export async function deleteTransaction(id) {
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
}

// ─── Realtime subscription ────────────────────────────────────────────────────
// Returns the channel so the caller can unsubscribe on cleanup.
//
// Usage in a component:
//   const channel = subscribeToTransactions(() => refetch());
//   return () => supabase.removeChannel(channel);
//
export function subscribeToTransactions(onChange) {
  const channel = supabase
    .channel('transactions-realtime')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'transactions' },
      onChange
    )
    .subscribe();
  return channel;
}