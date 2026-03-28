import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { ArrowLeft, Save, Calculator, UploadCloud, FileSpreadsheet } from 'lucide-react';
import toast from 'react-hot-toast';

import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Spinner from '../../components/ui/Spinner';
import MemberSearchInput from '../../components/shared/MemberSearchInput';

import { createLoan, updateLoan, getLoanById } from '../../services/loanService';
import { createTransaction } from '../../services/transactionService';
import { getAccountsByMemberId } from '../../services/accountService';
import {
  getMemberById,
  updateMember,
} from '../../services/memberService';
import {
  getMembershipByMemberId,
  createMembership,
  recordMembershipPayment,
  computeFeeBalance,
} from '../../services/membershipService';
import {
  uploadLoanDocument,
  getLoanDocumentsByLoanId,
} from '../../services/loanDocumentService';
import { useAuth } from '../../context/AuthContext';
import { computeMonthlyAmortization } from '../../utils/loanCalculator';
import { formatCurrency } from '../../utils/formatters';

const STATUS_OPTS = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'defaulted', label: 'Defaulted' },
];

const FREQUENCY_OPTS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'chattel', label: 'Chattel' },
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
  const [membership, setMembership] = useState(null);
  const [signatureFiles, setSignatureFiles] = useState([]);
  const [leaderSignatureFile, setLeaderSignatureFile] = useState(null);
  const [existingDocuments, setExistingDocuments] = useState([]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm({
    defaultValues: {
      member_id: '',
      amount: '',
      interest_rate: '',
      term_months: '',
      monthly_amortization: '',
      release_date: '',
      status: 'active',
      purpose: '',
      notes: '',
      repayment_frequency: 'monthly',

      // financial onboarding
      loan_proposal: '',
      service_fee: '',
      share_capital: '',
      loan_insurance: '',
      regular_savings: '',
      total_loan_payable: '',

      // team leader
      team_leader_name: '',
      team_leader_id_no: '',
      team_leader_account_no: '',
      team_leader_mobile: '',

      // membership reference / setup
      membership_fee_required: '',
      membership_fee_paid: '',
    },
  });

  const watchedAmount = useWatch({ control, name: 'amount' });
  const watchedRate = useWatch({ control, name: 'interest_rate' });
  const watchedTerm = useWatch({ control, name: 'term_months' });
  const watchedFrequency = useWatch({ control, name: 'repayment_frequency' });
  const watchedProposal = useWatch({ control, name: 'loan_proposal' });
  const watchedMembershipFeeRequired = useWatch({ control, name: 'membership_fee_required' });
  const watchedMembershipFeePaid = useWatch({ control, name: 'membership_fee_paid' });

  const calcSummary = (() => {
    const amount = parseFloat(watchedAmount || watchedProposal) || 0;
    const annualRate = (parseFloat(watchedRate) || 0) / 100;
    const termMonths = parseInt(watchedTerm) || 0;

    if (amount <= 0 || termMonths <= 0) return null;

    const monthlyPayment = computeMonthlyAmortization(amount, annualRate, termMonths);
    const totalPayable = monthlyPayment * termMonths;
    const totalInterest = totalPayable - amount;
    const weeklyPayment = (monthlyPayment * 12) / 52;
    const termWeeks = Math.round(termMonths * (52 / 12));
    const quarterlyPayment = monthlyPayment * 3;

    return {
      monthlyPayment,
      weeklyPayment,
      quarterlyPayment,
      totalPayable,
      totalInterest,
      termWeeks,
    };
  })();

  useEffect(() => {
    if (!calcSummary) return;

    setValue('monthly_amortization', calcSummary.monthlyPayment.toFixed(2));
    setValue('total_loan_payable', calcSummary.totalPayable.toFixed(2));

    const proposal = parseFloat(watchedProposal) || parseFloat(watchedAmount) || 0;
    const serviceFee = proposal * 0.035;
    setValue('service_fee', serviceFee ? serviceFee.toFixed(2) : '');
  }, [calcSummary?.monthlyPayment, calcSummary?.totalPayable, watchedProposal, watchedAmount, setValue]);

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
          interest_rate: data.interest_rate || '',
          term_months: data.term_months || '',
          monthly_amortization: data.monthly_amortization || '',
          release_date: data.release_date?.split('T')[0] || '',
          status: data.status || 'active',
          purpose: data.purpose || '',
          notes: data.notes || '',
          repayment_frequency: data.repayment_frequency || 'monthly',

          loan_proposal: data.loan_proposal || '',
          service_fee: data.service_fee || '',
          share_capital: data.share_capital || '',
          loan_insurance: data.loan_insurance || '',
          regular_savings: data.regular_savings || '',
          total_loan_payable: data.total_loan_payable || '',

          team_leader_name: data.team_leader_name || '',
          team_leader_id_no: data.team_leader_id_no || '',
          team_leader_account_no: data.team_leader_account_no || '',
          team_leader_mobile: data.team_leader_mobile || '',

          membership_fee_required: '',
          membership_fee_paid: '',
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

    if (isEdit) bootstrapEdit();
    else {
      bootstrapCreate().finally(() => setInitialLoading(false));
    }
  }, [id, isEdit, navigate, reset, searchParams, setValue]);

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

    try {
      const ms = await getMembershipByMemberId(member.id);
      setMembership(ms || null);

      if (ms) {
        setValue('membership_fee_required', ms.fee_required || '');
        setValue('membership_fee_paid', '');
      } else {
        setValue('membership_fee_required', '');
        setValue('membership_fee_paid', '');
      }
    } catch {
      setMembership(null);
    }
  }

  function handleMemberProfileChange(field, value) {
    setMemberProfile(prev => ({ ...prev, [field]: value }));
  }

  async function onSubmit(values) {
    if (!values.member_id) {
      toast.error('Please select a member');
      return;
    }

    setLoading(true);
    try {
      // 1. persist missing / updated member profile fields from loan page
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

      // 2. create/update loan
      let loan;
      if (isEdit) {
        loan = await updateLoan(id, values);
      } else {
        loan = await createLoan(values);

        // loan release transaction stays source-of-truth
        await createTransaction({
          member_id: loan.member_id,
          loan_id: loan.id,
          category: 'loan',
          type: 'loan_release',
          amount: loan.amount,
          created_by: user?.id ?? null,
        });

        // optional CBU from share capital
        const shareCapital = parseFloat(values.share_capital) || 0;
        const regularSavings = parseFloat(values.regular_savings) || 0;

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
          }
        }
      }

      // 3. membership reference/setup on loan page
      const feeRequired = parseFloat(values.membership_fee_required) || 0;
      const feePaid = parseFloat(values.membership_fee_paid) || 0;

      if (!membership && feeRequired > 0) {
        const ms = await createMembership({
          member_id: values.member_id,
          membership_type: selectedMember?.membership_type || 'associate',
          fee_required: feeRequired,
          fee_paid_now: feePaid,
          created_by: user?.id,
        });
        setMembership(ms);
      } else if (membership && feePaid > 0) {
        await recordMembershipPayment(
          membership.id,
          values.member_id,
          feePaid,
          new Date().toISOString().split('T')[0],
          'Payment collected during loan onboarding',
          user?.id
        );
      }

      // 4. upload loan documents if provided
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

  const membershipRemaining =
    membership
      ? computeFeeBalance(membership) - (parseFloat(watchedMembershipFeePaid) || 0)
      : (parseFloat(watchedMembershipFeeRequired) || 0) - (parseFloat(watchedMembershipFeePaid) || 0);

  if (initialLoading) {
    return <div className="flex justify-center py-24"><Spinner /></div>;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <button
        onClick={() => navigate('/loans')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors"
      >
        <ArrowLeft size={16} /> Back to Loans
      </button>

      <PageHeader
        title={isEdit ? 'Edit Loan' : 'New Loan'}
        subtitle={isEdit ? 'Update loan details and onboarding data' : 'Create a loan and complete financial onboarding'}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              label="Interest Rate (% per annum)"
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
              label="Repayment Frequency"
              options={FREQUENCY_OPTS}
              {...register('repayment_frequency')}
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
            <h3 className="text-sm font-semibold text-gray-700">Initial Financial Entries</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Loan Proposal"
              type="number"
              step="0.01"
              {...register('loan_proposal')}
            />
            <Input
              label="Service Fee (3.5%)"
              type="number"
              step="0.01"
              readOnly
              {...register('service_fee')}
            />
            <Input
              label="Share Capital"
              type="number"
              step="0.01"
              {...register('share_capital')}
            />
            <Input
              label="Loan Insurance"
              type="number"
              step="0.01"
              {...register('loan_insurance')}
            />
            <Input
              label="Regular Savings"
              type="number"
              step="0.01"
              {...register('regular_savings')}
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
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100">
            <Calculator size={15} className="text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">Membership Fee Logic</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Membership Type"
              value={membership?.membership_type || selectedMember?.membership_type || 'associate'}
              readOnly
            />
            <Input
              label="Membership Fee Required"
              type="number"
              step="0.01"
              {...register('membership_fee_required')}
            />
            <Input
              label="Membership Fee Paid"
              type="number"
              step="0.01"
              {...register('membership_fee_paid')}
            />
          </div>

          <div className="mt-4">
            <div className={`px-3 py-2 rounded-lg border text-sm font-semibold ${
              (membershipRemaining || 0) > 0
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-green-50 border-green-200 text-green-700'
            }`}>
              Remaining Balance:{' '}
              {formatCurrency(Math.max(0, membershipRemaining || 0))}
            </div>
          </div>

          {membership && (
            <p className="text-xs text-gray-400 mt-2">
              Existing membership ledger detected. Any paid amount entered here will be recorded as an additional membership payment.
            </p>
          )}
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

        {calcSummary && (
          <section>
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Calculator size={15} className="text-gray-400" />
                Loan Computation
              </h3>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <CalcCard
                label={
                  watchedFrequency === 'monthly'
                    ? 'Monthly Payment'
                    : watchedFrequency === 'weekly'
                    ? 'Weekly Payment'
                    : watchedFrequency === 'quarterly'
                    ? 'Quarterly Payment'
                    : 'Monthly Payment'
                }
                value={formatCurrency(
                  watchedFrequency === 'weekly'
                    ? calcSummary.weeklyPayment
                    : watchedFrequency === 'quarterly'
                    ? calcSummary.quarterlyPayment
                    : calcSummary.monthlyPayment
                )}
                highlight
              />
              <CalcCard
                label="Term"
                value={
                  watchedFrequency === 'weekly'
                    ? `~${calcSummary.termWeeks} weeks`
                    : `${watchedTerm || 0} months`
                }
              />
              <CalcCard label="Total Payable" value={formatCurrency(calcSummary.totalPayable)} />
              <CalcCard label="Total Interest" value={formatCurrency(calcSummary.totalInterest)} />
            </div>
          </section>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => navigate('/loans')}>
            Cancel
          </Button>
          <Button type="submit" loading={loading} icon={<Save size={15} />}>
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