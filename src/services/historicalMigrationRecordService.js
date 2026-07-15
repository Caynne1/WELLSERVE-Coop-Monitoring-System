import { supabase } from './supabase';

function targetIncludes(row, keyword) {
  return String(row?.target_page || '').toLowerCase().includes(keyword.toLowerCase());
}

function isHistoricalCashOutExpense(row) {
  const target = String(row?.target_page || '').toLowerCase();
  return row?.flow_type === 'cash_out' && target.includes('expenses');
}

function historicalBase(row, prefix, status = 'historical') {
  return {
    id: `${prefix}-${row.id}`,
    date: row.transaction_date,
    amount: Number(row.amount || 0),
    notes: [
      'Migrated historical record',
      row.particulars || null,
      row.final_category ? `Category: ${row.final_category}` : null,
      row.source_row ? `Excel row: ${row.source_row}` : null,
    ].filter(Boolean).join(' | '),
    status,
    source: 'imported',
    record_type: 'migrated_historical',
    migration_batch_id: row.batch_id || null,
    migration_row_id: row.id,
    created_at: row.created_at,
  };
}

export async function getImportedHistoricalRows(targetKeyword, { flowType } = {}) {
  try {
    let query = supabase
      .from('financial_migration_rows')
      .select('*')
      .eq('import_status', 'imported')
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (flowType) query = query.eq('flow_type', flowType);

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).filter(row => {
      if (targetIncludes(row, targetKeyword)) return true;
      if (['voucher', 'checkbook'].includes(String(targetKeyword || '').toLowerCase())) {
        return isHistoricalCashOutExpense(row);
      }
      return false;
    });
  } catch (error) {
    console.warn('[historicalMigrationRecordService] Unable to load imported historical rows:', error.message);
    return [];
  }
}

export function mapHistoricalExpense(row) {
  return {
    ...historicalBase(row, 'historical-expense', 'approved'),
    description: row.particulars || row.final_category || 'Migrated historical expense',
    category: row.final_category || 'OTHER WITHDRAWAL/EXPENSES',
    category_other: null,
    payee: row.particulars || 'Migrated Historical Record',
    voucher_id: null,
    voucher_no: row.reference || null,
  };
}

export function mapHistoricalVoucher(row) {
  return {
    ...historicalBase(row, 'historical-voucher', 'approved'),
    voucher_no: row.reference || `MIG-VCH-${row.source_row || row.id.slice(0, 8)}`,
    voucher_kind: 'expense',
    payee: row.particulars || 'Migrated Historical Record',
    purpose: row.particulars || row.final_category || 'Migrated historical voucher',
    expense_id: null,
    reference: row.reference || null,
  };
}

export function mapHistoricalCheck(row) {
  return {
    ...historicalBase(row, 'historical-check', 'released'),
    check_no: row.reference || `MIG-CHK-${row.source_row || row.id.slice(0, 8)}`,
    payee: row.particulars || 'Migrated Historical Record',
    purpose: row.final_category || row.particulars || 'Migrated historical check',
    bank: row.payment_mode || '',
    voucher_id: null,
    vouchers: null,
  };
}
