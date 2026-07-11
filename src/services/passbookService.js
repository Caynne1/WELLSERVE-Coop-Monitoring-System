import { supabase } from './supabase';

// ── Pagination helper ────────────────────────────────────────────────────────
// PostgREST/Supabase caps a single .select() at 1000 rows by default. Any
// table that can realistically grow past that (members, accounts,
// transactions) MUST be paginated, or rows silently go missing from the
// passbook -- this was the root cause of members/transactions being dropped
// from CBU & Savings passbook views. This helper transparently pages through
// a query in chunks of 1000 until exhausted.

const PAGE_SIZE = 1000;

async function fetchAllRows(buildQuery) {
  let all = [];
  let from = 0;

  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const rows = data || [];
    all = all.concat(rows);

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}

// ── Registry: members + linked CBU/Savings accounts ──────────────────────────

export async function getPassbookMembers() {
  return fetchAllRows(() =>
    supabase
      .from('members')
      .select(`
        id,
        member_no,
        first_name,
        last_name,
        middle_initial,
        date_joined,
        recruiter_name,
        passbook_status,
        passbook_print_status,
        created_at,
        status
      `)
      .order('created_at', { ascending: true })
  );
}

export async function getPassbookAccounts() {
  return fetchAllRows(() =>
    supabase
      .from('accounts')
      .select(`
        id,
        member_id,
        account_no,
        account_type,
        balance,
        created_at
      `)
  );
}

// All CBU + Savings (+ loan, which posts against the savings passbook)
// transactions system-wide (paginated). Used to build the registry view and
// per-member passbook ledgers without re-querying per member (N+1) and
// without hitting the 1000-row cap.
export async function getPassbookTransactions() {
  return fetchAllRows(() =>
    supabase
      .from('transactions')
      .select(`
        id,
        member_id,
        account_id,
        category,
        type,
        amount,
        reference,
        payment_mode,
        notes,
        transaction_date,
        created_at
      `)
      .in('category', ['savings', 'cbu', 'loan'])
      .order('transaction_date', { ascending: true })
      .order('created_at', { ascending: true })
  );
}

export async function getPassbookData() {
  const [members, accounts, transactions] = await Promise.all([
    getPassbookMembers(),
    getPassbookAccounts(),
    getPassbookTransactions(),
  ]);
  return { members, accounts, transactions };
}

// ── Per-member ledger ─────────────────────────────────────────────────────────
// Matches transactions to a specific passbook (savings or cbu) primarily by
// account_id (the authoritative link created at deposit/withdrawal time).
// Falls back to member_id + category for legacy rows that predate the
// account_id column being populated, so historical entries are never lost.

export function buildPassbookLedger({ transactions, memberId, accountType, accountId }) {
  return transactions.filter(tx => {
    if (tx.member_id !== memberId) return false;

    if (accountId && tx.account_id) {
      if (accountType === 'savings') {
        return tx.account_id === accountId || tx.category === 'loan';
      }
      return tx.account_id === accountId;
    }

    // Fallback for legacy rows missing account_id
    if (accountType === 'savings') {
      return tx.category === 'savings' || tx.category === 'loan';
    }
    return tx.category === 'cbu';
  });
}

export function computeAccountMap(accounts) {
  const map = new Map();
  for (const account of accounts) {
    if (!map.has(account.member_id)) {
      map.set(account.member_id, {});
    }
    map.get(account.member_id)[String(account.account_type).toLowerCase()] = account;
  }
  return map;
}

export async function updatePassbookStatus(memberId, newStatus) {
  const { data, error } = await supabase
    .from('members')
    .update({ passbook_status: newStatus })
    .eq('id', memberId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updatePassbookPrintStatus(memberId, newStatus) {
  const { data, error } = await supabase
    .from('members')
    .update({ passbook_print_status: newStatus })
    .eq('id', memberId)
    .select()
    .single();
  if (error) throw error;
  return data;
}