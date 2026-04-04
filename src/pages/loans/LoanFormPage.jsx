import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import {
  ArrowLeft,
  Save,
  Calculator,
  UploadCloud,
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
import { createTransaction } from '../../services/transactionService';
import { createInvoiceForPayment } from '../../services/invoiceService';
import { getAccountsByMemberId } from '../../services/accountService';
import {
  getMemberById,
  updateMember,
} from '../../services/memberService';
import {
  uploadLoanDocument,
  getLoanDocumentsByLoanId,
} from '../../services/loanDocumentService';
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
  { value: 'semi_monthly', label: 'Semi-Monthly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

const LOAN_METHOD_OPTS = [
  { value: 'diminishing', label: 'Diminishing' },
  { value: 'straight', label: 'Straight' },
];

const INSURANCE_MODE_OPTS = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'manual', label: 'Manual' },
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
  beneficiary_name: '',
  beneficiary_address: '',
  beneficiary_tel: '',
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
  const [signatureFiles, setSignatureFiles] = useState([]);
  const [leaderSignatureFile, setLeaderSignatureFile] = useState(null);
  const [existingDocuments, setExistingDocuments] = useState([]);
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
      share_capital: '',
      loan_insurance: '',
      regular_savings: '',
      total_loan_payable: '',

      service_fee_percent: '2',
      cbu_retention_percent: '2.5',
      notarial_fee: '200',
      insurance_mode: 'fixed',
      insurance_fixed_rate_percent: '0',
      insurance_manual_amount: '',

      cbu_per_period: '25',
      savings_per_period: '25',

      team_leader_name: '',
      team_leader_id_no: '',
      team_leader_account_no: '',
      team_leader_mobile: '',
    },
  });

  const watchedAmount = useWatch({ control, name: 'amount' });
  const watchedRate = useWatch({ control, name: 'interest_rate' });
  const watchedTerm = useWatch({ control, name: 'term_months' });
  const watchedFrequency = useWatch({ control, name: 'repayment_frequency' });
  const watchedMethod = useWatch({ control, name: 'loan_method' });
  const watchedReleaseDate = useWatch({ control, name: 'release_date' });

  const watchedProposal = useWatch({ control, name: 'loan_proposal' });
  const watchedShareCapital = useWatch({ control, name: 'share_capital' });
  const watchedRegularSavings = useWatch({ control, name: 'regular_savings' });

  const watchedServiceFeePercent = useWatch({ control, name: 'service_fee_percent' });
  const watchedCbuRetentionPercent = useWatch({ control, name: 'cbu_retention_percent' });
  const watchedNotarialFee = useWatch({ control, name: 'notarial_fee' });
  const watchedInsuranceMode = useWatch({ control, name: 'insurance_mode' });
  const watchedInsuranceFixedRatePercent = useWatch({ control, name: 'insurance_fixed_rate_percent' });
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
      insuranceMode: watchedInsuranceMode || 'fixed',
      insuranceAmount: parseFloat(watchedInsuranceManualAmount || 0) || 0,
      insuranceFixedRatePercent: parseFloat(watchedInsuranceFixedRatePercent || 0) || 0,
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
    watchedInsuranceMode,
    watchedInsuranceFixedRatePercent,
    watchedInsuranceManualAmount,
  ]);

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
    watchedShareCapital,
    watchedRegularSavings,
    watchedInsuranceMode,
    watchedInsuranceFixedRatePercent,
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
        applySelectedMember(member);
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
          share_capital: data.share_capital || '',
          loan_insurance: data.loan_insurance || '',
          regular_savings: data.regular_savings || '',
          total_loan_payable: data.total_loan_payable || '',

          service_fee_percent: data.service_fee_percent || '2',
          cbu_retention_percent: data.cbu_retention_percent || '2.5',
          notarial_fee: data.notarial_fee || '200',
          insurance_mode: data.insurance_mode || 'fixed',
          insurance_fixed_rate_percent: data.insurance_fixed_rate_percent || '0',
          insurance_manual_amount: data.insurance_manual_amount || '',
          cbu_per_period: data.cbu_per_period || '25',
          savings_per_period: data.savings_per_period || '25',

          team_leader_name: data.team_leader_name || '',
          team_leader_id_no: data.team_leader_id_no || '',
          team_leader_account_no: data.team_leader_account_no || '',
          team_leader_mobile: data.team_leader_mobile || '',
        });

        if (data.members) {
          applySelectedMember(data.members);
        } else if (data.member_id) {
          const member = await getMemberById(data.member_id);
          applySelectedMember(member);
        }

        try {
          const docs = await getLoanDocumentsByLoanId(id);
          setExistingDocuments(docs || []);
        } catch {
          setExistingDocuments([]);
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
      beneficiary_name: member.beneficiary_name || '',
      beneficiary_address: member.beneficiary_address || '',
      beneficiary_tel: member.beneficiary_tel || '',
    });
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
        beneficiary_name: memberProfile.beneficiary_name,
        beneficiary_address: memberProfile.beneficiary_address,
        beneficiary_tel: memberProfile.beneficiary_tel,
      });

      const principalAmount = parseFloat(values.amount || 0);
      const shareCapital = parseFloat(values.share_capital || 0) || 0;
      const regularSavings = parseFloat(values.regular_savings || 0) || 0;

      const payload = {
        ...values,
        amount: principalAmount,
        balance: principalAmount,
        monthly_amortization: round2(preview.summary.payment_per_period),
        total_loan_payable: round2(preview.summary.total_payments_collected),
        service_fee: round2(preview.deductions.service_fee),
        loan_insurance: round2(preview.deductions.insurance),
        loan_proposal: parseFloat(values.loan_proposal || principalAmount) || principalAmount,
        repayment_frequency: values.repayment_frequency,
        loan_method: values.loan_method,
        service_fee_percent: parseFloat(values.service_fee_percent || 2) || 0,
        cbu_retention_percent: parseFloat(values.cbu_retention_percent || 2.5) || 0,
        notarial_fee: parseFloat(values.notarial_fee || 200) || 0,
        insurance_mode: values.insurance_mode,
        insurance_fixed_rate_percent: parseFloat(values.insurance_fixed_rate_percent || 0) || 0,
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
      } else {
        loan = await createLoan(payload);

        const memberDisplayName = [
          selectedMember?.first_name,
          selectedMember?.last_name,
        ].filter(Boolean).join(' ') || 'Member';

        await createTransaction({
          member_id: loan.member_id,
          loan_id: loan.id,
          category: 'loan',
          type: 'loan_release',
          amount: loan.amount,
          created_by: user?.id ?? null,
        });

        if (shareCapital > 0 || regularSavings > 0) {
          const accounts = await getAccountsByMemberId(loan.member_id);
          const cbuAccount = accounts.find(a => a.account_type === 'cbu');
          const savingsAccount = accounts.find(a => a.account_type === 'savings');

          if (shareCapital > 0 && cbuAccount) {
            await createTransaction({
              member_id: loan.member_id,
              account_id: cbuAccount.id,
              category: 'cbu',
              type: 'deposit',
              amount: shareCapital,
              created_by: user?.id ?? null,
            });

            try {
              await createInvoiceForPayment({
                payment_type: 'cbu',
                member_id: loan.member_id,
                member_name: memberDisplayName,
                amount: shareCapital,
                purpose: 'CBU Share Capital',
                ref_id: cbuAccount.id,
                account_id: cbuAccount.id,
                created_by: user?.id ?? null,
              });
            } catch (e) {
              console.error('[LoanFormPage] cbu invoice failed:', e);
            }
          }

          if (regularSavings > 0 && savingsAccount) {
            await createTransaction({
              member_id: loan.member_id,
              account_id: savingsAccount.id,
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
                ref_id: savingsAccount.id,
                account_id: savingsAccount.id,
                created_by: user?.id ?? null,
              });
            } catch (e) {
              console.error('[LoanFormPage] savings invoice failed:', e);
            }
          }
        }
      }

      if (loan?.id) {
        for (let i = 0; i < signatureFiles.length; i += 1) {
          const file = signatureFiles[i];
          if (!file) continue;

          await uploadLoanDocument({
            loanId: loan.id,
            file,
            documentType: 'member_signature',
            label: `Signature ${i + 1}`,
            createdBy: user?.id,
          });
        }

        if (leaderSignatureFile) {
          await uploadLoanDocument({
            loanId: loan.id,
            file: leaderSignatureFile,
            documentType: 'team_leader_signature',
            label: 'Team Leader Signature',
            createdBy: user?.id,
          });
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
                Beneficiary
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Name"
                  value={memberProfile.beneficiary_name}
                  onChange={e => handleMemberProfileChange('beneficiary_name', e.target.value)}
                />
                <Input
                  label="Res. Tel. No."
                  value={memberProfile.beneficiary_tel}
                  onChange={e => handleMemberProfileChange('beneficiary_tel', e.target.value)}
                />
                <div className="sm:col-span-2">
                  <Input
                    label="Address"
                    value={memberProfile.beneficiary_address}
                    onChange={e => handleMemberProfileChange('beneficiary_address', e.target.value)}
                  />
                </div>
              </div>
            </section>
          </>
        )}

        <section className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">
            Loan Details
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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

            <Select
              label="Insurance Mode"
              options={INSURANCE_MODE_OPTS}
              {...register('insurance_mode')}
            />

            {watchedInsuranceMode === 'fixed' ? (
              <Input
                label="Insurance Fixed Rate %"
                type="number"
                step="0.01"
                {...register('insurance_fixed_rate_percent')}
              />
            ) : (
              <Input
                label="Insurance Manual Amount"
                type="number"
                step="0.01"
                {...register('insurance_manual_amount')}
              />
            )}

            <Input
              label="Insurance Amount"
              type="number"
              step="0.01"
              readOnly
              {...register('loan_insurance')}
            />

            <Input
              label="Share Capital"
              type="number"
              step="0.01"
              {...register('share_capital')}
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

        <section className="bg-gray-50 border border-gray-100 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">
            Team Leader (Optional)
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Name" {...register('team_leader_name')} />
            <Input label="ID No." {...register('team_leader_id_no')} />
            <Input label="Account No." {...register('team_leader_account_no')} />
            <Input label="Mobile No." {...register('team_leader_mobile')} />
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Team Leader Signature
            </label>
            <div className="border border-dashed border-gray-300 rounded-lg p-4 bg-white">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <UploadCloud size={16} />
                <span>Upload signature</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => setLeaderSignatureFile(e.target.files?.[0] || null)}
                />
              </label>
              {leaderSignatureFile && (
                <p className="text-xs text-gray-400 mt-2">{leaderSignatureFile.name}</p>
              )}
            </div>
          </div>
        </section>

        <section className="bg-gray-50 border border-gray-100 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">
            Member Signatures
          </h3>

          <div className="border border-dashed border-gray-300 rounded-lg p-4 bg-white">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <UploadCloud size={16} />
              <span>Upload up to 3 signature images</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => {
                  const files = Array.from(e.target.files || []).slice(0, 3);
                  setSignatureFiles(files);
                }}
              />
            </label>

            {signatureFiles.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-gray-400">
                {signatureFiles.map((file, index) => (
                  <li key={`${file.name}-${index}`}>{file.name}</li>
                ))}
              </ul>
            )}

            {existingDocuments.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-2">Existing uploaded documents</p>
                <ul className="space-y-1 text-xs text-gray-400">
                  {existingDocuments.map(doc => (
                    <li key={doc.id}>{doc.label || doc.document_type}</li>
                  ))}
                </ul>
              </div>
            )}
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
                      <tr className="bg-gray-50 border-b border-gray-100">
                        {[
                          'No.',
                          'Due Date',
                          'Beginning Balance',
                          'Principal',
                          'Interest',
                          'CBU',
                          'Savings',
                          'Total Due',
                          'Ending Balance',
                        ].map(h => (
                          <th
                            key={h}
                            className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {preview.schedule.map(row => (
                        <tr key={row.payment_no} className="hover:bg-gray-50/60">
                          <td className="px-3 py-2 whitespace-nowrap">{row.payment_no}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.due_date)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{formatCurrency(row.beginning_balance)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{formatCurrency(row.principal_amount)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{formatCurrency(row.interest_amount)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{formatCurrency(row.cbu_amount)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{formatCurrency(row.savings_amount)}</td>
                          <td className="px-3 py-2 whitespace-nowrap font-semibold">{formatCurrency(row.total_due)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{formatCurrency(row.ending_balance)}</td>
                        </tr>
                      ))}
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