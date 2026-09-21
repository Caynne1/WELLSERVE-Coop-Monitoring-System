import { getLoanFinancials, getLoanOutstandingComponents, isLoanReleased } from './loanListState.js';

export const memberPrintCss = `
  .lh-header { padding: 3mm 10mm; border-bottom: 1px solid #bbb; }
  .lh-header img { height: 10mm; }
  .lh-content { padding: 4mm 10mm 8mm; }
  .lh-wrap, .lh-wrap > tbody > tr { break-inside: auto; page-break-inside: auto; }
  .member-report { font-size: 9pt; line-height: 1.35; }
  .member-report h1 { font-size: 16pt; margin-bottom: 2mm; }
  .member-report h2 { font-size: 10pt; margin: 4mm 0 1mm; padding-bottom: 1mm; border-bottom: 1px solid #777; break-after: avoid; }
  .member-report table { table-layout: fixed; margin-bottom: 2mm; font-size: 8.5pt; }
  .member-report th, .member-report td { padding: 4pt 5pt; border: 0; border-bottom: 1px solid #e1e4e8; overflow-wrap: anywhere; vertical-align: top; }
  .member-report th { background: #f1f3f5; color: #333; text-align: left; }
  .member-report .pairs th { width: 18%; background: white; font-weight: 400; color: #555; }
  .member-report .pairs td { width: 32%; }
  .member-report .num { text-align: right; font-variant-numeric: tabular-nums; }
  .member-report .meta { font-size: 8pt; color: #555; }
  .member-report thead { display: table-header-group; }
`;

const esc = value => String(value ?? '-').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cash = value => 'PHP ' + Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = value => value ? String(value).slice(0, 10) : '-';
const label = value => String(value || '-').replace(/_/g, ' ');
function pairs(rows) {
  let result = '';
  for (let i = 0; i < rows.length; i += 2) {
    result += '<tr>' + [rows[i], rows[i + 1]].map(row => row ? '<th>' + esc(row[0]) + '</th><td>' + esc(row[1] || '-') + '</td>' : '<th></th><td></td>').join('') + '</tr>';
  }
  return '<table class="pairs"><tbody>' + result + '</tbody></table>';
}
function table(headers, rows, numeric = []) {
  return '<table><thead><tr>' + headers.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' +
    (rows.length ? rows.map(row => '<tr>' + row.map((v, i) => '<td class="' + (numeric.includes(i) ? 'num' : '') + '">' + esc(v) + '</td>').join('') + '</tr>').join('') : '<tr><td colspan="' + headers.length + '">No records.</td></tr>') + '</tbody></table>';
}
export function buildMemberPrint({ member, membership, accounts, loans, profile, performance, cbuTransactions, savingsTransactions, loanTransactions, cbuBalance, savingsBalance }) {
  const fullName = [member.first_name, member.middle_initial, member.last_name].filter(Boolean).join(' ');
  const history = rows => table(['Payment Date', 'SI / Reference', 'Transaction', 'Amount'], rows.map(tx => [
    date(tx.transaction_date), tx.invoice_no || tx.reference || '-', label(tx.type), cash(tx.amount),
  ]), [3]);
  const account = (type, balance, rows) => {
    const entries = accounts.filter(a => String(a.account_type).toLowerCase() === type);
    return pairs([['Current Balance', cash(balance)], ['Accounts', entries.map(a => a.account_no || a.account_number || '-').join(', ') || '-'], ['Status', entries.map(a => label(a.status)).join(', ') || '-']]) + history(rows);
  };
  return '<article class="member-report"><h1>Member Information Report</h1><p class="meta">' + esc(fullName) + ' | Member ' + esc(member.member_no) + ' | Generated ' + esc(new Date().toLocaleString('en-PH')) + ' | CONFIDENTIAL</p>' +
    '<h2>Personal Information</h2>' + pairs([
      ['Full Name', fullName], ['Date of Birth', date(member.date_of_birth)],
      ['Sex', member.sex], ['Civil Status', member.civil_status],
      ['Mobile', member.phone || member.contact_no], ['Telephone', member.res_tel_no],
      ['Email', member.email], ['Occupation', member.occupation], ['Address', member.address],
    ]) +
    '<h2>Member Details</h2>' + pairs([
      ['Member Number', member.member_no], ['Membership Type', label(membership?.membership_type || member.membership_type)],
      ['Status', label(member.status)], ['Date Joined', date(member.date_joined || member.created_at)],
      ['Referred By', member.recruiter_name || 'Self'], ['Record Type', label(member.record_type)],
      ['Membership Fee Required', membership ? cash(membership.fee_required) : '-'], ['Membership Fee Paid', membership ? cash(membership.fee_paid) : '-'],
    ]) +
    '<h2>Credit Profile</h2>' + pairs([
      ['Credit Grade / Score', profile.grade + ' / ' + profile.score + ' of 100'],
      ['Released Loans / Paid', profile.total + ' / ' + profile.paid],
      ['Active / Overdue', profile.active + ' / ' + profile.overdue],
      ['Draft / Pending Approval', loans.filter(l => ['draft', 'pending', 'credit_committee_approval'].includes(l.status)).length.toString()],
      ['Total Borrowed', cash(profile.totalBorrowed)], ['Outstanding Principal', cash(profile.totalOutstanding)],
      ['Principal Repaid', cash(profile.totalBorrowed - profile.totalOutstanding)], ['On-Time Rate', performance.onTimeRate + '%'],
      ['Due Installments', performance.dueInstallments.toString()], ['Paid On Time / Late', performance.paidOnTime + ' / ' + performance.paidLate],
      ['Missed / Still Overdue', performance.missed + ' / ' + performance.overdue], ['Timing Unknown', performance.timingUnknown.toString()],
      ['Balance Payments', performance.balancePayments.toString()], ['Balance Payment Amount', cash(performance.balancePaymentAmount)],
    ]) +
    '<h2>Loan History</h2>' + table(['Principal', 'Interest', 'Principal Balance', 'Interest Balance', 'Term', 'Status', 'Released'], loans.map(l => {
      const remaining = getLoanOutstandingComponents(l);
      return [cash(l.amount), cash(getLoanFinancials(l).interest), isLoanReleased(l) ? cash(remaining.principal) : 'Not released', isLoanReleased(l) ? cash(remaining.interest) : '-', l.term_months ? l.term_months + ' mo.' : '-', label(l.status), isLoanReleased(l) ? date(l.release_date) : '-'];
    }), [0, 1, 2, 3]) +
    '<h2>Loan Payment History</h2>' + history(loanTransactions.filter(tx => ['loan_payment', 'loan_interest'].includes(tx.type))) +
    '<h2>Capital Build-Up (CBU)</h2>' + account('cbu', cbuBalance, cbuTransactions) +
    '<h2>Savings</h2>' + account('savings', savingsBalance, savingsTransactions) +
    '<p class="meta">WELLSERVE Credit Cooperative | Authorized personnel only.</p></article>';
}
