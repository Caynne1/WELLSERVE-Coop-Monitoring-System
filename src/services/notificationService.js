import { supabase } from './supabase';
import { buildLoanCollectionRows } from '../utils/loanCollections';
import { getLoanBalanceWithInterest } from '../utils/loanListState';

const money = value => Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function displayDate(value) {
  if (!value) return '';
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

async function hasLoanAlert(referenceId, category, dueDate) {
  const { data, error } = await supabase
    .from('notifications')
    .select('id')
    .eq('reference_id', referenceId)
    .eq('category', category)
    .ilike('message', `%${displayDate(dueDate)}%`)
    .limit(1);
  if (error) throw error;
  return (data || []).length > 0;
}

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
  const todayStr = localDateKey(today);

  try {
    const { data: loans, error } = await supabase
      .from('loans')
      .select('id, loan_no, member_id, amount, balance, status, due_date, preview_schedule_json, preview_summary_json, members(first_name, last_name, member_no)')
      .in('status', ['released', 'active', 'ongoing', 'partial', 'overdue', 'delinquent', 'defaulted']);
    if (error) throw error;

    for (const loan of loans || []) {
      const nextDue = buildLoanCollectionRows([loan], today)[0];
      if (!nextDue) continue;
      const memberName = loan.members
        ? `${loan.members.first_name} ${loan.members.last_name}`
        : 'Unknown Member';
      const memberRef = loan.members?.member_no ? ` (${loan.members.member_no})` : '';
      const loanRef = loan.loan_no ? `Loan #${loan.loan_no}` : 'Loan';
      const dueDate = displayDate(nextDue.dueDate);
      const outstanding = getLoanBalanceWithInterest(loan);

      const dueCategory = nextDue.daysUntilDue === 0 ? 'due_today' : 'due_date';
      if (nextDue.daysUntilDue <= 7 && nextDue.dueDate >= todayStr
        && !(await hasLoanAlert(loan.id, dueCategory, nextDue.dueDate))) {
        await createNotification({
          title: nextDue.daysUntilDue === 0 ? 'Loan Due Today' : 'Loan Due Soon',
          message: `${loanRef} for ${memberName}${memberRef}. Due date: ${dueDate}. Payment ${nextDue.period}: ₱${money(nextDue.remainingDue)}. Total outstanding: ₱${money(outstanding)}.`,
          type: nextDue.daysUntilDue === 0 ? 'error' : 'warning',
          category: dueCategory,
          reference_id: loan.id,
          reference_type: 'loan',
        });
      }

      if (nextDue.dueDate < todayStr
        && !(await hasLoanAlert(loan.id, 'missed_payment', nextDue.dueDate))) {
        await createNotification({
          title: 'Missed Loan Payment',
          message: `${loanRef} for ${memberName}${memberRef}. Due date: ${dueDate}. Payment ${nextDue.period} remaining: ₱${money(nextDue.remainingDue)}. ${nextDue.daysOverdue} day${nextDue.daysOverdue === 1 ? '' : 's'} overdue. Total outstanding: ₱${money(outstanding)}.`,
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

// ── Birthday Alert Generator ──────────────────────────────────────────────────
// Checks members with a birthday today and creates a single alert per member.

export async function generateBirthdayAlerts() {
  const today = new Date();
  const todayStr = localDateKey(today);
  const todayMonth = today.getMonth() + 1;
  const todayDay   = today.getDate();

  try {
    const { data: members } = await supabase
      .from('members')
      .select('id, first_name, last_name, date_of_birth')
      .not('date_of_birth', 'is', null);

    for (const member of members || []) {
      if (!member.date_of_birth) continue;

      const dob = new Date(member.date_of_birth);
      if (dob.getMonth() + 1 !== todayMonth || dob.getDate() !== todayDay) continue;

      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('reference_id', member.id)
        .eq('category', 'birthday')
        .gte('created_at', todayStr)
        .limit(1);

      if (!existing || existing.length === 0) {
        const age = today.getFullYear() - dob.getFullYear();
        const suffix = age === 1 ? 'st' : age === 2 ? 'nd' : age === 3 ? 'rd' : 'th';
        await createNotification({
          title: 'Member Birthday',
          message: `${member.first_name} ${member.last_name} celebrates their ${age}${suffix} birthday today!`,
          type: 'info',
          category: 'birthday',
          reference_id: member.id,
          reference_type: 'member',
        });
      }
    }
  } catch (err) {
    console.error('[generateBirthdayAlerts] error:', err);
  }
}

// ── Overdue Escalation ────────────────────────────────────────────────────────
// Creates escalation alerts for loans that are 30, 60, and 90+ days overdue.

export async function generateOverdueEscalationAlerts() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const THRESHOLDS = [
    { days: 30,  label: '30-day',   type: 'warning' },
    { days: 60,  label: '60-day',   type: 'error' },
    { days: 90,  label: '90+ day',  type: 'error' },
  ];

  try {
    const { data: overdueLoans } = await supabase
      .from('loans')
      .select('id, loan_no, member_id, amount, due_date, balance, status, preview_schedule_json, preview_summary_json, members(first_name, last_name, member_no)')
      .in('status', ['released', 'active', 'ongoing', 'partial', 'overdue', 'delinquent', 'defaulted']);

    for (const loan of overdueLoans || []) {
      const nextDue = buildLoanCollectionRows([loan], today)[0];
      if (!nextDue || nextDue.daysOverdue <= 0) continue;
      const daysOverdue = nextDue.daysOverdue;

      const memberName = loan.members
        ? `${loan.members.first_name} ${loan.members.last_name}`
        : 'Unknown Member';
      const memberRef = loan.members?.member_no ? ` (${loan.members.member_no})` : '';
      const loanRef = loan.loan_no ? `Loan #${loan.loan_no}` : 'Loan';
      const dueDate = displayDate(nextDue.dueDate);
      const outstanding = getLoanBalanceWithInterest(loan);

      for (const threshold of THRESHOLDS) {
        if (daysOverdue < threshold.days) continue;

        const category = `overdue_${threshold.days}`;
        if (!(await hasLoanAlert(loan.id, category, nextDue.dueDate))) {
          await createNotification({
            title: `Loan ${threshold.label} Overdue`,
            message: `${loanRef} for ${memberName}${memberRef}. Due date: ${dueDate}. Payment ${nextDue.period} remaining: ₱${money(nextDue.remainingDue)}. ${daysOverdue} days overdue. Total outstanding: ₱${money(outstanding)}.`,
            type: threshold.type,
            category,
            reference_id: loan.id,
            reference_type: 'loan',
          });
        }
      }
    }
  } catch (err) {
    console.error('[generateOverdueEscalationAlerts] error:', err);
  }
}

// ── Master Daily Alert Runner ─────────────────────────────────────────────────
// Call this once per session (from NotificationContext or App.jsx).

export async function generateAllDailyAlerts() {
  await Promise.allSettled([
    generateDailyAlerts(),
    generateBirthdayAlerts(),
    generateOverdueEscalationAlerts(),
  ]);
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
