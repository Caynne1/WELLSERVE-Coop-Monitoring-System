import { supabase } from './supabase';
import { createTransaction } from './transactionService';
import { updateLoan } from './loanService';

function parseJSONSafe(value, fallback = {}) {
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

function memberName(member) {
  return [member?.first_name, member?.last_name].filter(Boolean).join(' ').trim();
}

export function getLoanNetProceeds(loan) {
  const deductions = parseJSONSafe(loan?.preview_deductions_json, {});
  const fromPreview = Number(deductions.net_proceeds || 0);
  if (fromPreview > 0) return round2(fromPreview);

  const totalDeductions = Number(deductions.total_deductions || 0);
  return round2(Math.max(0, Number(loan?.amount || 0) - totalDeductions));
}

export function getLoanDeductionItems(loan) {
  const deductions = parseJSONSafe(loan?.preview_deductions_json, {});
  const items = Array.isArray(deductions.items) ? deductions.items : [];
  const normalized = items
    .map(item => ({
      label: item.label || item.name || 'Loan Deduction',
      amount: round2(item.amount || 0),
      category: deductionCategory(item.label || item.name),
      kind: deductionKind(item.label || item.name),
    }))
    .filter(item => item.amount > 0);

  const extraItems = [
    ['Service Fee', loan?.service_fee, 'service_fee', 'service_fee'],
    ['Insurance', loan?.loan_insurance, 'insurance', 'insurance'],
    ['Legal / Notarial Fee', loan?.notarial_fee, 'legal_fees', 'legal_fees'],
    ['CBU', loan?.share_capital, 'cbu', 'cbu_retention'],
    ['Savings', loan?.regular_savings, 'savings', 'regular_savings'],
    ['Annual Dues', loan?.annual_dues, 'annual_dues', 'annual_dues'],
    ['Penalty Due', loan?.penalty_due, 'penalty', 'penalty'],
    ['Petty Cash', loan?.petty_cash, 'petty_cash', 'petty_cash'],
    ['CBU Completion', loan?.cbu_completion, 'cbu', 'cbu_completion'],
    ['Membership Regulatory Fee', loan?.membership_regulatory_fee, 'membership', 'membership_regulatory_fee'],
    ['Membership Initial Savings', loan?.membership_initial_savings, 'savings', 'membership_initial_savings'],
    ['WELLife VIP Card', loan?.membership_vip_card, 'membership', 'membership_vip_card'],
  ]
    .map(([label, amount, category, kind]) => ({ label, amount: round2(amount || 0), category, kind }))
    .filter(item => item.amount > 0);

  const byKey = new Map();
  [...normalized, ...extraItems].forEach(item => {
    const key = item.kind || `${item.category}|${item.label.toLowerCase()}`;
    if (!byKey.has(key)) byKey.set(key, item);
  });

  return [...byKey.values()];
}

function deductionCategory(label = '') {
  const text = String(label).toLowerCase();
  if (text.includes('service')) return 'service_fee';
  if (text.includes('insurance') || text.includes('clpp') || text.includes('protection')) return 'insurance';
  if (text.includes('notarial') || text.includes('legal')) return 'legal_fees';
  if (text.includes('cbu') || text.includes('share capital')) return 'cbu';
  if (text.includes('saving')) return 'savings';
  if (text.includes('annual')) return 'annual_dues';
  if (text.includes('penalty')) return 'penalty';
  if (text.includes('membership') || text.includes('regulatory') || text.includes('vip')) return 'membership';
  if (text.includes('petty')) return 'petty_cash';
  return 'loan_deduction';
}

function deductionKind(label = '') {
  const text = String(label).toLowerCase();
  if (text.includes('service')) return 'service_fee';
  if (text.includes('cbu completion')) return 'cbu_completion';
  if (text.includes('cbu') || text.includes('share capital') || text.includes('retention')) return 'cbu_retention';
  if (text.includes('regulatory') || text.includes('admin')) return 'membership_regulatory_fee';
  if (text.includes('initial savings')) return 'membership_initial_savings';
  if (text.includes('vip') || text.includes('wellife')) return 'membership_vip_card';
  if (text.includes('regular savings') || text.includes('saving')) return 'regular_savings';
  if (text.includes('insurance') || text.includes('clpp') || text.includes('clpi') || text.includes('protection')) return 'insurance';
  if (text.includes('notarial') || text.includes('legal')) return 'legal_fees';
  if (text.includes('annual')) return 'annual_dues';
  if (text.includes('penalty')) return 'penalty';
  if (text.includes('petty')) return 'petty_cash';
  if (text.includes('membership')) return 'membership_fee';
  return text.trim() || 'loan_deduction';
}

export async function getLoansForExpenseCreation() {
  const { data: loans, error } = await supabase
    .from('loans')
    .select('*')
    .in('status', ['approved'])
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!loans?.length) return [];

  const memberIds = [...new Set(loans.map(l => l.member_id).filter(Boolean))];
  const { data: members } = memberIds.length
    ? await supabase
        .from('members')
        .select('id, first_name, last_name, middle_initial, member_no')
        .in('id', memberIds)
    : { data: [] };

  const memberMap = Object.fromEntries((members || []).map(m => [m.id, m]));
  return loans.map(loan => ({
    ...loan,
    members: memberMap[loan.member_id] || null,
    net_proceeds: getLoanNetProceeds(loan),
  }));
}

