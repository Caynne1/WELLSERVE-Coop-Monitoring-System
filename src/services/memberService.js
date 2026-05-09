import { supabase } from './supabase';

const MEMBER_COLUMNS = [
  'first_name',
  'last_name',
  'middle_initial',
  'member_no',
  'email',
  'phone',
  'address',
  'civil_status',
  'sex',
  'date_of_birth',
  'res_tel_no',
  'occupation',
  'tin_no',
  'sss_id_no',
  'recruiter_name',
  'status',
  'notes',
  'date_joined',
  'membership_type',
  'beneficiary_name',
  'beneficiary_address',
  'beneficiary_tel',
  'record_type',
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
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
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

async function getMemberDeleteDependencies(memberId) {
  const tablesToCheck = [
    'invoices',
    'transactions',
    'loans',
    'penalties',
    'member_memberships',
  ];

  const dependencies = {};

  for (const table of tablesToCheck) {
    const { count, error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('member_id', memberId);

    if (error) throw error;
    dependencies[table] = count || 0;
  }

  return dependencies;
}

function hasProtectedRecords(dependencies) {
  return Object.values(dependencies).some(count => count > 0);
}

async function hardDeleteMember(id) {
  const { error: accountsError } = await supabase
    .from('accounts')
    .delete()
    .eq('member_id', id);

  if (accountsError) throw accountsError;

  const { error: memberError } = await supabase
    .from('members')
    .delete()
    .eq('id', id);

  if (memberError) throw memberError;

  return {
    success: true,
    action: 'deleted',
    message: 'Member deleted successfully.',
  };
}

export async function deleteMember(id) {
  // Read current member status first so the UI can use one delete button
  // while the backend decides whether to archive or hard-delete.
  const member = await getMemberById(id);
  const currentStatus = member?.status || 'active';

  const dependencies = await getMemberDeleteDependencies(id);
  const protectedExists = hasProtectedRecords(dependencies);

  // Case 1:
  // Active member with protected/accounting records → archive instead of delete
  if (currentStatus === 'active' && protectedExists) {
    const { data, error: updateError } = await supabase
      .from('members')
      .update({ status: 'inactive' })
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    return {
      success: true,
      action: 'archived',
      member: data,
      message:
        'Member has existing financial/history records and was moved to Inactive instead of being deleted.',
    };
  }

  // Case 2:
  // Inactive member with protected/accounting records → block permanent delete
  if (currentStatus === 'inactive' && protectedExists) {
    throw new Error(
      'This inactive member still has financial/history records and cannot be permanently deleted.'
    );
  }

  // Case 3:
  // No protected records → safe hard delete
  return await hardDeleteMember(id);
}

export async function initializeMemberAccounts(memberId) {
  const { data: existing, error: existingError } = await supabase
    .from('accounts')
    .select('account_type')
    .eq('member_id', memberId);

  if (existingError) throw existingError;

  const existingTypes = (existing || []).map(a => a.account_type);
  const toCreate = [];

  if (!existingTypes.includes('cbu')) {
    toCreate.push({
      member_id: memberId,
      account_type: 'cbu',
      balance: 0,
      status: 'active',
    });
  }

  if (!existingTypes.includes('savings')) {
    toCreate.push({
      member_id: memberId,
      account_type: 'savings',
      balance: 0,
      status: 'active',
    });
  }

  if (toCreate.length === 0) return [];

  const { data, error } = await supabase
    .from('accounts')
    .insert(toCreate)
    .select();

  if (error) throw error;
  return data || [];
}

export async function searchMembers(query) {
  // Sanitize: strip characters that could manipulate PostgREST filter syntax
  const sanitized = String(query || '')
    .replace(/[,.()"'\\%;]/g, '')
    .trim();

  if (!sanitized) return [];

  const { data, error } = await supabase
    .from('members')
    .select('id, first_name, last_name, middle_initial, member_no, email, phone, membership_type, status, recruiter_name')
    .or(
      `first_name.ilike.%${sanitized}%,last_name.ilike.%${sanitized}%,member_no.ilike.%${sanitized}%,recruiter_name.ilike.%${sanitized}%`
    )
    .order('first_name')
    .limit(20);

  if (error) throw error;
  return data || [];
}

export async function getMemberStats() {
  const { data, error } = await supabase
    .from('members')
    .select('id, status, membership_type');

  if (error) throw error;

  return {
    total: data.length,
    active: data.filter(m => m.status === 'active').length,
    inactive: data.filter(m => m.status === 'inactive').length,
    associate: data.filter(m => m.membership_type === 'associate').length,
    regular: data.filter(m => m.membership_type === 'regular').length,
  };
}