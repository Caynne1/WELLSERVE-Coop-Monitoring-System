export function incomeCategoryRoute(label) {
  switch (label) {
    case 'Membership CBU':
    case 'Membership Savings':
    case 'Membership/Admin & Regulatory Fees':
    case 'WELLife VIP Card':
      return '/membership-monitoring';
    case 'CBU Retention':
    case 'CBU Completion':
      return '/cbu';
    case 'Regular Savings':
      return '/savings';
    case 'Loan Interest':
    case 'Service Fee':
    case 'Legal Fees':
    case 'CLPI/Insurance':
      return '/loans';
    default:
      return '/transactions';
  }
}