export async function getLoanByLoanNo(loanNo) {
  if (!loanNo) return null;
  const { data, error } = await supabase
    .from('loans')
    .select('*')
    .eq('loan_no', loanNo)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function getLoanByReference(reference) {
  const ref = cleanReference(reference);
  if (!ref) return null;

  const byLoanNo = await getLoanByLoanNo(ref);
  if (byLoanNo) return byLoanNo;

  const { data, error } = await supabase
    .from('loans')
    .select('*')
    .eq('id', ref)
    .maybeSingle();

  if (error) return null;
  return data || null;
}

export function buildLoanExpensePayload(loan, createdBy) {
  const borrower = memberName(loan.members) || loan.loan_no || 'Borrower';
  return {
    date: new Date().toISOString().split('T')[0],
    description: `Loan net proceeds - ${loan.loan_no || loan.id}`,
    category: 'loan_net_proceeds',
    amount: getLoanNetProceeds(loan),
    payee: borrower,
    notes: [`Loan No: ${loan.loan_no || ''}`, `Loan ID: ${loan.id || ''}`].join('\n'),
    status: 'pending',
    created_by: createdBy ?? null,
  };
}

export async function releaseLoanFromCheck(check, userId) {
  if (!check?.voucher_id) throw new Error('This check is not linked to a loan voucher.');

  const { data: voucher, error: voucherError } = await supabase
    .from('vouchers')
    .select('*')
    .eq('id', check.voucher_id)
    .single();
  if (voucherError) throw voucherError;

  const loan = await resolveLinkedLoanForRelease(check, voucher);
  if (!loan) {
    throw new Error(
      'Linked loan could not be found. Please make sure the linked voucher or expense contains the Loan No. in its Reference, Notes, or Purpose.'
    );
  }
  if (loan.status === 'released') return loan;

  const { data: existingRelease, error: releaseLookupError } = await supabase
    .from('transactions')
    .select('id')
    .eq('loan_id', loan.id)
    .eq('type', 'loan_release')
    .maybeSingle();
  if (releaseLookupError) throw releaseLookupError;
  if (existingRelease) {
    return updateLoan(loan.id, {
      status: 'released',
      release_date: new Date().toISOString().split('T')[0],
    });
  }

  const releaseDate = new Date().toISOString().split('T')[0];
  const netProceeds = getLoanNetProceeds(loan);

  await createTransaction({
    member_id: loan.member_id,
    loan_id: loan.id,
    category: 'capital',
    type: 'loan_release',
    amount: netProceeds,
    reference: loan.loan_no,
    notes: 'Loan net proceeds released to member',
    created_by: userId ?? null,
    transaction_date: releaseDate,
  });

  for (const item of getLoanDeductionItems(loan)) {
    await createTransaction({
      member_id: loan.member_id,
      loan_id: loan.id,
      category: item.category,
      type: 'loan_deduction',
      amount: item.amount,
      reference: loan.loan_no,
      notes: item.label,
      created_by: userId ?? null,
      transaction_date: releaseDate,
    });
  }

  return updateLoan(loan.id, {
    status: 'released',
    release_date: releaseDate,
  });
}

async function resolveLinkedLoanForRelease(check, voucher) {
  const expense = await getVoucherExpense(voucher);
  const textSources = [
    voucher.reference,
    voucher.notes,
    voucher.purpose,
    check.notes,
    check.purpose,
    expense?.notes,
    expense?.description,
  ];

  for (const source of textSources) {
    for (const reference of extractLoanReferences(source)) {
      const loan = await getLoanByReference(reference);
      if (loan) return loan;
    }
  }

  return findLoanByReleaseContext({ check, voucher, expense });
}

async function getVoucherExpense(voucher) {
  if (!voucher?.expense_id) return null;

  const { data, error } = await supabase
    .from('expenses')
    .select('id, description, notes, amount, payee')
    .eq('id', voucher.expense_id)
    .maybeSingle();

  if (error) return null;
  return data || null;
}

async function findLoanByReleaseContext({ check, voucher, expense }) {
  let query = supabase
    .from('loans')
    .select('*')
    .in('status', ['approved', 'released']);

  if (voucher.member_id) query = query.eq('member_id', voucher.member_id);

  const { data: loans, error } = await query;
  if (error || !loans?.length) return null;

  const targetAmount = round2(voucher.amount || check.amount || expense?.amount || 0);
  const amountMatches = targetAmount > 0
    ? loans.filter(loan => round2(getLoanNetProceeds(loan)) === targetAmount)
    : [];

  if (amountMatches.length === 1) return amountMatches[0];

  const text = [
    voucher.payee,
    check.payee,
    expense?.payee,
    voucher.purpose,
    check.purpose,
    expense?.description,
  ].filter(Boolean).join(' ').toLowerCase();

  const memberIds = [...new Set(loans.map(loan => loan.member_id).filter(Boolean))];
  if (!memberIds.length) return null;

  const { data: members } = await supabase
    .from('members')
    .select('id, first_name, last_name, member_no')
    .in('id', memberIds);

  const memberMap = Object.fromEntries((members || []).map(member => [member.id, member]));
  const nameMatches = loans.filter(loan => {
    const member = memberMap[loan.member_id];
    const memberText = [
      member?.member_no,
      member?.first_name,
      member?.last_name,
      [member?.first_name, member?.last_name].filter(Boolean).join(' '),
    ].filter(Boolean).map(v => String(v).toLowerCase());

    return memberText.some(value => value && text.includes(value));
  });

  if (nameMatches.length === 1) return nameMatches[0];
  return null;
}

function extractLoanReferences(value = '') {
  const text = String(value || '');
  const refs = [
    ...text.matchAll(/Loan No\.?\s*:\s*([^\n\r;|]+)/gi),
    ...text.matchAll(/Loan ID\s*:\s*([0-9a-f-]{20,})/gi),
    ...text.matchAll(/Loan net proceeds\s*-\s*([^\n\r;|]+)/gi),
    ...text.matchAll(/\b(LN[-_/ A-Za-z0-9]+)\b/gi),
  ].map(match => cleanReference(match[1])).filter(Boolean);

  return [...new Set(refs)];
}

function cleanReference(value = '') {
  return String(value || '')
    .trim()
    .replace(/^[#:\s-]+/, '')
    .replace(/\s*(?:-|·|\|)\s*(?:PHP|₱)?\s*[\d,]+(?:\.\d{1,2})?.*$/i, '')
    .replace(/\s+$/g, '');
}
