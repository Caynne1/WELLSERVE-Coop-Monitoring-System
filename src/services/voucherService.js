import { supabase } from './supabase';
import { getLoanByReference, getLoanDeductionItems } from './loanWorkflowService';
import { getImportedHistoricalRows, mapHistoricalVoucher } from './historicalMigrationRecordService';

// ── Column whitelist ──────────────────────────────────────────────────────────
// Only these fields are ever written to the DB.
// Prevents accidental injection of joined/computed fields.

const VOUCHER_COLUMNS = [
  'voucher_no',
  'date',
  'payee',
  'purpose',
  'amount',
  'notes',
  'status',
  'created_by',
  'expense_id',

  // added for member withdrawal flow
  'voucher_kind',   // 'expense' | 'member_withdrawal'
  'member_id',
  'account_id',
  'account_type',   // 'cbu' | 'savings'
  'payment_mode',
  'reference',
];

function sanitizeVoucherPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([k, v]) => VOUCHER_COLUMNS.includes(k) && v !== '' && v !== undefined && v !== null
    )
  );
}

// ── Voucher number generation ─────────────────────────────────────────────────
// Format: VCH-YYYY-NNN
// Counts all vouchers for the current year and increments by 1.
// Not guaranteed to be gap-free (voided records still count),
// which is correct behaviour for an audit trail.

async function generateVoucherNo() {
  const year = new Date().getFullYear();
  const prefix = `VCH-${year}-`;

  const { count, error } = await supabase
    .from('vouchers')
    .select('*', { count: 'exact', head: true })
    .like('voucher_no', `${prefix}%`);

  if (error) throw error;

  const next = String((count || 0) + 1).padStart(3, '0');
  return `${prefix}${next}`;
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getVouchers(filters = {}) {
  let query = supabase
    .from('vouchers')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.voucher_kind) query = query.eq('voucher_kind', filters.voucher_kind);
  if (filters.member_id) query = query.eq('member_id', filters.member_id);
  if (filters.account_id) query = query.eq('account_id', filters.account_id);
  if (filters.account_type) query = query.eq('account_type', filters.account_type);

  const { data: vouchers, error } = await query;
  if (error) throw error;
  const voucherRows = vouchers || [];

  const expenseIds = [...new Set(voucherRows.map(v => v.expense_id).filter(Boolean))];
  const memberIds = [...new Set(voucherRows.map(v => v.member_id).filter(Boolean))];
  const accountIds = [...new Set(voucherRows.map(v => v.account_id).filter(Boolean))];

  const [expensesRes, membersRes, accountsRes] = await Promise.all([
    expenseIds.length
      ? supabase.from('expenses').select('id, description, date, amount').in('id', expenseIds)
      : Promise.resolve({ data: [] }),
    memberIds.length
      ? supabase.from('members').select('id, member_no, first_name, last_name').in('id', memberIds)
      : Promise.resolve({ data: [] }),
    accountIds.length
      ? supabase.from('accounts').select('id, account_no, account_type, balance').in('id', accountIds)
      : Promise.resolve({ data: [] }),
  ]);

  const expenseMap = Object.fromEntries((expensesRes.data || []).map(e => [e.id, e]));
  const memberMap = Object.fromEntries((membersRes.data || []).map(m => [m.id, m]));
  const accountMap = Object.fromEntries((accountsRes.data || []).map(a => [a.id, a]));

  const enriched = voucherRows.map(v => ({
    ...v,
    expenses: v.expense_id ? (expenseMap[v.expense_id] || null) : null,
    members: v.member_id ? (memberMap[v.member_id] || null) : null,
    accounts: v.account_id ? (accountMap[v.account_id] || null) : null,
  }));

  if (filters.status && filters.status !== 'historical') return enriched;

  const historicalRows = await getImportedHistoricalRows('Voucher', { flowType: 'cash_out' });
  const historicalVouchers = historicalRows.map(mapHistoricalVoucher);

  return [...enriched, ...historicalVouchers]
    .sort((a, b) => new Date(b.date || b.created_at || 0) - new Date(a.date || a.created_at || 0));
}

