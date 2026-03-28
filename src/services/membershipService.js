import { supabase } from './supabase';

const MEMBERSHIP_COLUMNS = [
  'member_id',
  'membership_type',
  'fee_required',
  'fee_paid',
  'status',
  'notes',
  'created_by',
];

const PAYMENT_COLUMNS = [
  'member_membership_id',
  'member_id',
  'amount',
  'payment_date',
  'notes',
  'created_by',
];

const UPGRADE_LOG_COLUMNS = [
  'member_membership_id',
  'member_id',
  'from_type',
  'to_type',
  'notes',
  'created_by',
];

function sanitize(payload, allowed) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([k, v]) => allowed.includes(k) && v !== '' && v !== undefined && v !== null
    )
  );
}

export function computeFeeBalance(membership) {
  const required = parseFloat(membership?.fee_required) || 0;
  const paid = parseFloat(membership?.fee_paid) || 0;
  return Math.max(0, required - paid);
}

function assertCreatedBy(createdBy) {
  if (!createdBy) {
    throw new Error('Authenticated user is required.');
  }
}

function assertMembershipType(type) {
  if (!['associate', 'regular'].includes(type)) {
    throw new Error('Invalid membership type.');
  }
}

export async function getMembershipByMemberId(memberId) {
  const { data, error } = await supabase
    .from('member_memberships')
    .select('*')
    .eq('member_id', memberId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getMembershipPayments(memberMembershipId) {
  const { data, error } = await supabase
    .from('membership_payments')
    .select('*')
    .eq('member_membership_id', memberMembershipId)
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getMembershipUpgradeLogs(memberMembershipId) {
  const { data, error } = await supabase
    .from('membership_upgrade_logs')
    .select('*')
    .eq('member_membership_id', memberMembershipId)
    .order('upgraded_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createMembership({
  member_id,
  membership_type,
  fee_required,
  fee_paid_now = 0,
  notes,
  created_by,
}) {
  assertCreatedBy(created_by);
  assertMembershipType(membership_type);

  const feeReq = parseFloat(fee_required) || 0;
  const feePaid = parseFloat(fee_paid_now) || 0;

  if (feeReq <= 0) {
    throw new Error('Membership fee required must be greater than zero.');
  }

  if (feePaid < 0) {
    throw new Error('Initial membership payment cannot be negative.');
  }

  const safePaid = Math.min(feePaid, feeReq);

  const membershipPayload = sanitize(
    {
      member_id,
      membership_type,
      fee_required: feeReq,
      fee_paid: safePaid,
      status: 'active',
      notes: notes || null,
      created_by,
    },
    MEMBERSHIP_COLUMNS
  );

  const { data: membership, error: membershipError } = await supabase
    .from('member_memberships')
    .insert(membershipPayload)
    .select()
    .single();

  if (membershipError) throw membershipError;

  if (safePaid > 0) {
    const paymentPayload = sanitize(
      {
        member_membership_id: membership.id,
        member_id,
        amount: safePaid,
        payment_date: new Date().toISOString().split('T')[0],
        notes: 'Initial payment at onboarding',
        created_by,
      },
      PAYMENT_COLUMNS
    );

    const { error: paymentError } = await supabase
      .from('membership_payments')
      .insert(paymentPayload);

    if (paymentError) throw paymentError;
  }

  return membership;
}

export async function recordMembershipPayment(
  memberMembershipId,
  memberId,
  amount,
  paymentDate,
  notes,
  createdBy
) {
  assertCreatedBy(createdBy);

  const value = parseFloat(amount) || 0;
  if (value <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }

  if (!paymentDate) {
    throw new Error('Payment date is required.');
  }

  const { data: membership, error: fetchError } = await supabase
    .from('member_memberships')
    .select('id, fee_required, fee_paid')
    .eq('id', memberMembershipId)
    .single();

  if (fetchError) throw fetchError;

  const currentPaid = parseFloat(membership.fee_paid) || 0;
  const required = parseFloat(membership.fee_required) || 0;
  const remaining = Math.max(0, required - currentPaid);

  if (remaining <= 0) {
    throw new Error('Membership fee is already fully paid.');
  }

  const safeAmount = Math.min(value, remaining);
  const newFeePaid = currentPaid + safeAmount;

  const paymentPayload = sanitize(
    {
      member_membership_id: memberMembershipId,
      member_id: memberId,
      amount: safeAmount,
      payment_date: paymentDate,
      notes: notes || null,
      created_by: createdBy,
    },
    PAYMENT_COLUMNS
  );

  const { error: paymentError } = await supabase
    .from('membership_payments')
    .insert(paymentPayload);

  if (paymentError) throw paymentError;

  const { data: updated, error: updateError } = await supabase
    .from('member_memberships')
    .update({ fee_paid: newFeePaid })
    .eq('id', memberMembershipId)
    .select()
    .single();

  if (updateError) throw updateError;

  return updated;
}

export async function upgradeMembership(
  memberMembershipId,
  memberId,
  newType,
  notes,
  createdBy
) {
  assertCreatedBy(createdBy);
  assertMembershipType(newType);

  const { data: membership, error: fetchError } = await supabase
    .from('member_memberships')
    .select('membership_type')
    .eq('id', memberMembershipId)
    .single();

  if (fetchError) throw fetchError;

  const fromType = membership.membership_type;

  if (fromType === newType) {
    throw new Error(`Member is already a ${newType} member.`);
  }

  const { data: updated, error: updateError } = await supabase
    .from('member_memberships')
    .update({ membership_type: newType })
    .eq('id', memberMembershipId)
    .select()
    .single();

  if (updateError) throw updateError;

  const upgradePayload = sanitize(
    {
      member_membership_id: memberMembershipId,
      member_id: memberId,
      from_type: fromType,
      to_type: newType,
      notes: notes || null,
      created_by: createdBy,
    },
    UPGRADE_LOG_COLUMNS
  );

  const { error: logError } = await supabase
    .from('membership_upgrade_logs')
    .insert(upgradePayload);

  if (logError) throw logError;

  return updated;
}