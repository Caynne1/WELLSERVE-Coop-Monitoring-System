import * as XLSX from 'xlsx';
import { supabase } from './supabase';

const BDO_SHEET_NAME = 'BDO ACCOUNT MONITORING';

export const FINANCIAL_MIGRATION_CATEGORIES = [
  'LOAN RELEASES',
  'LOAN PAYMENT',
  'LOAN ONLY / INTEREST',
  'INTEREST',
  'SERVICE FEE',
  'PENALTY',
  'MEMBERSHIP',
  'FOR CBU',
  'FOR SAVINGS',
  'TIME DEPOSIT',
  'COMMISSION FROM WELLIFE',
  'ADMIN & REGULATORY FEES',
  'BANK CHARGES / ADJUSTMENTS',
  'PAYROLL',
  'PETTYCASH - OFFICE USE',
  'GLOBE',
  'LEYECO / UTILITIES',
  'OFFICE RENTAL',
  'OPERATING EXPENSES',
  'CBU AND SAVINGS WITHDRAWAL & TIME DEPOSIT WITHDRAWAL',
  'BREAKDOWN OF BANK TRANSFERS',
  'BANK DEPOSIT / BANK TRANSFER',
  'OTHER WITHDRAWAL/EXPENSES',
  'OTHER DEPOSIT',
  'NEEDS MANUAL REVIEW',
];

