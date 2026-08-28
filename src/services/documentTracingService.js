import { supabase } from './supabase';
import { trackAuditEvent } from './logService';

function text(value) {
  return String(value || '').trim();
}

function isInvoiceForTracing(invoice) {
  const number = text(invoice.invoice_no);
  return !number || /^FOR[- ]TRACING(?:-|$)/i.test(number);
}

function isVoucherForTracing(voucher) {
  return /^FOR-TRACING-/i.test(text(voucher.voucher_no));
}

function isCheckForTracing(check) {
  return /^CHECK-FOR-TRACING-/i.test(text(check.check_no));
}

function displayName(row) {
  return text(row.payee) || '—';
}

export async function getDocumentsForTracing() {
  const [invoiceResult, voucherResult, checkResult] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, invoice_no, date, payee, amount, status, member_id, payment_mode, created_at')
      .order('date', { ascending: false }),
    supabase
      .from('vouchers')
      .select('id, voucher_no, date, payee, amount, status, expense_id, created_at')
      .order('date', { ascending: false }),
    supabase
      .from('checkbook')
      .select('id, check_no, date, payee, amount, status, voucher_id, created_at')
      .order('date', { ascending: false }),
  ]);

  if (invoiceResult.error) throw invoiceResult.error;
  if (voucherResult.error) throw voucherResult.error;
  if (checkResult.error) throw checkResult.error;

  const invoices = (invoiceResult.data || [])
    .filter(isInvoiceForTracing)
    .map(row => ({
      ...row,
      document_type: 'invoice',
      document_label: 'Invoice',
      number_field: 'invoice_no',
      current_number: row.invoice_no,
      party: displayName(row),
    }));

  const vouchers = (voucherResult.data || [])
    .filter(isVoucherForTracing)
    .map(row => ({
      ...row,
      document_type: 'voucher',
      document_label: 'Voucher',
      number_field: 'voucher_no',
      current_number: row.voucher_no,
      party: displayName(row),
    }));

  const checks = (checkResult.data || [])
    .filter(isCheckForTracing)
    .map(row => ({
      ...row,
      document_type: 'checkbook',
      document_label: 'Check',
      number_field: 'check_no',
      current_number: row.check_no,
      party: displayName(row),
    }));

  return [...invoices, ...vouchers, ...checks]
    .sort((a, b) => new Date(b.date || b.created_at || 0) - new Date(a.date || a.created_at || 0));
}

const DOCUMENT_CONFIG = {
  invoice: { table: 'invoices', field: 'invoice_no', label: 'SI No.', module: 'invoice' },
  voucher: { table: 'vouchers', field: 'voucher_no', label: 'Voucher No.', module: 'voucher' },
  checkbook: { table: 'checkbook', field: 'check_no', label: 'Check No.', module: 'checkbook' },
};

export async function traceDocumentNumber(document, newNumber, userId) {
  const config = DOCUMENT_CONFIG[document?.document_type];
  if (!config) throw new Error('Unsupported document type.');

  const nextNumber = text(newNumber);
  if (!nextNumber) throw new Error(`${config.label} is required.`);
  if (/FOR[- ]TRACING/i.test(nextNumber)) {
    throw new Error(`Enter the actual ${config.label}, not "For Tracing".`);
  }

  const { data: duplicate, error: duplicateError } = await supabase
    .from(config.table)
    .select('id')
    .eq(config.field, nextNumber)
    .neq('id', document.id)
    .limit(1);

  if (duplicateError) throw duplicateError;
  if (duplicate?.length) throw new Error(`${config.label} "${nextNumber}" is already in use.`);

  const previousNumber = text(document.current_number) || 'For Tracing';
  const { data: updated, error } = await supabase
    .from(config.table)
    .update({ [config.field]: nextNumber })
    .eq('id', document.id)
    .select()
    .single();

  if (error) throw error;

  // Expenses mirror their linked voucher number for display. This is a
  // reference-only update and does not create or modify any cash movement.
  if (document.document_type === 'voucher' && document.expense_id) {
    const { error: expenseError } = await supabase
      .from('expenses')
      .update({ voucher_no: nextNumber })
      .eq('id', document.expense_id);
    if (expenseError) {
      await supabase
        .from(config.table)
        .update({ [config.field]: document.current_number })
        .eq('id', document.id);
      throw expenseError;
    }
  }

  await trackAuditEvent({
    userId,
    entityType: config.module,
    entityId: document.id,
    action: 'trace',
    oldValues: { [config.field]: previousNumber },
    newValues: { [config.field]: nextNumber },
    description: `${config.label} traced and updated for ${document.party || 'record'}`,
  });

  return updated;
}
