import { supabase } from './supabase';

const PENALTY_COLUMNS = [
  'member_id',
  'amount',
  'description',
  'penalty_date',
  'created_by',
];

function sanitizePenaltyPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([k, v]) => PENALTY_COLUMNS.includes(k) && v !== '' && v !== undefined && v !== null
    )
  );
}

export async function getPenaltiesByMemberId(memberId) {
  const { data, error } = await supabase
    .from('penalties')
    .select('*')
    .eq('member_id', memberId)
    .order('penalty_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getPenaltyTotalByMemberId(memberId) {
  const penalties = await getPenaltiesByMemberId(memberId);
  return penalties.reduce((sum, row) => sum + (parseFloat(row.amount) || 0), 0);
}

export async function createPenalty(payload) {
  const clean = sanitizePenaltyPayload(payload);

  const { data, error } = await supabase
    .from('penalties')
    .insert(clean)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deletePenalty(id) {
  const { error } = await supabase
    .from('penalties')
    .delete()
    .eq('id', id);

  if (error) throw error;
}