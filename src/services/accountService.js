import { supabase } from './supabase';

async function enrichWithMembers(accounts) {
  if (!accounts || accounts.length === 0) return accounts || [];

  const memberIds = [...new Set(accounts.map(a => a.member_id).filter(Boolean))];
  const { data: members } = await supabase
    .from('members')
    .select('id, first_name, last_name, middle_initial, member_no, membership_type, status')
    .in('id', memberIds);

  const memberMap = Object.fromEntries((members || []).map(m => [m.id, m]));
  return accounts.map(a => ({ ...a, members: memberMap[a.member_id] || null }));
}

export async function getAccounts() {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return enrichWithMembers(data);
}

export async function getAccountById(id) {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;

  if (data?.member_id) {
    const { data: member } = await supabase
      .from('members')
      .select('id, first_name, last_name, middle_initial, member_no, email, phone, membership_type')
      .eq('id', data.member_id)
      .single();

    data.members = member || null;
  }

  return data;
}

export async function getAccountsByMemberId(memberId) {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('member_id', memberId)
    .order('account_type');

  if (error) throw error;
  return data || [];
}

export async function getAllCBUAccounts() {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('account_type', 'cbu')
    .order('balance', { ascending: false });

  if (error) throw error;
  return enrichWithMembers(data);
}

export async function getAllSavingsAccounts() {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('account_type', 'savings')
    .order('balance', { ascending: false });

  if (error) throw error;
  return enrichWithMembers(data);
}

export async function createAccount(payload) {
  const { data, error } = await supabase
    .from('accounts')
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateAccount(id, payload) {
  const { data, error } = await supabase
    .from('accounts')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteAccount(id) {
  const { error } = await supabase
    .from('accounts')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function getAccountStats() {
  const { data, error } = await supabase
    .from('accounts')
    .select('account_type, balance');

  if (error) throw error;

  const cbu = data.filter(a => a.account_type === 'cbu');
  const savings = data.filter(a => a.account_type === 'savings');

  return {
    totalCBU: cbu.reduce((s, a) => s + (a.balance || 0), 0),
    totalSavings: savings.reduce((s, a) => s + (a.balance || 0), 0),
    cbuCount: cbu.length,
    savingsCount: savings.length,
  };
}