import { supabase } from './supabase';

const LOAN_COLUMNS = [
  'member_id',
  'loan_no',
  'amount',
  'balance',
  'interest_rate',
  'term_months',
  'monthly_amortization',
  'release_date',
  'due_date',
  'status',
  'purpose',
  'notes',
  'repayment_frequency',

  'loan_method',

  'loan_proposal',
  'service_fee',
  'share_capital',
  'loan_insurance',
  'regular_savings',
  'total_loan_payable',

  'service_fee_percent',
  'cbu_retention_percent',
  'notarial_fee',
  'insurance_mode',
  'insurance_fixed_rate_percent',
  'insurance_manual_amount',
  'cbu_per_period',
  'savings_per_period',

  'team_leader_name',
  'team_leader_id_no',
  'team_leader_account_no',
  'team_leader_mobile',

  'preview_summary_json',
  'preview_deductions_json',
  'preview_schedule_json',
];

function sanitizeLoanPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([k, v]) => LOAN_COLUMNS.includes(k) && v !== '' && v !== undefined && v !== null
    )
  );
}

function parseJSONSafe(value, fallback) {
  try {
    if (value == null) return fallback;
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
}

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export async function getLoans() {
  const { data: loans, error } = await supabase
    .from('loans')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  const memberIds = [...new Set((loans || []).map(l => l.member_id).filter(Boolean))];
  if (memberIds.length === 0) return loans || [];

  const { data: members } = await supabase
    .from('members')
    .select('id, first_name, last_name, middle_initial, member_no, membership_type, phone')
    .in('id', memberIds);

  const memberMap = Object.fromEntries((members || []).map(m => [m.id, m]));
  return (loans || []).map(l => ({ ...l, members: memberMap[l.member_id] || null }));
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
      .select(`
        id,
        first_name,
        last_name,
        middle_initial,
        member_no,
        membership_type,
        email,
        phone,
        address,
        civil_status,
        sex,
        date_of_birth,
        res_tel_no,
        occupation,
        tin_no,
        sss_id_no,
        beneficiary_name,
        beneficiary_address,
        beneficiary_tel
      `)
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
  return data || [];
}

export async function createLoan(payload) {
  const amount = Number(payload.amount || 0);

  const withDefaults = {
    ...payload,
    amount,
    balance: amount,
    status: payload.status || 'active',
    repayment_frequency: payload.repayment_frequency || 'weekly',
    loan_method: payload.loan_method || 'diminishing',
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
  const { error } = await supabase
    .from('loans')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function getLoanStats() {
  const { data, error } = await supabase
    .from('loans')
    .select('status, amount, balance');

  if (error) throw error;

  const active = (data || []).filter(l => l.status === 'active');

  return {
    total: (data || []).length,
    active: active.length,
    totalReleased: (data || []).reduce((s, l) => s + (l.amount || 0), 0),
    totalOutstanding: active.reduce((s, l) => s + (l.balance || 0), 0),
  };
}

/**
 * Marks the next unpaid amortization row(s) as paid based on the posted amount.
 * This fixes the "Next Due stays the same after payment" issue.
 */
export async function applyLoanPaymentToSchedule(loanId, paymentAmount) {
  const amountToApply = round2(paymentAmount);
  if (!loanId || amountToApply <= 0) {
    throw new Error('Valid loan id and payment amount are required.');
  }

  const loan = await getLoanById(loanId);

  const schedule = parseJSONSafe(loan.preview_schedule_json, []);
  const summary = parseJSONSafe(loan.preview_summary_json, {});

  if (!Array.isArray(schedule) || schedule.length === 0) {
    return loan;
  }

  let remaining = amountToApply;

  const updatedSchedule = schedule.map((row) => ({ ...row }));

  for (let i = 0; i < updatedSchedule.length; i += 1) {
    const row = updatedSchedule[i];
    if (row.paid) continue;

    const rowDue = round2(
      row.total_due ??
      row.payment ??
      row.amount_due ??
      0
    );

    if (rowDue <= 0) continue;

    // full payment of this row
    if (remaining >= rowDue) {
      row.paid = true;
      row.paid_amount = rowDue;
      row.paid_at = new Date().toISOString();
      remaining = round2(remaining - rowDue);
      continue;
    }

    // partial payment
    row.paid = false;
    row.partial_paid = true;
    row.partial_paid_amount = round2((row.partial_paid_amount || 0) + remaining);
    row.remaining_due = round2(rowDue - row.partial_paid_amount);
    row.last_partial_paid_at = new Date().toISOString();
    remaining = 0;
    break;
  }

  const unpaidRows = updatedSchedule.filter(r => !r.paid);
  const nextUnpaid = unpaidRows[0] || null;
  const newDueDate = nextUnpaid?.due_date || loan.due_date || null;

  const updatedSummary = {
    ...summary,
    next_due_date: nextUnpaid?.due_date || null,
    next_due_amount: round2(
      nextUnpaid?.remaining_due ??
      nextUnpaid?.total_due ??
      nextUnpaid?.payment ??
      0
    ),
  };

  const { data, error } = await supabase
    .from('loans')
    .update({
      due_date: newDueDate,
      preview_schedule_json: JSON.stringify(updatedSchedule),
      preview_summary_json: JSON.stringify(updatedSummary),
    })
    .eq('id', loanId)
    .select()
    .single();

  if (error) throw error;
  return data;
}