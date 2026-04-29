import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────────────────────
// CRUD — Time Deposits
// ─────────────────────────────────────────────────────────────────────────────

export async function getAllTimeDeposits() {
  const { data, error } = await supabase
    .from('time_deposits')
    .select('*, time_deposit_payments(id, si_number, amount, payment_date)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getTimeDepositById(id) {
  const { data, error } = await supabase
    .from('time_deposits')
    .select('*, time_deposit_payments(id, si_number, amount, payment_date)')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function createTimeDeposit(payload) {
  const {
    name, age, birth_date, address, spouse_name, spouse_age,
    spouse_birth_date, children_count, beneficiary_name, employer,
    business, business_years, terms, amount, interest_rate,
    date_applied, termination_date, member_id,
  } = payload;

  if (!name?.trim())          throw new Error('Name is required.');
  if (!terms || terms <= 0)   throw new Error('Terms must be a positive number.');
  if (!amount || amount <= 0) throw new Error('Amount must be greater than zero.');
  if (interest_rate == null || interest_rate < 0)
                              throw new Error('Interest rate must be zero or greater.');
  if (!date_applied)          throw new Error('Date Applied is required.');

  const { data, error } = await supabase
    .from('time_deposits')
    .insert([{
      name:              name.trim(),
      age:               age              ? parseInt(age, 10)              : null,
      birth_date:        birth_date       || null,
      address:           address?.trim()  || null,
      spouse_name:       spouse_name?.trim()  || null,
      spouse_age:        spouse_age       ? parseInt(spouse_age, 10)       : null,
      spouse_birth_date: spouse_birth_date || null,
      children_count:    children_count != null ? parseInt(children_count, 10) : 0,
      beneficiary_name:  beneficiary_name?.trim() || null,
      employer:          employer?.trim() || null,
      business:          business?.trim() || null,
      business_years:    business_years   ? parseInt(business_years, 10)  : null,
      terms:             parseInt(terms, 10),
      amount:            parseFloat(amount),
      interest_rate:     parseFloat(interest_rate),
      date_applied,
      termination_date:  termination_date || null,
      status:            'Active',
      member_id:         member_id || null,
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateTimeDeposit(id, payload) {
  const {
    name, age, birth_date, address, spouse_name, spouse_age,
    spouse_birth_date, children_count, beneficiary_name, employer,
    business, business_years, terms, amount, interest_rate,
    date_applied, termination_date, status,
  } = payload;

  if (!name?.trim())          throw new Error('Name is required.');
  if (!terms || terms <= 0)   throw new Error('Terms must be a positive number.');
  if (!amount || amount <= 0) throw new Error('Amount must be greater than zero.');

  const { data, error } = await supabase
    .from('time_deposits')
    .update({
      name:              name.trim(),
      age:               age              ? parseInt(age, 10)              : null,
      birth_date:        birth_date       || null,
      address:           address?.trim()  || null,
      spouse_name:       spouse_name?.trim()  || null,
      spouse_age:        spouse_age       ? parseInt(spouse_age, 10)       : null,
      spouse_birth_date: spouse_birth_date || null,
      children_count:    children_count != null ? parseInt(children_count, 10) : 0,
      beneficiary_name:  beneficiary_name?.trim() || null,
      employer:          employer?.trim() || null,
      business:          business?.trim() || null,
      business_years:    business_years   ? parseInt(business_years, 10)  : null,
      terms:             parseInt(terms, 10),
      amount:            parseFloat(amount),
      interest_rate:     parseFloat(interest_rate),
      date_applied,
      termination_date:  termination_date || null,
      status:            status || 'Active',
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTimeDeposit(id) {
  const { error } = await supabase
    .from('time_deposits')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payments
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record a payment row for a time deposit.
 * Invoice and transaction creation are handled by the caller (page)
 * so errors are surfaced to the user rather than swallowed.
 */
export async function recordTimeDepositPayment({
  time_deposit_id,
  amount,
  payment_date,
  si_number,
  created_by = null,
}) {
  const value = parseFloat(amount) || 0;

  if (!time_deposit_id)   throw new Error('Time Deposit reference is required.');
  if (value <= 0)         throw new Error('Amount must be greater than zero.');
  if (!payment_date)      throw new Error('Payment date is required.');
  if (!si_number?.trim()) throw new Error('SI# is required.');

  const trimmedSI = si_number.trim();

  const { data: td, error: tdErr } = await supabase
    .from('time_deposits')
    .select('name')
    .eq('id', time_deposit_id)
    .single();

  if (tdErr) throw tdErr;

  const { data: payment, error: payErr } = await supabase
    .from('time_deposit_payments')
    .insert([{ time_deposit_id, si_number: trimmedSI, amount: value, payment_date }])
    .select()
    .single();

  if (payErr) throw payErr;

  return { ...payment, si_number: trimmedSI, memberName: td?.name || '' };
}

export async function getPaymentsByTimeDepositId(time_deposit_id) {
  const { data, error } = await supabase
    .from('time_deposit_payments')
    .select('*')
    .eq('time_deposit_id', time_deposit_id)
    .order('payment_date', { ascending: false });

  if (error) throw error;
  return data || [];
}

// Fetch time deposits linked to a member via member_id column
// Falls back to matching by member name if member_id is not stored
export async function getTimeDepositsByMemberId(memberId) {
  const { data, error } = await supabase
    .from('time_deposits')
    .select('*, time_deposit_payments(id, si_number, amount, payment_date)')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });

  if (error) {
    // If member_id column doesn't exist yet, return empty array gracefully
    console.warn('[timeDepositService] getTimeDepositsByMemberId error:', error.message);
    return [];
  }
  return data || [];
}
