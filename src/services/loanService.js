import { supabase } from './supabase';

const LOAN_COLUMNS = [
  'member_id', 'loan_no', 'amount', 'balance', 'interest_rate',
  'term_months', 'monthly_amortization', 'release_date', 'due_date',
  'status', 'purpose', 'notes',
];

function sanitizeLoanPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([k, v]) => LOAN_COLUMNS.includes(k) && v !== '' && v !== undefined && v !== null
    )
  );
}

export async function getLoans() {
  const { data: loans, error } = await supabase
    .from('loans')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const memberIds = [...new Set(loans.map(l => l.member_id).filter(Boolean))];
  if (memberIds.length === 0) return loans;

  const { data: members } = await supabase
    .from('members')
    .select('id, first_name, last_name, member_no')
    .in('id', memberIds);

  const memberMap = Object.fromEntries((members || []).map(m => [m.id, m]));
  return loans.map(l => ({ ...l, members: memberMap[l.member_id] || null }));
}

export async function getLoanById(id) {
  const { data: loan, error } = await supabase
    .from('loans')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;

  if (loan.member_id) {
    const { data: member } = await supabase
      .from('members')
      .select('id, first_name, last_name, member_no, email, phone')
      .eq('id', loan.member_id)
      .single();
    loan.members = member || null;
  }
  return loan;
}

export async function getLoansByMemberId(memberId) {
  const { data, error } = await supabase
    .from('loans')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createLoan(payload) {
  const amount = Number(payload.amount || 0);

  // Always inject balance = amount and default status = active.
  // The trigger does NOT handle loan creation — the frontend sets the initial balance here.
  const withDefaults = {
    ...payload,
    amount,
    balance: amount,
    status: payload.status || 'active',
  };

  const clean = sanitizeLoanPayload(withDefaults);
  const { data, error } = await supabase
    .from('loans')
    .insert(clean)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateLoan(id, payload) {
  const clean = sanitizeLoanPayload(payload);
  const { data, error } = await supabase
    .from('loans')
    .update(clean)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteLoan(id) {
  const { error } = await supabase.from('loans').delete().eq('id', id);
  if (error) throw error;
}

export async function getLoanStats() {
  const { data, error } = await supabase.from('loans').select('status, amount, balance');
  if (error) throw error;
  const active = data.filter(l => l.status === 'active');
  return {
    total: data.length,
    active: active.length,
    totalReleased: data.reduce((s, l) => s + (l.amount || 0), 0),
    totalOutstanding: active.reduce((s, l) => s + (l.balance || 0), 0),
  };
}