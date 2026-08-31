import { supabase } from './supabase';
import { createTransaction } from './transactionService';
import { updateLoan } from './loanService';
import { cleanLoanReference as cleanReference, extractLoanReferences, findReleaseMemberIds } from '../utils/loanReleaseLink';
import { getAccountsByMemberId, createAccount, updateAccount } from './accountService';
import {
  createMembership,
  getMembershipByMemberId,
  patchMembershipFeeRequired,
  recordMembershipPayment,
} from './membershipService';

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

function dateOnly(value) {
  return String(value || '').split('T')[0];
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
      category: item.category || deductionCategory(item.label || item.name),
      kind: item.kind || deductionKind(item.label || item.name),
      post_to_membership: Boolean(item.post_to_membership),
    }))
    .filter(item => item.amount > 0 && !item.post_to_membership);

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

function getLoanMembershipDeduction(loan) {
  const deductions = parseJSONSafe(loan?.preview_deductions_json, {});
  const structured = deductions.membership_deduction;
  if (structured?.enabled && Number(structured.total || 0) > 0) {
    return {
      ...structured,
      total: round2(structured.total),
      membership_fee: round2(structured.membership_fee),
      cbu: round2(structured.cbu),
      savings: round2(structured.savings),
      wellife_vip: round2(structured.wellife_vip),
      other_fee: round2(structured.other_fee),
      breakdown: Array.isArray(structured.breakdown) ? structured.breakdown : [],
    };
  }

  const items = Array.isArray(deductions.items) ? deductions.items : [];
  const membershipItems = items.filter(item => item.post_to_membership && Number(item.amount || 0) > 0);
  if (!membershipItems.length) return null;

  const amountByKind = Object.fromEntries(
    membershipItems.map(item => [item.kind || deductionKind(item.label || item.name), round2(item.amount)])
  );
  const total = round2(Object.values(amountByKind).reduce((sum, amount) => sum + amount, 0));
  if (total <= 0) return null;

  return {
    enabled: true,
    preset: 'custom',
    record_type: 'new',
    membership_type: 'regular',
    membership_fee: amountByKind.membership_fee || 0,
    cbu: amountByKind.cbu || 0,
    savings: amountByKind.savings || 0,
    wellife_vip: amountByKind.wellife_vip || 0,
    other_fee: amountByKind.other_fee || 0,
    other_label: 'Other Membership Fee',
    total,
    breakdown: membershipItems.map(item => ({
      key: item.kind || deductionKind(item.label || item.name),
      label: item.label || item.name || 'Membership Deduction',
      category: item.category || deductionCategory(item.label || item.name),
      amount: round2(item.amount),
    })),
  };
}

function membershipPaymentNotes(loan, deduction) {
  const parts = [
    `Loan membership deduction from ${loan?.loan_no || loan?.id || 'loan'}`,
    `Record type: ${deduction.record_type || 'new'}`,
    `Membership type: ${deduction.membership_type || 'regular'}`,
    `Membership: ${deduction.membership_fee || 0}`,
    `CBU: ${deduction.cbu || 0}`,
    `Savings: ${deduction.savings || 0}`,
    `WELLife VIP Card: ${deduction.wellife_vip || 0}`,
  ];
  if (deduction.other_fee > 0) parts.push(`${deduction.other_label || 'Other Fee'}: ${deduction.other_fee}`);
  return parts.join(' | ');
}

async function ensureMemberAccount(memberId, accountType, createdBy) {
  const accounts = await getAccountsByMemberId(memberId);
  const existing = accounts.find(account => String(account.account_type).toLowerCase() === accountType);
  if (existing) return existing;

  return createAccount({
    member_id: memberId,
    account_type: accountType,
    balance: 0,
    status: 'active',
  });
}

async function incrementMemberAccount(memberId, accountType, amount, createdBy) {
  const value = round2(amount);
  if (value <= 0) return null;

  const account = await ensureMemberAccount(memberId, accountType, createdBy);
  const nextBalance = round2(Number(account.balance || 0) + value);
  return updateAccount(account.id, { balance: nextBalance });
}

