import { supabase } from './supabase';

const PAGE_SIZE = 1000;

const OLD_BREAKDOWNS = {
  associate: { entry: 300, cbu: 1000, savings: 500, vip_card: 0, total: 1800 },
  regular: { entry: 1800, cbu: 4000, savings: 1000, vip_card: 0, total: 6800 },
};

const NEW_BREAKDOWNS = {
  associate: { entry: 100, admin_fees: 0, cbu: 500, savings: 0, vip_card: 300, total: 900 },
  regular: { entry: 100, admin_fees: 1000, cbu: 4000, savings: 500, vip_card: 300, total: 5900 },
};

async function fetchAll(table, select, order = null) {
  const rows = [];
  let from = 0;

  while (true) {
    let query = supabase.from(table).select(select).range(from, from + PAGE_SIZE - 1);
    if (order) query = query.order(order.column, { ascending: order.ascending ?? true });

    const { data, error } = await query;
    if (error) throw error;

    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeType(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('associate')) return 'associate';
  if (text.includes('kiddy')) return 'kiddy';
  return 'regular';
}

function isOldRecord(member, membership) {
  const text = `${member?.record_type || ''} ${membership?.notes || ''}`.toLowerCase();
  return text.includes('old');
}

function getRequiredBreakdown(member, membership) {
  const membershipType = normalizeType(membership?.membership_type || member?.membership_type);
  const base = isOldRecord(member, membership)
    ? OLD_BREAKDOWNS[membershipType]
    : NEW_BREAKDOWNS[membershipType];

  if (!base) {
    const required = money(membership?.fee_required);
    return { entry: required, admin_fees: 0, cbu: 0, savings: 0, vip_card: 0, total: required };
  }

  return {
    ...base,
    total: Math.max(base.total, money(membership?.fee_required)),
  };
}

function parsePaymentComponents(payment) {
  const amount = money(payment?.amount);
  try {
    const parsed = JSON.parse(payment?.notes || '{}');
    if (!parsed || typeof parsed !== 'object') return { entry: amount };

    const components = {};
    Object.entries(parsed).forEach(([key, value]) => {
      if (key === 'text') return;
      const n = money(value);
      if (n > 0) components[key] = (components[key] || 0) + n;
    });

    const componentTotal = Object.values(components).reduce((sum, n) => sum + n, 0);
    if (componentTotal <= 0) return { entry: amount };
    if (amount > componentTotal) {
      components.entry = (components.entry || 0) + (amount - componentTotal);
    }
    return components;
  } catch {
    return { entry: amount };
  }
}

function summarizePayments(payments) {
  return payments.reduce((summary, payment) => {
    const components = parsePaymentComponents(payment);
    const amount = money(payment.amount);

    summary.totalPaid += amount;
    summary.lastPaymentDate = !summary.lastPaymentDate || String(payment.payment_date || '') > String(summary.lastPaymentDate || '')
      ? payment.payment_date
      : summary.lastPaymentDate;

    summary.membershipFee +=
      money(components.entry) +
      money(components.membership_fee) +
      money(components.admin_fees);
    summary.cbu +=
      money(components.cbu) +
      money(components.cbu_assoc) +
      money(components.min_cbu);
    summary.savings +=
      money(components.savings) +
      money(components.savings_deposit);
    summary.vipCard += money(components.vip_card);

    return summary;
  }, {
    totalPaid: 0,
    membershipFee: 0,
    cbu: 0,
    savings: 0,
    vipCard: 0,
    lastPaymentDate: null,
  });
}

export async function getMembershipMonitoringIncomeSummary({ from = null, to = null } = {}) {
  let paymentQuery = supabase
    .from('membership_payments')
    .select('id, member_membership_id, member_id, amount, payment_date, notes, created_at');

  if (from) paymentQuery = paymentQuery.gte('payment_date', from);
  if (to) paymentQuery = paymentQuery.lte('payment_date', to);

  const { data: payments = [], error } = await paymentQuery;
  if (error) throw error;

  const paid = summarizePayments(payments || []);

  return {
    membership_fee: Math.round(paid.membershipFee * 100) / 100,
    membership_cbu: Math.round(paid.cbu * 100) / 100,
    membership_savings: Math.round(paid.savings * 100) / 100,
    vip_card: Math.round(paid.vipCard * 100) / 100,
    total_paid: Math.round(paid.totalPaid * 100) / 100,
    payment_count: (payments || []).length,
  };
}

export async function getMembershipMonitoringRows() {
  const [members, memberships, payments] = await Promise.all([
    fetchAll(
      'members',
      'id, member_no, first_name, last_name, middle_initial, membership_type, status, record_type, date_joined, recruiter_name',
      { column: 'member_no', ascending: true }
    ),
    fetchAll(
      'member_memberships',
      'id, member_id, membership_type, fee_required, fee_paid, status, notes, created_at',
      { column: 'created_at', ascending: false }
    ),
    fetchAll(
      'membership_payments',
      'id, member_membership_id, member_id, amount, payment_date, notes, created_at',
      { column: 'payment_date', ascending: false }
    ),
  ]);

  const membershipByMember = new Map();
  memberships.forEach(row => {
    if (!membershipByMember.has(row.member_id)) membershipByMember.set(row.member_id, row);
  });

  const paymentsByMembership = payments.reduce((map, payment) => {
    const key = payment.member_membership_id;
    if (!key) return map;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(payment);
    return map;
  }, new Map());

  return members.map(member => {
    const membership = membershipByMember.get(member.id) || null;
    const memberPayments = membership ? paymentsByMembership.get(membership.id) || [] : [];
    const required = membership ? getRequiredBreakdown(member, membership) : null;
    const paid = summarizePayments(memberPayments);
    const storedPaid = money(membership?.fee_paid);
    const storedRemainder = Math.max(0, storedPaid - paid.totalPaid);

    if (required && storedRemainder > 0.009) {
      let remaining = storedRemainder;
      const allocations = [
        ['membershipFee', required.entry],
        ['membershipFee', required.admin_fees],
        ['vipCard', required.vip_card],
        ['cbu', required.cbu],
        ['savings', required.savings],
      ];

      allocations.forEach(([key, target]) => {
        if (remaining <= 0) return;
        const available = Math.max(0, money(target) - money(paid[key]));
        const amount = Math.min(remaining, available);
        paid[key] += amount;
        remaining -= amount;
      });

      if (remaining > 0) paid.membershipFee += remaining;
      paid.totalPaid = storedPaid;
    }

    const requiredTotal = required?.total || 0;
    const paidTotal = Math.max(storedPaid, paid.totalPaid);
    const balance = membership ? Math.max(0, requiredTotal - paidTotal) : 0;
    const status = !membership
      ? 'no_setup'
      : balance <= 0
        ? 'fully_paid'
        : 'with_balance';

    return {
      id: member.id,
      member,
      membership,
      member_no: member.member_no || '',
      member_name: [member.first_name, member.middle_initial ? `${member.middle_initial}.` : '', member.last_name].filter(Boolean).join(' '),
      membership_type: normalizeType(membership?.membership_type || member.membership_type),
      record_type: isOldRecord(member, membership) ? 'old' : 'new',
      member_status: member.status || 'active',
      date_joined: member.date_joined,
      recruiter_name: member.recruiter_name || 'Self',
      required,
      required_total: requiredTotal,
      membership_fee_paid: paid.membershipFee,
      initial_cbu_paid: paid.cbu,
      initial_savings_paid: paid.savings,
      vip_card_paid: paid.vipCard,
      total_paid: paidTotal,
      balance,
      status,
      last_payment_date: paid.lastPaymentDate,
      payment_count: memberPayments.length,
    };
  });
}

export function summarizeMembershipMonitoring(rows) {
  return rows.reduce((summary, row) => {
    if (row.membership) summary.totalSetup += 1;
    if (!row.membership) summary.noSetup += 1;
    if (row.status === 'fully_paid') summary.fullyPaid += 1;
    if (row.status === 'with_balance') summary.withBalance += 1;
    if (row.member_status === 'closed') summary.closed += 1;

    summary.required += row.required_total;
    summary.totalPaid += row.total_paid;
    summary.balance += row.balance;
    summary.membershipFee += row.membership_fee_paid;
    summary.initialCbu += row.initial_cbu_paid;
    summary.initialSavings += row.initial_savings_paid;
    summary.vipCard += row.vip_card_paid;
    return summary;
  }, {
    totalSetup: 0,
    fullyPaid: 0,
    withBalance: 0,
    noSetup: 0,
    closed: 0,
    required: 0,
    totalPaid: 0,
    balance: 0,
    membershipFee: 0,
    initialCbu: 0,
    initialSavings: 0,
    vipCard: 0,
  });
}
  