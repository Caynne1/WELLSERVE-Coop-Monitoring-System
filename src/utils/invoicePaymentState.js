import { getLoanBalanceWithInterest, isLoanReleased, normalizeLoanStatus } from './loanListState.js';

const OLD_MEMBERSHIP_BREAKDOWN = {
  associate: [
    { label: 'Membership Entry', amount: 300, key: 'membership', bucket: 'entry' },
    { label: 'Initial CBU', amount: 1000, key: 'membership_initial_cbu', bucket: 'cbu' },
    { label: 'Initial Savings', amount: 500, key: 'membership_initial_savings', bucket: 'savings' },
  ],
  regular: [
    { label: 'Membership Entry', amount: 1800, key: 'membership', bucket: 'entry' },
    { label: 'Initial CBU', amount: 4000, key: 'membership_initial_cbu', bucket: 'cbu' },
    { label: 'Initial Savings', amount: 1000, key: 'membership_initial_savings', bucket: 'savings' },
  ],
};

const NEW_MEMBERSHIP_BREAKDOWN = {
  associate: [
    { label: 'Membership Fee', amount: 100, key: 'membership', bucket: 'entry' },
    { label: 'WELLife VIP Card', amount: 300, key: 'membership_wellife_vip', bucket: 'vip' },
    { label: 'Initial CBU', amount: 500, key: 'membership_initial_cbu', bucket: 'cbu' },
  ],
  regular: [
    { label: 'Membership Fee', amount: 100, key: 'membership', bucket: 'entry' },
    { label: 'WELLife VIP Card', amount: 300, key: 'membership_wellife_vip', bucket: 'vip' },
    { label: 'Initial CBU', amount: 500, key: 'membership_initial_cbu', bucket: 'cbu' },
    { label: 'Admin & Regulatory Fees', amount: 1000, key: 'membership_admin_regulatory', bucket: 'admin' },
    { label: 'Initial Savings Deposit', amount: 500, key: 'membership_initial_savings', bucket: 'savings' },
    { label: 'Minimum CBU', amount: 3500, key: 'membership_minimum_cbu', bucket: 'cbu' },
  ],
};


export function getMembershipBreakdown(member, membershipInfo) {
  const membership = membershipInfo?.record;
  if (!membership) return null;
  const type = membership.membership_type || member?.membership_type || '';
  const required = Number(membership.fee_required) || 0;
  const isOld = member?.record_type === 'old_member' || [1800, 6800].includes(required);
  const isNew = !isOld && (member?.record_type === 'new_member' || [900, 5900].includes(required));
  const rows = (isOld ? OLD_MEMBERSHIP_BREAKDOWN : isNew ? NEW_MEMBERSHIP_BREAKDOWN : {})[type];
  if (!rows) return null;
  return { rows, total: rows.reduce((sum, row) => sum + row.amount, 0), structure: isOld ? 'old' : 'new' };
}

export function getInvoiceMembershipState(member, membership) {
  const breakdown = getMembershipBreakdown(member, { record: membership });
  // Match the membership page: an upgrade keeps prior payments and raises the requirement.
  const required = Math.max(Number(membership?.fee_required) || 0, breakdown?.total || 0);
  const paid = Number(membership?.fee_paid) || 0;
  const value = Math.max(0, required - paid);
  return {
    key: 'membership', label: 'Membership', record: membership,
    hasRecord: !!membership, valueType: 'balance', value,
    required, paid, payable: !!membership && value > 0,
  };
}

export function getInvoiceLoanState(loans = []) {
  const released = loans.filter(isLoanReleased);
  const records = released
    .filter(loan => normalizeLoanStatus(loan.status) !== 'paid')
    .map(loan => ({
      ...loan,
      principal_balance: Math.max(0, Number(loan.balance ?? loan.amount) || 0),
      outstanding_balance: getLoanBalanceWithInterest(loan),
    }))
    .filter(loan => loan.outstanding_balance > 0);
  return {
    key: 'loan', label: 'Loan', records, hasRecord: released.length > 0,
    valueType: 'balance', value: records[0]?.principal_balance || 0,
    payable: records.length > 0,
  };
}
