import { supabase } from './supabase';

const PENALTY_COLUMNS = [
  'member_id',
  'loan_id',
  'amount',
  'description',
  'penalty_date',
  'created_by',
  'days_overdue',
  'is_collected',
];

function sanitizePenaltyPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([k, v]) => PENALTY_COLUMNS.includes(k) && v !== '' && v !== undefined && v !== null
    )
  );
}

/**
 * Calculate penalty amount: balance × daily_rate% × days_overdue.
 * Default rate is 0.1% per day (configurable by the coop).
 */
export function calculatePenaltyAmount(loanBalance, daysOverdue, dailyRatePercent = 0.1) {
  if (daysOverdue <= 0 || loanBalance <= 0) return 0;
  const rate = dailyRatePercent / 100;
  return Math.round(loanBalance * rate * daysOverdue * 100) / 100;
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

/**
 * Get penalties for a specific loan.
 * Requires loan_id column on penalties table (see migration SQL).
 */
export async function getLoanPenalties(loanId) {
  const { data, error } = await supabase
    .from('penalties')
    .select('*')
    .eq('loan_id', loanId)
    .order('penalty_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Create a penalty tied to a specific loan.
 * Requires loan_id column on penalties table (see migration SQL).
 */
export async function createLoanPenalty({ loanId, memberId, amount, description, penaltyDate, daysOverdue = 0, createdBy }) {
  const clean = sanitizePenaltyPayload({
    loan_id:      loanId,
    member_id:    memberId,
    amount,
    description,
    penalty_date: penaltyDate,
    days_overdue: daysOverdue,
    created_by:   createdBy,
    is_collected: false,
  });

  const { data, error } = await supabase
    .from('penalties')
    .insert(clean)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Mark a loan penalty as collected.
 */
export async function markPenaltyCollected(penaltyId) {
  const { data, error } = await supabase
    .from('penalties')
    .update({ is_collected: true })
    .eq('id', penaltyId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get all uncollected penalties with a loan_id set (for accrual management).
 */
export async function getUncollectedLoanPenalties() {
  const { data, error } = await supabase
    .from('penalties')
    .select('*, loans(loan_no, balance, status, member_id)')
    .eq('is_collected', false)
    .not('loan_id', 'is', null)
    .order('penalty_date', { ascending: false });

  if (error) throw error;
  return data || [];
}