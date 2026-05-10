import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Save, UserPlus, DollarSign, Archive, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Spinner from '../../components/ui/Spinner';

import {
  createMember,
  updateMember,
  getMemberById,
  initializeMemberAccounts,
} from '../../services/memberService';

import { getAccountsByMemberId, updateAccount } from '../../services/accountService';
import { createTransaction } from '../../services/transactionService';
import { createMembership } from '../../services/membershipService';
import { createInvoiceForPayment } from '../../services/invoiceService';
import { createTimeDeposit } from '../../services/timeDepositService';

import { useAuth } from '../../context/AuthContext';
import { trackActivity } from '../../services/logService';
import { formatCurrency } from '../../utils/formatters';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
];

const MEMBERSHIP_TYPE_OPTIONS = [
  { value: 'associate', label: 'Associate' },
  { value: 'regular', label: 'Regular / Fullpledge' },
];

const PAYMENT_OPTION_OPTIONS = [
  { value: 'none', label: 'No payment yet' },
  { value: 'partial', label: 'Partial payment' },
  { value: 'full', label: 'Full payment' },
];

const PAYMENT_MODE_OPTIONS = [
  { value: '', label: 'Select mode of payment' },
  { value: 'Cash', label: 'Cash' },
  { value: 'GCash', label: 'GCash' },
  { value: 'Bank Transfer', label: 'Bank Transfer' },
  { value: 'Check', label: 'Check' },
  { value: 'Others', label: 'Others' },
];

// New members (joining now) — current fee structure effective 2026
// Each item: key (unique per type), label (exact display word), amount, category (membership|cbu|savings), optional group
const NEW_MEMBER_BREAKDOWN = {
  associate: {
    label: 'Associate Membership',
    items: [
      { key: 'membership_fee', label: 'Membership Fee',  amount: 100, category: 'membership' },
      { key: 'vip_card',       label: 'WELLife VIP Card', amount: 300, category: 'membership' },
      { key: 'cbu',            label: 'Initial CBU',      amount: 500, category: 'cbu'        },
    ],
  },
  regular: {
    label: 'Regular / Fullpledge Membership',
    items: [
      { key: 'membership_fee', label: 'Membership Fee',          amount: 100,  category: 'membership', group: 'Associate Package' },
      { key: 'vip_card',       label: 'WELLife VIP Card',        amount: 300,  category: 'membership', group: 'Associate Package' },
      { key: 'cbu_assoc',      label: 'Initial CBU',             amount: 500,  category: 'cbu',        group: 'Associate Package' },
      { key: 'admin_fees',     label: 'Admin & Regulatory Fees', amount: 1000, category: 'membership', group: 'Regular Package'   },
      { key: 'savings_deposit',label: 'Initial Savings Deposit', amount: 500,  category: 'savings',    group: 'Regular Package'   },
      { key: 'min_cbu',        label: 'Minimum CBU',             amount: 3500, category: 'cbu',        group: 'Regular Package'   },
    ],
  },
};

// All possible item keys across both new-member types (for clearing/reset)
const ALL_NEW_ITEM_KEYS = ['membership_fee', 'vip_card', 'cbu', 'cbu_assoc', 'admin_fees', 'savings_deposit', 'min_cbu'];

// Old members (encoded from pre-system records 2023–2025) — historical fee structure; DO NOT CHANGE
const OLD_MEMBER_BREAKDOWN = {
  associate: {
    label: 'Entry Membership',
    membership_fee: 300,
    cbu: 1000,
    savings: 500,
  },
  regular: {
    label: 'Full Pledge Member',
    membership_fee: 1800,
    cbu: 4000,
    savings: 1000,
  },
};

async function createInvoiceStrict(args, label) {
  try {
    return await createInvoiceForPayment(args);
  } catch (e) {
    console.error(`[${label}] Invoice creation failed:`, e);
    throw new Error(e?.message || `${label} invoice creation failed.`);
  }
}