export async function getVoucherById(id) {
  const { data, error } = await supabase
    .from('vouchers')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

// approved vouchers ready to be consumed by a withdrawal flow
export async function getApprovedWithdrawalVouchers({ member_id, account_id, account_type } = {}) {
  let query = supabase
    .from('vouchers')
    .select('*')
    .eq('status', 'approved')
    .eq('voucher_kind', 'member_withdrawal')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (member_id) query = query.eq('member_id', member_id);
  if (account_id) query = query.eq('account_id', account_id);
  if (account_type) query = query.eq('account_type', account_type);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ── Create ────────────────────────────────────────────────────────────────────
// voucher_no is always auto-generated unless caller explicitly supplies one.
// This preserves your old flow while allowing future manual override if needed.

export async function createVoucher(payload) {
  const voucher_no = payload?.voucher_no?.trim() || await generateVoucherNo();

  const clean = sanitizeVoucherPayload({
    status: 'draft',
    voucher_kind: 'expense',
    ...payload,
    voucher_no,
  });

  const { data, error } = await supabase
    .from('vouchers')
    .insert(clean)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// helper specifically for the Expenses approval flow — auto-creates a draft
// voucher the moment an expense is approved, so it's ready to be picked up
// in the Vouchers module for disbursement.
export async function createVoucherFromExpense(expense, createdBy) {
  const categoryLabel = expense.category === 'others'
    ? (expense.category_other || 'Others')
    : expense.category;
  const loanReference = extractLoanReference(expense.notes) || extractLoanReference(expense.description);
  const loan = loanReference ? await getLoanByReference(loanReference) : null;
  const deductionItems = loan ? getLoanDeductionItems(loan) : [];
  const deductionNotes = deductionItems.length
    ? `Loan Deductions: ${deductionItems.map(item => `${item.label} - ${item.amount}`).join('; ')}`
    : null;

  return createVoucher({
    date: expense.date,
    payee: expense.payee,
    purpose: expense.description || categoryLabel,
    amount: expense.amount,
    notes: [expense.notes, deductionNotes].filter(Boolean).join('\n') || undefined,
    expense_id: expense.id,
    created_by: createdBy ?? null,
    // The expense approval IS the approval — the voucher shouldn't need a
    // second, separate approval step in the Vouchers module.
    reference: loan?.loan_no || loan?.id || loanReference || undefined,
    member_id: loan?.member_id || undefined,
    status: 'draft',
  });
}

function extractLoanReference(value = '') {
  const text = String(value || '');
  const match =
    text.match(/Loan No:\s*([A-Za-z0-9-]+)/i) ||
    text.match(/Loan ID:\s*([0-9a-f-]{20,})/i) ||
    text.match(/Loan net proceeds\s*-\s*([A-Za-z0-9-]+)/i);
  return match?.[1] || null;
}

// helper specifically for member-account withdrawals
export async function createMemberWithdrawalVoucher(payload) {
  const voucher_no = payload?.voucher_no?.trim() || await generateVoucherNo();

  const clean = sanitizeVoucherPayload({
    status: 'draft',
    voucher_kind: 'member_withdrawal',
    ...payload,
    voucher_no,
  });

  const { data, error } = await supabase
    .from('vouchers')
    .insert(clean)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── Update ────────────────────────────────────────────────────────────────────
// Only safe to call on draft vouchers. The page enforces this;
// voucher_no is excluded from the whitelist so it can never be overwritten.

export async function updateVoucher(id, payload) {
  const clean = sanitizeVoucherPayload(payload);

  delete clean.voucher_no;
  delete clean.status;

  const { data, error } = await supabase
    .from('vouchers')
    .update(clean)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// mark voucher as consumed by posting withdrawal if your table supports it later
export async function markVoucherUsed(id, extra = {}) {
  const clean = sanitizeVoucherPayload(extra);

  const { data, error } = await supabase
    .from('vouchers')
    .update({
      ...clean,
      notes: clean.notes ?? undefined,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── Status transitions ────────────────────────────────────────────────────────

export async function approveVoucher(id) {
  const { data, error } = await supabase
    .from('vouchers')
    .update({ status: 'approved' })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Soft delete — rows are never hard-deleted.
export async function voidVoucher(id) {
  const { data, error } = await supabase
    .from('vouchers')
    .update({ status: 'voided' })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}
