import { supabase } from './supabase';
import { canAssignLoanProduct, LOAN_PRODUCT_FILTER_OPTIONS } from '../utils/loanProducts';

function readSummary(value) {
  const summary = typeof value === 'string' ? JSON.parse(value) : value ?? {};
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    throw new Error('The loan summary needs review before assigning a product.');
  }
  return summary;
}

function matchSnapshot(query, field, value) {
  return value == null ? query.is(field, null)
    : query.eq(field, typeof value === 'object' ? JSON.stringify(value) : value);
}

export async function assignLoanProduct(loanId, productCode) {
  const product = LOAN_PRODUCT_FILTER_OPTIONS.find(item => item.value === productCode);
  if (!product) throw new Error('Select a valid loan product.');
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user) throw new Error('Please sign in again.');
  const userId = auth.user.id;
  const { data: profile, error: profileError } = await supabase.from('profiles')
    .select('role, status, permissions').eq('id', userId).single();
  if (profileError) throw profileError;
  if (!profile || profile.status === 'inactive' ||
      (profile.role !== 'admin' && !profile.permissions?.loans?.edit)) {
    throw new Error('You do not have permission to set loan products.');
  }

  const { data: loan, error: loanError } = await supabase.from('loans')
    .select('*, product_summary_snapshot:preview_summary_json::text, product_schedule_snapshot:preview_schedule_json::text')
    .eq('id', loanId).single();
  if (loanError) throw loanError;
  if (!loan || !canAssignLoanProduct(loan)) {
    throw new Error('Only released loans with an unspecified product can use this action. Refresh the loan record.');
  }
  const summary = readSummary(loan.preview_summary_json);
  const assignment = { previous_product: summary.loan_product ?? loan.loan_product ?? null,
    product: productCode, user_id: userId, assigned_at: new Date().toISOString() };
  const payload = { preview_summary_json: JSON.stringify({ ...summary,
    loan_product: productCode, loan_product_assignment: assignment }) };

  // Compare the current snapshot so this metadata update cannot overwrite a newer summary.
  let query = supabase.from('loans').update(payload).eq('id', loanId);
  for (const field of ['status', 'balance', 'loan_product', 'preview_summary_json', 'preview_schedule_json']) {
    if (field === 'loan_product' && !Object.hasOwn(loan, field)) continue;
    const snapshot = field === 'preview_summary_json' ? 'product_summary_snapshot'
      : field === 'preview_schedule_json' ? 'product_schedule_snapshot' : field;
    query = matchSnapshot(query, field, loan[snapshot]);
  }
  const { data: updated, error: updateError } = await query.select().maybeSingle();
  if (updateError) throw updateError;
  if (!updated) throw new Error('This loan changed while you were editing. Refresh and try again.');

  let auditRecorded = false;
  try {
    const { error } = await supabase.from('activity_logs').insert({ user_id: userId, module: 'loan', action: 'update',
      record_id: loanId, description: `Set loan product for ${loan.loan_no || loanId}: Unspecified to ${product.label}. Product label only; financial terms unchanged.` });
    auditRecorded = !error;
  } catch { /* The assignment retains its actor and timestamp even if the activity log is unavailable. */ }
  return { loan: updated, auditRecorded };
}