export function MemberFormContent({
  memberId: memberIdProp,
  inModal = false,
  onClose,
  onCreated,
  onUpdated,
}) {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const memberId = memberIdProp ?? routeId;
  const isEdit = Boolean(memberId);

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEdit);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm({
    defaultValues: {
      record_type: 'new_member',
      first_name: '',
      last_name: '',
      middle_initial: '',
      member_no: '',
      email: '',
      phone: '',
      address: '',
      civil_status: '',
      sex: '',
      date_of_birth: '',
      res_tel_no: '',
      occupation: '',
      tin_no: '',
      sss_id_no: '',
      recruiter_name: '',
      status: 'active',
      membership_type: 'associate',
      notes: '',
      date_joined: '',
      // New member payment fields
      payment_option: 'none',
      payment_date: '',
      // Per-item paid amounts (keyed to NEW_MEMBER_BREAKDOWN item keys)
      paid_membership_fee: '',
      paid_vip_card: '',
      paid_cbu: '',
      paid_cbu_assoc: '',
      paid_admin_fees: '',
      paid_savings_deposit: '',
      paid_min_cbu: '',
      invoice_no: '',
      payment_mode: '',
      payment_reference: '',
      payment_notes: '',
      // Account numbers
      cbu_account_no: '',
      savings_account_no: '',
      // Old member historical balance fields (not saved to members table)
      old_cbu_balance: '',
      old_savings_balance: '',
      // Old member breakdown manual overrides (optional — defaults to OLD_MEMBER_BREAKDOWN amounts)
      old_manual_membership_fee: '',
      old_manual_cbu: '',
      old_manual_savings: '',
      // Old member time deposit fields
      has_time_deposit: false,
      td_date_applied: '',
      td_terms: '',
      td_amount: '',
      td_interest_rate: '',
      td_termination_date: '',
    },
  });

  const recordType     = watch('record_type');
  const membershipType = watch('membership_type');
  const paymentOption  = watch('payment_option');
  const paymentMode    = watch('payment_mode');
  const paymentReference = watch('payment_reference');
  const hasTimeDep     = watch('has_time_deposit');

  // Watch all per-item paid fields for live remaining display
  const itemPaidRaw = watch(ALL_NEW_ITEM_KEYS.map(k => `paid_${k}`));
  const itemPaidMap = Object.fromEntries(ALL_NEW_ITEM_KEYS.map((k, i) => [k, parseFloat(itemPaidRaw[i]) || 0]));

  const isOldMember = recordType === 'old_member';

  const breakdownMap = isOldMember ? OLD_MEMBER_BREAKDOWN : NEW_MEMBER_BREAKDOWN;
  const breakdown = breakdownMap[membershipType];

  // Old member manual override watches
  const oldManualMFRaw  = watch('old_manual_membership_fee');
  const oldManualCBURaw = watch('old_manual_cbu');
  const oldManualSavRaw = watch('old_manual_savings');

  // Defaults from OLD_MEMBER_BREAKDOWN (used when manual fields are blank)
  const oldDefaults = OLD_MEMBER_BREAKDOWN[membershipType] || { membership_fee: 0, cbu: 0, savings: 0 };

  const oldEffectiveMF  = isOldMember ? (parseFloat(oldManualMFRaw)  || oldDefaults.membership_fee) : 0;
  const oldEffectiveCBU = isOldMember ? (parseFloat(oldManualCBURaw) || oldDefaults.cbu)            : 0;
  const oldEffectiveSav = isOldMember ? (parseFloat(oldManualSavRaw) || oldDefaults.savings)        : 0;
  const oldEffectiveTotal = oldEffectiveMF + oldEffectiveCBU + oldEffectiveSav;

  // Total required: sum item amounts for new members, or sum effective (manual/default) amounts for old members
  const total = breakdown?.items
    ? breakdown.items.reduce((s, i) => s + i.amount, 0)
    : oldEffectiveTotal;

  // Total paid so far across all items (for new member payment summary)
  const totalPaidSoFar = breakdown?.items
    ? breakdown.items.reduce((s, i) => s + Math.min(itemPaidMap[i.key] || 0, i.amount), 0)
    : 0;

  const referenceRequired = ['GCash', 'Bank Transfer', 'Check'].includes(paymentMode);

  useEffect(() => {
    if (isEdit) loadMember();
  }, [memberId]);

  useEffect(() => {
    if (!breakdown?.items || isEdit || isOldMember) return;

    if (paymentOption === 'full') {
      // Fill each item with its max amount; clear keys not in the current breakdown
      ALL_NEW_ITEM_KEYS.forEach(key => {
        const item = breakdown.items.find(i => i.key === key);
        setValue(`paid_${key}`, item ? String(item.amount) : '');
      });
      if (!watch('payment_date')) {
        setValue('payment_date', new Date().toISOString().split('T')[0]);
      }
    }

    if (paymentOption === 'none') {
      ALL_NEW_ITEM_KEYS.forEach(key => setValue(`paid_${key}`, ''));
      setValue('invoice_no', '');
      setValue('payment_mode', '');
      setValue('payment_reference', '');
      setValue('payment_notes', '');
    }

    // When switching record type or membership type, reset old-member manual override fields
    if (isOldMember) {
      setValue('old_manual_membership_fee', '');
      setValue('old_manual_cbu', '');
      setValue('old_manual_savings', '');
    }

    // When membership type changes, clear item fields not in the new breakdown
    if (paymentOption === 'partial') {
      ALL_NEW_ITEM_KEYS.forEach(key => {
        if (!breakdown.items.find(i => i.key === key)) {
          setValue(`paid_${key}`, '');
        }
      });
    }
  }, [paymentOption, membershipType, isEdit, isOldMember, breakdown, setValue, watch]);

  async function loadMember() {
    try {
      const data = await getMemberById(memberId);
      const accounts = await getAccountsByMemberId(memberId);

      const cbu = (accounts || []).find(a => String(a.account_type).toLowerCase() === 'cbu');
      const savings = (accounts || []).find(a => String(a.account_type).toLowerCase() === 'savings');

      reset({
        record_type: data.record_type || 'new_member',
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        middle_initial: data.middle_initial || '',
        member_no: data.member_no || '',
        email: data.email || '',
        phone: data.phone || '',
        address: data.address || '',
        civil_status: data.civil_status || '',
        sex: data.sex || '',
        date_of_birth: data.date_of_birth || '',
        res_tel_no: data.res_tel_no || '',
        occupation: data.occupation || '',
        tin_no: data.tin_no || '',
        sss_id_no: data.sss_id_no || '',
        recruiter_name: data.recruiter_name || '',
        status: data.status || 'active',
        membership_type: data.membership_type || 'associate',
        notes: data.notes || '',
        date_joined: data.date_joined || '',
        payment_option: 'none',
        payment_date: '',
        invoice_no: '',
        payment_mode: '',
        payment_reference: '',
        payment_notes: '',
        cbu_account_no: cbu?.account_no || '',
        savings_account_no: savings?.account_no || '',
        old_cbu_balance: '',
        old_savings_balance: '',
        old_manual_membership_fee: '',
        old_manual_cbu: '',
        old_manual_savings: '',
        has_time_deposit: false,
        td_date_applied: '',
        td_terms: '',
        td_amount: '',
        td_interest_rate: '',
        td_termination_date: '',
      });
    } catch {
      toast.error('Failed to load member');
      if (!inModal) navigate('/members');
    } finally {
      setInitialLoading(false);
    }
  }

  async function onSubmit(values) {
    try {
      setLoading(true);

      if (!user?.id) {
        toast.error('User not authenticated');
        return;
      }

      const payload = {
        first_name: values.first_name,
        last_name: values.last_name,
        middle_initial: values.middle_initial,
        member_no: values.member_no,
        email: values.email,
        phone: values.phone,
        address: values.address,
        civil_status: values.civil_status,
        sex: values.sex,
        date_of_birth: values.date_of_birth,
        res_tel_no: values.res_tel_no,
        occupation: values.occupation,
        tin_no: values.tin_no,
        sss_id_no: values.sss_id_no,
        recruiter_name: values.recruiter_name?.trim() || 'Self',
        status: values.status,
        membership_type: values.membership_type,
        notes: values.notes,
        date_joined: values.date_joined || new Date().toISOString().split('T')[0],
        record_type: values.record_type || 'new_member',
      };

      // ── EDIT FLOW ────────────────────────────────────────────────────────────
      if (isEdit) {
        await updateMember(memberId, payload);

        const existingAccounts = await getAccountsByMemberId(memberId);
        const cbuAccount = (existingAccounts || []).find(a => String(a.account_type).toLowerCase() === 'cbu');
        const savingsAccount = (existingAccounts || []).find(a => String(a.account_type).toLowerCase() === 'savings');

        if (cbuAccount) {
          await updateAccount(cbuAccount.id, { account_no: values.cbu_account_no || null });
        }
        if (savingsAccount) {
          await updateAccount(savingsAccount.id, { account_no: values.savings_account_no || null });
        }

        toast.success('Member updated successfully');
        trackActivity({ userId: user?.id, module: 'member', action: 'update', description: `Updated member: ${values.first_name} ${values.last_name}` });

        if (inModal) {
          onUpdated?.(memberId);
          onClose?.();
        } else {
          navigate(`/members/${memberId}`);
        }
        return;
      }

      const selectedBreakdownMap = values.record_type === 'old_member' ? OLD_MEMBER_BREAKDOWN : NEW_MEMBER_BREAKDOWN;
      const selectedBreakdown = selectedBreakdownMap[values.membership_type];

      // ── OLD MEMBER FLOW ──────────────────────────────────────────────────────
      if (values.record_type === 'old_member') {
        if (!values.date_joined) {
          toast.error('Original membership date is required for historical records.');
          return;
        }

        if (values.has_time_deposit) {
          if (!values.td_date_applied || !values.td_terms || !values.td_amount || values.td_interest_rate === '') {
            toast.error('Please fill in all required Time Deposit fields (Date Applied, Terms, Amount, Interest Rate).');
            return;
          }
        }

        // Compute effective breakdown amounts: manual input takes priority, falls back to OLD_MEMBER_BREAKDOWN defaults
        const oldBD = OLD_MEMBER_BREAKDOWN[values.membership_type] || { membership_fee: 0, cbu: 0, savings: 0 };
        const effectiveMF  = parseFloat(values.old_manual_membership_fee)  || oldBD.membership_fee;
        const effectiveCBU = parseFloat(values.old_manual_cbu)             || oldBD.cbu;
        const effectiveSav = parseFloat(values.old_manual_savings)         || oldBD.savings;
        const effectiveTotal = effectiveMF + effectiveCBU + effectiveSav;

        if (effectiveTotal <= 0) {
          toast.error('Membership total must be greater than zero.');
          return;
        }

        const newMember = await createMember({ ...payload, record_type: 'old_member' });
        const newMemberId = newMember.id;
        const memberName = `${newMember.first_name || ''} ${newMember.last_name || ''}`.trim();

        await initializeMemberAccounts(newMemberId);
        const accounts = await getAccountsByMemberId(newMemberId);
        const cbuAccount = accounts.find(a => String(a.account_type).toLowerCase() === 'cbu');
        const savingsAccount = accounts.find(a => String(a.account_type).toLowerCase() === 'savings');

        if (cbuAccount) {
          await updateAccount(cbuAccount.id, {
            account_no: values.cbu_account_no || null,
            balance: parseFloat(values.old_cbu_balance) || 0,
          });
        }
        if (savingsAccount) {
          await updateAccount(savingsAccount.id, {
            account_no: values.savings_account_no || null,
            balance: parseFloat(values.old_savings_balance) || 0,
          });
        }

        // Mark membership as fully paid using the full effective total (membership + CBU + savings)
        // is_historical = true → skips payment record, no invoice, no fund movement
        await createMembership({
          member_id: newMemberId,
          membership_type: values.membership_type,
          fee_required: effectiveTotal,
          fee_paid_now: effectiveTotal,
          notes: `Historical record — membership fully paid before system. Breakdown: Entry ₱${effectiveMF.toLocaleString()}, CBU ₱${effectiveCBU.toLocaleString()}, Savings ₱${effectiveSav.toLocaleString()}`,
          created_by: user.id,
          is_historical: true,
        });

        if (values.has_time_deposit) {
          await createTimeDeposit({
            name: memberName,
            terms: parseInt(values.td_terms, 10),
            amount: parseFloat(values.td_amount),
            interest_rate: parseFloat(values.td_interest_rate) || 0,
            date_applied: values.td_date_applied,
            termination_date: values.td_termination_date || null,
            member_id: newMemberId,
          });
        }

        toast.success('Old member record created successfully.');
        trackActivity({ userId: user?.id, module: 'member', action: 'create', description: `Encoded old member record: ${values.first_name} ${values.last_name}` });

        if (inModal) {
          onCreated?.(newMemberId);
          onClose?.();
        } else {
          navigate(`/members/${newMemberId}`);
        }
        return;
      }

      // ── NEW MEMBER FLOW ──────────────────────────────────────────────────────
      const paymentDate = values.payment_date || new Date().toISOString().split('T')[0];

      let postedMembershipPaid = 0;
      let postedCbuPaid = 0;
      let postedSavingsPaid = 0;

      if (values.payment_option !== 'none') {
        // Validate each item and aggregate into the 3 transaction categories
        for (const item of selectedBreakdown.items) {
          const paid = parseFloat(values[`paid_${item.key}`]) || 0;
          if (paid < 0) {
            toast.error(`${item.label} amount cannot be negative.`);
            return;
          }
          if (paid > item.amount) {
            toast.error(`${item.label} cannot exceed ₱${item.amount.toLocaleString()}.`);
            return;
          }
          if (item.category === 'membership') postedMembershipPaid += paid;
          else if (item.category === 'cbu')        postedCbuPaid        += paid;
          else if (item.category === 'savings')    postedSavingsPaid    += paid;
        }
      }

      const totalPaid = postedMembershipPaid + postedCbuPaid + postedSavingsPaid;

      if (values.payment_option !== 'none' && totalPaid <= 0) {
        toast.error('Enter at least one onboarding payment amount.');
        return;
      }

      if (totalPaid > 0) {
        if (!paymentDate) { toast.error('Payment date is required.'); return; }
        if (!values.invoice_no?.trim()) { toast.error('SI# is required when there is onboarding payment.'); return; }
        if (!values.payment_mode) { toast.error('Mode of payment is required when there is onboarding payment.'); return; }
        if (referenceRequired && !values.payment_reference?.trim()) {
          toast.error('Reference / Account / Check No. is required for the selected payment mode.');
          return;
        }
      }

      const newMember = await createMember({ ...payload, record_type: 'new_member' });
      const newMemberId = newMember.id;
      const memberName = `${newMember.first_name || ''} ${newMember.last_name || ''}`.trim();

      await initializeMemberAccounts(newMemberId);

      const accounts = await getAccountsByMemberId(newMemberId);
      const cbuAccount = accounts.find(a => String(a.account_type).toLowerCase() === 'cbu');
      const savingsAccount = accounts.find(a => String(a.account_type).toLowerCase() === 'savings');

      if (cbuAccount && values.cbu_account_no) {
        await updateAccount(cbuAccount.id, { account_no: values.cbu_account_no });
      }
      if (savingsAccount && values.savings_account_no) {
        await updateAccount(savingsAccount.id, { account_no: values.savings_account_no });
      }

      const refreshedAccounts = await getAccountsByMemberId(newMemberId);
      const refreshedCbuAccount = refreshedAccounts.find(a => String(a.account_type).toLowerCase() === 'cbu');
      const refreshedSavingsAccount = refreshedAccounts.find(a => String(a.account_type).toLowerCase() === 'savings');

      const paymentModeNote =
        [values.payment_reference?.trim(), values.payment_notes?.trim()].filter(Boolean).join(' | ') || null;

      // fee_required = full package total (entry + CBU + savings) so the payment panel tracks all components
      const feeRequired = selectedBreakdown.items
        ? selectedBreakdown.items.reduce((s, i) => s + i.amount, 0)
        : selectedBreakdown.membership_fee;

      // Build JSON breakdown note using exact item keys so each row shows its own paid amount
      let initPaymentNotes = null;
      if (totalPaid > 0 && selectedBreakdown.items) {
        const itemBreakdown = {};
        selectedBreakdown.items.forEach(item => {
          const paid = parseFloat(values[`paid_${item.key}`]) || 0;
          if (paid > 0) itemBreakdown[item.key] = paid;
        });
        initPaymentNotes = JSON.stringify(itemBreakdown);
      }

      const membershipRecord = await createMembership({
        member_id: newMemberId,
        membership_type: values.membership_type,
        fee_required: feeRequired,
        fee_paid_now: totalPaid,   // full initial payment (entry + CBU + savings)
        payment_notes: initPaymentNotes,
        created_by: user.id,
      });

      if (postedMembershipPaid > 0) {
        // Create one transaction per membership fee item so each shows individually
        const membershipItems = selectedBreakdown.items.filter(i => i.category === 'membership');
        for (const item of membershipItems) {
          const paid = parseFloat(values[`paid_${item.key}`]) || 0;
          if (paid > 0) {
            await createTransaction({
              member_id: newMemberId,
              category: 'membership',
              type: 'membership_payment',
              amount: paid,
              reference: values.payment_reference?.trim() || null,
              notes: [item.label, values.payment_notes?.trim()].filter(Boolean).join(' — '),
              created_by: user.id,
              transaction_date: paymentDate,
              payment_mode: values.payment_mode,
              payment_mode_note: paymentModeNote,
            });
          }
        }
      }

      if (postedCbuPaid > 0) {
        if (!refreshedCbuAccount) throw new Error('CBU account not found after member initialization.');
        // Create one transaction per CBU fee item
        const cbuItems = selectedBreakdown.items.filter(i => i.category === 'cbu');
        for (const item of cbuItems) {
          const paid = parseFloat(values[`paid_${item.key}`]) || 0;
          if (paid > 0) {
            await createTransaction({
              member_id: newMemberId,
              account_id: refreshedCbuAccount.id,
              category: 'cbu',
              type: 'deposit',
              amount: paid,
              reference: values.payment_reference?.trim() || refreshedCbuAccount.account_no || null,
              notes: [item.label, values.payment_notes?.trim()].filter(Boolean).join(' — '),
              created_by: user.id,
              transaction_date: paymentDate,
              payment_mode: values.payment_mode,
              payment_mode_note: paymentModeNote,
            });
          }
        }
      }

      if (postedSavingsPaid > 0) {
        if (!refreshedSavingsAccount) throw new Error('Savings account not found after member initialization.');
        // Create one transaction per Savings fee item
        const savingsItems = selectedBreakdown.items.filter(i => i.category === 'savings');
        for (const item of savingsItems) {
          const paid = parseFloat(values[`paid_${item.key}`]) || 0;
          if (paid > 0) {
            await createTransaction({
              member_id: newMemberId,
              account_id: refreshedSavingsAccount.id,
              category: 'savings',
              type: 'deposit',
              amount: paid,
              reference: values.payment_reference?.trim() || refreshedSavingsAccount.account_no || null,
              notes: [item.label, values.payment_notes?.trim()].filter(Boolean).join(' — '),
              created_by: user.id,
              transaction_date: paymentDate,
              payment_mode: values.payment_mode,
              payment_mode_note: paymentModeNote,
            });
          }
        }
      }

      if (totalPaid > 0) {
        // Build invoice notes from exact item labels that had a paid amount
        const invoiceBreakdown = selectedBreakdown.items
          ? selectedBreakdown.items
              .filter(i => (parseFloat(values[`paid_${i.key}`]) || 0) > 0)
              .map(i => `${i.label}: ${formatCurrency(parseFloat(values[`paid_${i.key}`]) || 0)}`)
          : [
              postedMembershipPaid > 0 ? `Membership: ${formatCurrency(postedMembershipPaid)}` : null,
              postedCbuPaid > 0        ? `CBU: ${formatCurrency(postedCbuPaid)}`               : null,
              postedSavingsPaid > 0    ? `Savings: ${formatCurrency(postedSavingsPaid)}`       : null,
            ].filter(Boolean);

        await createInvoiceStrict(
          {
            invoice_no: values.invoice_no.trim(),
            payment_type: 'membership',
            member_id: newMemberId,
            member_name: memberName || 'Member',
            amount: totalPaid,
            purpose: invoiceBreakdown.length > 1 ? 'Combined Onboarding Payment' : (invoiceBreakdown[0] || 'Onboarding Payment'),
            ref_id: membershipRecord?.id || null,
            created_by: user.id,
            date: paymentDate,
            payment_mode: values.payment_mode,
            payment_mode_note: paymentModeNote,
            notes: [
              ...invoiceBreakdown,
              values.payment_notes?.trim() || null,
            ].filter(Boolean).join(' | '),
          },
          'Combined onboarding payment'
        );
      }

      toast.success('Member added successfully.');
      trackActivity({ userId: user?.id, module: 'member', action: 'create', description: `Added new member: ${values.first_name} ${values.last_name}` });

      if (inModal) {
        onCreated?.(newMemberId);
        onClose?.();
      } else {
        navigate(`/members/${newMemberId}`);
      }
    } catch (err) {
      console.error('[MemberFormPage] save failed:', err);
      toast.error(err.message || 'Failed to save member');
    } finally {
      setLoading(false);
    }
  }

  if (initialLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Spinner />
      </div>
    );
  }

  const content = (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

      {/* ── Record Type selector (new registrations only) ── */}
      {!isEdit && (
        <section>
          <p className="text-sm font-semibold text-gray-700 mb-3">Registration Category</p>
          <div className="grid grid-cols-2 gap-3">
            {/* New Member */}
            <label
              className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                !isOldMember
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                value="new_member"
                className="mt-0.5 accent-blue-600"
                {...register('record_type')}
              />
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <UserPlus size={14} className={!isOldMember ? 'text-blue-600' : 'text-gray-400'} />
                  <span className={`text-sm font-semibold ${!isOldMember ? 'text-blue-700' : 'text-gray-600'}`}>
                    New Member
                  </span>
                </div>
                <p className="text-xs text-gray-500 leading-snug">
                  Joining now. Follows normal registration and payment flow.
                </p>
              </div>
            </label>

            {/* Old Member */}
            <label
              className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                isOldMember
                  ? 'border-amber-500 bg-amber-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                value="old_member"
                className="mt-0.5 accent-amber-600"
                {...register('record_type')}
              />
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Archive size={14} className={isOldMember ? 'text-amber-600' : 'text-gray-400'} />
                  <span className={`text-sm font-semibold ${isOldMember ? 'text-amber-700' : 'text-gray-600'}`}>
                    Old Member
                  </span>
                </div>
                <p className="text-xs text-gray-500 leading-snug">
                  Encoding from existing Excel / printed records. No fund movement.
                </p>
              </div>
            </label>
          </div>

          {/* Old Member explanation banner */}
          {isOldMember && (
            <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <Archive size={14} /> Historical Record — Old Member
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-xs text-amber-700 mt-1">
                <li>Membership is automatically marked as <strong>Fully Paid</strong>.</li>
                <li>No invoice or receipt will be generated.</li>
                <li>No fund movement will be recorded in the cooperative fund.</li>
                <li>This member will be recognized as eligible for loans and other services.</li>
                <li>You may enter the member's existing CBU, Savings, and Time Deposit balances below.</li>
              </ul>
            </div>
          )}

          {/* New Member info banner */}
          {!isOldMember && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-start gap-2">
              <UserPlus size={16} className="flex-shrink-0 mt-0.5" />
              <span>
                You may register a member only, or register and post initial onboarding payments at the same time.
              </span>
            </div>
          )}
        </section>
      )}

      {/* Old member read-only badge in edit mode */}
      {isEdit && recordType === 'old_member' && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <Archive size={14} />
          <span className="font-medium">Historical Record — Old Member</span>
          <span className="text-amber-600 text-xs">· Encoded from pre-system records</span>
        </div>
      )}

      {/* ── Personal Information ── */}
      <section className={inModal ? 'bg-gray-50 border border-gray-100 rounded-xl p-4' : ''}>
        <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">
          Personal Information
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            label="First Name"
            required
            error={errors.first_name?.message}
            {...register('first_name', { required: 'First name is required' })}
          />
          <Input
            label="Last Name"
            required
            error={errors.last_name?.message}
            {...register('last_name', { required: 'Last name is required' })}
          />
          <Input label="M.I." placeholder="M" {...register('middle_initial')} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Input label="Member Number" placeholder="e.g. MBR-2024-001" {...register('member_no')} />

          <Input
            label={isOldMember ? 'Original Membership Date *' : 'Date Joined'}
            type="date"
            required={isOldMember}
            error={errors.date_joined?.message}
            {...register('date_joined', {
              required: isOldMember ? 'Original membership date is required.' : false,
            })}
          />

          <Input label="Date of Birth" type="date" {...register('date_of_birth')} />

          <Select
            label="Civil Status"
            options={[
              { value: '', label: 'Select status' },
              { value: 'single', label: 'Single' },
              { value: 'married', label: 'Married' },
              { value: 'widowed', label: 'Widowed' },
              { value: 'separated', label: 'Separated' },
            ]}
            {...register('civil_status')}
          />

          <Select
            label="Sex"
            options={[
              { value: '', label: 'Select sex' },
              { value: 'male', label: 'Male' },
              { value: 'female', label: 'Female' },
            ]}
            {...register('sex')}
          />

          <Input label="Occupation" {...register('occupation')} />
          <Input label="TIN No." {...register('tin_no')} />
          <Input label="SSS ID No." {...register('sss_id_no')} />

          <div className="sm:col-span-2">
            <Input
              label="Complete Address"
              placeholder="House No., Street, Barangay, City"
              {...register('address')}
            />
          </div>
        </div>
      </section>

      {/* ── Contact & Membership ── */}
      <section className={inModal ? 'bg-gray-50 border border-gray-100 rounded-xl p-4' : ''}>
        <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">
          Contact Information
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Email"
            type="email"
            error={errors.email?.message}
            {...register('email', {
              pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Invalid email' },
            })}
          />
          <Input label="Mobile No." placeholder="+63 9XX XXX XXXX" {...register('phone')} />
          <Input label="Res. Tel. No." {...register('res_tel_no')} />

          <Input
            label="Referred By"
            placeholder="Leave blank for Self"
            {...register('recruiter_name')}
          />

          <Select label="Status" options={STATUS_OPTIONS} {...register('status')} />

          <Select
            label="Membership Type"
            options={MEMBERSHIP_TYPE_OPTIONS}
            {...register('membership_type', { required: 'Membership type is required' })}
          />

          {/* Membership Breakdown */}
          {breakdown && (
            <div className="sm:col-span-2 mt-2">
              <div className={`p-4 rounded-xl border ${isOldMember ? 'bg-amber-50/40 border-amber-100' : 'bg-blue-50/40 border-blue-100'}`}>
                <div className="flex items-center justify-between mb-3">
                  <h4 className={`text-sm font-semibold ${isOldMember ? 'text-amber-800' : 'text-blue-800'}`}>
                    Membership Breakdown
                  </h4>
                  {isOldMember && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      <CheckCircle size={11} /> Fully Paid — Historical
                    </span>
                  )}
                </div>

                {/* Old Member: manual-input breakdown — defaults to OLD_MEMBER_BREAKDOWN amounts, fully overridable */}
                {isOldMember && (
                  <div className="space-y-3 text-sm">
                    <p className="text-xs text-amber-600 mb-3">
                      Standard amounts are pre-filled. Leave a field blank to use the default, or type a new value to override.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Membership Entry
                          <span className="ml-1 text-amber-500 font-normal">(default ₱{oldDefaults.membership_fee.toLocaleString()})</span>
                        </label>
                        <input
                          type="number" step="0.01" min="0"
                          placeholder={String(oldDefaults.membership_fee)}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                          {...register('old_manual_membership_fee')}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Initial CBU
                          <span className="ml-1 text-amber-500 font-normal">(default ₱{oldDefaults.cbu.toLocaleString()})</span>
                        </label>
                        <input
                          type="number" step="0.01" min="0"
                          placeholder={String(oldDefaults.cbu)}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                          {...register('old_manual_cbu')}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Initial Savings
                          <span className="ml-1 text-amber-500 font-normal">(default ₱{oldDefaults.savings.toLocaleString()})</span>
                        </label>
                        <input
                          type="number" step="0.01" min="0"
                          placeholder={String(oldDefaults.savings)}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                          {...register('old_manual_savings')}
                        />
                      </div>
                    </div>
                    <div className="border-t my-2 border-amber-100" />
                    <div className="flex justify-between font-semibold text-base text-amber-900">
                      <span>Total Amount</span>
                      <span>₱{oldEffectiveTotal.toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-amber-500 mt-0.5">
                      This total is recorded as the historical membership amount — marked fully paid automatically.
                    </p>
                  </div>
                )}

                {/* New Member: render from items array, grouped when group property exists */}
                {!isOldMember && breakdown.items && (() => {
                  const hasGroups = breakdown.items.some(i => i.group);

                  if (!hasGroups) {
                    return (
                      <div className="space-y-1 text-sm">
                        {breakdown.items.map(item => (
                          <div key={item.key} className="flex justify-between text-gray-700">
                            <span>{item.label}</span>
                            <span>₱{item.amount.toLocaleString()}</span>
                          </div>
                        ))}
                        <div className="border-t my-2 border-blue-100" />
                        <div className="flex justify-between font-semibold text-base text-blue-900">
                          <span>Total Required</span>
                          <span>₱{total.toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  }

                  // Grouped display (Regular / Fullpledge)
                  const groups = [...new Set(breakdown.items.map(i => i.group))];
                  return (
                    <div className="space-y-3 text-sm">
                      {groups.map(grp => {
                        const grpItems = breakdown.items.filter(i => i.group === grp);
                        const subtotal = grpItems.reduce((s, i) => s + i.amount, 0);
                        return (
                          <div key={grp}>
                            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1.5">{grp}</p>
                            <div className="space-y-1">
                              {grpItems.map(item => (
                                <div key={item.key} className="flex justify-between text-gray-700">
                                  <span>{item.label}</span>
                                  <span>₱{item.amount.toLocaleString()}</span>
                                </div>
                              ))}
                            </div>
                            <div className="flex justify-between text-xs font-semibold text-blue-700 mt-1.5 pt-1.5 border-t border-blue-100">
                              <span>Package Subtotal</span>
                              <span>₱{subtotal.toLocaleString()}</span>
                            </div>
                          </div>
                        );
                      })}
                      <div className="border-t-2 border-blue-200 pt-2">
                        <div className="flex justify-between font-bold text-base text-blue-900">
                          <span>Total Required</span>
                          <span>₱{total.toLocaleString()}</span>
                        </div>
                        <p className="text-xs text-blue-500 mt-0.5">
                          Includes Associate package (₱900) + Regular package (₱5,000)
                        </p>
                        <div className="mt-2 flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                          <CheckCircle size={12} className="text-emerald-600 flex-shrink-0" />
                          <p className="text-xs text-emerald-700 font-medium">
                            Member status upon full payment: <span className="uppercase tracking-wide">Fullpledge</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ── NEW MEMBER: Onboarding Payment ── */}
          {!isEdit && !isOldMember && breakdown && (
            <div className="sm:col-span-2 mt-2">
              <div className="p-4 rounded-xl border bg-green-50/40 border-green-100">
                <div className="flex items-center gap-2 mb-3 text-green-800">
                  <DollarSign size={16} />
                  <h4 className="text-sm font-semibold">Onboarding Payment Option</h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select
                    label="Payment Option"
                    options={PAYMENT_OPTION_OPTIONS}
                    {...register('payment_option')}
                  />
                  {paymentOption !== 'none' && (
                    <Input label="Payment Date" type="date" {...register('payment_date')} />
                  )}
                </div>

                {/* Per-item paid inputs — always shown regardless of payment option */}
                {breakdown.items && (() => {
                  const isDisabled = paymentOption !== 'partial';
                  const hasGroups  = breakdown.items.some(i => i.group);
                  const groups     = hasGroups ? [...new Set(breakdown.items.map(i => i.group))] : [null];

                  return (
                    <div className="mt-4 space-y-4">
                      {groups.map(grp => {
                        const grpItems = grp
                          ? breakdown.items.filter(i => i.group === grp)
                          : breakdown.items;
                        return (
                          <div key={grp || 'flat'}>
                            {grp && (
                              <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">{grp}</p>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              {grpItems.map(item => {
                                const paid      = itemPaidMap[item.key] || 0;
                                const remaining = Math.max(0, item.amount - paid);
                                const isFull    = paid >= item.amount && item.amount > 0;
                                return (
                                  <div key={item.key} className="relative">
                                    <Input
                                      label={`${item.label} (₱${item.amount.toLocaleString()})`}
                                      type="number" step="0.01" min="0"
                                      placeholder="0.00"
                                      disabled={isDisabled}
                                      {...register(`paid_${item.key}`)}
                                    />
                                    <p className={`text-xs mt-0.5 ${isFull ? 'text-emerald-600 font-medium' : 'text-gray-400'}`}>
                                      {isFull ? '✓ Fully paid' : `Remaining: ₱${remaining.toLocaleString()}`}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}

                      {/* Total paid summary */}
                      <div className="p-3 rounded-lg bg-white border border-green-100 text-sm flex justify-between font-semibold">
                        <span>Total Paid Now</span>
                        <span className={totalPaidSoFar > 0 ? 'text-emerald-700' : 'text-gray-400'}>
                          ₱{totalPaidSoFar.toLocaleString()}
                          <span className="font-normal text-gray-400 ml-1">/ ₱{total.toLocaleString()}</span>
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* SI#, mode, reference — only when there is an actual payment */}
                {paymentOption !== 'none' && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                      <Input label="SI#" placeholder="Enter SI# manually" {...register('invoice_no')} />
                      <Select label="Mode of Payment" options={PAYMENT_MODE_OPTIONS} {...register('payment_mode')} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                      <Input
                        label="Reference / Account / Check No."
                        placeholder="Optional for Cash, required for GCash/Bank/Check"
                        {...register('payment_reference')}
                      />
                      <Input label="Payment Notes" placeholder="Optional notes" {...register('payment_notes')} />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── OLD MEMBER: Historical Account Balances ── */}
          {!isEdit && isOldMember && (
            <div className="sm:col-span-2 mt-2 space-y-4">
              {/* CBU & Savings historical balances */}
              <div className="p-4 rounded-xl border bg-amber-50/30 border-amber-100">
                <h4 className="text-sm font-semibold text-amber-800 mb-1">
                  Historical Account Balances
                  <span className="ml-2 text-xs font-normal text-amber-600">(Optional)</span>
                </h4>
                <p className="text-xs text-amber-700 mb-4">
                  Enter the member's existing account balances from your records. These will be set directly — no transaction will be recorded since these pre-date the system.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="CBU Account No."
                    placeholder="Enter CBU account number"
                    {...register('cbu_account_no')}
                  />
                  <Input
                    label="CBU Balance"
                    type="number" step="0.01" min="0"
                    placeholder="0.00"
                    {...register('old_cbu_balance')}
                  />
                  <Input
                    label="Savings Account No."
                    placeholder="Enter Savings account number"
                    {...register('savings_account_no')}
                  />
                  <Input
                    label="Savings Balance"
                    type="number" step="0.01" min="0"
                    placeholder="0.00"
                    {...register('old_savings_balance')}
                  />
                </div>
              </div>

              {/* Time Deposit toggle */}
              <div className="p-4 rounded-xl border bg-violet-50/30 border-violet-100">
                <label className="flex items-center gap-3 cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-violet-600"
                    {...register('has_time_deposit')}
                  />
                  <span className="text-sm font-semibold text-violet-800">
                    This member had a Time Deposit
                  </span>
                </label>

                {hasTimeDep && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                    <Input
                      label="Date Applied *"
                      type="date"
                      {...register('td_date_applied')}
                    />
                    <Input
                      label="Terms (months) *"
                      type="number" min="1"
                      placeholder="e.g. 12"
                      {...register('td_terms')}
                    />
                    <Input
                      label="Amount *"
                      type="number" step="0.01" min="0.01"
                      placeholder="0.00"
                      {...register('td_amount')}
                    />
                    <Input
                      label="Interest Rate (%) *"
                      type="number" step="0.01" min="0"
                      placeholder="e.g. 5.00"
                      {...register('td_interest_rate')}
                    />
                    <Input
                      label="Termination / Maturity Date"
                      type="date"
                      {...register('td_termination_date')}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Account Details (new member edit / new member create) ── */}
          {(isEdit || !isOldMember) && (
            <div className="sm:col-span-2 mt-2">
              <div className="p-4 rounded-xl border bg-purple-50/40 border-purple-100">
                <h4 className="text-sm font-semibold text-purple-800 mb-3">Account Details</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="CBU Account No."
                    placeholder="Enter CBU account number"
                    {...register('cbu_account_no')}
                  />
                  <Input
                    label="Savings Account No."
                    placeholder="Enter Savings account number"
                    {...register('savings_account_no')}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              rows={3}
              placeholder="Optional notes..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              {...register('notes')}
            />
          </div>
        </div>
      </section>

      <div className="flex items-center justify-end gap-3 pt-2 sticky bottom-0 bg-white">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (inModal) onClose?.();
            else navigate('/members');
          }}
        >
          Cancel
        </Button>
        <Button type="submit" loading={loading} disabled={isEdit && !isDirty} icon={<Save size={15} />}>
          {isEdit ? 'Save Changes' : isOldMember ? 'Save Historical Record' : 'Add Member'}
        </Button>
      </div>
    </form>
  );

  if (inModal) {
    return <div className="max-h-[78vh] overflow-y-auto pr-1">{content}</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <button
        onClick={() => navigate('/members')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Members
      </button>

      <PageHeader
        title={isEdit ? 'Edit Member' : 'Add New Member'}
        subtitle={isEdit ? 'Update member registration information' : 'Register a new cooperative member'}
      />

      <div className="mt-6 space-y-6">{content}</div>
    </div>
  );
}

export default function MemberFormPage() {
  return <MemberFormContent />;
}