import { supabase } from './supabase';

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getNotifications(limit = 60) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function getUnreadCount() {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false);

  if (error) throw error;
  return count || 0;
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function createNotification(payload) {
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      title: payload.title,
      message: payload.message,
      type: payload.type || 'info',         // info | warning | error | success
      category: payload.category || 'general', // payment | loan | cash_flow | due_date | missed_payment
      reference_id: payload.reference_id || null,
      reference_type: payload.reference_type || null,
      is_read: false,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function markAsRead(id) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function markAsUnread(id) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: false, read_at: null })
    .eq('id', id);

  if (error) throw error;
}

export async function markAllAsRead() {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('is_read', false);

  if (error) throw error;
}

export async function deleteNotification(id) {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ── Realtime Subscription ─────────────────────────────────────────────────────

export function subscribeToNotifications(onChange) {
  const channel = supabase
    .channel('notifications-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications' },
      onChange
    )
    .subscribe();

  return channel;
}

// ── Daily Alert Generator ─────────────────────────────────────────────────────
// Called once per session to check for due dates and missed payments.

export async function generateDailyAlerts() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  // Check for loans due in the next 7 days
  const in7Days = new Date(today);
  in7Days.setDate(in7Days.getDate() + 7);
  const in7Str = in7Days.toISOString().split('T')[0];

  try {
    // 1. Loans due within 7 days
    const { data: dueSoonLoans } = await supabase
      .from('loans')
      .select('id, loan_no, due_date, balance, members(first_name, last_name)')
      .eq('status', 'active')
      .gte('due_date', todayStr)
      .lte('due_date', in7Str);

    for (const loan of dueSoonLoans || []) {
      const memberName = loan.members
        ? `${loan.members.first_name} ${loan.members.last_name}`
        : 'Unknown Member';
      const dueDate = new Date(loan.due_date).toLocaleDateString('en-PH', {
        month: 'short', day: 'numeric', year: 'numeric'
      });

      // Avoid duplicate daily alerts — check if one already exists today
      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('reference_id', loan.id)
        .eq('category', 'due_date')
        .gte('created_at', todayStr)
        .limit(1);

      if (!existing || existing.length === 0) {
        await createNotification({
          title: 'Loan Due Soon',
          message: `Loan #${loan.loan_no} for ${memberName} is due on ${dueDate}. Balance: ₱${Number(loan.balance || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
          type: 'warning',
          category: 'due_date',
          reference_id: loan.id,
          reference_type: 'loan',
        });
      }
    }

    // 2. Overdue/missed loan payments
    const { data: overdueLoans } = await supabase
      .from('loans')
      .select('id, loan_no, due_date, balance, members(first_name, last_name)')
      .eq('status', 'active')
      .lt('due_date', todayStr);

    for (const loan of overdueLoans || []) {
      const memberName = loan.members
        ? `${loan.members.first_name} ${loan.members.last_name}`
        : 'Unknown Member';
      const dueDate = new Date(loan.due_date).toLocaleDateString('en-PH', {
        month: 'short', day: 'numeric', year: 'numeric'
      });

      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('reference_id', loan.id)
        .eq('category', 'missed_payment')
        .gte('created_at', todayStr)
        .limit(1);

      if (!existing || existing.length === 0) {
        await createNotification({
          title: 'Missed Loan Payment',
          message: `Loan #${loan.loan_no} for ${memberName} was due on ${dueDate} and has not been paid. Balance: ₱${Number(loan.balance || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
          type: 'error',
          category: 'missed_payment',
          reference_id: loan.id,
          reference_type: 'loan',
        });
      }
    }
  } catch (err) {
    console.error('[generateDailyAlerts] error:', err);
  }
}

// ── Transaction Alert Helpers (called from service layer) ────────────────────

export async function notifyPayment(payload) {
  return createNotification({
    title: 'Payment Received',
    message: payload.message,
    type: 'success',
    category: 'payment',
    reference_id: payload.reference_id,
    reference_type: 'transaction',
  });
}

export async function notifyCashIn(payload) {
  return createNotification({
    title: 'Cash In',
    message: payload.message,
    type: 'success',
    category: 'cash_flow',
    reference_id: payload.reference_id,
    reference_type: 'fund_transaction',
  });
}

export async function notifyCashOut(payload) {
  return createNotification({
    title: 'Cash Out',
    message: payload.message,
    type: 'info',
    category: 'cash_flow',
    reference_id: payload.reference_id,
    reference_type: 'fund_transaction',
  });
}
