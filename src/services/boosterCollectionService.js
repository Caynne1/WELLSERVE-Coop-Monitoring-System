import { supabase } from './supabase';
import { boosterCollections } from '../utils/boosterCollections';

export async function getBoosterCollections(range = {}) {
  const rows = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase.from('transactions')
      .select('id,member_id,category,type,amount,transaction_date,created_at')
      .eq('category', 'savings_booster').eq('type', 'deposit').order('id').range(start, start + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return boosterCollections(rows, range);
}

export async function recordBoosterInitialDeposit({ requestId, memberId, slot, startDate, payment, notes }) {
  const { data, error } = await supabase.rpc('record_booster_initial_deposit', {
    p_request_id: requestId, p_member_id: memberId, p_booster_id: slot?.id || null,
    p_start_date: slot?.start_date || startDate, p_amount: 350,
    p_invoice_no: payment.invoiceNo.trim(), p_invoice_date: payment.invoiceDate,
    p_payment_date: payment.paymentDate, p_payment_mode: payment.mode,
    p_reference: payment.reference.trim(), p_notes: notes || '', p_old_transaction: payment.oldTransaction,
  });
  if (error) throw error;
  return data;
}
