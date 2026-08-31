import { parseLoanJSON } from './loanListState.js';

// Display names only. Product rates and calculation rules stay in the loan form.
export const LOAN_PRODUCT_FILTER_OPTIONS = [
  { value: 'beneficial_straight', label: 'Beneficial Loan (Straight)' },
  { value: 'beneficial_diminishing', label: 'Beneficial Loan (Diminishing)' },
  { value: 'productive', label: 'WELLife Productive Loan' },
  { value: 'providential', label: 'Providential Loan' },
  { value: 'financing', label: 'Financing Loan' },
  { value: 'custom', label: 'Custom / Other' },
];

export function getLoanProductCode(loan) {
  const summary = parseLoanJSON(loan?.preview_summary_json, {});
  const code = summary.loan_product ?? loan?.loan_product ?? '';
  return LOAN_PRODUCT_FILTER_OPTIONS.some(product => product.value === code) ? code : '';
}

export function getLoanProductLabel(loan) {
  const code = getLoanProductCode(loan);
  return LOAN_PRODUCT_FILTER_OPTIONS.find(product => product.value === code)?.label || 'Unspecified';
}

export function matchesLoanProduct(loan, filter = 'all') {
  if (filter === 'all') return true;
  return getLoanProductCode(loan) === (filter === 'unspecified' ? '' : filter);
}
