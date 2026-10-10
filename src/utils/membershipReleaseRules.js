export const money = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
export function calculateMembershipUpgrade({ requiredBreakdown, paidBreakdown }) {
  const keys = ['membership_fee', 'wellife_vip', 'cbu', 'savings', 'other_fee'];
  const breakdown = Object.fromEntries(keys.map(key => [key, money(Math.max(0, money(requiredBreakdown?.[key]) - money(paidBreakdown?.[key])))]));
  return { ...breakdown, total: money(keys.reduce((sum, key) => sum + breakdown[key], 0)) };
}
export function validateMembershipRelease({ checkAmount, netProceeds, loanStatus, membershipDeduction }) {
  if (loanStatus !== 'approved') throw new Error('Only approved loans can be newly released.');
  if (!Number.isFinite(Number(checkAmount)) || money(checkAmount) !== money(netProceeds))
    throw new Error('Check amount must match net loan proceeds.');
  if (membershipDeduction?.enabled) {
    const keys = ['membership_fee', 'wellife_vip', 'cbu', 'savings', 'other_fee'];
    const amounts = keys.map(key => Number(membershipDeduction[key] || 0));
    if (amounts.some(value => !Number.isFinite(value) || value < 0))
      throw new Error('Membership deduction contains an invalid amount.');
    if (money(amounts.reduce((sum, value) => sum + value, 0)) !== money(membershipDeduction.total))
      throw new Error('Membership deduction category amounts do not match its total.');
  }
  return true;
}
s