import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import {
  ArrowLeft,
  Save,
  Calculator,
  FileSpreadsheet,
  Eye,
} from 'lucide-react';
import toast from 'react-hot-toast';

import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Spinner from '../../components/ui/Spinner';
import MemberSearchInput from '../../components/shared/MemberSearchInput';

import { createLoan, updateLoan, getLoanById } from '../../services/loanService';
import { trackActivity } from '../../services/logService';
import { createTransaction } from '../../services/transactionService';
import { createInvoiceForPayment } from '../../services/invoiceService';
import { getAccountsByMemberId } from '../../services/accountService';
import {
  getMemberById,
  updateMember,
} from '../../services/memberService';
import { useAuth } from '../../context/AuthContext';
import {
  generateLoanPreview,
  frequencyDisplayLabel,
} from '../../utils/loanCalculator';
import { formatCurrency, formatDate } from '../../utils/formatters';

const STATUS_OPTS = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'defaulted', label: 'Defaulted' },
];

const FREQUENCY_OPTS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'semi_monthly', label: 'Quencena (Semi-Monthly)' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'chattel', label: 'Chattel' },
];

const LOAN_METHOD_OPTS = [
  { value: 'diminishing', label: 'Diminishing' },
  { value: 'straight', label: 'Straight' },
];

// WELLSERVE loan products — per the approved loan products sheet.
// Selecting a product auto-fills the interest rate & method below;
// the encoder can still override them manually if a special case requires it.
const LOAN_PRODUCTS = [
  { value: '',                       label: 'Select loan product...' },
  { value: 'beneficial_straight',    label: 'Beneficial Loan — 2.5% Straight (CBU-Based)',                     rate: '2.5', method: 'straight' },
  { value: 'beneficial_diminishing', label: 'Beneficial Loan — 3.0% Diminishing (CBU-Based)',                  rate: '3.0', method: 'diminishing' },
  { value: 'productive',             label: 'WELLife Productive Loan — 2.5% Straight (Business, w/ Co-Maker)', rate: '2.5', method: 'straight' },
  { value: 'providential',           label: 'Providential Loan — 3.0% (HMO & Memorial Plans, w/ Co-Maker)',    rate: '3.0', method: 'diminishing' },
  { value: 'financing',              label: 'Financing Loan — 3.0% (Motorcycle/Gadgets/Appliances, w/ Co-Maker)', rate: '3.0', method: 'diminishing' },
  { value: 'custom',                 label: 'Custom / Other (set rate & method manually)' },
];

const LOAN_PRODUCT_MAP = Object.fromEntries(LOAN_PRODUCTS.map(p => [p.value, p]));

const PAYMENT_MODE_OPTS = [
  { value: '',              label: 'Select mode of payment' },
  { value: 'Cash',          label: 'Cash' },
  { value: 'GCash',         label: 'GCash' },
  { value: 'Bank Transfer', label: 'Bank Transfer' },
  { value: 'Check',         label: 'Check' },
  { value: 'Others',        label: 'Others' },
];

