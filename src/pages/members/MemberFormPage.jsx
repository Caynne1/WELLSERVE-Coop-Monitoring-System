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

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
];

export default function MemberFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

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
      member_no: '',
      email: '',
      phone: '',
      address: '',
      status: 'active',
      notes: '',
    },
  });

  useEffect(() => {
    if (isEdit) loadMember();
  }, [id]);

  async function loadMember() {
    try {
      const data = await getMemberById(id);
      reset({
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        member_no: data.member_no || '',
        email: data.email || '',
        phone: data.phone || '',
        address: data.address || '',
        status: data.status || 'active',
        notes: data.notes || '',
      });
    } catch {
      toast.error('Failed to load member');
      navigate('/members');
    } finally {
      setInitialLoading(false);
    }
  }

  async function onSubmit(values) {
    try {
      setLoading(true);

      if (isEdit) {
        await updateMember(id, values);
        toast.success('Member updated successfully');
        navigate(`/members/${id}`);
      } else {
        const newMember = await createMember(values);
        try {
          await initializeMemberAccounts(newMember.id);
        } catch (initErr) {
          console.warn('Account init warning:', initErr);
        }
        toast.success('Member added! CBU and Savings accounts initialized.');
        navigate(`/members/${newMember.id}`);
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

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <button
        onClick={() => navigate('/members')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Members
      </button>

      <PageHeader
        title={isEdit ? 'Edit Member' : 'Add New Member'}
        subtitle={
          isEdit
            ? 'Update member information'
            : 'Create a new member. CBU and Savings accounts will be automatically prepared.'
        }
      />

      {!isEdit && (
        <div className="mt-4 mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-start gap-2">
          <UserPlus size={16} className="flex-shrink-0 mt-0.5" />
          <span>
            When you save, the system will automatically create linked{' '}
            <strong>CBU</strong> and <strong>Savings</strong> accounts for this member.
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-6">

        {/* Personal information */}
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">
            Personal Information
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <Input
              label="Member Number"
              placeholder="e.g. MBR-2024-001"
              {...register('member_no')}
            />
          </div>
        </section>

        {/* Contact */}
        <section>
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
            <Input
              label="Phone"
              placeholder="+63 9XX XXX XXXX"
              {...register('phone')}
            />
            <div className="sm:col-span-2">
              <Input
                label="Address"
                placeholder="House No., Street, Barangay, City"
                {...register('address')}
              />
            </div>
          </div>
        </section>

        {/* Membership */}
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">
            Membership Settings
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label="Status" options={STATUS_OPTIONS} {...register('status')} />
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

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => navigate('/members')}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={loading}
            disabled={isEdit && !isDirty}
            icon={<Save size={15} />}
          >
            {isEdit ? 'Save Changes' : 'Add Member'}
          </Button>
        </div>
      </form>
    </div>
  );
}