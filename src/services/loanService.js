import { supabase } from './supabase';

// ── Inlined helpers (no external engine dependency) ───────────────────────────
// These are kept here so loanService.js never fails to load due to a missing file.

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function loanFingerprint(memberId, releaseDate, amount) {
  return `${memberId}|${releaseDate || ''}|${round2(safeNum(amount))}`;
}

function applyPaymentToSchedule(schedule, paymentAmount) {
  if (!Array.isArray(schedule) || schedule.length === 0)
    return { schedule: [], applied: 0, remaining: safeNum(paymentAmount) };

  let remaining = round2(safeNum(paymentAmount));
  let applied = 0;
  const updated = schedule.map(r => ({ ...r }));

  for (let i = 0; i < updated.length; i++) {
    const row = updated[i];
    if (row.paid) continue;
    const rowDue = round2(row.remaining_due ?? row.total_due ?? row.payment ?? 0);
    if (rowDue <= 0) continue;

    if (remaining >= rowDue) {
      row.paid = true;
      row.paid_amount = rowDue;
      row.paid_at = new Date().toISOString();
      row.remaining_due = 0;
      row.partial_paid = false;
      applied = round2(applied + rowDue);
      remaining = round2(remaining - rowDue);
    } else if (remaining > 0) {
      row.paid = false;
      row.partial_paid = true;
      row.paid_amount = round2((row.paid_amount || 0) + remaining);
      row.partial_paid_amount = row.paid_amount;
      row.remaining_due = round2(rowDue - row.paid_amount);
      row.last_partial_paid_at = new Date().toISOString();
      applied = round2(applied + remaining);
      remaining = 0;
      break;
    } else {
      break;
    }
  }
  return { schedule: updated, applied, remaining };
}

function computeLoanStatus(balance, dueDate, schedule = []) {
  const bal = safeNum(balance);
  if (bal <= 0) return 'paid';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (Array.isArray(schedule) && schedule.length > 0) {
    const nextUnpaid = schedule.find(r => !r.paid);
    if (nextUnpaid?.due_date) {
      const due = new Date(nextUnpaid.due_date);
      due.setHours(0, 0, 0, 0);
      if (due < today) return 'overdue';
    }
    if (schedule.some(r => r.partial_paid)) return 'partial';
  } else if (dueDate) {
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    if (due < today) return 'overdue';
  }
  return 'active';
}

function buildScheduleSummary(schedule, loanParams = {}) {
  if (!Array.isArray(schedule) || schedule.length === 0) return {};
  const paidRows   = schedule.filter(r => r.paid);
  const unpaidRows = schedule.filter(r => !r.paid);
  const nextUnpaid = unpaidRows[0] || null;
  const totalPrincipal = round2(schedule.reduce((s, r) => s + (r.principal || 0), 0));
  const totalInterest  = round2(schedule.reduce((s, r) => s + (r.interest  || 0), 0));
  const totalCbu       = round2(schedule.reduce((s, r) => s + (r.cbu_paid  || 0), 0));
  const totalSavings   = round2(schedule.reduce((s, r) => s + (r.savings_paid || 0), 0));
  const totalPayment   = round2(totalPrincipal + totalInterest + totalCbu + totalSavings);
  const principal      = safeNum(loanParams.amount ?? totalPrincipal);
  const roiPercent     = principal > 0 ? round2((totalInterest / principal) * 100) : 0;
  return {
    number_of_payments:       schedule.length,
    paid_periods:             paidRows.length,
    payment_per_period:       schedule[0]?.total_due || 0,
    payment_frequency:        loanParams.frequency || loanParams.repayment_frequency || 'monthly',
    loan_method:              loanParams.method || loanParams.loan_method || 'diminishing',
    total_principal_collected: totalPrincipal,
    total_interest_earned:    totalInterest,
    total_cbu_collected:      totalCbu,
    total_savings_collected:  totalSavings,
    total_payments_collected: totalPayment,
    total_roi_percent:        roiPercent,
    next_due_date:            nextUnpaid?.due_date || null,
    next_due_amount:          round2(nextUnpaid?.remaining_due ?? nextUnpaid?.total_due ?? nextUnpaid?.payment ?? 0),
  };
}

