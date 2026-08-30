import { supabase } from './supabase';
import { getLoanReleaseCandidates, releaseLoanFromCheck } from './loanWorkflowService';
import { createTransaction } from './transactionService';
import { getImportedHistoricalRows, mapHistoricalCheck } from './historicalMigrationRecordService';

// ── Column whitelist ──────────────────────────────────────────────────────────
// Only these fields are ever written to the DB.
// Prevents accidental injection of joined/computed fields.

const CHECKBOOK_COLUMNS = [
  'check_no', 'date', 'payee', 'amount',
  'purpose', 'bank', 'notes', 'status', 'created_by',
  'voucher_id',   // optional link to vouchers table (documentation only)
];

function sanitizeCheckbookPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([k, v]) => CHECKBOOK_COLUMNS.includes(k) && v !== '' && v !== undefined && v !== null
    )
  );
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getCheckbookEntries(filters = {}) {
  let query = supabase
    .from('checkbook')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.bank)   query = query.eq('bank',   filters.bank);

  const { data: entries, error } = await query;
  if (error) throw error;
  const entryRows = entries || [];

  // ── Optional join: attach linked voucher for display in detail modal ──────
  const voucherIds = [...new Set(entryRows.map(e => e.voucher_id).filter(Boolean))];
  let enriched = entryRows;

  if (voucherIds.length > 0) {
    const { data: vouchers } = await supabase
      .from('vouchers')
      .select('id, voucher_no, payee, amount, status, purpose, voucher_kind, expense_id')
      .in('id', voucherIds);

    const expenseIds = [...new Set((vouchers || []).map(v => v.expense_id).filter(Boolean))];
    let expenseMap = {};

    if (expenseIds.length > 0) {
      const { data: expenses } = await supabase
        .from('expenses')
        .select('id, category, category_other')
        .in('id', expenseIds);

      expenseMap = Object.fromEntries((expenses || []).map(expense => [expense.id, expense]));
    }

    const voucherMap = Object.fromEntries((vouchers || []).map(voucher => [
      voucher.id,
      {
        ...voucher,
        expenses: voucher.expense_id ? (expenseMap[voucher.expense_id] || null) : null,
      },
    ]));
    enriched = entryRows.map(e => ({
      ...e,
      vouchers: e.voucher_id ? (voucherMap[e.voucher_id] || null) : null,
    }));
  }

  if (filters.status && filters.status !== 'historical') return enriched;

  const historicalRows = await getImportedHistoricalRows('Checkbook', { flowType: 'cash_out' });
  const historicalChecks = historicalRows.map(mapHistoricalCheck);

  return [...enriched, ...historicalChecks]
    .sort((a, b) => new Date(b.date || b.created_at || 0) - new Date(a.date || a.created_at || 0));
}

