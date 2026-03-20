import { supabase } from './supabase';

export async function getDashboardStats() {
  const [membersRes, loansRes, accountsRes, txRes] = await Promise.all([
    supabase.from('members').select('id, status'),
    supabase.from('loans').select('id, status, amount, balance'),
    supabase.from('accounts').select('id, account_type, balance'),
    supabase
      .from('transactions')
      .select('id, type, amount, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const memberData = membersRes.data || [];
  const loanData = loansRes.data || [];
  const accountData = accountsRes.data || [];
  const txData = txRes.data || [];

  const cbuAccounts = accountData.filter(a => a.account_type === 'cbu');
  const savingsAccounts = accountData.filter(a => a.account_type === 'savings');
  const activeLoans = loanData.filter(l => ['active', 'ongoing'].includes(l.status));

  return {
    totalMembers: memberData.length,
    activeMembers: memberData.filter(m => m.status === 'active').length,
    totalCBU: cbuAccounts.reduce((s, a) => s + (a.balance || 0), 0),
    totalSavings: savingsAccounts.reduce((s, a) => s + (a.balance || 0), 0),
    activeLoans: activeLoans.length,
    totalLoanOutstanding: activeLoans.reduce((s, l) => s + (l.balance ?? l.amount ?? 0), 0),
    recentTransactions: txData,
  };
}