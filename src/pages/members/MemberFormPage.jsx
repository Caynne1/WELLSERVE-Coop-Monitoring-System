import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Save, UserPlus } from 'lucide-react';
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

import { useAuth } from '../../context/AuthContext';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
];

const MEMBERSHIP_TYPE_OPTIONS = [
  { value: 'associate', label: 'Associate' },
  { value: 'regular', label: 'Regular' },
];

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
      status: 'active',
      membership_type: 'associate',
      notes: '',
      date_joined: '',
    },
  });

  useEffect(() => {
    if (isEdit) loadMember();
  }, [memberId]);

  async function loadMember() {
    try {
      const data = await getMemberById(memberId);
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
        status: data.status || 'active',
        membership_type: data.membership_type || 'associate',
        notes: data.notes || '',
        date_joined: data.date_joined || '',
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
        ...values,
        date_joined: values.date_joined || new Date().toISOString().split('T')[0],
      };

      if (isEdit) {
        await updateMember(memberId, payload);
        toast.success('Member updated successfully');

        if (inModal) {
          onUpdated?.(memberId);
          onClose?.();
        } else {
          navigate(`/members/${memberId}`);
        }
        return;
      }

      const newMember = await createMember(payload);
      const newMemberId = newMember.id;

      try {
        await initializeMemberAccounts(newMemberId);
      } catch (initErr) {
        console.warn('[MemberFormPage] Account init warning:', initErr);
      }

      toast.success('Member added successfully.');

      if (inModal) {
        onCreated?.(newMemberId);
        onClose?.();
      } else {
        navigate(`/members/${newMemberId}`);
      }
    } catch (err) {
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
            This page is for <strong>member registration only</strong>. Financial onboarding and membership fee setup are handled in the Loan Page.
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

          <Select label="Status" options={STATUS_OPTIONS} {...register('status')} />

          <Select
            label="Membership Type"
            options={MEMBERSHIP_TYPE_OPTIONS}
            {...register('membership_type', { required: 'Membership type is required' })}
          />

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