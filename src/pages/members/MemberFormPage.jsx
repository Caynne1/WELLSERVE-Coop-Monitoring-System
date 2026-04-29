import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Save, UserPlus, DollarSign } from 'lucide-react';
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
  { value: 'regular', label: 'Regular' },
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

const MEMBERSHIP_BREAKDOWN = {
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
      payment_option: 'none',
      membership_paid: '',
      cbu_paid: '',
      savings_paid: '',
      payment_date: '',
      invoice_no: '',
      payment_mode: '',
      payment_reference: '',
      payment_notes: '',
      cbu_account_no: '',
      savings_account_no: '',
    },
  });

  const membershipType = watch('membership_type');
  const paymentOption = watch('payment_option');
  const paymentMode = watch('payment_mode');
  const paymentReference = watch('payment_reference');
  const membershipPaid = parseFloat(watch('membership_paid')) || 0;
  const cbuPaid = parseFloat(watch('cbu_paid')) || 0;
  const savingsPaid = parseFloat(watch('savings_paid')) || 0;

  const breakdown = MEMBERSHIP_BREAKDOWN[membershipType];
  const total =
    (breakdown?.membership_fee || 0) +
    (breakdown?.cbu || 0) +
    (breakdown?.savings || 0);

  const referenceRequired = ['GCash', 'Bank Transfer', 'Check'].includes(paymentMode);

  useEffect(() => {
    if (isEdit) loadMember();
  }, [memberId]);

  useEffect(() => {
    if (!breakdown || isEdit) return;

    if (paymentOption === 'full') {
      setValue('membership_paid', String(breakdown.membership_fee));
      setValue('cbu_paid', String(breakdown.cbu));
      setValue('savings_paid', String(breakdown.savings));
      if (!watch('payment_date')) {
        setValue('payment_date', new Date().toISOString().split('T')[0]);
      }
    }

    if (paymentOption === 'none') {
      setValue('membership_paid', '');
      setValue('cbu_paid', '');
      setValue('savings_paid', '');
      setValue('invoice_no', '');
      setValue('payment_mode', '');
      setValue('payment_reference', '');
      setValue('payment_notes', '');
    }
  }, [paymentOption, membershipType, isEdit, breakdown, setValue, watch]);

  async function loadMember() {
    try {
      const data = await getMemberById(memberId);
      const accounts = await getAccountsByMemberId(memberId);

      const cbu = (accounts || []).find(a => String(a.account_type).toLowerCase() === 'cbu');
      const savings = (accounts || []).find(a => String(a.account_type).toLowerCase() === 'savings');

      reset({
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
        membership_paid: '',
        cbu_paid: '',
        savings_paid: '',
        payment_date: '',
        invoice_no: '',
        payment_mode: '',
        payment_reference: '',
        payment_notes: '',
        cbu_account_no: cbu?.account_no || '',
        savings_account_no: savings?.account_no || '',
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
      };

      if (isEdit) {
        await updateMember(memberId, payload);

        const existingAccounts = await getAccountsByMemberId(memberId);
        const cbuAccount = (existingAccounts || []).find(a => String(a.account_type).toLowerCase() === 'cbu');
        const savingsAccount = (existingAccounts || []).find(a => String(a.account_type).toLowerCase() === 'savings');

        if (cbuAccount) {
          await updateAccount(cbuAccount.id, {
            account_no: values.cbu_account_no || null,
          });
        }

        if (savingsAccount) {
          await updateAccount(savingsAccount.id, {
            account_no: values.savings_account_no || null,
          });
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

      const selectedBreakdown = MEMBERSHIP_BREAKDOWN[values.membership_type];
      const paymentDate = values.payment_date || new Date().toISOString().split('T')[0];

      let postedMembershipPaid = 0;
      let postedCbuPaid = 0;
      let postedSavingsPaid = 0;

      if (values.payment_option === 'full') {
        postedMembershipPaid = selectedBreakdown.membership_fee;
        postedCbuPaid = selectedBreakdown.cbu;
        postedSavingsPaid = selectedBreakdown.savings;
      } else if (values.payment_option === 'partial') {
        postedMembershipPaid = parseFloat(values.membership_paid) || 0;
        postedCbuPaid = parseFloat(values.cbu_paid) || 0;
        postedSavingsPaid = parseFloat(values.savings_paid) || 0;
      }

      if (postedMembershipPaid < 0 || postedCbuPaid < 0 || postedSavingsPaid < 0) {
        toast.error('Paid amounts cannot be negative.');
        return;
      }

      if (postedMembershipPaid > selectedBreakdown.membership_fee) {
        toast.error(`Membership payment cannot exceed ₱${selectedBreakdown.membership_fee.toLocaleString()}.`);
        return;
      }

      if (postedCbuPaid > selectedBreakdown.cbu) {
        toast.error(`Initial CBU payment cannot exceed ₱${selectedBreakdown.cbu.toLocaleString()}.`);
        return;
      }

      if (postedSavingsPaid > selectedBreakdown.savings) {
        toast.error(`Initial Savings payment cannot exceed ₱${selectedBreakdown.savings.toLocaleString()}.`);
        return;
      }

      const totalPaid = postedMembershipPaid + postedCbuPaid + postedSavingsPaid;

      if (values.payment_option !== 'none' && totalPaid <= 0) {
        toast.error('Enter at least one onboarding payment amount.');
        return;
      }

      if (totalPaid > 0) {
        if (!paymentDate) {
          toast.error('Payment date is required.');
          return;
        }

        if (!values.invoice_no?.trim()) {
          toast.error('SI# is required when there is onboarding payment.');
          return;
        }

        if (!values.payment_mode) {
          toast.error('Mode of payment is required when there is onboarding payment.');
          return;
        }

        if (referenceRequired && !values.payment_reference?.trim()) {
          toast.error('Reference / Account / Check No. is required for the selected payment mode.');
          return;
        }
      }

      const newMember = await createMember(payload);
      const newMemberId = newMember.id;
      const memberName = `${newMember.first_name || ''} ${newMember.last_name || ''}`.trim();

      await initializeMemberAccounts(newMemberId);

      const accounts = await getAccountsByMemberId(newMemberId);
      const cbuAccount = (accounts || []).find(a => String(a.account_type).toLowerCase() === 'cbu');
      const savingsAccount = (accounts || []).find(a => String(a.account_type).toLowerCase() === 'savings');

      if (cbuAccount && values.cbu_account_no) {
        await updateAccount(cbuAccount.id, {
          account_no: values.cbu_account_no,
        });
      }

      if (savingsAccount && values.savings_account_no) {
        await updateAccount(savingsAccount.id, {
          account_no: values.savings_account_no,
        });
      }

      const refreshedAccounts = await getAccountsByMemberId(newMemberId);
      const refreshedCbuAccount = (refreshedAccounts || []).find(a => String(a.account_type).toLowerCase() === 'cbu');
      const refreshedSavingsAccount = (refreshedAccounts || []).find(a => String(a.account_type).toLowerCase() === 'savings');

      const paymentModeNote =
        [values.payment_reference?.trim(), values.payment_notes?.trim()].filter(Boolean).join(' | ') || null;

      const membershipRecord = await createMembership({
        member_id: newMemberId,
        membership_type: values.membership_type,
        fee_required: selectedBreakdown.membership_fee,
        fee_paid_now: postedMembershipPaid,
        created_by: user.id,
      });

      if (postedMembershipPaid > 0) {
        await createTransaction({
          member_id: newMemberId,
          category: 'membership',
          type: 'membership_payment',
          amount: postedMembershipPaid,
          reference: values.payment_reference?.trim() || null,
          notes: values.payment_notes?.trim() || 'Membership initial payment',
          created_by: user.id,
          transaction_date: paymentDate,
          payment_mode: values.payment_mode,
          payment_mode_note: paymentModeNote,
        });
      }

      if (postedCbuPaid > 0) {
        if (!refreshedCbuAccount) throw new Error('CBU account not found after member initialization.');

        await createTransaction({
          member_id: newMemberId,
          account_id: refreshedCbuAccount.id,
          category: 'cbu',
          type: 'deposit',
          amount: postedCbuPaid,
          reference: values.payment_reference?.trim() || refreshedCbuAccount.account_no || null,
          notes: values.payment_notes?.trim() || 'Initial CBU deposit',
          created_by: user.id,
          transaction_date: paymentDate,
          payment_mode: values.payment_mode,
          payment_mode_note: paymentModeNote,
        });
      }

      if (postedSavingsPaid > 0) {
        if (!refreshedSavingsAccount) throw new Error('Savings account not found after member initialization.');

        await createTransaction({
          member_id: newMemberId,
          account_id: refreshedSavingsAccount.id,
          category: 'savings',
          type: 'deposit',
          amount: postedSavingsPaid,
          reference: values.payment_reference?.trim() || refreshedSavingsAccount.account_no || null,
          notes: values.payment_notes?.trim() || 'Initial savings deposit',
          created_by: user.id,
          transaction_date: paymentDate,
          payment_mode: values.payment_mode,
          payment_mode_note: paymentModeNote,
        });
      }

      if (totalPaid > 0) {
        const invoiceBreakdown = [];
        if (postedMembershipPaid > 0) invoiceBreakdown.push(`Membership: ${formatCurrency(postedMembershipPaid)}`);
        if (postedCbuPaid > 0) invoiceBreakdown.push(`CBU: ${formatCurrency(postedCbuPaid)}`);
        if (postedSavingsPaid > 0) invoiceBreakdown.push(`Savings: ${formatCurrency(postedSavingsPaid)}`);

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
      {!isEdit && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-start gap-2">
          <UserPlus size={16} className="flex-shrink-0 mt-0.5" />
          <span>
            You may register a member only, or register and post initial onboarding payments at the same time.
          </span>
        </div>
      )}

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
          <Input label="Date Joined" type="date" {...register('date_joined')} />
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
        </div>
      </section>

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
              pattern: {
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: 'Invalid email',
              },
            })}
          />
          <Input label="Mobile No." placeholder="+63 9XX XXX XXXX" {...register('phone')} />
          <Input label="Res. Tel. No." {...register('res_tel_no')} />

          <Input
            label="Inviter / Recruiter"
            placeholder="Leave blank for Self"
            {...register('recruiter_name')}
          />

          <Select label="Status" options={STATUS_OPTIONS} {...register('status')} />

          <Select
            label="Membership Type"
            options={MEMBERSHIP_TYPE_OPTIONS}
            {...register('membership_type', { required: 'Membership type is required' })}
          />

          {breakdown && (
            <div className="sm:col-span-2 mt-2">
              <div className="p-4 rounded-xl border bg-blue-50/40 border-blue-100">
                <h4 className="text-sm font-semibold text-blue-800 mb-3">
                  Membership Breakdown
                </h4>

                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Membership Entry</span>
                    <span>₱{breakdown.membership_fee.toLocaleString()}</span>
                  </div>

                  <div className="flex justify-between">
                    <span>Initial CBU</span>
                    <span>₱{breakdown.cbu.toLocaleString()}</span>
                  </div>

                  <div className="flex justify-between">
                    <span>Initial Savings</span>
                    <span>₱{breakdown.savings.toLocaleString()}</span>
                  </div>

                  <div className="border-t my-2 border-blue-100"></div>

                  <div className="flex justify-between font-semibold text-base text-blue-900">
                    <span>Total Amount</span>
                    <span>₱{total.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!isEdit && breakdown && (
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
                    <Input
                      label="Payment Date"
                      type="date"
                      {...register('payment_date')}
                    />
                  )}
                </div>

                {paymentOption !== 'none' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                    <Input
                      label={`Membership Entry Paid (max ₱${breakdown.membership_fee.toLocaleString()})`}
                      type="number"
                      step="0.01"
                      min="0"
                      disabled={paymentOption === 'full'}
                      {...register('membership_paid')}
                    />

                    <Input
                      label={`Initial CBU Paid (max ₱${breakdown.cbu.toLocaleString()})`}
                      type="number"
                      step="0.01"
                      min="0"
                      disabled={paymentOption === 'full'}
                      {...register('cbu_paid')}
                    />

                    <Input
                      label={`Initial Savings Paid (max ₱${breakdown.savings.toLocaleString()})`}
                      type="number"
                      step="0.01"
                      min="0"
                      disabled={paymentOption === 'full'}
                      {...register('savings_paid')}
                    />
                  </div>
                )}

                {paymentOption !== 'none' && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                      <Input
                        label="SI#"
                        placeholder="Enter SI# manually"
                        {...register('invoice_no')}
                      />

                      <Select
                        label="Mode of Payment"
                        options={PAYMENT_MODE_OPTIONS}
                        {...register('payment_mode')}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                      <Input
                        label="Reference / Account / Check No."
                        placeholder="Optional for Cash, required for GCash/Bank/Check"
                        {...register('payment_reference')}
                      />

                      <Input
                        label="Payment Notes"
                        placeholder="Optional notes"
                        {...register('payment_notes')}
                      />
                    </div>
                  </>
                )}

                {paymentOption !== 'none' && (
                  <div className="mt-4 p-3 rounded-lg bg-white border border-green-100 text-sm">
                    <div className="flex justify-between">
                      <span>Membership Remaining</span>
                      <span>₱{Math.max(0, breakdown.membership_fee - membershipPaid).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span>CBU Remaining</span>
                      <span>₱{Math.max(0, breakdown.cbu - cbuPaid).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span>Savings Remaining</span>
                      <span>₱{Math.max(0, breakdown.savings - savingsPaid).toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="sm:col-span-2 mt-2">
            <div className="p-4 rounded-xl border bg-purple-50/40 border-purple-100">
              <h4 className="text-sm font-semibold text-purple-800 mb-3">
                Account Details
              </h4>

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

          <div className="sm:col-span-2">
            <Input
              label="Complete Address"
              placeholder="House No., Street, Barangay, City"
              {...register('address')}
            />
          </div>

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
          {isEdit ? 'Save Changes' : 'Add Member'}
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