async function membershipTransactionExists(loanId) {
  const { data, error } = await supabase
    .from('transactions')
    .select('id')
    .eq('loan_id', loanId)
    .ilike('notes', '%Loan membership deduction%')
    .limit(1);

  if (error) throw error;
  return Boolean(data?.length);
}

async function postLoanMembershipDeduction(loan, userId, releaseDate) {
  const deduction = getLoanMembershipDeduction(loan);
  if (!deduction || !loan?.member_id) return;

  if (await membershipTransactionExists(loan.id)) return;

  const membershipTotal = round2(
    Number(deduction.membership_fee || 0) +
    Number(deduction.cbu || 0) +
    Number(deduction.savings || 0) +
    Number(deduction.wellife_vip || 0) +
    Number(deduction.other_fee || 0)
  );
  if (membershipTotal <= 0) return;

  let membership = await getMembershipByMemberId(loan.member_id);
  if (!membership) {
    membership = await createMembership({
      member_id: loan.member_id,
      membership_type: deduction.membership_type || 'regular',
      fee_required: membershipTotal,
      fee_paid_now: 0,
      notes: `Created from loan membership deduction (${loan.loan_no || loan.id})`,
      created_by: userId,
      is_historical: false,
    });
  }

  const currentPaid = Number(membership.fee_paid || 0);
  const required = Number(membership.fee_required || 0);
  const nextRequired = Math.max(required, round2(currentPaid + membershipTotal));
  if (nextRequired > required) {
    await patchMembershipFeeRequired(membership.id, nextRequired);
  }

  await recordMembershipPayment(
    membership.id,
    loan.member_id,
    membershipTotal,
    releaseDate,
    membershipPaymentNotes(loan, deduction),
    userId
  );

  const memberCategoryAmount = round2(
    Number(deduction.membership_fee || 0) +
    Number(deduction.other_fee || 0)
  );
  if (memberCategoryAmount > 0) {
    await createTransaction({
      member_id: loan.member_id,
      loan_id: loan.id,
      category: 'membership',
      type: 'membership_payment',
      amount: memberCategoryAmount,
      reference: loan.loan_no,
      notes: `Loan membership deduction | Membership fee${deduction.other_fee > 0 ? ` | ${deduction.other_label || 'Other Fee'}: ${deduction.other_fee}` : ''}`,
      created_by: userId ?? null,
      transaction_date: releaseDate,
    });
  }

  if (deduction.wellife_vip > 0) {
    await createTransaction({
      member_id: loan.member_id,
      loan_id: loan.id,
      category: 'membership',
      type: 'membership_payment',
      amount: deduction.wellife_vip,
      reference: loan.loan_no,
      notes: 'Loan membership deduction | WELLife VIP Card',
      created_by: userId ?? null,
      transaction_date: releaseDate,
    });
  }

  if (deduction.cbu > 0) {
    await incrementMemberAccount(loan.member_id, 'cbu', deduction.cbu, userId);
    await createTransaction({
      member_id: loan.member_id,
      loan_id: loan.id,
      category: 'cbu',
      type: 'deposit',
      amount: deduction.cbu,
      reference: loan.loan_no,
      notes: 'Loan membership deduction | Initial CBU',
      created_by: userId ?? null,
      transaction_date: releaseDate,
    });
  }

  if (deduction.savings > 0) {
    await incrementMemberAccount(loan.member_id, 'savings', deduction.savings, userId);
    await createTransaction({
      member_id: loan.member_id,
      loan_id: loan.id,
      category: 'savings',
      type: 'deposit',
      amount: deduction.savings,
      reference: loan.loan_no,
      notes: 'Loan membership deduction | Initial Savings',
      created_by: userId ?? null,
      transaction_date: releaseDate,
    });
  }
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
  const [membersResult, expensesResult, vouchersResult] = await Promise.all([
    memberIds.length
      ? supabase
          .from('members')
          .select('id, first_name, last_name, middle_initial, member_no')
          .in('id', memberIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('expenses')
      .select('description, notes')
      .eq('status', 'approved')
      .not('voucher_id', 'is', null),
    supabase
      .from('vouchers')
      .select('reference')
      .not('expense_id', 'is', null)
      .neq('status', 'voided'),
  ]);

  if (membersResult.error) throw membersResult.error;
  if (expensesResult.error) throw expensesResult.error;
  if (vouchersResult.error) throw vouchersResult.error;

  const completedLoanReferences = new Set();
  const addReference = value => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized) completedLoanReferences.add(normalized);
  };

  for (const expense of expensesResult.data || []) {
    const text = `${expense.description || ''}\n${expense.notes || ''}`;
    const loanNo = text.match(/Loan No:\s*([^\s\n]+)/i)?.[1];
    const loanId = text.match(/Loan ID:\s*([0-9a-f-]{20,})/i)?.[1];
    const descriptionReference = text.match(/Loan net proceeds\s*-\s*([^\s\n]+)/i)?.[1];
    addReference(loanNo);
    addReference(loanId);
    addReference(descriptionReference);
  }

  for (const voucher of vouchersResult.data || []) addReference(voucher.reference);

  const memberMap = Object.fromEntries((membersResult.data || []).map(m => [m.id, m]));
  return loans
    .filter(loan => (
      !completedLoanReferences.has(String(loan.id || '').toLowerCase()) &&
      !completedLoanReferences.has(String(loan.loan_no || '').trim().toLowerCase())
    ))
    .map(loan => ({
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
  const loanStartDate = dateOnly(loan.release_date) || new Date().toISOString().split('T')[0];
  return {
    date: loanStartDate,
    description: `Loan net proceeds - ${loan.loan_no || loan.id}`,
    category: 'loan_net_proceeds',
    amount: getLoanNetProceeds(loan),
    payee: borrower,
    notes: [`Loan No: ${loan.loan_no || ''}`, `Loan ID: ${loan.id || ''}`].join('\n'),
    status: 'pending',
    created_by: createdBy ?? null,
  };
}

export async function releaseLoanFromCheck(check, userId, selectedLoanId = null) {
  if (!check?.voucher_id) throw new Error('This check is not linked to a loan voucher.');

  const { data: voucher, error: voucherError } = await supabase
    .from('vouchers')
    .select('*')
    .eq('id', check.voucher_id)
    .single();
  if (voucherError) throw voucherError;

  const loan = await resolveLinkedLoanForRelease(check, voucher, selectedLoanId);
  if (round2(check.amount) !== round2(getLoanNetProceeds(loan))) {
    throw new Error('The check amount does not match the selected loan net proceeds. Please review the check and voucher amounts.');
  }
  // Persist the resolved link before posting, so a retry targets the same loan.
  const { error: linkError } = await supabase.from('vouchers')
    .update({ reference: loan.id, member_id: loan.member_id }).eq('id', voucher.id);
  if (linkError) throw linkError;
  const releaseDate =
    dateOnly(check.date) ||
    dateOnly(loan.release_date) ||
    new Date().toISOString().split('T')[0];

  if (loan.status === 'released') {
    await supabase
      .from('transactions')
      .update({ transaction_date: releaseDate })
      .eq('loan_id', loan.id)
      .in('type', ['loan_release', 'loan_deduction']);

    return updateLoan(loan.id, { release_date: releaseDate, approval_status: 'released' });
  }

  const { data: existingRelease, error: releaseLookupError } = await supabase
    .from('transactions')
    .select('id')
    .eq('loan_id', loan.id)
    .eq('type', 'loan_release')
    .maybeSingle();
  if (releaseLookupError) throw releaseLookupError;
  if (existingRelease) {
    await supabase
      .from('transactions')
      .update({ transaction_date: releaseDate })
      .eq('loan_id', loan.id)
      .in('type', ['loan_release', 'loan_deduction']);

    await postLoanMembershipDeduction(loan, userId, releaseDate);
    return updateLoan(loan.id, {
      status: 'released',
      approval_status: 'released',
      release_date: releaseDate,
    });
  }

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

  await postLoanMembershipDeduction(loan, userId, releaseDate);

  return updateLoan(loan.id, {
    status: 'released',
    approval_status: 'released',
    release_date: releaseDate,
  });
}

export async function getLoanReleaseCandidates(check, voucher) {
  const expense = await getVoucherExpense(voucher);
  const references = new Set([
    cleanReference(voucher.reference),
    ...[voucher.notes, voucher.purpose, check.notes, check.purpose, expense?.notes, expense?.description]
      .flatMap(extractLoanReferences),
  ].filter(Boolean));
  const linked = new Map();
  for (const reference of references) {
    const loan = await getLoanByReference(reference);
    if (loan) linked.set(loan.id, loan);
  }
  if (linked.size > 1) {
    throw new Error('The linked voucher and expense refer to different loans. Please review them before releasing this check.');
  }
  if (linked.size === 1) {
    const loan = [...linked.values()][0];
    if (voucher.member_id && loan.member_id !== voucher.member_id) {
      throw new Error('The linked loan does not belong to the voucher member.');
    }
    if (!['approved', 'released', 'active', 'ongoing', 'partial', 'overdue', 'delinquent', 'defaulted', 'paid'].includes(loan.status)) {
      throw new Error('The linked loan must be approved before this check can be released.');
    }
    return [{ ...loan, net_proceeds: getLoanNetProceeds(loan) }];
  }

  let memberId = voucher.member_id;
  if (!memberId) {
    const { data: members, error } = await supabase.from('members')
      .select('id, first_name, last_name');
    if (error) throw error;
    const memberIds = findReleaseMemberIds(members || [], [voucher.payee, check.payee, expense?.payee]);
    if (memberIds.length > 1) {
      throw new Error('The payee names match more than one member. Please review the linked voucher and expense.');
    }
    memberId = memberIds[0];
  }
  if (!memberId) {
    throw new Error('No member matches the full payee name. Please check the member name on the voucher or expense.');
  }
  const { data: loans, error } = await supabase.from('loans').select('*')
    .eq('member_id', memberId).eq('status', 'approved');
  if (error) throw error;
  if (!loans?.length) {
    throw new Error('This member has no approved loan available for release.');
  }
  // Already-posted releases are not new candidates, even if a prior status update failed.
  const { data: releases, error: releaseError } = await supabase.from('transactions')
    .select('loan_id').eq('type', 'loan_release').in('loan_id', loans.map(loan => loan.id));
  if (releaseError) throw releaseError;
  const posted = new Set((releases || []).map(row => row.loan_id));
  const candidates = loans.filter(loan => !posted.has(loan.id));
  if (!candidates.length) throw new Error('The approved loans for this member have already been released.');
  return candidates.map(loan => ({ ...loan, net_proceeds: getLoanNetProceeds(loan) }));
}

async function resolveLinkedLoanForRelease(check, voucher, selectedLoanId) {
  const candidates = await getLoanReleaseCandidates(check, voucher);
  if (selectedLoanId) {
    const selected = candidates.find(loan => loan.id === selectedLoanId);
    if (!selected) throw new Error('The selected loan is no longer available for this check. Please reopen Release Check.');
    return selected;
  }
  if (candidates.length === 1) return candidates[0];
  throw new Error('This member has multiple approved loans. Please select the loan by amount and date.');
}

async function getVoucherExpense(voucher) {
  if (!voucher?.expense_id) return null;
  const { data, error } = await supabase.from('expenses')
    .select('id, description, notes, amount, payee').eq('id', voucher.expense_id).maybeSingle();
  if (error) throw error;
  return data || null;
}