export async function getCheckbookEntryById(id) {
  const { data, error } = await supabase
    .from('checkbook')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

async function getLinkedVoucher(voucherId) {
  if (!voucherId) return null;

  const { data, error } = await supabase
    .from('vouchers')
    .select('*')
    .eq('id', voucherId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function getLinkedExpense(expenseId) {
  if (!expenseId) return null;

  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('id', expenseId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

function hasLoanReference(value = '') {
  const text = String(value || '');
  return /Loan No\s*:|Loan ID\s*:|Loan net proceeds\s*-|\bLN[-_/ A-Za-z0-9]+\b/i.test(text);
}

function isLoanReleaseVoucher(voucher, expense) {
  if (!voucher) return false;
  if ((voucher.voucher_kind || 'expense') === 'member_withdrawal') return false;
  if (expense?.category === 'loan_net_proceeds') return true;
  if (voucher.member_id && hasLoanReference(voucher.reference || voucher.notes || voucher.purpose)) return true;
  return [
    voucher.reference,
    voucher.purpose,
    voucher.notes,
    expense?.description,
    expense?.notes,
  ].some(hasLoanReference);
}

function expenseTransactionCategory(expense) {
  return expense?.category || 'expense';
}

function buildExpenseReleaseNotes({ check, voucher, expense, category }) {
  return [
    `Check release for expense${voucher?.voucher_no ? ` | Voucher: ${voucher.voucher_no}` : ''}`,
    `Original expense category: ${category}`,
    expense?.category_other ? `Category detail: ${expense.category_other}` : null,
    check.notes,
    expense?.notes,
  ].filter(Boolean).join('\n');
}

async function expenseReleaseAlreadyRecorded(check) {
  const { data, error } = await supabase
    .from('transactions')
    .select('id')
    .eq('reference', check.check_no)
    .in('type', ['expense', 'withdrawal', 'check_release'])
    .limit(1);

  if (error) throw error;
  return Boolean(data?.length);
}

async function recordExpenseCheckRelease(check, voucher, expense, userId) {
  if (await expenseReleaseAlreadyRecorded(check)) return;

  const releaseDate = new Date().toISOString().split('T')[0];
  const category = expenseTransactionCategory(expense);
  const notes = buildExpenseReleaseNotes({ check, voucher, expense, category });

  const payload = {
    member_id: voucher?.member_id || null,
    category: 'others',
    type: 'expense',
    amount: Number(check.amount || voucher?.amount || expense?.amount || 0),
    reference: check.check_no,
    notes,
    created_by: userId ?? null,
    transaction_date: check.date || releaseDate,
  };

  try {
    await createTransaction(payload);
  } catch (err) {
    const message = String(err.message || '');
    if (message.includes('transactions_type_check')) {
      try {
        await createTransaction({ ...payload, type: 'withdrawal' });
      } catch (retryErr) {
        if (!String(retryErr.message || '').includes('transactions_category_check')) throw retryErr;
        await createTransaction({
          ...payload,
          type: 'withdrawal',
          category: 'others',
          notes,
        });
      }
      return;
    }
    if (!message.includes('transactions_category_check')) throw err;
    try {
      await createTransaction({
        ...payload,
        category: 'others',
        notes,
      });
    } catch (retryErr) {
      if (!String(retryErr.message || '').includes('transactions_type_check')) throw retryErr;
      await createTransaction({
        ...payload,
        type: 'withdrawal',
        category: 'others',
        notes,
      });
    }
  }
}

// ── Create ────────────────────────────────────────────────────────────────────
// check_no is user-supplied — it comes from the physical bank checkbook.
// The DB UNIQUE constraint is the guard against duplicates.

export async function createCheckbookEntry(payload) {
  const clean = sanitizeCheckbookPayload(payload);
  const { data, error } = await supabase
    .from('checkbook')
    .insert(clean)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Update ────────────────────────────────────────────────────────────────────
// Record-only edits; status transitions are handled by the dedicated functions below.

export async function updateCheckbookEntry(id, payload) {
  const clean = sanitizeCheckbookPayload(payload);
  delete clean.status;

  const { data, error } = await supabase
    .from('checkbook')
    .update(clean)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Status transitions ────────────────────────────────────────────────────────
// Each function handles exactly one transition.
// The DB check constraint is the final guard.

export async function clearCheck(id) {
  const { data, error } = await supabase
    .from('checkbook')
    .update({ status: 'waiting_release' })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getCheckLoanReleaseOptions(id) {
  const check = await getCheckbookEntryById(id);
  const voucher = await getLinkedVoucher(check.voucher_id);
  const expense = await getLinkedExpense(voucher?.expense_id);
  if (!isLoanReleaseVoucher(voucher, expense)) return [];
  return getLoanReleaseCandidates(check, voucher);
}

export async function releaseCheck(id, userId, selectedLoanId = null) {
  const check = await getCheckbookEntryById(id);
  const voucher = await getLinkedVoucher(check.voucher_id);
  const expense = await getLinkedExpense(voucher?.expense_id);

  if (isLoanReleaseVoucher(voucher, expense)) {
    await releaseLoanFromCheck(check, userId, selectedLoanId);
  } else {
    await recordExpenseCheckRelease(check, voucher, expense, userId);
  }

  const { data, error } = await supabase
    .from('checkbook')
    .update({ status: 'released' })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Soft delete — rows are never hard-deleted.
export async function voidCheck(id) {
  const { data, error } = await supabase
    .from('checkbook')
    .update({ status: 'voided' })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