const LOAN_COLUMNS = [
  'member_id', 'loan_no', 'amount', 'balance', 'interest_rate', 'term_months',
  'monthly_amortization', 'release_date', 'due_date', 'status', 'purpose', 'notes',
  'repayment_frequency', 'loan_method', 'source',

  'loan_proposal', 'service_fee', 'share_capital', 'loan_insurance', 'regular_savings',
  'total_loan_payable', 'previous_loan_balance', 'annual_dues',

  'service_fee_percent', 'cbu_retention_percent', 'notarial_fee', 'insurance_mode',
  'insurance_fixed_rate_percent', 'insurance_manual_amount', 'cbu_per_period',
  'savings_per_period',

  'team_leader_name', 'team_leader_id_no', 'team_leader_account_no', 'team_leader_mobile',
  'deduction_payment_mode',

  'preview_summary_json', 'preview_deductions_json', 'preview_schedule_json',
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
    // Spread caller's payload first so all provided values are preserved
    ...payload,

    // Always normalise amount
    amount,

    // Preserve imported/provided balance — only default to full amount if not supplied
    balance: payload.balance != null ? Number(payload.balance) : amount,

    // Preserve provided status — only default if not supplied
    status: payload.status || 'active',

    // Preserve provided source — default to 'manual' if not supplied
    source: payload.source || 'manual',

    repayment_frequency: payload.repayment_frequency || 'monthly',
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
 * Apply a loan payment to the amortization schedule using the unified engine.
 * Updates the loan's schedule JSON, summary JSON, balance, due date, and status.
 */
export async function applyLoanPaymentToSchedule(loanId, paymentAmount) {
  const amount = round2(safeNum(paymentAmount));
  if (!loanId || amount <= 0) throw new Error('Valid loan ID and payment amount are required.');

  const loan = await getLoanById(loanId);
  const schedule = parseJSONSafe(loan.preview_schedule_json, []);
  const summary = parseJSONSafe(loan.preview_summary_json, {});

  if (!Array.isArray(schedule) || schedule.length === 0) return loan;

  // Engine handles all payment allocation
  const { schedule: updatedSchedule } = applyPaymentToSchedule(schedule, amount);

  // Recompute balance from remaining unpaid principal
  const unpaidPrincipal = round2(
    updatedSchedule.filter(r => !r.paid).reduce((s, r) => s + (r.principal || 0), 0)
  );
  const newBalance = unpaidPrincipal;

  // Recompute status using engine
  const nextUnpaid = updatedSchedule.find(r => !r.paid);
  const newStatus = computeLoanStatus(newBalance, nextUnpaid?.due_date, updatedSchedule);

  // Rebuild summary
  const updatedSummary = buildScheduleSummary(updatedSchedule, {
    amount: loan.amount,
    frequency: loan.repayment_frequency,
    method: loan.loan_method,
  });

  const { data, error } = await supabase
    .from('loans')
    .update({
      balance: newBalance,
      status: newStatus,
      due_date: nextUnpaid?.due_date || loan.due_date || null,
      preview_schedule_json: JSON.stringify(updatedSchedule),
      preview_summary_json: JSON.stringify(updatedSummary),
    })
    .eq('id', loanId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Check if a loan already exists (duplicate detection for imports).
 */
export async function findDuplicateLoan(memberId, releaseDate, amount) {
  const fp = loanFingerprint(memberId, releaseDate, amount);
  const { data } = await supabase
    .from('loans')
    .select('id, loan_no, created_at')
    .eq('member_id', memberId)
    .eq('amount', round2(safeNum(amount)));

  if (!data || data.length === 0) return null;

  // Further check release date
  if (releaseDate) {
    return data.find(l => l.release_date === releaseDate) || null;
  }
  return data[0] || null;
}