import { supabase } from './supabase';
import { createTransaction } from './transactionService';
import {
  getMembershipByMemberId,
  recordMembershipPayment,
  computeFeeBalance,
} from './membershipService';
import { getLoansByMemberId, applyLoanPaymentToSchedule, reverseLoanPaymentFromSchedule } from './loanService';
import { getMemberAccountsMap, updateAccount } from './accountService';
import { updateMember } from './memberService';
import {
  getTimeDepositsByMemberId,
  recordTimeDepositPayment,
} from './timeDepositService';
import {
  buildSavingsBoosterUpdate,
  getBoosterDepositWeeks,
} from './savingsBoosterService';

const INVOICE_COLUMNS = [
  'invoice_no',
  'date',
  'due_date',
  'payee',
  'purpose',
  'amount',
  'notes',
  'status',
  'created_by',
  'member_id',
  'payment_type',
  'ref_id',
  'account_id',
  'fund_added',
  'payment_mode',
  'payment_mode_note',
  'payment_date',
];

function sanitizeInvoicePayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([k, v]) => INVOICE_COLUMNS.includes(k) && v !== '' && v !== undefined && v !== null
    )
  );
}

export async function getInvoices(filters = {}) {
  let query = supabase
    .from('invoices')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.from) query = query.gte('date', filters.from);
  if (filters.to) query = query.lte('date', filters.to);

  const { data: invoices, error } = await query;
  if (error) throw error;
  if (!invoices || invoices.length === 0) return [];

  const memberIds = [...new Set(invoices.map(inv => inv.member_id).filter(Boolean))];
  const accountIds = [...new Set(invoices.map(inv => inv.account_id).filter(Boolean))];

  let memberMap = {};
  let accountMap = {};

  if (memberIds.length > 0) {
    const { data: members, error: memberError } = await supabase
      .from('members')
      .select('id, first_name, last_name, member_no')
      .in('id', memberIds);

    if (memberError) throw memberError;
    memberMap = Object.fromEntries((members || []).map(m => [m.id, m]));
  }

  if (accountIds.length > 0) {
    const { data: accounts, error: accountError } = await supabase
      .from('accounts')
      .select('id, account_no, account_type, member_id')
      .in('id', accountIds);

    if (accountError) throw accountError;
    accountMap = Object.fromEntries((accounts || []).map(a => [a.id, a]));
  }

  return invoices.map(inv => ({
    ...inv,
    members: inv.member_id ? (memberMap[inv.member_id] || null) : null,
    accounts: inv.account_id ? (accountMap[inv.account_id] || null) : null,
  }));
}

export async function getInvoiceById(id) {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Check whether an Invoice Number (SI#) is already in use.
 * Used to block duplicate Invoice Numbers before saving.
 */
export async function checkInvoiceNoExists(invoiceNo, excludeId = null) {
  if (!invoiceNo || !String(invoiceNo).trim()) return false;

  let query = supabase
    .from('invoices')
    .select('id')
    .eq('invoice_no', String(invoiceNo).trim())
    .limit(1);

  if (excludeId) query = query.neq('id', excludeId);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).length > 0;
}

async function insertInvoiceRow(clean) {
  const { data, error } = await supabase
    .from('invoices')
    .insert(clean)
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === '23505' && String(error.message || '').includes('invoice_no')) {
      throw new Error(`Invoice Number "${clean.invoice_no}" is already in use. Please enter a different SI#.`);
    }
    throw error;
  }
  if (!data) {
    throw new Error('The invoice was not saved — no row was returned after insert.');
  }
  return data;
}

export async function createInvoice(payload) {
  if (!payload.invoice_no || !String(payload.invoice_no).trim()) {
    throw new Error('SI# is required.');
  }

  const invoiceNo = String(payload.invoice_no).trim();

  const duplicate = await checkInvoiceNoExists(invoiceNo);
  if (duplicate) {
    throw new Error(`Invoice Number "${invoiceNo}" is already in use. Please enter a different SI#.`);
  }

  const clean = sanitizeInvoicePayload({
    ...payload,
    invoice_no: invoiceNo,
  });

  return insertInvoiceRow(clean);
}

function buildPaymentInvoicePayload({
  invoice_no,
  allow_blank_invoice_no = false,
  payment_type,
  member_id,
  member_name,
  amount,
  purpose,
  ref_id = null,
  account_id = null,
  notes = null,
  created_by = null,
  date = null,
  payment_mode = null,
  payment_mode_note = null,
}) {
  if (!allow_blank_invoice_no && (!invoice_no || !String(invoice_no).trim())) {
    throw new Error('SI# is required for invoice creation.');
  }
  if (!payment_type) throw new Error('payment_type is required for invoice creation.');
  if (!member_id && payment_type !== 'capital') {
    throw new Error('member_id is required for invoice creation.');
  }
  if (!member_name) throw new Error('member_name is required for invoice creation.');
  if (!amount || Number(amount) <= 0) throw new Error('amount must be greater than zero.');

  return sanitizeInvoicePayload({
    invoice_no: String(invoice_no || '').trim(),
    date: date || new Date().toISOString().split('T')[0],
    payee: member_name,
    purpose: purpose || payment_type,
    amount: Number(amount),
    status: 'paid',
    member_id,
    payment_type,
    ref_id,
    account_id,
    notes,
    created_by,
    payment_mode,
    payment_mode_note,
  });
}

