import { supabase } from './supabase';

export async function getTransactions(filters = {}) {
  let query = supabase
    .from('transactions')
    .select('*')
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters.type) query = query.eq('type', filters.type);
  if (filters.category) query = query.eq('category', filters.category);
  if (filters.from) query = query.gte('transaction_date', filters.from);
  if (filters.to) query = query.lte('transaction_date', filters.to);

  const { data: transactions, error } = await query;
  if (error) throw error;

  const memberIds = [...new Set((transactions || []).map(t => t.member_id).filter(Boolean))];
  if (memberIds.length === 0) return transactions || [];

  const { data: members } = await supabase
    .from('members')
    .select('id, first_name, last_name, middle_initial, member_no')
    .in('id', memberIds);

  const memberMap = Object.fromEntries((members || []).map(m => [m.id, m]));
  return (transactions || []).map(t => ({ ...t, members: memberMap[t.member_id] || null }));
}

export async function getTransactionsByMemberId(memberId) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('member_id', memberId)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createTransaction(payload) {
  const finalPayload = {
    ...payload,
    transaction_date:
      payload.transaction_date ||
      new Date().toISOString().split('T')[0],
  };

  console.log('[createTransaction] inserting:', JSON.stringify(finalPayload, null, 2));

  const { data, error } = await supabase
    .from('transactions')
    .insert(finalPayload)
    .select()
    .single();

  if (error) {
    console.error('[createTransaction] FAILED');
    console.error('  message :', error.message);
    console.error('  code    :', error.code);
    console.error('  details :', error.details);
    console.error('  hint    :', error.hint);
    console.error('  payload :', JSON.stringify(finalPayload, null, 2));
    throw error;
  }

  console.log('[createTransaction] success → id:', data.id);
  return data;
}

export async function deleteTransaction(id) {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

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