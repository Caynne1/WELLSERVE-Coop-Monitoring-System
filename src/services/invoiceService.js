import { supabase } from './supabase';
import { createTransaction } from './transactionService';
import {
  getMembershipByMemberId,
  recordMembershipPayment,
  computeFeeBalance,
} from './membershipService';
import { getLoansByMemberId, applyLoanPaymentToSchedule } from './loanService';
import { getMemberAccountsMap } from './accountService';
import {
  getTimeDepositsByMemberId,
  recordTimeDepositPayment,
} from './timeDepositService';

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

  const { data, error } = await supabase
    .from('invoices')
    .insert(clean)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createInvoiceForPayment({
  invoice_no,
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
  if (!invoice_no || !String(invoice_no).trim()) {
    throw new Error('SI# is required for invoice creation.');
  }
  if (!payment_type) throw new Error('payment_type is required for invoice creation.');
  if (!member_id && payment_type !== 'capital') {
    throw new Error('member_id is required for invoice creation.');
  }
  if (!member_name) throw new Error('member_name is required for invoice creation.');
  if (!amount || Number(amount) <= 0) throw new Error('amount must be greater than zero.');

  return createInvoice({
    invoice_no: String(invoice_no).trim(),
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

  const [membership, loans, accounts, timeDeposits] = await Promise.all([
    getMembershipByMemberId(memberId).catch(() => null),
    getLoansByMemberId(memberId).catch(() => []),
    getMemberAccountsMap(memberId).catch(() => ({ all: [], cbu: null, savings: null })),
    getTimeDepositsByMemberId(memberId).catch(() => []),
  ]);

  const activeLoans = (loans || []).filter(l => l.status !== 'paid' && (l.balance || 0) > 0);
  const activeTimeDeposits = (timeDeposits || []).filter(td => td.status === 'Active');

  const membershipBalance = membership ? computeFeeBalance(membership) : 0;

  return {
    membership: {
      key: 'membership',
      label: 'Membership',
      record: membership,
      balance: membershipBalance,
      hasBalance: membershipBalance > 0,
      payable: !!membership && membershipBalance > 0,
    },
    loan: {
      key: 'loan',
      label: 'Loan',
      records: activeLoans,
      balance: activeLoans.reduce((s, l) => s + (l.balance || 0), 0),
      hasBalance: activeLoans.length > 0,
      payable: activeLoans.length > 0,
    },
    cbu: {
      key: 'cbu',
      label: 'CBU',
      record: accounts.cbu,
      balance: accounts.cbu?.balance || 0,
      hasBalance: !!accounts.cbu,
      payable: !!accounts.cbu, // deposit-based: always allowed to add more
    },
    savings: {
      key: 'savings',
      label: 'Savings',
      record: accounts.savings,
      balance: accounts.savings?.balance || 0,
      hasBalance: !!accounts.savings,
      payable: !!accounts.savings,
    },
    time_deposit: {
      key: 'time_deposit',
      label: 'Time Deposit',
      records: activeTimeDeposits,
      balance: activeTimeDeposits.reduce((s, td) => s + (td.amount || 0), 0),
      hasBalance: activeTimeDeposits.length > 0,
      payable: activeTimeDeposits.length > 0,
    },
    savings_booster: {
      key: 'savings_booster',
      label: 'Savings Booster',
      hasBalance: false,
      payable: false, // Savings Booster deposits are managed on its own enrollment page
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
  member,
  date,
  entries,
  payment_mode = null,
  payment_mode_note = null,
  notes = null,
  created_by = null,
}) {
  if (!invoice_no || !String(invoice_no).trim()) {
    throw new Error('Invoice Number (SI#) is required.');
  }
  if (!member?.id) throw new Error('A member must be selected.');
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('Select at least one payment category with an amount.');
  }
  if (!date) throw new Error('Invoice date is required.');

  const siNo = String(invoice_no).trim();
  const duplicate = await checkInvoiceNoExists(siNo);
  if (duplicate) {
    throw new Error(`Invoice Number "${siNo}" is already in use. Please enter a different SI#.`);
  }

  const memberName = [member.first_name, member.last_name].filter(Boolean).join(' ') || 'Member';
  const created = [];

  for (const entry of entries) {
    const amount = Number(entry.amount) || 0;
    if (amount <= 0) continue;

    let ref_id = entry.ref_id || null;
    let account_id = null;
    let purpose = entry.purpose;

    if (entry.category === 'membership') {
      if (!entry.membership) throw new Error('Membership record not found for this member.');
      await recordMembershipPayment(
        entry.membership.id, member.id, amount, date, notes, created_by
      );
      ref_id = entry.membership.id;
      purpose = purpose || 'Membership Fee Payment';
    }

    if (entry.category === 'loan') {
      if (!entry.loan) throw new Error('Loan record not found for this member.');
      if (amount > (entry.loan.balance || 0)) {
        throw new Error(`Loan payment exceeds remaining balance of ${entry.loan.balance}.`);
      }
      await createTransaction({
        member_id: member.id,
        loan_id: entry.loan.id,
        category: 'loan',
        type: 'loan_payment',
        amount,
        reference: siNo,
        notes,
        created_by,
        transaction_date: date,
        payment_mode,
        payment_mode_note,
      });
      await applyLoanPaymentToSchedule(entry.loan.id, amount);
      ref_id = entry.loan.id;
      purpose = purpose || `Loan Payment — ${entry.loan.loan_no || entry.loan.id}`;
    }

    if (entry.category === 'cbu' || entry.category === 'savings') {
      if (!entry.account) throw new Error(`No ${entry.category.toUpperCase()} account found for this member.`);
      await createTransaction({
        member_id: member.id,
        account_id: entry.account.id,
        category: entry.category,
        type: 'deposit',
        amount,
        reference: siNo,
        notes,
        created_by,
        transaction_date: date,
        payment_mode,
        payment_mode_note,
      });
      account_id = entry.account.id;
      ref_id = entry.account.id;
      purpose = purpose || `${entry.category === 'cbu' ? 'CBU' : 'Savings'} Deposit — ${entry.account.account_no || entry.account.id}`;
    }

    if (entry.category === 'time_deposit') {
      if (!entry.timeDeposit) throw new Error('Time Deposit record not found for this member.');
      await recordTimeDepositPayment({
        time_deposit_id: entry.timeDeposit.id,
        amount,
        payment_date: date,
        si_number: siNo,
        created_by,
      });
      ref_id = entry.timeDeposit.id;
      purpose = purpose || `Time Deposit Payment — ${entry.timeDeposit.name || memberName}`;
    }

    const invoiceRow = await createInvoiceForPayment({
      invoice_no: siNo,
      payment_type: entry.category === 'loan' ? 'loan_payment' : entry.category,
      member_id: member.id,
      member_name: memberName,
      amount,
      purpose,
      ref_id,
      account_id,
      notes,
      created_by,
      date,
      payment_mode,
      payment_mode_note,
    });

    created.push(invoiceRow);
  }

  if (created.length === 0) {
    throw new Error('Select at least one payment category with an amount greater than zero.');
  }

  return created;
}