export async function createInvoiceForPayment(args) {
  const invoiceNo = String(args.invoice_no || '').trim();
  const duplicate = await checkInvoiceNoExists(invoiceNo);
  if (duplicate) {
    throw new Error(`Invoice Number "${invoiceNo}" is already in use. Please enter a different SI#.`);
  }
  const clean = buildPaymentInvoicePayload(args);
  return insertInvoiceRow(clean);
}

export async function updateInvoice(id, payload) {
  const clean = sanitizeInvoicePayload(payload);
  delete clean.status;

  if (Object.prototype.hasOwnProperty.call(clean, 'invoice_no')) {
    clean.invoice_no = clean.invoice_no ? String(clean.invoice_no).trim() : clean.invoice_no;
  }

  const { data, error } = await supabase
    .from('invoices')
    .update(clean)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function markInvoicePaid(id) {
  const { data, error } = await supabase
    .from('invoices')
    .update({ status: 'paid' })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function voidInvoice(id) {
  const { data, error } = await supabase
    .from('invoices')
    .update({ status: 'voided' })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteInvoiceAndLinkedRecords(id, { deleted_by = null } = {}) {
  const invoice = await getInvoiceById(id);
  if (!invoice) throw new Error('Invoice could not be found.');

  const invoiceNo = String(invoice.invoice_no || '').trim();
  const referenceKeys = [invoiceNo, invoice.id].filter(Boolean);
  const paymentDate = invoice.payment_date || invoice.date || null;
  const amount = Number(invoice.amount || 0);

  let relatedTransactions = [];
  if (referenceKeys.length > 0) {
    let txQuery = supabase
      .from('transactions')
      .select('*')
      .in('reference', referenceKeys);

    if (invoice.member_id) txQuery = txQuery.eq('member_id', invoice.member_id);

    const { data, error } = await txQuery;
    if (error) throw error;
    relatedTransactions = data || [];
  }

  const hasLoanTransactions = relatedTransactions.some(tx =>
    ['loan_payment', 'loan_interest', 'penalty_payment'].includes(String(tx.type || '').toLowerCase())
  );

  if (hasLoanTransactions) {
    const loanGroups = relatedTransactions.reduce((map, tx) => {
      if (!tx.loan_id) return map;
      if (!['loan_payment', 'loan_interest'].includes(String(tx.type || '').toLowerCase())) return map;
      const current = map.get(tx.loan_id) || 0;
      map.set(tx.loan_id, current + Number(tx.amount || 0));
      return map;
    }, new Map());

    for (const [loanId, total] of loanGroups.entries()) {
      await reverseLoanPaymentFromSchedule(loanId, total);
    }
  }

  for (const tx of relatedTransactions) {
    const txType = String(tx.type || '').toLowerCase();
    const category = String(tx.category || '').toLowerCase();
    const txAmount = Number(tx.amount || 0);

    if (tx.account_id && txType === 'deposit' && ['cbu', 'savings'].includes(category)) {
      const { data: account, error: accountError } = await supabase
        .from('accounts')
        .select('id, balance, total_deposits')
        .eq('id', tx.account_id)
        .maybeSingle();

      if (accountError) throw accountError;
      if (account) {
        await updateAccount(account.id, {
          balance: Math.max(0, Number(account.balance || 0) - txAmount),
          total_deposits: Math.max(0, Number(account.total_deposits || 0) - txAmount),
          updated_at: new Date().toISOString(),
        });
      }
    }
  }

  if (invoice.payment_type === 'membership' && invoice.ref_id && amount > 0) {
    const { data: membership, error: membershipError } = await supabase
      .from('member_memberships')
      .select('id, fee_paid')
      .eq('id', invoice.ref_id)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (membership) {
      await supabase
        .from('member_memberships')
        .update({ fee_paid: Math.max(0, Number(membership.fee_paid || 0) - amount) })
        .eq('id', membership.id);
    }

    let paymentQuery = supabase
      .from('membership_payments')
      .select('id')
      .eq('member_membership_id', invoice.ref_id)
      .eq('amount', amount)
      .order('created_at', { ascending: false })
      .limit(1);

    if (invoice.member_id) paymentQuery = paymentQuery.eq('member_id', invoice.member_id);
    if (paymentDate) paymentQuery = paymentQuery.eq('payment_date', paymentDate);

    const { data: membershipPaymentRows, error: paymentFindError } = await paymentQuery;
    if (paymentFindError) throw paymentFindError;

    if (membershipPaymentRows?.[0]?.id) {
      const { error: paymentDeleteError } = await supabase
        .from('membership_payments')
        .delete()
        .eq('id', membershipPaymentRows[0].id);

      if (paymentDeleteError) throw paymentDeleteError;
    }
  }

  if (invoice.payment_type === 'savings_booster' && invoice.ref_id && amount > 0) {
    const { data: booster, error: boosterError } = await supabase
      .from('savings_booster')
      .select('*')
      .eq('id', invoice.ref_id)
      .maybeSingle();

    if (boosterError) throw boosterError;
    if (booster) {
      const nextTotalDeposited = Math.max(0, Number(booster.total_deposited || 0) - amount);
      const nextWeeksDeposited = Math.max(
        0,
        Number(booster.weeks_deposited || 0) - getBoosterDepositWeeks(amount, booster)
      );
      await supabase
        .from('savings_booster')
        .update(buildSavingsBoosterUpdate(booster, {
          total_deposited: nextTotalDeposited,
          weeks_deposited: nextWeeksDeposited,
        }))
        .eq('id', booster.id);
    }
  }

  if (relatedTransactions.length > 0) {
    const { error: txDeleteError } = await supabase
      .from('transactions')
      .delete()
      .in('id', relatedTransactions.map(tx => tx.id));

    if (txDeleteError) throw txDeleteError;
  }

  const { data: fundRowsByRefId, error: fundRefIdError } = await supabase
    .from('fund_transactions')
    .select('*')
    .eq('ref_id', invoice.id);

  if (fundRefIdError) throw fundRefIdError;

  const { data: fundRowsByReference, error: fundReferenceError } = await supabase
    .from('fund_transactions')
    .select('*')
    .in('reference', referenceKeys);

  if (fundReferenceError) throw fundReferenceError;

  const fundRows = Object.values(
    [...(fundRowsByRefId || []), ...(fundRowsByReference || [])]
      .reduce((map, row) => ({ ...map, [row.id]: row }), {})
  );

  if (fundRows.length) {
    const { data: fund, error: fundError } = await supabase
      .from('coop_fund')
      .select('*')
      .maybeSingle();

    if (fundError) throw fundError;

    if (fund) {
      const cashIn = fundRows
        .filter(row => row.flow_type === 'cash_in')
        .reduce((sum, row) => sum + Number(row.amount || 0), 0);
      const cashOut = fundRows
        .filter(row => row.flow_type === 'cash_out')
        .reduce((sum, row) => sum + Number(row.amount || 0), 0);

      await supabase
        .from('coop_fund')
        .update({
          cash_in: Math.max(0, Number(fund.cash_in || 0) - cashIn),
          cash_out: Math.max(0, Number(fund.cash_out || 0) - cashOut),
          balance: Math.max(0, Number(fund.balance || 0) - cashIn + cashOut),
          last_updated: new Date().toISOString(),
        })
        .eq('id', fund.id);
    }

    const { error: fundDeleteError } = await supabase
      .from('fund_transactions')
      .delete()
      .in('id', fundRows.map(row => row.id));

    if (fundDeleteError) throw fundDeleteError;
  }

  const { error: invoiceDeleteError } = await supabase
    .from('invoices')
    .delete()
    .eq('id', invoice.id);

  if (invoiceDeleteError) throw invoiceDeleteError;

  return {
    invoice,
    deletedTransactions: relatedTransactions.length,
    deletedBy: deleted_by,
  };
}

// ── Centralized Payment Recording (Invoice Module) ────────────────────────────
//
// Every member payment (Membership, Loan, CBU, Savings, Time Deposit,
// Savings Booster) is processed here, through the Invoice module, instead of
// through separate "Payment" buttons scattered across each module's page.

export const PAYMENT_CATEGORIES = [
  { key: 'membership', label: 'Membership', depositBased: false },
  { key: 'loan', label: 'Loan', depositBased: false },
  { key: 'cbu', label: 'CBU', depositBased: true },
  { key: 'savings', label: 'Savings', depositBased: true },
  { key: 'time_deposit', label: 'Time Deposit', depositBased: true },
  { key: 'savings_booster', label: 'Savings Booster', depositBased: true },
];

/**
 * Build the "Member Selection" screen: one row per payment category with its
 * current balance / status, for a given member.
 */
export async function getMemberPaymentSummary(memberId) {
  if (!memberId) throw new Error('member_id is required.');

  const [membership, loans, accounts, timeDeposits, boosterRows] = await Promise.all([
    getMembershipByMemberId(memberId).catch(() => null),
    getLoansByMemberId(memberId).catch(() => []),
    getMemberAccountsMap(memberId).catch(() => ({ all: [], cbu: null, savings: null })),
    getTimeDepositsByMemberId(memberId).catch(() => []),
    supabase.from('savings_booster').select('*').eq('member_id', memberId).then(
      r => (r.error ? [] : (r.data || [])),
      () => []
    ),
  ]);

  const allLoans = loans || [];
  const activeLoans = allLoans.filter(l => l.status !== 'paid' && (l.balance || 0) > 0);
  const allTimeDeposits = timeDeposits || [];
  const activeTimeDeposits = allTimeDeposits.filter(td => td.status === 'Active');
  const activeBoosterRows = (boosterRows || []).filter(b => b.status === 'active');

  const hasMembership = !!membership;
  const membershipBalance = hasMembership ? computeFeeBalance(membership) : 0;

  const cbuTotalDeposited = accounts.cbu?.total_deposits ?? accounts.cbu?.balance ?? 0;
  const savingsTotalDeposited = accounts.savings?.total_deposits ?? accounts.savings?.balance ?? 0;
  const tdTotalDeposited = allTimeDeposits.reduce((s, td) => s + (Number(td.amount) || 0), 0);
  const boosterTotalDeposited = (boosterRows || []).reduce((s, b) => s + (Number(b.total_deposited) || 0), 0);

  return {
    membership: {
      key: 'membership',
      label: 'Membership',
      record: membership,
      hasRecord: hasMembership,
      valueType: 'balance',
      value: membershipBalance,
      payable: hasMembership && membershipBalance > 0,
    },
    loan: {
      key: 'loan',
      label: 'Loan',
      records: activeLoans,
      hasRecord: allLoans.length > 0,
      valueType: 'balance',
      value: activeLoans.reduce((s, l) => s + (l.balance || 0), 0),
      payable: activeLoans.length > 0,
    },
    cbu: {
      key: 'cbu',
      label: 'CBU',
      record: accounts.cbu,
      hasRecord: !!accounts.cbu,
      valueType: 'deposited',
      value: cbuTotalDeposited,
      payable: !!accounts.cbu, // deposit-based: always allowed to add more
    },
    savings: {
      key: 'savings',
      label: 'Savings',
      record: accounts.savings,
      hasRecord: !!accounts.savings,
      valueType: 'deposited',
      value: savingsTotalDeposited,
      payable: !!accounts.savings,
    },
    time_deposit: {
      key: 'time_deposit',
      label: 'Time Deposit',
      records: activeTimeDeposits,
      hasRecord: allTimeDeposits.length > 0,
      valueType: 'deposited',
      value: tdTotalDeposited,
      payable: activeTimeDeposits.length > 0,
    },
    savings_booster: {
      key: 'savings_booster',
      label: 'Savings Booster',
      records: activeBoosterRows,
      hasRecord: (boosterRows || []).length > 0,
      valueType: 'deposited',
      value: boosterTotalDeposited,
      // Deposit-based, same as CBU/Savings/Time Deposit: only payable once
      // the member has at least one active enrollment slot.
      payable: activeBoosterRows.length > 0,
    },
  };
}

/**
 * Post a single Invoice Number (SI#) that covers one or more payment
 * categories for a member, in one transaction group.
 *
 * `entries` = [{ category, amount, ref_id, loan, account, timeDeposit }]
 * Each entry updates its own module (loan schedule, membership fee_paid,
 * account balance via `transactions`, or time-deposit payment ledger) and
 * writes a linked `invoices` row that shares the same invoice_no.
 */
export async function createMultiCategoryInvoice({
  invoice_no,
  is_old_transaction = false,
  member,
  date,
  payment_date = null,
  entries,
  payment_mode = null,
  payment_mode_note = null,
  notes = null,
  created_by = null,
}) {
  if (!is_old_transaction && (!invoice_no || !String(invoice_no).trim())) {
    throw new Error('Invoice Number (SI#) is required.');
  }
  if (!member?.id) throw new Error('A member must be selected.');
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('Select at least one payment category with an amount.');
  }
  if (!date) throw new Error('Invoice date is required.');

  const siNo = String(invoice_no || '').trim();
  if (siNo) {
    const duplicate = await checkInvoiceNoExists(siNo);
    if (duplicate) {
      throw new Error(`Invoice Number "${siNo}" is already in use. Please enter a different SI#.`);
    }
  }

  const effectivePaymentDate = payment_date || date;
  const memberName = [member.first_name, member.last_name].filter(Boolean).join(' ') || 'Member';
  const created = [];
  const invoiceLines = [];
  let invoiceRefId = null;
  let invoiceAccountId = null;
  let invoicePaymentType = null;

  // Every side effect performed below (transaction rows, account balance
  // changes, membership fee updates, the kiddy_savings_type sync, etc.) is
  // recorded here as a compensating action. If any later step in this same
  // invoice save fails — including the final invoice insert — we run these
  // in reverse to undo everything that already happened, so a failed
  // invoice never leaves a deposit or payment "stuck" on the member's
  // account with nothing to show for it.
  const rollbacks = [];

  async function runRollbacks() {
    for (const undo of rollbacks.reverse()) {
      try {
        await undo();
      } catch (rollbackErr) {
        console.error('[createMultiCategoryInvoice] rollback step failed:', rollbackErr);
      }
    }
  }

  function buildInvoiceLinePreview(entry) {
    const amount = Number(entry.amount) || 0;
    if (amount <= 0) return [];

    if (entry.category === 'membership') {
      if (!entry.membership) throw new Error('Membership record not found for this member.');
      return [{
        label: entry.purpose || 'Membership Fee Payment',
        amount,
        payment_type: 'membership',
        ref_id: entry.membership.id,
      }];
    }

    if (entry.category === 'loan') {
      if (!entry.loan) throw new Error('Loan record not found for this member.');
      const principalAmount = Number(entry.principal_amount ?? entry.loan_amount ?? amount) || 0;
      const interestAmount = Number(entry.interest_amount) || 0;
      const penaltyAmount = Number(entry.penalty_amount) || 0;
      if (principalAmount > (entry.loan.balance || 0)) {
        throw new Error(`Loan payment exceeds remaining balance of ${entry.loan.balance}.`);
      }
      return [
        principalAmount > 0 ? {
          label: `Loan Payment${entry.loan.loan_no ? ` - ${entry.loan.loan_no}` : ''}`,
          amount: principalAmount,
          payment_type: 'loan_payment',
          ref_id: entry.loan.id,
        } : null,
        interestAmount > 0 ? {
          label: `Interest${entry.loan.loan_no ? ` - ${entry.loan.loan_no}` : ''}`,
          amount: interestAmount,
          payment_type: 'loan_payment',
          ref_id: entry.loan.id,
        } : null,
        penaltyAmount > 0 ? {
          label: `Penalty${entry.loan.loan_no ? ` - ${entry.loan.loan_no}` : ''}`,
          amount: penaltyAmount,
          payment_type: 'loan_payment',
          ref_id: entry.loan.id,
        } : null,
      ].filter(Boolean);
    }

    if (entry.category === 'cbu' || entry.category === 'savings') {
      if (!entry.account) throw new Error(`No ${entry.category.toUpperCase()} account found for this member.`);
      const isKiddySavings = entry.category === 'savings' && member.membership_type === 'kiddy';
      const kiddySavingsType = isKiddySavings ? (entry.kiddySavingsType || member.kiddy_savings_type || 'regular_savings') : null;
      const kiddySavingsLabel = kiddySavingsType === 'educational_savings'
        ? 'Educational Savings Account'
        : 'Regular Savings Account';
      const label = entry.purpose || (isKiddySavings
        ? `${kiddySavingsLabel} Deposit${entry.account.account_no ? ` - ${entry.account.account_no}` : ''}`
        : `${entry.category === 'cbu' ? 'CBU' : 'Savings'} Deposit${entry.account.account_no ? ` - ${entry.account.account_no}` : ''}`);
      return [{ label, amount, payment_type: entry.category, ref_id: entry.account.id, account_id: entry.account.id }];
    }

    if (entry.category === 'time_deposit') {
      if (!entry.timeDeposit) throw new Error('Time Deposit record not found for this member.');
      return [{
        label: entry.purpose || `Time Deposit Payment${entry.timeDeposit.name ? ` - ${entry.timeDeposit.name}` : ''}`,
        amount,
        payment_type: 'time_deposit',
        ref_id: entry.timeDeposit.id,
      }];
    }

    if (entry.category === 'savings_booster') {
      if (!entry.booster) throw new Error('Savings Booster enrollment not found for this member.');
      return [{
        label: entry.purpose || `Savings Booster Deposit${entry.booster.slot_number ? ` - Slot #${entry.booster.slot_number}` : ''}`,
        amount,
        payment_type: 'savings_booster',
        ref_id: entry.booster.id,
      }];
    }

    return [];
  }

  try {
    const previewLines = entries.flatMap(buildInvoiceLinePreview);
    if (previewLines.length === 0) {
      throw new Error('Select at least one payment category with an amount greater than zero.');
    }

    const previewRefId = previewLines.find(line => line.ref_id)?.ref_id || null;
    const previewAccountId = previewLines.find(line => line.account_id)?.account_id || null;
    const previewPaymentType = previewLines[0]?.payment_type || 'loan_payment';
    const previewTotal = previewLines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
    const previewPurpose = previewLines.length === 1 ? previewLines[0].label : 'Combined Payment';
    const previewBreakdown = previewLines
      .map(line => `${line.label}: PHP ${Number(line.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
      .join(' | ');

    const invoicePayload = buildPaymentInvoicePayload({
      invoice_no: siNo,
      allow_blank_invoice_no: is_old_transaction,
      payment_type: previewPaymentType,
      member_id: member.id,
      member_name: memberName,
      amount: previewTotal,
      purpose: previewPurpose,
      ref_id: previewRefId,
      account_id: previewAccountId,
      notes: [
        previewBreakdown,
        is_old_transaction ? 'Old transaction: original SI# not available.' : null,
        notes,
      ].filter(Boolean).join(' | '),
      created_by,
      date,
      payment_mode,
      payment_mode_note,
    });
    invoicePayload.payment_date = effectivePaymentDate;

    const savedInvoice = await insertInvoiceRow(invoicePayload);
    const invoiceReference = siNo || savedInvoice.id;
    created.push(savedInvoice);
    rollbacks.push(async () => {
      await supabase.from('invoices').delete().eq('id', savedInvoice.id);
    });

    for (const entry of entries) {
      const amount = Number(entry.amount) || 0;
      if (amount <= 0) continue;

      let ref_id = entry.ref_id || null;
      let account_id = null;
      let purpose = entry.purpose;

      if (entry.category === 'membership') {
        if (!entry.membership) throw new Error('Membership record not found for this member.');
        const priorFeePaid = parseFloat(entry.membership.fee_paid) || 0;
        const breakdown = entry.membership_breakdown || {};
        const entryAmount = Object.prototype.hasOwnProperty.call(breakdown, 'entry')
          ? Number(breakdown.entry || 0)
          : amount;
        const adminRegulatoryAmount = Number(breakdown.admin_regulatory || 0) || 0;
        const vipCardAmount = Number(breakdown.vip_card || 0) || 0;
        const cbuAmount = Number(breakdown.cbu || 0) || 0;
        const savingsAmount = Number(breakdown.savings || 0) || 0;
        const breakdownNotes = JSON.stringify({
          entry: entryAmount,
          admin_regulatory: adminRegulatoryAmount,
          vip_card: vipCardAmount,
          cbu: cbuAmount,
          savings: savingsAmount,
          rows: Array.isArray(breakdown.rows) ? breakdown.rows : [],
          ...(notes ? { text: notes } : {}),
        });
        const membershipRequired = parseFloat(entry.membership.fee_required) || 0;
        const membershipRemaining = Math.max(0, membershipRequired - priorFeePaid);
        if (amount > membershipRemaining) {
          throw new Error(`Membership payment exceeds remaining balance of ${membershipRemaining}.`);
        }
        const result = await recordMembershipPayment(
          entry.membership.id, member.id, amount, effectivePaymentDate, breakdownNotes, created_by
        );
        rollbacks.push(async () => {
          if (result?._paymentId) {
            await supabase.from('membership_payments').delete().eq('id', result._paymentId);
          }
          await supabase.from('member_memberships').update({ fee_paid: priorFeePaid }).eq('id', entry.membership.id);
        });
        if (entryAmount > 0) {
          const membershipTx = await createTransaction({
            member_id: member.id,
            category: 'membership',
            type: 'membership_payment',
            amount: entryAmount,
            reference: invoiceReference,
            notes: [entry.purpose || 'Membership Fee Payment', 'Membership fee portion', notes].filter(Boolean).join(' - '),
            created_by,
            transaction_date: effectivePaymentDate,
            payment_mode,
            payment_mode_note,
          });
          rollbacks.push(async () => {
            await supabase.from('transactions').delete().eq('id', membershipTx.id);
          });
        }

        if (adminRegulatoryAmount > 0) {
          const adminTx = await createTransaction({
            member_id: member.id,
            category: 'membership',
            type: 'membership_payment',
            amount: adminRegulatoryAmount,
            reference: invoiceReference,
            notes: [entry.purpose || 'Membership Fee Payment', 'Admin & Regulatory Fees', notes].filter(Boolean).join(' - '),
            created_by,
            transaction_date: effectivePaymentDate,
            payment_mode,
            payment_mode_note,
          });
          rollbacks.push(async () => {
            await supabase.from('transactions').delete().eq('id', adminTx.id);
          });
        }

        if (vipCardAmount > 0) {
          const vipTx = await createTransaction({
            member_id: member.id,
            category: 'membership',
            type: 'membership_payment',
            amount: vipCardAmount,
            reference: invoiceReference,
            notes: [entry.purpose || 'Membership Fee Payment', 'WELLife VIP Card', notes].filter(Boolean).join(' - '),
            created_by,
            transaction_date: effectivePaymentDate,
            payment_mode,
            payment_mode_note,
          });
          rollbacks.push(async () => {
            await supabase.from('transactions').delete().eq('id', vipTx.id);
          });
        }

        const membershipDeposits = [
          { key: 'cbu', amount: cbuAmount, account: entry.cbuAccount, label: 'Initial CBU' },
          { key: 'savings', amount: savingsAmount, account: entry.savingsAccount, label: 'Initial Savings' },
        ];

        for (const deposit of membershipDeposits) {
          if (deposit.amount <= 0) continue;
          if (!deposit.account) {
            throw new Error(`No ${deposit.key.toUpperCase()} account found for this member.`);
          }

          const depositTx = await createTransaction({
            member_id: member.id,
            account_id: deposit.account.id,
            category: deposit.key,
            type: 'deposit',
            amount: deposit.amount,
            reference: invoiceReference || deposit.account.account_no || null,
            notes: [deposit.label, 'Membership breakdown', notes].filter(Boolean).join(' - '),
            created_by,
            transaction_date: effectivePaymentDate,
            payment_mode,
            payment_mode_note,
          });
          rollbacks.push(async () => {
            await supabase.from('transactions').delete().eq('id', depositTx.id);
          });

          const priorBalance = deposit.account.balance || 0;
          const priorTotalDeposits = deposit.account.total_deposits || 0;
          await updateAccount(deposit.account.id, {
            balance: priorBalance + deposit.amount,
            total_deposits: priorTotalDeposits + deposit.amount,
            updated_at: new Date().toISOString(),
          });
          deposit.account.balance = priorBalance + deposit.amount;
          deposit.account.total_deposits = priorTotalDeposits + deposit.amount;
          rollbacks.push(async () => {
            await supabase.from('accounts').update({
              balance: priorBalance,
              total_deposits: priorTotalDeposits,
            }).eq('id', deposit.account.id);
          });
        }
        ref_id = entry.membership.id;
        purpose = purpose || 'Membership Fee Payment';
        invoiceLines.push({ label: purpose, amount, payment_type: 'membership', ref_id, account_id });
      }

      if (entry.category === 'loan') {
        if (!entry.loan) throw new Error('Loan record not found for this member.');
        const principalAmount = Number(entry.principal_amount ?? entry.loan_amount ?? amount) || 0;
        const interestAmount = Number(entry.interest_amount) || 0;
        const penaltyAmount = Number(entry.penalty_amount) || 0;
        const scheduleAmount = principalAmount + interestAmount;

        if (principalAmount > (entry.loan.balance || 0)) {
          throw new Error(`Loan payment exceeds remaining balance of ${entry.loan.balance}.`);
        }
        if (principalAmount > 0) {
          const loanTx = await createTransaction({
            member_id: member.id,
            loan_id: entry.loan.id,
            category: 'loan',
            type: 'loan_payment',
            amount: principalAmount,
            reference: invoiceReference || entry.loan.loan_no || null,
            notes,
            created_by,
            transaction_date: effectivePaymentDate,
            payment_mode,
            payment_mode_note,
          });
          rollbacks.push(async () => {
            await supabase.from('transactions').delete().eq('id', loanTx.id);
          });
          invoiceLines.push({
            label: `Loan Payment${entry.loan.loan_no ? ` - ${entry.loan.loan_no}` : ''}`,
            amount: principalAmount,
            payment_type: 'loan_payment',
            ref_id: entry.loan.id,
          });
        }
        if (interestAmount > 0) {
          const interestTx = await createTransaction({
            member_id: member.id,
            loan_id: entry.loan.id,
            category: 'loan',
            type: 'loan_interest',
            amount: interestAmount,
            reference: invoiceReference || entry.loan.loan_no || null,
            notes,
            created_by,
            transaction_date: effectivePaymentDate,
            payment_mode,
            payment_mode_note,
          });
          rollbacks.push(async () => {
            await supabase.from('transactions').delete().eq('id', interestTx.id);
          });
          invoiceLines.push({
            label: `Interest${entry.loan.loan_no ? ` - ${entry.loan.loan_no}` : ''}`,
            amount: interestAmount,
            payment_type: 'loan_payment',
            ref_id: entry.loan.id,
          });
        }
        if (penaltyAmount > 0) {
          const penaltyTx = await createTransaction({
            member_id: member.id,
            loan_id: entry.loan.id,
            category: 'penalty',
            type: 'penalty_payment',
            amount: penaltyAmount,
            reference: invoiceReference || entry.loan.loan_no || null,
            notes,
            created_by,
            transaction_date: effectivePaymentDate,
            payment_mode,
            payment_mode_note,
          });
          rollbacks.push(async () => {
            await supabase.from('transactions').delete().eq('id', penaltyTx.id);
          });
          invoiceLines.push({
            label: `Penalty${entry.loan.loan_no ? ` - ${entry.loan.loan_no}` : ''}`,
            amount: penaltyAmount,
            payment_type: 'loan_payment',
            ref_id: entry.loan.id,
          });
        }
        if (scheduleAmount > 0) {
          await applyLoanPaymentToSchedule(entry.loan.id, scheduleAmount);
        }
        ref_id = entry.loan.id;
        purpose = purpose || `Loan Payment${entry.loan.loan_no ? ` — ${entry.loan.loan_no}` : ''}`;
      }

      if (entry.category === 'cbu' || entry.category === 'savings') {
        if (!entry.account) throw new Error(`No ${entry.category.toUpperCase()} account found for this member.`);

        // Kiddy & Youth Savings members carry a sub-type (Regular Savings
        // Account vs Educational Savings Account) chosen on the invoice form.
        // Label the deposit under that sub-type and keep the member's on-file
        // savings type in sync if it was changed here.
        const isKiddySavings = entry.category === 'savings' && member.membership_type === 'kiddy';
        const kiddySavingsType = isKiddySavings ? (entry.kiddySavingsType || member.kiddy_savings_type || 'regular_savings') : null;
        const kiddySavingsLabel = kiddySavingsType === 'educational_savings'
          ? 'Educational Savings Account'
          : 'Regular Savings Account';

        const depositTx = await createTransaction({
          member_id: member.id,
          account_id: entry.account.id,
          category: entry.category,
          type: 'deposit',
          amount,
          reference: invoiceReference,
          notes: isKiddySavings ? [kiddySavingsLabel, notes].filter(Boolean).join(' — ') : notes,
          created_by,
          transaction_date: effectivePaymentDate,
          payment_mode,
          payment_mode_note,
        });
        rollbacks.push(async () => {
          await supabase.from('transactions').delete().eq('id', depositTx.id);
        });

        // The transaction row alone doesn't move the needle on the account's
        // own balance/total_deposits — those are the fields the CBU/Savings
        // pages and the Member Dashboard tabs actually display, so they must
        // be updated here too, or the deposit will look like it "disappeared"
        // even though it was recorded.
        const priorBalance = entry.account.balance || 0;
        const priorTotalDeposits = entry.account.total_deposits || 0;
        await updateAccount(entry.account.id, {
          balance: priorBalance + amount,
          total_deposits: priorTotalDeposits + amount,
          updated_at: new Date().toISOString(),
        });
        rollbacks.push(async () => {
          await supabase.from('accounts').update({
            balance: priorBalance,
            total_deposits: priorTotalDeposits,
          }).eq('id', entry.account.id);
        });

        if (isKiddySavings && kiddySavingsType && kiddySavingsType !== member.kiddy_savings_type) {
          const priorSavingsType = member.kiddy_savings_type;
          await updateMember(member.id, { kiddy_savings_type: kiddySavingsType });
          member.kiddy_savings_type = kiddySavingsType;
          rollbacks.push(async () => {
            await supabase.from('members').update({ kiddy_savings_type: priorSavingsType }).eq('id', member.id);
          });
        }

        account_id = entry.account.id;
        ref_id = entry.account.id;
        purpose = purpose || (isKiddySavings
          ? `${kiddySavingsLabel} Deposit${entry.account.account_no ? ` — ${entry.account.account_no}` : ''}`
          : `${entry.category === 'cbu' ? 'CBU' : 'Savings'} Deposit${entry.account.account_no ? ` — ${entry.account.account_no}` : ''}`);
        invoiceLines.push({ label: purpose, amount, payment_type: entry.category, ref_id, account_id });
      }

      if (entry.category === 'time_deposit') {
        if (!entry.timeDeposit) throw new Error('Time Deposit record not found for this member.');
        await recordTimeDepositPayment({
          time_deposit_id: entry.timeDeposit.id,
          amount,
          payment_date: effectivePaymentDate,
          si_number: invoiceReference,
          created_by,
        });
        // Time Deposit payments live in their own `time_deposit_payments`
        // ledger (see timeDepositService.js) rather than an `amount` running
        // balance, but the member's Transactions tab and dashboard read from
        // the shared `transactions` table — so a transaction row is written
        // here too, exactly like CBU/Savings, or the deposit wouldn't show up
        // in the member's general transaction history.
        const tdTx = await createTransaction({
          member_id: member.id,
          category: 'time_deposit',
          type: 'deposit',
          amount,
          reference: invoiceReference,
          notes,
          created_by,
          transaction_date: effectivePaymentDate,
          payment_mode,
          payment_mode_note,
        });
        rollbacks.push(async () => {
          await supabase.from('transactions').delete().eq('id', tdTx.id);
        });
        ref_id = entry.timeDeposit.id;
        purpose = purpose || `Time Deposit Payment${entry.timeDeposit.name ? ` — ${entry.timeDeposit.name}` : ''}`;
        invoiceLines.push({ label: purpose, amount, payment_type: 'time_deposit', ref_id, account_id });
      }

      if (entry.category === 'savings_booster') {
        if (!entry.booster) throw new Error('Savings Booster enrollment not found for this member.');
        const priorTotalDeposited = entry.booster.total_deposited || 0;
        const priorWeeksDeposited = entry.booster.weeks_deposited || 0;
        const priorLastDepositDate = entry.booster.last_deposit_date || null;
        const weekCount = getBoosterDepositWeeks(amount, entry.booster);
        const nextTotalDeposited = priorTotalDeposited + amount;
        const nextWeeksDeposited = priorWeeksDeposited + weekCount;
        const { data: updatedBooster, error: boosterErr } = await supabase
          .from('savings_booster')
          .update({
            ...buildSavingsBoosterUpdate(entry.booster, {
              total_deposited: nextTotalDeposited,
              weeks_deposited: nextWeeksDeposited,
              last_deposit_date: effectivePaymentDate,
            }),
            last_deposit_date: effectivePaymentDate,
          })
          .eq('id', entry.booster.id)
          .select()
          .maybeSingle();
        if (boosterErr) throw boosterErr;
        if (!updatedBooster) {
          throw new Error('Could not update this Savings Booster enrollment.');
        }
        rollbacks.push(async () => {
          await supabase.from('savings_booster').update({
            total_deposited: priorTotalDeposited,
            weeks_deposited: priorWeeksDeposited,
            last_deposit_date: priorLastDepositDate,
          }).eq('id', entry.booster.id);
        });

        const boosterTx = await createTransaction({
          member_id: member.id,
          category: 'savings_booster',
          type: 'deposit',
          amount,
          reference: invoiceReference,
          notes,
          created_by,
          transaction_date: effectivePaymentDate,
          payment_mode,
          payment_mode_note,
        });
        rollbacks.push(async () => {
          await supabase.from('transactions').delete().eq('id', boosterTx.id);
        });
        const { error: boosterPaymentErr } = await supabase
          .from('savings_booster_payments')
          .insert({
            booster_id: entry.booster.id,
            member_id: member.id,
            invoice_id: savedInvoice.id,
            transaction_id: boosterTx.id,
            amount,
            week_count: weekCount,
            payment_date: effectivePaymentDate,
            payment_mode,
            reference: invoiceReference,
            notes,
            created_by,
          });
        if (boosterPaymentErr && boosterPaymentErr.code !== '42P01') {
          throw boosterPaymentErr;
        }
        ref_id = updatedBooster?.id || entry.booster.id;
        purpose = purpose || `Savings Booster Deposit${entry.booster.slot_number ? ` — Slot #${entry.booster.slot_number}` : ''}`;
        invoiceLines.push({ label: purpose, amount, payment_type: 'savings_booster', ref_id, account_id });
      }

      if (!invoiceRefId && ref_id) invoiceRefId = ref_id;
      if (!invoiceAccountId && account_id) invoiceAccountId = account_id;
      if (!invoicePaymentType) invoicePaymentType = entry.category === 'loan' ? 'loan_payment' : entry.category;

      // NOTE: intentionally bypasses createInvoiceForPayment's own duplicate
      // check here — the SI# was already validated once above and is reused
      // on purpose across every category in this same invoice. Re-checking per
      // line item would find the row we just inserted for the first category
      // and incorrectly reject the second one as a "duplicate".
    }

    return created;
  } catch (err) {
    await runRollbacks();
    throw err;
  }
}
