import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { ArrowLeft, Save, Calculator } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Spinner from '../../components/ui/Spinner';
import MemberSearchInput from '../../components/shared/MemberSearchInput';
import { createLoan, updateLoan, getLoanById } from '../../services/loanService';
import { createTransaction } from '../../services/transactionService';
import { useAuth } from '../../context/AuthContext';
import { getMemberById } from '../../services/memberService';
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
];

export default function LoanFormPage() {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEdit);
  const [selectedMember, setSelectedMember] = useState(null);
  const [frequency, setFrequency] = useState('monthly');

  const { register, handleSubmit, reset, setValue, control, formState: { errors } } = useForm({
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
    },
  });

  // Watch fields for live calculation
  const watchedAmount = useWatch({ control, name: 'amount' });
  const watchedRate = useWatch({ control, name: 'interest_rate' });
  const watchedTerm = useWatch({ control, name: 'term_months' });

  // Compute loan summary whenever inputs change
  const calcSummary = (() => {
    const amount = parseFloat(watchedAmount) || 0;
    const annualRate = (parseFloat(watchedRate) || 0) / 100;
    const termMonths = parseInt(watchedTerm) || 0;

    if (amount <= 0 || termMonths <= 0) return null;

    const monthlyPayment = computeMonthlyAmortization(amount, annualRate, termMonths);
    const totalPayable = monthlyPayment * termMonths;
    const totalInterest = totalPayable - amount;
    const weeklyPayment = (monthlyPayment * 12) / 52;
    const termWeeks = Math.round(termMonths * (52 / 12));

    return { monthlyPayment, weeklyPayment, totalPayable, totalInterest, termWeeks };
  })();

  // Auto-fill monthly_amortization field
  useEffect(() => {
    if (calcSummary) {
      setValue('monthly_amortization', calcSummary.monthlyPayment.toFixed(2));
    }
  }, [calcSummary?.monthlyPayment]);

  useEffect(() => {
    const memberId = searchParams.get('member');
    if (memberId && !isEdit) {
      getMemberById(memberId).then(m => {
        setSelectedMember(m);
        setValue('member_id', m.id);
      }).catch(() => {});
    }
    if (isEdit) {
      getLoanById(id).then(data => {
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
        });
        setSelectedMember(data.members);
      }).catch(() => navigate('/loans')).finally(() => setInitialLoading(false));
    }
  }, [id]);

  async function onSubmit(values) {
    if (!values.member_id) return toast.error('Please select a member');
    setLoading(true);
    try {
      if (isEdit) {
        await updateLoan(id, values);
        toast.success('Loan updated');
        navigate(`/loans/${id}`);
      } else {
        const loan = await createLoan(values);

        // Insert a loan_release transaction.
        // This is what makes the loan appear in Transactions and Activity Logs.
        // The trigger handles balance logic — do NOT update balances here.
        // REQUIRES: wellserve_trigger_v5_patch.sql applied in Supabase SQL Editor.
        const txPayload = {
          member_id:  loan.member_id,
          loan_id:    loan.id,
          category:   'loan',
          type:       'loan_release',
          amount:     loan.amount,
          created_by: user?.id ?? null,
        };
        console.log('[LoanFormPage] posting loan_release transaction:', txPayload);
        await createTransaction(txPayload);
        // createTransaction throws on failure — error is caught by outer try/catch
        // and shown to the user via toast.error below.

        toast.success('Loan created');
        navigate(`/loans/${loan.id}`);
      }
    } catch (e) {
      toast.error(e.message || 'Failed to save loan');
    } finally {
      setLoading(false);
    }
  }

  if (initialLoading) return <div className="flex justify-center py-24"><Spinner /></div>;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <button
        onClick={() => navigate('/loans')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors"
      >
        <ArrowLeft size={16} /> Back to Loans
      </button>

      <PageHeader
        title={isEdit ? 'Edit Loan' : 'New Loan'}
        subtitle={isEdit ? 'Update loan details' : 'Record a new member loan'}
      />

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-6">

        {/* Member */}
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">Member</h3>
          <input type="hidden" {...register('member_id', { required: true })} />
          <MemberSearchInput
            value={selectedMember}
            onChange={m => { setSelectedMember(m); setValue('member_id', m.id); }}
            placeholder={selectedMember ? `${selectedMember.first_name} ${selectedMember.last_name}` : 'Search member...'}
          />
          {errors.member_id && <p className="text-xs text-red-500 mt-1">Member is required</p>}
        </section>

        {/* Loan Details */}
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">Loan Details</h3>
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
              placeholder="e.g. 12"
              {...register('interest_rate')}
            />
            <Input
              label="Term (months)"
              type="number"
              placeholder="e.g. 12"
              {...register('term_months')}
            />
            <Input
              label="Release Date"
              type="date"
              {...register('release_date')}
            />
            <Select label="Status" options={STATUS_OPTS} {...register('status')} />
            <Input
              label="Purpose"
              placeholder="e.g. Business, Education"
              {...register('purpose')}
            />
          </div>
          {/* Hidden field — auto-filled by calculation */}
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

        {/* Loan Calculation Summary */}
        {calcSummary && (
          <section>
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Calculator size={15} className="text-gray-400" />
                Loan Computation
              </h3>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                {FREQUENCY_OPTS.map(f => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setFrequency(f.value)}
                    className={`px-3 py-1 text-xs font-medium transition-colors ${
                      frequency === f.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <CalcCard
                label={frequency === 'monthly' ? 'Monthly Payment' : 'Weekly Payment'}
                value={formatCurrency(
                  frequency === 'monthly' ? calcSummary.monthlyPayment : calcSummary.weeklyPayment
                )}
                highlight
              />
              <CalcCard
                label={frequency === 'monthly' ? `Term` : `Term`}
                value={frequency === 'monthly'
                  ? `${watchedTerm} months`
                  : `~${calcSummary.termWeeks} weeks`}
              />
              <CalcCard label="Total Payable" value={formatCurrency(calcSummary.totalPayable)} />
              <CalcCard label="Total Interest" value={formatCurrency(calcSummary.totalInterest)} />
            </div>

            <p className="text-xs text-gray-400 mt-2">
              {watchedRate
                ? `Based on ${watchedRate}% per annum interest, reducing balance.`
                : 'Based on 0% interest (no interest applied).'}
            </p>
          </section>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => navigate('/loans')}>Cancel</Button>
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