function clean(value) {
  return String(value ?? '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
}

function money(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = parseFloat(String(value).replace(/[\u20b1,\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCategory(value = '') {
  return clean(value).toUpperCase();
}

function buildTransactionMapping(row) {
  const category = normalizeCategory(row.final_category || row.category);

  if (row.type === 'cash_out') {
    if (category.includes('LOAN RELEASE')) {
      return { category: 'loan_release', type: 'loan_release' };
    }
    if (category.includes('CBU')) {
      return { category: 'cbu', type: 'cbu_withdrawal' };
    }
    if (category.includes('SAVINGS')) {
      return { category: 'savings', type: 'savings_withdrawal' };
    }
    if (category.includes('PETTY')) {
      return { category: 'petty_cash', type: 'withdrawal' };
    }
    return { category: 'others', type: 'withdrawal' };
  }

  if (category.includes('LOAN ONLY') || category.includes('LOAN PAYMENT')) {
    return { category: 'loan', type: 'loan_payment' };
  }
  if (category === 'INTEREST' || category.includes('INTEREST')) {
    return { category: 'loan', type: 'loan_interest' };
  }
  if (category.includes('SERVICE FEE')) {
    return { category: 'service_fee', type: 'loan_deduction' };
  }
  if (category.includes('PENALTY')) {
    return { category: 'penalty', type: 'penalty_payment' };
  }
  if (category.includes('MEMBERSHIP')) {
    return { category: 'membership', type: 'membership_payment' };
  }
  if (category.includes('CBU')) {
    return { category: 'cbu', type: 'deposit' };
  }
  if (category.includes('SAVINGS')) {
    return { category: 'savings', type: 'deposit' };
  }
  if (category.includes('TIME DEPOSIT')) {
    return { category: 'time_deposit', type: 'deposit' };
  }
  if (category.includes('ANNUAL')) {
    return { category: 'annual_dues', type: 'other_payment' };
  }
  if (category.includes('PETTY')) {
    return { category: 'petty_cash', type: 'other_payment' };
  }

  return { category: 'others', type: 'other_payment' };
}

function buildMigrationReference(analysis, row) {
  return [
    'FINANCIAL-MIGRATION',
    analysis?.sourceFile || 'Excel',
    `Row ${row.source_row}`,
    row.reference || '',
  ].filter(Boolean).join(' | ');
}

function dateValue(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof value === 'number' && value > 20000) {
    const parsedExcelDate = XLSX.SSF.parse_date_code(value);
    if (parsedExcelDate?.y && parsedExcelDate?.m && parsedExcelDate?.d) {
      const y = parsedExcelDate.y;
      const m = String(parsedExcelDate.m).padStart(2, '0');
      const d = String(parsedExcelDate.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function readWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => {
      try {
        resolve(XLSX.read(event.target.result, { type: 'array', cellDates: true, raw: true }));
      } catch (error) {
        reject(new Error(`Failed to read Excel file: ${error.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read Excel file.'));
    reader.readAsArrayBuffer(file);
  });
}

function findBdoSheet(workbook) {
  return workbook.SheetNames.find(name => clean(name).toUpperCase() === BDO_SHEET_NAME);
}

function sheetRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
}

function includesAny(text, words) {
  const lower = clean(text).toLowerCase();
  return words.some(word => lower.includes(word));
}

export function getFinancialMigrationTargetPage(category, type) {
  if (category.includes('LOAN RELEASE')) return 'Expenses / Voucher / Checkbook / Fund Monitoring';
  if (category.includes('LOAN PAYMENT') || category.includes('LOAN ONLY') || category === 'INTEREST') return 'Loan Payments / Fund Monitoring';
  if (category.includes('MEMBERSHIP')) return 'Membership / Fund Monitoring';
  if (category.includes('CBU')) return 'CBU / Fund Monitoring';
  if (category.includes('SAVINGS')) return 'Savings / Fund Monitoring';
  if (category.includes('TIME DEPOSIT')) return 'Time Deposit / Fund Monitoring';
  if (category.includes('BANK')) return 'Fund Monitoring';
  if (category.includes('PAYROLL') || category.includes('EXPENSE') || category.includes('PETTYCASH') || category.includes('GLOBE') || category.includes('LEYECO') || category.includes('OFFICE RENTAL') || category.includes('ADMIN')) {
    return 'Expenses / Fund Monitoring';
  }
  if (type === 'cash_in') return 'Fund Monitoring';
  return 'Expenses / Fund Monitoring';
}

function withMigrationRouting(row) {
  const finalCategory = row.category || 'NEEDS MANUAL REVIEW';
  return {
    ...row,
    final_category: finalCategory,
    target_page: getFinancialMigrationTargetPage(finalCategory, row.type),
    record_type: 'Migrated Historical Record',
    import_status: row.confidence === 'low' || row.accounting_class === 'Needs Review' ? 'Needs Review' : 'Ready for Review',
  };
}

function buildBreakdown(row) {
  const breakdown = [
    { label: 'FOR CBU', amount: money(row[14]) },
    { label: 'FOR SAVINGS', amount: money(row[15]) },
    { label: 'FOR 300 MEMBERSHIP', amount: money(row[16]) },
    { label: 'FOR MEMBERSHIP 1500', amount: money(row[17]) },
    { label: 'PENALTY', amount: money(row[18]) },
    { label: 'LOAN ONLY', amount: money(row[19]) },
    { label: 'INTEREST', amount: money(row[20]) },
    { label: 'TIME DEPOSIT', amount: money(row[21]) },
    { label: 'others', amount: money(row[22]) },
  ].filter(item => item.amount > 0);

  return {
    items: breakdown,
    labels: breakdown.map(item => item.label),
    text: breakdown.map(item => item.label).join(' / '),
  };
}

function classifyFromBreakdown(breakdown) {
  const labels = breakdown.labels;
  if (!labels.length) return null;

  const hasLoan = labels.includes('LOAN ONLY');
  const hasInterest = labels.includes('INTEREST');
  const hasCbu = labels.includes('FOR CBU');
  const hasSavings = labels.includes('FOR SAVINGS');
  const hasMembership = labels.includes('FOR 300 MEMBERSHIP') || labels.includes('FOR MEMBERSHIP 1500');
  const hasPenalty = labels.includes('PENALTY');
  const hasTimeDeposit = labels.includes('TIME DEPOSIT');
  const hasOthers = labels.includes('others');

  if (hasLoan && hasInterest && labels.length === 2) {
    return { category: 'LOAN ONLY / INTEREST', accounting_class: 'Loan Principal / Interest Needs Review', confidence: 'medium' };
  }
  if (hasLoan) {
    return { category: breakdown.text, accounting_class: 'Loan Principal / Interest Needs Review', confidence: 'medium' };
  }
  if (hasMembership) {
    return { category: breakdown.text, accounting_class: 'Income', confidence: hasCbu || hasSavings ? 'medium' : 'high' };
  }
  if (hasPenalty) {
    return { category: breakdown.text, accounting_class: 'Income', confidence: labels.length === 1 ? 'high' : 'medium' };
  }
  if (hasCbu || hasSavings || hasTimeDeposit) {
    return { category: breakdown.text, accounting_class: 'Member Deposit / Liability Movement', confidence: 'medium' };
  }
  if (hasInterest) {
    return { category: breakdown.text, accounting_class: 'Income', confidence: labels.length === 1 ? 'high' : 'medium' };
  }
  if (hasOthers) {
    return { category: breakdown.text, accounting_class: 'Needs Review', confidence: 'low' };
  }

  return null;
}

function classifyTransaction(type, description, paymentMode = '', breakdown = null) {
  const text = clean(`${description} ${paymentMode}`).toLowerCase();

  if (type === 'cash_out') {
    if (includesAny(text, ['loan release', 'loan released', 'loan releas', ' loan'])) {
      return { category: 'LOAN RELEASES', accounting_class: 'Loan Principal / Asset Movement', confidence: 'high' };
    }
    if (includesAny(text, ['payroll', 'salary', '13th month', 'cash advance', 'cash avance'])) {
      return { category: 'PAYROLL', accounting_class: 'Expense', confidence: 'high' };
    }
    if (includesAny(text, ['pettycash', 'petty cash'])) {
      return { category: 'PETTYCASH - OFFICE USE', accounting_class: 'Expense', confidence: 'high' };
    }
    if (includesAny(text, ['globe', 'telecom', 'phone'])) {
      return { category: 'GLOBE', accounting_class: 'Expense', confidence: 'high' };
    }
    if (includesAny(text, ['leyeco', 'electric', 'water', 'utilities'])) {
      return { category: 'LEYECO / UTILITIES', accounting_class: 'Expense', confidence: 'high' };
    }
    if (includesAny(text, ['rent', 'rental'])) {
      return { category: 'OFFICE RENTAL', accounting_class: 'Expense', confidence: 'high' };
    }
    if (includesAny(text, ['cbu', 'savings', 'withdrawal', 'dismembership', 'time deposit'])) {
      return { category: 'CBU AND SAVINGS WITHDRAWAL & TIME DEPOSIT WITHDRAWAL', accounting_class: 'Member Deposit / Liability Movement', confidence: 'medium' };
    }
    if (includesAny(text, ['bank transfer', 'transfer'])) {
      return { category: 'BREAKDOWN OF BANK TRANSFERS', accounting_class: 'Transfer', confidence: 'medium' };
    }
    return { category: 'OTHER WITHDRAWAL/EXPENSES', accounting_class: 'Needs Review', confidence: 'low' };
  }

  const breakdownClassification = classifyFromBreakdown(breakdown || { labels: [], text: '' });
  if (breakdownClassification) return breakdownClassification;

  if (includesAny(text, ['loan payment', 'loan + interest', 'loan only', 'loan and interest', 'loan & interest', 'loan/cbu', 'loan & cbu', ' loan'])) {
    return { category: 'LOAN PAYMENT', accounting_class: 'Loan Principal / Interest Needs Review', confidence: 'medium' };
  }
  if (includesAny(text, ['interest'])) {
    return { category: 'INTEREST', accounting_class: 'Income', confidence: 'medium' };
  }
  if (includesAny(text, ['service fee'])) {
    return { category: 'SERVICE FEE', accounting_class: 'Income', confidence: 'high' };
  }
  if (includesAny(text, ['penalty'])) {
    return { category: 'PENALTY', accounting_class: 'Income', confidence: 'high' };
  }
  if (includesAny(text, ['membership', 'regulatory'])) {
    return { category: 'MEMBERSHIP', accounting_class: 'Income', confidence: 'high' };
  }
  if (includesAny(text, ['cbu'])) {
    return { category: 'CBU', accounting_class: 'Member Deposit / Liability Movement', confidence: 'medium' };
  }
  if (includesAny(text, ['savings'])) {
    return { category: 'SAVINGS', accounting_class: 'Member Deposit / Liability Movement', confidence: 'medium' };
  }
  if (includesAny(text, ['wellife', 'commission'])) {
    return { category: 'COMMISSION FROM WELLIFE', accounting_class: 'Income', confidence: 'high' };
  }
  if (includesAny(text, ['time deposit'])) {
    return { category: 'TIME DEPOSIT', accounting_class: 'Member Deposit / Liability Movement', confidence: 'medium' };
  }
  if (includesAny(text, ['bank transfer', 'transfer', 'bank deposit', 'deposit by treasurer', 'gcash'])) {
    return { category: 'BANK DEPOSIT / BANK TRANSFER', accounting_class: 'Cash Movement', confidence: 'medium' };
  }

  return { category: 'OTHER DEPOSIT', accounting_class: 'Needs Review', confidence: 'low' };
}

function makeWarning(row, message) {
  return {
    row: row.source_row,
    type: row.type,
    amount: row.amount,
    message,
  };
}

function parseBdoRows(rows) {
  const parsed = [];
  const warnings = [];
  let skippedRows = 0;

  rows.forEach((row, index) => {
    const sourceRow = index + 1;

    const outDate = dateValue(row[1]);
    const outAmount = money(row[5]);
    if (outDate && outAmount > 0) {
      const description = clean(row[2]);
      const checkNo = clean(row[3]);
      const voucherNo = clean(row[4]);
      const classified = classifyTransaction('cash_out', description);
      const tx = {
        id: `out-${sourceRow}`,
        source_row: sourceRow,
        date: outDate,
        type: 'cash_out',
        amount: outAmount,
        description,
        reference: [checkNo && `Check ${checkNo}`, voucherNo && `Voucher ${voucherNo}`].filter(Boolean).join(' | '),
        payment_mode: checkNo ? 'Check' : '',
        balance: money(row[12]),
        total_deposited: money(row[23]),
        ...classified,
      };
      parsed.push(withMigrationRouting(tx));
      if (classified.confidence === 'low') warnings.push(makeWarning(tx, 'Needs manual category review.'));
      return;
    }

    const inDate = dateValue(row[8]);
    const inAmount = money(row[9]);
    if (inDate && inAmount > 0) {
      const description = clean(row[10]);
      const paymentMode = clean(row[11]);
      const breakdown = buildBreakdown(row);
      const classified = classifyTransaction('cash_in', description, paymentMode, breakdown);
      const tx = {
        id: `in-${sourceRow}`,
        source_row: sourceRow,
        date: inDate,
        type: 'cash_in',
        amount: inAmount,
        description,
        reference: clean(row[11]),
        payment_mode: paymentMode,
        balance: money(row[12]),
        total_deposited: money(row[23]),
        breakdown: breakdown.items,
        ...classified,
      };
      parsed.push(withMigrationRouting(tx));
      if (classified.confidence === 'low') warnings.push(makeWarning(tx, 'Needs manual category review.'));
      return;
    }

    if (row.some(cell => clean(cell))) skippedRows += 1;
  });

  return { rows: parsed, warnings, skippedRows };
}

function summarize(rows, warnings, skippedRows, sourceFile, sheetName) {
  const cashIn = rows.filter(row => row.type === 'cash_in').reduce((sum, row) => sum + row.amount, 0);
  const cashOut = rows.filter(row => row.type === 'cash_out').reduce((sum, row) => sum + row.amount, 0);
  const trueIncome = rows
    .filter(row => row.accounting_class === 'Income')
    .reduce((sum, row) => sum + row.amount, 0);
  const trueExpenses = rows
    .filter(row => row.accounting_class === 'Expense')
    .reduce((sum, row) => sum + row.amount, 0);
  const needsReview = rows.filter(row => row.confidence === 'low' || row.accounting_class === 'Needs Review').length;

  return {
    sourceFile,
    sheetName,
    totalRows: rows.length,
    cashIn,
    cashOut,
    netCashFlow: cashIn - cashOut,
    trueIncome,
    trueExpenses,
    profitLoss: trueIncome - trueExpenses,
    warnings: warnings.length,
    needsReview,
    skippedRows,
  };
}

export async function analyzeFinancialMonitoringWorkbook(file) {
  const workbook = await readWorkbook(file);
  const sheetName = findBdoSheet(workbook);
  if (!sheetName) {
    throw new Error('BDO ACCOUNT MONITORING sheet was not found in this workbook.');
  }

  const rawRows = sheetRows(workbook, sheetName);
  const parsed = parseBdoRows(rawRows);

  return {
    sourceFile: file.name,
    sheetName,
    workbookSheets: workbook.SheetNames,
    rows: parsed.rows,
    warnings: parsed.warnings,
    summary: summarize(parsed.rows, parsed.warnings, parsed.skippedRows, file.name, sheetName),
  };
}

export async function confirmFinancialMonitoringMigration({ analysis, rows, createdBy = null }) {
  if (!analysis?.summary) {
    throw new Error('Financial migration analysis is required before import.');
  }

  const reviewedRows = rows || [];
  if (!reviewedRows.length) {
    throw new Error('No financial migration rows found for import.');
  }

  const needsReview = reviewedRows.filter(row => row.import_status === 'Needs Review' || row.final_category === 'NEEDS MANUAL REVIEW');
  if (needsReview.length > 0) {
    throw new Error(`${needsReview.length} row(s) still need review before import.`);
  }

  const { data: existingBatch, error: existingError } = await supabase
    .from('financial_migration_batches')
    .select('id, imported_at')
    .eq('source_file', analysis.sourceFile || 'ACCOUNT MONITORING Excel file')
    .eq('source_sheet', analysis.sheetName || 'BDO ACCOUNT MONITORING')
    .eq('status', 'imported')
    .maybeSingle();

  if (existingError) throw existingError;
  if (existingBatch) {
    throw new Error('This Excel file and sheet were already imported. Import was stopped to avoid duplicate historical records.');
  }

  const { data: batch, error: batchError } = await supabase
    .from('financial_migration_batches')
    .insert({
      source_file: analysis.sourceFile || 'ACCOUNT MONITORING Excel file',
      source_sheet: analysis.sheetName || 'BDO ACCOUNT MONITORING',
      status: 'imported',
      total_rows: reviewedRows.length,
      imported_rows: 0,
      needs_review_rows: 0,
      cash_in: analysis.summary.cashIn || 0,
      cash_out: analysis.summary.cashOut || 0,
      notes: 'Imported from Financial Migration Import. Historical ledger records only.',
      created_by: createdBy,
      imported_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (batchError) throw batchError;

  let importedRows = 0;

  for (const row of reviewedRows) {
    const migrationPayload = {
      batch_id: batch.id,
      source_row: row.source_row,
      transaction_date: row.date,
      flow_type: row.type,
      amount: row.amount,
      particulars: row.description || null,
      reference: row.reference || null,
      payment_mode: row.payment_mode || null,
      balance: row.balance || null,
      total_deposited: row.total_deposited || null,
      suggested_category: row.category || null,
      final_category: row.final_category,
      target_page: row.target_page || null,
      record_type: 'migrated_historical',
      import_status: 'ready',
      raw_data: {
        accounting_class: row.accounting_class || null,
        breakdown: row.breakdown || [],
        source_file: analysis.sourceFile || null,
        source_sheet: analysis.sheetName || null,
      },
    };

    const { data: migrationRow, error: rowError } = await supabase
      .from('financial_migration_rows')
      .insert(migrationPayload)
      .select()
      .single();

    if (rowError) throw rowError;

    const mapped = buildTransactionMapping(row);
    const reference = buildMigrationReference(analysis, row);
    const notes = [
      'Migrated Historical Record',
      row.description || '',
      row.final_category ? `Final Category: ${row.final_category}` : '',
    ].filter(Boolean).join(' | ');

    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        category: mapped.category,
        type: mapped.type,
        amount: row.amount,
        reference,
        notes,
        transaction_date: row.date,
        payment_mode: row.payment_mode || null,
        created_by: createdBy,
        source: 'imported',
        record_type: 'migrated_historical',
        migration_batch_id: batch.id,
        migration_row_id: migrationRow.id,
      })
      .select()
      .single();

    if (txError) {
      await supabase
        .from('financial_migration_rows')
        .update({ import_status: 'failed', error_message: txError.message })
        .eq('id', migrationRow.id);
      throw txError;
    }

    const { error: fundError } = await supabase
      .from('fund_transactions')
      .insert({
        flow_type: row.type,
        category: row.final_category,
        amount: row.amount,
        description: row.description || row.final_category,
        ref_id: transaction.id,
        source: 'imported',
        record_type: 'migrated_historical',
        migration_batch_id: batch.id,
        migration_row_id: migrationRow.id,
        transaction_date: row.date,
        reference,
        created_by: createdBy,
      });

    if (fundError) {
      await supabase
        .from('financial_migration_rows')
        .update({ import_status: 'failed', error_message: fundError.message })
        .eq('id', migrationRow.id);
      throw fundError;
    }

    await supabase
      .from('financial_migration_rows')
      .update({
        import_status: 'imported',
        imported_table: 'transactions',
        imported_record_id: transaction.id,
      })
      .eq('id', migrationRow.id);

    importedRows += 1;
  }

  const { error: updateError } = await supabase
    .from('financial_migration_batches')
    .update({ imported_rows: importedRows, status: 'imported', imported_at: new Date().toISOString() })
    .eq('id', batch.id);

  if (updateError) throw updateError;

  return { batchId: batch.id, importedRows };
}
