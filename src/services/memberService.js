import { supabase } from './supabase';

// Strips out any keys that aren't real columns to prevent schema cache errors.
// Add or remove keys here to match your actual `members` table columns.
const MEMBER_COLUMNS = [
  'first_name', 'last_name', 'member_no', 'email', 'phone',
  'address', 'status', 'notes',
  // Uncomment only if these columns exist in your DB:
  // 'date_of_birth', 'gender', 'occupation',
];

function sanitizeMemberPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([k, v]) => MEMBER_COLUMNS.includes(k) && v !== '' && v !== undefined
    )
  );
}

export async function getMembers() {
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getMemberById(id) {
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function createMember(payload) {
  const clean = sanitizeMemberPayload(payload);
  const { data, error } = await supabase
    .from('members')
    .insert(clean)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateMember(id, payload) {
  const clean = sanitizeMemberPayload(payload);
  const { data, error } = await supabase
    .from('members')
    .update(clean)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMember(id) {
  // Delete linked accounts first to avoid FK constraint errors
  await supabase.from('accounts').delete().eq('member_id', id);

  const { error } = await supabase
    .from('members')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function initializeMemberAccounts(memberId) {
  const { data: existing } = await supabase
    .from('accounts')
    .select('account_type')
    .eq('member_id', memberId);

  const existingTypes = (existing || []).map(a => a.account_type);
  const toCreate = [];

  if (!existingTypes.includes('cbu')) {
    toCreate.push({ member_id: memberId, account_type: 'cbu', balance: 0, status: 'active' });
  }
  if (!existingTypes.includes('savings')) {
    toCreate.push({ member_id: memberId, account_type: 'savings', balance: 0, status: 'active' });
  }
  if (toCreate.length === 0) return;

  const { error } = await supabase.from('accounts').insert(toCreate);
  if (error) throw error;
}

export async function searchMembers(query) {
  const { data, error } = await supabase
    .from('members')
    .select('id, first_name, last_name, member_no, email')
    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,member_no.ilike.%${query}%`)
    .order('first_name')
    .limit(20);
  if (error) throw error;
  return data;
}

export async function getMemberStats() {
  const { data, error } = await supabase.from('members').select('id, status');
  if (error) throw error;
  return {
    total: data.length,
    active: data.filter(m => m.status === 'active').length,
  };
}