import * as XLSX from 'xlsx';

function fullName(member) {
  const mi = member?.middle_initial ? `${member.middle_initial}. ` : '';
  return `${member?.first_name || ''} ${mi}${member?.last_name || ''}`.replace(/\s+/g, ' ').trim();
}

function safeFileName(name) {
  return String(name || 'member')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export async function exportMemberReport({
  member,
  loans = [],
  membership = null,
  transactions = [],
  penalties = [],
}) {
  if (!member) {
    throw new Error('Member data is required for export.');
  }

  const workbook = XLSX.utils.book_new();

  // 🧠 categorize transactions
  const loanTx = transactions.filter(t => t.category === 'loan');
  const cbuTx = transactions.filter(t => t.category === 'cbu');
  const savingsTx = transactions.filter(t => t.category === 'savings');

  // 🧾 BASIC INFO
  const basicInfoRows = [
    ['Name', fullName(member)],
    ['Phone Number', member.phone || ''],
    ['Date Joined', member.date_joined || member.created_at || ''],
    ['Membership Type', membership?.membership_type || member.membership_type || ''],
    ['Address', member.address || ''],
    ['Civil Status', member.civil_status || ''],
    ['Sex', member.sex || ''],
    ['Occupation', member.occupation || ''],
  ];

  // 💰 LOANS
  const loanSheetRows = [
    ['Loan Balance', loans.reduce((s, l) => s + (parseFloat(l.balance) || 0), 0)],
    ['Payment Count', loanTx.filter(t => t.type === 'loan_payment').length],
    [],
    ['Payment History'],
    ['Date', 'Type', 'Amount', 'Reference'],
    ...loanTx.map(tx => [
      tx.created_at || '',
      tx.type || '',
      tx.amount || 0,
      tx.reference || '',
    ]),
  ];

  // 🏦 CBU
  const cbuSheetRows = [
    ['Total Deposits', cbuTx.filter(t => t.type === 'deposit').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0)],
    ['Withdrawals', cbuTx.filter(t => t.type === 'withdrawal').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0)],
    [],
    ['History'],
    ['Date', 'Type', 'Amount', 'Reference'],
    ...cbuTx.map(tx => [
      tx.created_at || '',
      tx.type || '',
      tx.amount || 0,
      tx.reference || '',
    ]),
  ];

  // 💳 SAVINGS
  const savingsSheetRows = [
    ['Total Deposits', savingsTx.filter(t => t.type === 'deposit').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0)],
    ['Withdrawals', savingsTx.filter(t => t.type === 'withdrawal').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0)],
    [],
    ['History'],
    ['Date', 'Type', 'Amount', 'Reference'],
    ...savingsTx.map(tx => [
      tx.created_at || '',
      tx.type || '',
      tx.amount || 0,
      tx.reference || '',
    ]),
  ];

  // ⚠️ PENALTIES
  const penaltiesSheetRows = [
    ['Total Penalties', penalties.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)],
    ['Penalty Count', penalties.length],
    [],
    ['History'],
    ['Date', 'Amount', 'Description'],
    ...penalties.map(p => [
      p.penalty_date || p.created_at || '',
      p.amount || 0,
      p.description || '',
    ]),
  ];

  // 🌟 NEW: ALL TRANSACTIONS (THE MAGIC SHEET)
  const allTxRows = [
    ['Category', 'Type', 'Amount', 'Reference', 'Date'],
    ...transactions.map(tx => [
      tx.category || '',
      tx.type || '',
      tx.amount || 0,
      tx.reference || '',
      tx.created_at || '',
    ]),
  ];

  // 📦 APPEND SHEETS
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(basicInfoRows), 'Basic Info');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(loanSheetRows), 'Loans');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(cbuSheetRows), 'CBU');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(savingsSheetRows), 'Savings');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(penaltiesSheetRows), 'Penalties');

  // ⭐ NEW SHEET
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(allTxRows), 'All Transactions');

  const fileName = `member_${safeFileName(fullName(member))}_report.xlsx`;
  XLSX.writeFile(workbook, fileName);
}