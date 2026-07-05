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
  // Kiddy & Youth Savings fields — omitting these silently drops them from
  // any update payload (e.g. syncing kiddy_savings_type from an invoice
  // payment), which can leave an update with zero columns to set.
  'place_of_birth',
  'school',
  'grade_year_level',
  'guardian_name',
  'guardian_relationship',
  'guardian_address',
  'guardian_valid_id',
  'guardian_id_number',
  'kiddy_savings_type',
];

// For CREATE: strip empty strings and undefined (don't send blank fields on insert)
function sanitizeCreatePayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([k, v]) => MEMBER_COLUMNS.includes(k) && v !== '' && v !== undefined
    )
  );
}

// For UPDATE: send null for cleared fields so the DB is actually cleared.
// Empty string → null; undefined → skip entirely (unknown field).
function sanitizeUpdatePayload(payload) {
  return Object.fromEntries(
    Object.entries(payload)
      .filter(([k]) => MEMBER_COLUMNS.includes(k))
      .map(([k, v]) => [k, v === '' ? null : v])
      .filter(([, v]) => v !== undefined)
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
  const clean = sanitizeCreatePayload(payload);

  const { data, error } = await supabase
    .from('members')
    .insert(clean)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateMember(id, payload) {
  const clean = sanitizeUpdatePayload(payload);

  // An update with zero columns is a no-op — sending it anyway is what
  // produced the "Cannot coerce the result to a single JSON object" error
  // (a 0-column PATCH can come back with no representable row). Just
  // return the current record instead of making a pointless request.
  if (Object.keys(clean).length === 0) {
    return getMemberById(id);
  }

  const { data, error } = await supabase
    .from('members')
    .update(clean)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error('Could not update this member — the record may no longer exist.');
  }
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
  const member = await getMemberById(id);
  const currentStatus = member?.status || 'active';

  const dependencies = await getMemberDeleteDependencies(id);
  const protectedExists = hasProtectedRecords(dependencies);

  // Active member with protected records → archive
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

  // Inactive member with protected records → block
  if (currentStatus === 'inactive' && protectedExists) {
    throw new Error(
      'This inactive member still has financial/history records and cannot be permanently deleted.'
    );
  }

  // No protected records → hard delete
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
    toCreate.push({ member_id: memberId, account_type: 'cbu', balance: 0, status: 'active' });
  }
  if (!existingTypes.includes('savings')) {
    toCreate.push({ member_id: memberId, account_type: 'savings', balance: 0, status: 'active' });
  }

  if (toCreate.length === 0) return [];

  const { data, error } = await supabase.from('accounts').insert(toCreate).select();
  if (error) throw error;
  return data || [];
}

export async function searchMembers(query) {
  const sanitized = String(query || '')
    .replace(/[,.()\"'\\%;]/g, '')
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
  const members = data || [];

  const total     = members.length;
  const active    = members.filter(m => m.status === 'active').length;
  const inactive  = members.filter(m => m.status === 'inactive').length;
  const regular   = members.filter(m => m.membership_type === 'regular').length;
  const associate = members.filter(m => m.membership_type === 'associate').length;
  const kiddy     = members.filter(m => m.membership_type === 'kiddy').length;

  // Active count per membership type — used for sub-labels in Reports cards
  const activeKiddy     = members.filter(m => m.membership_type === 'kiddy'     && m.status === 'active').length;
  const activeRegular   = members.filter(m => m.membership_type === 'regular'   && m.status === 'active').length;
  const activeAssociate = members.filter(m => m.membership_type === 'associate' && m.status === 'active').length;

  return {
    total,
    active,
    inactive,
    regular,
    associate,
    kiddy,
    activeKiddy,
    activeRegular,
    activeAssociate,
  };
}