const emptyMemberProfile = {
  first_name: '',
  last_name: '',
  middle_initial: '',
  member_no: '',
  address: '',
  civil_status: '',
  sex: '',
  date_of_birth: '',
  res_tel_no: '',
  occupation: '',
  tin_no: '',
  sss_id_no: '',
  phone: '',
  recruiter_name: 'Self',
};

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export default function LoanFormPage() {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEdit);
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberProfile, setMemberProfile] = useState(emptyMemberProfile);
  const [memberAccounts, setMemberAccounts] = useState({
    cbuAccountNo: '',
    savingsAccountNo: '',
    cbuAccountId: '',
    savingsAccountId: '',
  });
  const [previewReady, setPreviewReady] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    getValues,
    formState: { errors },
  } = useForm({
    defaultValues: {
      member_id: '',
      loan_product: '',
      amount: '',
      interest_rate: '2.5',
      term_months: '',
      monthly_amortization: '',
      release_date: '',
      status: 'active',
      purpose: '',
      notes: '',
      repayment_frequency: 'weekly',
      loan_method: 'diminishing',

      loan_proposal: '',
      service_fee: '',
      loan_insurance: '',
      regular_savings: '',
      total_loan_payable: '',

      service_fee_percent: '2',
      cbu_retention_percent: '2.5',
      notarial_fee: '200',
      insurance_manual_amount: '',

      cbu_per_period: '25',
      savings_per_period: '25',
    },
  });

  const watchedAmount = useWatch({ control, name: 'amount' });
  const watchedProduct = useWatch({ control, name: 'loan_product' });
  const watchedRate = useWatch({ control, name: 'interest_rate' });
  const watchedTerm = useWatch({ control, name: 'term_months' });
  const watchedFrequency = useWatch({ control, name: 'repayment_frequency' });
  const watchedMethod = useWatch({ control, name: 'loan_method' });
  const watchedReleaseDate = useWatch({ control, name: 'release_date' });

  const watchedProposal = useWatch({ control, name: 'loan_proposal' });
  const watchedServiceFeePercent = useWatch({ control, name: 'service_fee_percent' });
  const watchedCbuRetentionPercent = useWatch({ control, name: 'cbu_retention_percent' });
  const watchedNotarialFee = useWatch({ control, name: 'notarial_fee' });
  const watchedInsuranceManualAmount = useWatch({ control, name: 'insurance_manual_amount' });

  const watchedCbuPerPeriod = useWatch({ control, name: 'cbu_per_period' });
  const watchedSavingsPerPeriod = useWatch({ control, name: 'savings_per_period' });

  const preview = useMemo(() => {
    const amount = parseFloat(watchedAmount || 0);
    const termMonths = parseInt(watchedTerm || 0, 10);
    const monthlyInterestRate = parseFloat(watchedRate || 0);

    if (amount <= 0 || termMonths <= 0 || monthlyInterestRate < 0) {
      return null;
    }

    return generateLoanPreview({
      amount,
      termMonths,
      monthlyInterestRate,
      paymentFrequency: watchedFrequency || 'weekly',
      loanMethod: watchedMethod || 'diminishing',
      startDate: watchedReleaseDate || new Date(),
      cbuPerPeriod: parseFloat(watchedCbuPerPeriod || 25) || 0,
      savingsPerPeriod: parseFloat(watchedSavingsPerPeriod || 25) || 0,
      serviceFeePercent: parseFloat(watchedServiceFeePercent || 2) || 0,
      cbuRetentionPercent: parseFloat(watchedCbuRetentionPercent || 2.5) || 0,
      notarialFee: parseFloat(watchedNotarialFee || 200) || 0,
      insuranceMode: 'manual',
      insuranceAmount: parseFloat(watchedInsuranceManualAmount || 0) || 0,
      insuranceFixedRatePercent: 0,
    });
  }, [
    watchedAmount,
    watchedTerm,
    watchedRate,
    watchedFrequency,
    watchedMethod,
    watchedReleaseDate,
    watchedCbuPerPeriod,
    watchedSavingsPerPeriod,
    watchedServiceFeePercent,
    watchedCbuRetentionPercent,
    watchedNotarialFee,
    watchedInsuranceManualAmount,
  ]);

  // Auto-fill interest rate & method when a loan product is selected.
  useEffect(() => {
    if (!watchedProduct || watchedProduct === 'custom') return;
    const cfg = LOAN_PRODUCT_MAP[watchedProduct];
    if (!cfg) return;
    setValue('interest_rate', cfg.rate);
    setValue('loan_method', cfg.method);
    setPreviewReady(false);
  }, [watchedProduct, setValue]);

  useEffect(() => {
    const proposal = parseFloat(watchedProposal || watchedAmount || 0) || 0;
    const serviceFee = proposal * ((parseFloat(watchedServiceFeePercent || 2) || 0) / 100);
    setValue('service_fee', serviceFee ? round2(serviceFee).toFixed(2) : '');

    setPreviewReady(false);
  }, [
    watchedProposal,
    watchedAmount,
    watchedServiceFeePercent,
    watchedRate,
    watchedTerm,
    watchedFrequency,
    watchedMethod,
    watchedReleaseDate,
    watchedInsuranceManualAmount,
    watchedCbuPerPeriod,
    watchedSavingsPerPeriod,
    watchedCbuRetentionPercent,
    watchedNotarialFee,
    setValue,
  ]);

  useEffect(() => {
    if (!preview) {
      setValue('monthly_amortization', '');
      setValue('total_loan_payable', '');
      setValue('loan_insurance', '');
      return;
    }

    setValue('monthly_amortization', String(round2(preview.summary.payment_per_period)));
    setValue('total_loan_payable', String(round2(preview.summary.total_payments_collected)));
    setValue('loan_insurance', String(round2(preview.deductions.insurance)));
  }, [preview, setValue]);

  useEffect(() => {
    async function bootstrapCreate() {
      const memberId = searchParams.get('member');
      if (!memberId || isEdit) return;

      try {
        const member = await getMemberById(memberId);
        await applySelectedMember(member);
      } catch {
        // silent
      }
    }

    async function bootstrapEdit() {
      try {
        const data = await getLoanById(id);

        reset({
          member_id: data.member_id,
          amount: data.amount || '',
          interest_rate: data.interest_rate || '2.5',
          term_months: data.term_months || '',
          monthly_amortization: data.monthly_amortization || '',
          release_date: data.release_date?.split('T')[0] || '',
          status: data.status || 'active',
          purpose: data.purpose || '',
          notes: data.notes || '',
          repayment_frequency: data.repayment_frequency || 'weekly',
          loan_method: data.loan_method || 'diminishing',

          loan_proposal: data.loan_proposal || data.amount || '',
          service_fee: data.service_fee || '',
          loan_insurance: data.loan_insurance || '',
          regular_savings: data.regular_savings || '',
          total_loan_payable: data.total_loan_payable || '',

          service_fee_percent: data.service_fee_percent || '2',
          cbu_retention_percent: data.cbu_retention_percent || '2.5',
          notarial_fee: data.notarial_fee || '200',
          insurance_manual_amount: data.insurance_manual_amount || data.loan_insurance || '',
          cbu_per_period: data.cbu_per_period || '25',
          savings_per_period: data.savings_per_period || '25',
        });

        if (data.members) {
          await applySelectedMember(data.members);
        } else if (data.member_id) {
          const member = await getMemberById(data.member_id);
          await applySelectedMember(member);
        }
      } catch {
        navigate('/loans');
      } finally {
        setInitialLoading(false);
      }
    }

    if (isEdit) {
      bootstrapEdit();
    } else {
      bootstrapCreate().finally(() => setInitialLoading(false));
    }
  }, [id, isEdit, navigate, reset, searchParams]);

  async function applySelectedMember(member) {
    setSelectedMember(member);
    setValue('member_id', member.id);

    setMemberProfile({
      first_name: member.first_name || '',
      last_name: member.last_name || '',
      middle_initial: member.middle_initial || '',
      member_no: member.member_no || '',
      address: member.address || '',
      civil_status: member.civil_status || '',
      sex: member.sex || '',
      date_of_birth: member.date_of_birth || '',
      res_tel_no: member.res_tel_no || '',
      occupation: member.occupation || '',
      tin_no: member.tin_no || '',
      sss_id_no: member.sss_id_no || '',
      phone: member.phone || '',
      recruiter_name: member.recruiter_name || 'Self',
    });

    try {
      const accounts = await getAccountsByMemberId(member.id);
      const cbuAccount = (accounts || []).find(a => String(a.account_type).toLowerCase() === 'cbu');
      const savingsAccount = (accounts || []).find(a => String(a.account_type).toLowerCase() === 'savings');

      setMemberAccounts({
        cbuAccountNo: cbuAccount?.account_no || '',
        savingsAccountNo: savingsAccount?.account_no || '',
        cbuAccountId: cbuAccount?.id || '',
        savingsAccountId: savingsAccount?.id || '',
      });
    } catch {
      setMemberAccounts({
        cbuAccountNo: '',
        savingsAccountNo: '',
        cbuAccountId: '',
        savingsAccountId: '',
      });
    }
  }

  function handleMemberProfileChange(field, value) {
    setMemberProfile(prev => ({ ...prev, [field]: value }));
  }

  function handlePreview() {
    const values = getValues();

    if (!values.member_id) {
      toast.error('Please select a member first.');
      return;
    }

    const amount = parseFloat(values.amount || 0);
    const termMonths = parseInt(values.term_months || 0, 10);
    const monthlyInterestRate = parseFloat(values.interest_rate || 0);

    if (amount <= 0) {
      toast.error('Loan amount must be greater than zero.');
      return;
    }

    if (termMonths <= 0) {
      toast.error('Term months must be greater than zero.');
      return;
    }

    if (monthlyInterestRate < 0) {
      toast.error('Interest rate cannot be negative.');
      return;
    }

    if (!preview) {
      toast.error('Unable to generate preview.');
      return;
    }

    setPreviewReady(true);
    toast.success('Loan preview generated.');
  }

  async function onSubmit(values) {
    if (!values.member_id) {
      toast.error('Please select a member');
      return;
    }

    if (!previewReady || !preview) {
      toast.error('Please preview the loan schedule first before saving.');
      return;
    }

    setLoading(true);
    try {
      await updateMember(values.member_id, {
        middle_initial: memberProfile.middle_initial,
        address: memberProfile.address,
        civil_status: memberProfile.civil_status,
        sex: memberProfile.sex,
        date_of_birth: memberProfile.date_of_birth,
        res_tel_no: memberProfile.res_tel_no,
        occupation: memberProfile.occupation,
        tin_no: memberProfile.tin_no,
        sss_id_no: memberProfile.sss_id_no,
        phone: memberProfile.phone,
      });

      const principalAmount = parseFloat(values.amount || 0);
      const regularSavings = parseFloat(values.regular_savings || 0) || 0;

      const payload = {
        ...values,
        source: 'manual',
        amount: principalAmount,
        balance: principalAmount,
        monthly_amortization: round2(preview.summary?.payment_per_period || 0),
        total_loan_payable: round2(preview.summary?.total_payments_collected || 0),
        service_fee: round2(preview.deductions?.items?.find(d => d.label?.toLowerCase().includes('service'))?.amount
          || preview.deductions?.service_fee || 0),
        loan_insurance: round2(preview.deductions?.items?.find(d =>
          d.label?.toLowerCase().includes('protection') || d.label?.toLowerCase().includes('clpp'))?.amount
          || preview.deductions?.insurance || 0),
        loan_proposal: parseFloat(values.loan_proposal || principalAmount) || principalAmount,
        repayment_frequency: values.repayment_frequency,
        loan_method: values.loan_method,
        service_fee_percent: parseFloat(values.service_fee_percent || 2) || 0,
        cbu_retention_percent: parseFloat(values.cbu_retention_percent || 2.5) || 0,
        notarial_fee: parseFloat(values.notarial_fee || 200) || 0,
        insurance_mode: 'manual',
        insurance_fixed_rate_percent: 0,
        insurance_manual_amount: parseFloat(values.insurance_manual_amount || 0) || 0,
        cbu_per_period: parseFloat(values.cbu_per_period || 25) || 0,
        savings_per_period: parseFloat(values.savings_per_period || 25) || 0,
        preview_summary_json: JSON.stringify(preview.summary),
        preview_deductions_json: JSON.stringify(preview.deductions),
        preview_schedule_json: JSON.stringify(preview.schedule),
      };

      let loan;
      if (isEdit) {
        loan = await updateLoan(id, payload);

        const memberDisplayName = [
          selectedMember?.first_name,
          selectedMember?.last_name,
        ].filter(Boolean).join(' ') || 'Member';

        trackActivity({
          userId: user?.id,
          module: 'loan',
          action: 'update',
          description: `Updated loan for ${memberDisplayName} — Amount: ₱${principalAmount.toLocaleString()}`,
        });
      } else {
        loan = await createLoan(payload);

        const memberDisplayName = [
          selectedMember?.first_name,
          selectedMember?.last_name,
        ].filter(Boolean).join(' ') || 'Member';

        trackActivity({
          userId: user?.id,
          module: 'loan',
          action: 'create',
          description: `Created loan for ${memberDisplayName} — Amount: ₱${principalAmount.toLocaleString()}`,
        });

        await createTransaction({
          member_id: loan.member_id,
          loan_id: loan.id,
          category: 'loan',
          type: 'loan_release',
          amount: loan.amount,
          created_by: user?.id ?? null,
        });

        if (regularSavings > 0) {
          const savingsAccountId = memberAccounts.savingsAccountId;

          if (savingsAccountId) {
            await createTransaction({
              member_id: loan.member_id,
              account_id: savingsAccountId,
              category: 'savings',
              type: 'deposit',
              amount: regularSavings,
              created_by: user?.id ?? null,
            });

            try {
              await createInvoiceForPayment({
                payment_type: 'savings',
                member_id: loan.member_id,
                member_name: memberDisplayName,
                amount: regularSavings,
                purpose: 'Regular Savings Deposit',
                ref_id: savingsAccountId,
                account_id: savingsAccountId,
                created_by: user?.id ?? null,
              });
            } catch (e) {
              console.error('[LoanFormPage] savings invoice failed:', e);
            }
          }
        }
      }

      toast.success(isEdit ? 'Loan updated' : 'Loan created');
      navigate(`/loans/${loan.id}`);
    } catch (e) {
      toast.error(e.message || 'Failed to save loan');
    } finally {
      setLoading(false);
    }
  }

  if (initialLoading) {
    return <div className="flex justify-center py-24"><Spinner /></div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <button
        onClick={() => navigate('/loans')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors"
      >
        <ArrowLeft size={16} /> Back to Loans
      </button>

      <PageHeader
        title={isEdit ? 'Edit Loan' : 'New Loan'}
        subtitle={isEdit ? 'Update loan details and preview schedule before saving' : 'Create a loan with schedule preview and deduction breakdown'}
      />

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-6">
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">Member</h3>

          <input type="hidden" {...register('member_id', { required: true })} />

          <MemberSearchInput
            value={selectedMember}
            onChange={applySelectedMember}
            placeholder={
              selectedMember
                ? `${selectedMember.first_name} ${selectedMember.last_name}`
                : 'Search member...'
            }
          />

          {errors.member_id && (
            <p className="text-xs text-red-500 mt-1">Member is required</p>
          )}
        </section>

        {selectedMember && (
          <>
            <section className="bg-gray-50 border border-gray-100 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">
                Personal Information
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input label="First Name" value={memberProfile.first_name} readOnly />
                <Input label="Last Name" value={memberProfile.last_name} readOnly />
                <Input
                  label="M.I."
                  value={memberProfile.middle_initial}
                  onChange={e => handleMemberProfileChange('middle_initial', e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <Input
                  label="Complete Address"
                  value={memberProfile.address}
                  onChange={e => handleMemberProfileChange('address', e.target.value)}
                />
                <Select
                  label="Civil Status"
                  value={memberProfile.civil_status}
                  onChange={e => handleMemberProfileChange('civil_status', e.target.value)}
                  options={[
                    { value: '', label: 'Select status' },
                    { value: 'single', label: 'Single' },
                    { value: 'married', label: 'Married' },
                    { value: 'widowed', label: 'Widowed' },
                    { value: 'separated', label: 'Separated' },
                  ]}
                />
                <Select
                  label="Sex"
                  value={memberProfile.sex}
                  onChange={e => handleMemberProfileChange('sex', e.target.value)}
                  options={[
                    { value: '', label: 'Select sex' },
                    { value: 'male', label: 'Male' },
                    { value: 'female', label: 'Female' },
                  ]}
                />
                <Input
                  label="Date of Birth"
                  type="date"
                  value={memberProfile.date_of_birth || ''}
                  onChange={e => handleMemberProfileChange('date_of_birth', e.target.value)}
                />
                <Input
                  label="Res. Tel. No."
                  value={memberProfile.res_tel_no}
                  onChange={e => handleMemberProfileChange('res_tel_no', e.target.value)}
                />
                <Input
                  label="Occupation"
                  value={memberProfile.occupation}
                  onChange={e => handleMemberProfileChange('occupation', e.target.value)}
                />
                <Input
                  label="TIN No."
                  value={memberProfile.tin_no}
                  onChange={e => handleMemberProfileChange('tin_no', e.target.value)}
                />
                <Input
                  label="SSS ID No."
                  value={memberProfile.sss_id_no}
                  onChange={e => handleMemberProfileChange('sss_id_no', e.target.value)}
                />
                <Input
                  label="Mobile No."
                  value={memberProfile.phone}
                  onChange={e => handleMemberProfileChange('phone', e.target.value)}
                />
                <Input
                  label="Member No."
                  value={memberProfile.member_no}
                  readOnly
                />
              </div>
            </section>

            <section className="bg-gray-50 border border-gray-100 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">
                Linked Member Accounts
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="CBU Account No."
                  value={memberAccounts.cbuAccountNo || '—'}
                  readOnly
                />
                <Input
                  label="Savings Account No."
                  value={memberAccounts.savingsAccountNo || '—'}
                  readOnly
                />
              </div>
            </section>
          </>
        )}

        <section className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">
            Loan Details
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Select
              label="Loan Product"
              options={LOAN_PRODUCTS}
              {...register('loan_product')}
            />

            <Input
              label="Loan Amount"
              type="number"
              step="0.01"
              required
              error={errors.amount?.message}
              {...register('amount', {
                required: 'Amount is required',
                min: { value: 1, message: 'Must be > 0' },
              })}
            />

            <Input
              label="Monthly Interest Rate (%)"
              type="number"
              step="0.01"
              {...register('interest_rate')}
            />

            <Input
              label="Term (months)"
              type="number"
              {...register('term_months')}
            />

            <Input
              label="Release Date"
              type="date"
              {...register('release_date')}
            />

            <Select
              label="Payment Frequency"
              options={FREQUENCY_OPTS}
              {...register('repayment_frequency')}
            />

            <Select
              label="Loan Method"
              options={LOAN_METHOD_OPTS}
              {...register('loan_method')}
            />

            <Select
              label="Status"
              options={STATUS_OPTS}
              {...register('status')}
            />

            <Input
              label="Purpose"
              {...register('purpose')}
            />

            <Input
              label="Preview Payment / Period"
              readOnly
              value={preview ? formatCurrency(preview.summary.payment_per_period) : ''}
            />
          </div>

          <input type="hidden" {...register('monthly_amortization')} />

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              rows={3}
              placeholder="Optional notes..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              {...register('notes')}
            />
          </div>
        </section>

        <section className="bg-gray-50 border border-gray-100 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100">
            <FileSpreadsheet size={15} className="text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">Loan Deductions & Onboarding</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Input
              label="Loan Proposal"
              type="number"
              step="0.01"
              {...register('loan_proposal')}
            />

            <Input
              label="Service Fee %"
              type="number"
              step="0.01"
              {...register('service_fee_percent')}
            />

            <Input
              label="Service Fee Amount"
              type="number"
              step="0.01"
              readOnly
              {...register('service_fee')}
            />

            <Input
              label="CBU Retention %"
              type="number"
              step="0.01"
              {...register('cbu_retention_percent')}
            />

            <Input
              label="Notarial Fee"
              type="number"
              step="0.01"
              {...register('notarial_fee')}
            />

            <Input
              label="Insurance Amount"
              type="number"
              step="0.01"
              {...register('insurance_manual_amount')}
            />

            <Input
              label="Regular Savings"
              type="number"
              step="0.01"
              {...register('regular_savings')}
            />

            <Input
              label="CBU per Period"
              type="number"
              step="0.01"
              {...register('cbu_per_period')}
            />

            <Input
              label="Savings per Period"
              type="number"
              step="0.01"
              {...register('savings_per_period')}
            />

            <Input
              label="Total Loan Payable"
              type="number"
              step="0.01"
              readOnly
              {...register('total_loan_payable')}
            />

          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between gap-3 mb-4 pb-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Calculator size={15} className="text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-700">Loan Preview</h3>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={handlePreview}
              icon={<Eye size={14} />}
            >
              Preview Schedule
            </Button>
          </div>

          {!preview ? (
            <p className="text-sm text-gray-400">
              Enter loan details first to generate a preview.
            </p>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <CalcCard
                  label="Method"
                  value={watchedMethod === 'straight' ? 'Straight' : 'Diminishing'}
                />
                <CalcCard
                  label="Frequency"
                  value={frequencyDisplayLabel(watchedFrequency)}
                />
                <CalcCard
                  label="No. of Payments"
                  value={String(preview.summary.number_of_payments)}
                />
                <CalcCard
                  label="Rate / Period"
                  value={`${preview.summary.rate_per_period_percent}%`}
                />
                <CalcCard
                  label="Payment / Period"
                  value={formatCurrency(preview.summary.payment_per_period)}
                  highlight
                />
                <CalcCard
                  label="Total Principal"
                  value={formatCurrency(preview.summary.total_principal_collected)}
                />
                <CalcCard
                  label="Total Interest"
                  value={formatCurrency(preview.summary.total_interest_earned)}
                />
                <CalcCard
                  label="Total Payments"
                  value={formatCurrency(preview.summary.total_payments_collected)}
                />
                <CalcCard
                  label="ROI"
                  value={`${preview.summary.total_roi_percent}%`}
                />
                <CalcCard
                  label="Service Fee"
                  value={formatCurrency(preview.deductions.service_fee)}
                />
                <CalcCard
                  label="CBU Retention"
                  value={formatCurrency(preview.deductions.cbu_retention)}
                />
                <CalcCard
                  label="Insurance"
                  value={formatCurrency(preview.deductions.insurance)}
                />
                <CalcCard
                  label="Notarial Fee"
                  value={formatCurrency(preview.deductions.notarial_fee)}
                />
                <CalcCard
                  label="Total Deductions"
                  value={formatCurrency(preview.deductions.total_deductions)}
                />
                <CalcCard
                  label="Net Proceeds"
                  value={formatCurrency(preview.deductions.net_proceeds)}
                  highlight
                />
              </div>

              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Amortization Schedule Preview</h4>
                <div className="overflow-x-auto border border-gray-100 rounded-lg">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[#07A04E] text-white">
                        {[
                          'No.',
                          'Principal',
                          'Principal Amort.',
                          watchedFrequency === 'semi_monthly' ? 'Quencena' : watchedFrequency === 'weekly' ? 'Weekly' : watchedFrequency === 'yearly' ? 'Yearly' : 'Monthly',
                          'Loan Total',
                          'CBU',
                          'Savings',
                          watchedFrequency === 'semi_monthly' ? 'Kinsenas' : watchedFrequency === 'weekly' ? 'Weekly Total' : watchedFrequency === 'yearly' ? 'Yearly Total' : 'Monthly Total',
                          'Due Date',
                        ].map(h => (
                          <th
                            key={h}
                            className="px-3 py-2 text-left font-semibold whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {preview.schedule.map(row => {
                        const loanTotal = round2((row.principal || 0) + (row.interest || 0));
                        const freqTotal = round2(loanTotal + (row.cbu_paid || 0) + (row.savings_paid || 0));
                        return (
                          <tr key={row.period} className="hover:bg-gray-50/60 text-gray-700">
                            <td className="px-3 py-2 font-mono">{row.period}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{formatCurrency(row.balance || 0)}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{formatCurrency(row.principal || 0)}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{formatCurrency(row.interest || 0)}</td>
                            <td className="px-3 py-2 whitespace-nowrap font-medium">{formatCurrency(loanTotal)}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-blue-600">{(row.cbu_paid || 0) > 0 ? formatCurrency(row.cbu_paid) : '—'}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-emerald-600">{(row.savings_paid || 0) > 0 ? formatCurrency(row.savings_paid) : '—'}</td>
                            <td className="px-3 py-2 whitespace-nowrap font-semibold">{formatCurrency(freqTotal)}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.due_date)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <p className="text-xs text-gray-400 mt-3">
                  Preview generated successfully. Review the schedule and deductions before saving the loan.
                </p>
              </div>
            </div>
          )}
        </section>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => navigate('/loans')}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={loading}
            disabled={!previewReady}
            icon={<Save size={15} />}
          >
            {isEdit ? 'Save Changes' : 'Create Loan'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function CalcCard({ label, value, highlight }) {
  return (
    <div className={`rounded-lg p-3 border ${highlight ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100'}`}>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className={`text-sm font-semibold ${highlight ? 'text-blue-700' : 'text-gray-800'}`}>{value}</p>
    </div>
  );
}