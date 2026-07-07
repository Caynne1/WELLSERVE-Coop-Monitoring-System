import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import {
  ArrowLeft,
  Save,
  Calculator,
  FileSpreadsheet,
  Eye,
  RotateCw,
  Plus,
  Trash2,
  Check,
  Printer,
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
import { printHtmlDocument, wrapWithLetterhead } from '../../utils/print';

const STATUS_OPTS = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'defaulted', label: 'Defaulted' },
];

const FREQUENCY_OPTS = [
  { value: 'weekly',        label: 'Weekly (Old)' },
  { value: 'weekly_fixed4', label: 'Weekly' },
  { value: 'monthly_old',  label: 'Monthly (Old)' },
  { value: 'semi_monthly_old', label: 'Quencena (Old)' },
  { value: 'semi_monthly', label: 'Quencena (Semi-Monthly)' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'chattel', label: 'Chattel' },
];

// Payment Frequency options depend on the selected Loan Type, since only
// some frequencies have the "new formula" implemented in the loan engine
// (see src/engine/loanEngine.js — computeSchedule / computeNumberOfPayments).
// 'weekly', 'monthly_old', and 'semi_monthly_old' are still on the old
// worksheet formula (Payment / Period = Loan Amount / Number of Payments,
// no separate interest line). Every other frequency already uses the new,
// standard declining-balance formula.
//
// Existing/Old loans: only the old-formula frequencies are available for now.
const OLD_FORMULA_FREQUENCY_VALUES = ['weekly', 'monthly_old', 'semi_monthly_old'];
// New loans: every frequency that already has the new formula implemented.
const NEW_FORMULA_FREQUENCY_VALUES = FREQUENCY_OPTS
  .map(o => o.value)
  .filter(v => !OLD_FORMULA_FREQUENCY_VALUES.includes(v));

const OLD_LOAN_FREQUENCY_OPTS = FREQUENCY_OPTS.filter(o => OLD_FORMULA_FREQUENCY_VALUES.includes(o.value));
const NEW_LOAN_FREQUENCY_OPTS = FREQUENCY_OPTS.filter(o => NEW_FORMULA_FREQUENCY_VALUES.includes(o.value));

const LOAN_METHOD_OPTS = [
  { value: 'diminishing', label: 'Diminishing' },
  { value: 'straight', label: 'Straight' },
];

// WELLSERVE loan products — per the approved loan products sheet.
// Selecting a product auto-fills the interest rate & method below;
// the encoder can still override them manually if a special case requires it.
//
// `rate` is the current/updated interest rate — used for New Loans.
// `previousRate` is the rate that was in effect before the coop's most
// recent rate update — used for Existing/Ongoing loans being re-encoded,
// so they keep the rate they were originally released under. Update
// `previousRate` to match `rate` (or remove the distinction) once every
// existing loan under the old rate has been fully re-encoded.
const LOAN_PRODUCTS = [
  { value: '',                       label: 'Select loan product...' },
  { value: 'beneficial_straight',    label: 'Beneficial Loan — 2.5% Straight (CBU-Based)',                     rate: '2.5', previousRate: '2.5', method: 'straight' },
  { value: 'beneficial_diminishing', label: 'Beneficial Loan — 3.0% Diminishing (CBU-Based)',                  rate: '3.0', previousRate: '3.0', method: 'diminishing' },
  { value: 'productive',             label: 'WELLife Productive Loan — 2.5% Straight (Business, w/ Co-Maker)', rate: '2.5', previousRate: '2.5', method: 'straight' },
  { value: 'providential',           label: 'Providential Loan — 3.0% (HMO & Memorial Plans, w/ Co-Maker)',    rate: '3.0', previousRate: '3.0', method: 'diminishing' },
  { value: 'financing',              label: 'Financing Loan — 3.0% (Motorcycle/Gadgets/Appliances, w/ Co-Maker)', rate: '3.0', previousRate: '3.0', method: 'diminishing' },
  { value: 'custom',                 label: 'Custom / Other (set rate & method manually)' },
];

const LOAN_PRODUCT_MAP = Object.fromEntries(LOAN_PRODUCTS.map(p => [p.value, p]));

const LOAN_TYPE_OPTS = [
  { value: 'existing', label: 'Existing / Ongoing Loan — previous interest rate' },
  { value: 'new',      label: 'New Loan — updated interest rate' },
];

// Beneficial Loan CBU-eligibility tiers — per "WELLSERVE-Details-for-System"
// deck, Slides 5-6. `requiresCoMaker` starts at the 20K tier per the deck.
// This is advisory guidance shown to the encoder, not a hard block, since
// coops occasionally approve exceptions.
const BENEFICIAL_LOAN_TIERS = [
  { maxLoan: 7000,  requiredCbu: 4000,  label: 'First Loan (7K)',              requiresCoMaker: false },
  { maxLoan: 14000, requiredCbu: 7000,  label: 'Second Loan (14K)',            requiresCoMaker: false },
  { maxLoan: 25000, requiredCbu: 10000, label: '20K net (25K loan, 10K CBU)',  requiresCoMaker: true  },
  { maxLoan: 30000, requiredCbu: 15000, label: '30K (15K CBU)',                requiresCoMaker: true  },
  { maxLoan: 40000, requiredCbu: 20000, label: '40K (20K CBU)',                requiresCoMaker: true  },
  { maxLoan: 50000, requiredCbu: 25000, label: '50K (25K CBU)',                requiresCoMaker: true  },
];

/** Find the applicable Beneficial Loan tier for a given proposed amount. */
function findBeneficialTier(amount) {
  const amt = parseFloat(amount || 0) || 0;
  if (amt <= 0) return null;
  return BENEFICIAL_LOAN_TIERS.find(t => amt <= t.maxLoan) || BENEFICIAL_LOAN_TIERS[BENEFICIAL_LOAN_TIERS.length - 1];
}

/** Loan products that always require a co-maker per the deck (Slides 4, 7-9). */
const CO_MAKER_PRODUCTS = new Set(['productive', 'providential', 'financing']);

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

function titleCase(value) {
  if (!value) return '—';
  return String(value).replaceAll('_', ' ').replace(/\b\w/g, m => m.toUpperCase());
}

// ─── Print helpers (Loan Application Preview) ──────────────────────────────

function loanFormPrintStyles() {
  return `
    .doc-meta-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      border-bottom: 2px solid #059669;
      padding-bottom: 8px;
      margin-bottom: 16px;
    }
    .doc-title {
      font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;
      color: #059669;
    }
    .draft-badge {
      display: inline-block; font-size: 9px; font-weight: 700; letter-spacing: 0.08em;
      text-transform: uppercase; color: #92400e; background: #fef3c7; border: 1px solid #fde68a;
      border-radius: 99px; padding: 2px 10px; margin-left: 8px; vertical-align: middle;
    }
    .printed-at { font-size: 9.5px; color: #6b7280; }
    .info-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 0 24px; margin-bottom: 14px;
      border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;
    }
    .info-grid .col { padding: 10px 14px; }
    .info-grid .col:first-child { border-right: 1px solid #e5e7eb; }
    .info-grid h3 {
      font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em;
      color: #6b7280; margin-bottom: 8px;
    }
    .kv-row {
      display: flex; justify-content: space-between; padding: 3px 0;
      border-bottom: 1px solid #f3f4f6; font-size: 10.5px;
    }
    .kv-row:last-child { border-bottom: none; }
    .kv-row .kv-label { color: #6b7280; }
    .kv-row .kv-value { font-weight: 600; color: #111827; text-align: right; }
    .kv-row.highlight .kv-label { color: #059669; font-weight: 600; }
    .kv-row.highlight .kv-value { color: #059669; font-size: 12px; }
    .section-header {
      display: flex; align-items: center; justify-content: space-between;
      background: #f9fafb; border: 1px solid #e5e7eb; border-bottom: none;
      border-radius: 6px 6px 0 0; padding: 7px 12px;
    }
    .section-header span {
      font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #374151;
    }
    .section-header .meta { font-size: 10px; color: #6b7280; font-weight: 400; text-transform: none; letter-spacing: 0; }
    table.schedule {
      width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb;
      border-radius: 0 0 6px 6px; overflow: hidden; font-size: 10px;
    }
    table.schedule thead tr { background: #059669; color: #fff; }
    table.schedule thead th {
      padding: 6px 8px; text-align: right; font-weight: 600; font-size: 9px;
      text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap;
    }
    table.schedule thead th:first-child, table.schedule thead th:nth-child(2) { text-align: left; }
    table.schedule tbody tr { border-bottom: 1px solid #f3f4f6; }
    table.schedule tbody tr:last-child { border-bottom: none; }
    table.schedule tbody tr:nth-child(even) { background: #f9fafb; }
    table.schedule tbody td { padding: 5px 8px; text-align: right; color: #374151; white-space: nowrap; }
    table.schedule tbody td:first-child, table.schedule tbody td:nth-child(2) { text-align: left; }
    .totals-bar {
      display: flex; justify-content: flex-end; gap: 24px; margin-top: 10px;
      padding: 8px 14px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; font-size: 10.5px;
    }
    .totals-bar .tot-item { display: flex; flex-direction: column; align-items: flex-end; }
    .totals-bar .tot-label { color: #6b7280; font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; }
    .totals-bar .tot-value { font-weight: 700; color: #065f46; font-size: 12px; }
    .sig-block { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-top: 32px; }
    .sig-item { border-top: 1px solid #9ca3af; padding-top: 6px; font-size: 10px; color: #6b7280; }
    .sig-item strong { display: block; font-size: 10.5px; color: #111827; margin-bottom: 2px; }
    .confidential-note {
      margin-top: 20px; font-size: 9px; color: #9ca3af; text-align: center; font-style: italic;
    }
  `;
}

function loanFormKvRow(label, value, highlight = false) {
  return `
    <div class="kv-row${highlight ? ' highlight' : ''}">
      <span class="kv-label">${label}</span>
      <span class="kv-value">${value}</span>
    </div>
  `;
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
    cbuBalance: 0,
    savingsBalance: 0,
  });
  const [previewReady, setPreviewReady] = useState(false);

  const [chargeIncluded, setChargeIncluded] = useState({
    service_fee: true,
    cbu_retention: true,
    notarial_fee: true,
    insurance: true,
    regular_savings: true,
    penalty_due: true,
    annual_dues: true,
    cbu_completion: true,
    petty_cash: true,
    membership_regulatory_fee: false,
    membership_initial_savings: false,
    membership_vip_card: false,
  });
  const [otherCharges, setOtherCharges] = useState([]); // [{ id, label, amount, included }]

  // Associate → Regular membership upgrade bundle: on = all three membership
  // charges (Regulatory Fee, Initial Savings, VIP Card) are included together.
  const membershipUpgradeIncluded =
    chargeIncluded.membership_regulatory_fee &&
    chargeIncluded.membership_initial_savings &&
    chargeIncluded.membership_vip_card;

  function toggleMembershipUpgradeBundle() {
    const next = !membershipUpgradeIncluded;
    setChargeIncluded(prev => ({
      ...prev,
      membership_regulatory_fee: next,
      membership_initial_savings: next,
      membership_vip_card: next,
      cbu_completion: next ? true : prev.cbu_completion,
    }));
    if (next) {
      toast.success('Membership upgrade bundle applied — set the CBU Completion amount to match the member\'s CBU shortfall.');
    }
  }

  // Co-maker requirement — auto-suggested from product/tier, but the encoder
  // can force it on/off manually (e.g. coop-approved exception).
  const [coMakerOverride, setCoMakerOverride] = useState(null); // null = auto, true/false = manual override

  function toggleCharge(key) {
    setChargeIncluded(prev => ({ ...prev, [key]: !prev[key] }));
  }

  const [chargeTypeMode, setChargeTypeMode] = useState({
    regular_savings: 'percent',
    penalty_due: 'fixed',
    annual_dues: 'fixed',
    cbu_completion: 'fixed',
    petty_cash: 'fixed',
  });

  function setChargeType(key, mode) {
    setChargeTypeMode(prev => ({ ...prev, [key]: mode }));
  }

  function addOtherCharge() {
    setOtherCharges(prev => [
      ...prev,
      { id: `oc_${Date.now()}`, label: '', amount: '', included: true },
    ]);
  }

  function updateOtherCharge(id, patch) {
    setOtherCharges(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));
  }

  function removeOtherCharge(id) {
    setOtherCharges(prev => prev.filter(c => c.id !== id));
  }

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
      loan_type: 'new',
      loan_product: '',
      amount: '',
      interest_rate: '2.5',
      term_months: '',
      monthly_amortization: '',
      release_date: '',
      status: 'active',
      purpose: '',
      notes: '',
      repayment_frequency: 'weekly_fixed4',
      loan_method: 'diminishing',

      loan_proposal: '',
      service_fee: '',
      loan_insurance: '',
      regular_savings: '',
      regular_savings_percent: '',
      total_loan_payable: '',

      service_fee_percent: '3.5',
      cbu_retention_percent: '5.0',
      share_capital: '',
      notarial_fee: '300',
      insurance_manual_amount: '',

      cbu_per_period: '0',
      savings_per_period: '0',

      penalty_due: '',
      penalty_due_percent: '',
      annual_dues: '',
      annual_dues_percent: '',
      petty_cash: '',
      petty_cash_percent: '',
      cbu_completion: '',
      cbu_completion_percent: '',

      // Associate → Regular membership upgrade bundle
      membership_regulatory_fee: '1000',
      membership_initial_savings: '500',
      membership_vip_card: '300',

      // Co-maker details
      co_maker_name: '',
      co_maker_member_no: '',
      co_maker_relationship: '',
      co_maker_contact_no: '',
    },
  });

  const watchedLoanType = useWatch({ control, name: 'loan_type' });
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
  const watchedRegularSavings = useWatch({ control, name: 'regular_savings' });
  const watchedRegularSavingsPercent = useWatch({ control, name: 'regular_savings_percent' });
  const watchedServiceFee = useWatch({ control, name: 'service_fee' });
  const watchedShareCapital = useWatch({ control, name: 'share_capital' });

  const watchedCbuPerPeriod = useWatch({ control, name: 'cbu_per_period' });
  const watchedSavingsPerPeriod = useWatch({ control, name: 'savings_per_period' });

  const watchedPettyCash = useWatch({ control, name: 'petty_cash' });
  const watchedPettyCashPercent = useWatch({ control, name: 'petty_cash_percent' });
  const watchedPenaltyDue = useWatch({ control, name: 'penalty_due' });
  const watchedPenaltyDuePercent = useWatch({ control, name: 'penalty_due_percent' });
  const watchedAnnualDues = useWatch({ control, name: 'annual_dues' });
  const watchedAnnualDuesPercent = useWatch({ control, name: 'annual_dues_percent' });
  const watchedCbuCompletion = useWatch({ control, name: 'cbu_completion' });
  const watchedCbuCompletionPercent = useWatch({ control, name: 'cbu_completion_percent' });

  const watchedMembershipRegulatoryFee = useWatch({ control, name: 'membership_regulatory_fee' });
  const watchedMembershipInitialSavings = useWatch({ control, name: 'membership_initial_savings' });
  const watchedMembershipVipCard = useWatch({ control, name: 'membership_vip_card' });

  const watchedCoMakerName = useWatch({ control, name: 'co_maker_name' });
  const watchedCoMakerMemberNo = useWatch({ control, name: 'co_maker_member_no' });
  const watchedCoMakerRelationship = useWatch({ control, name: 'co_maker_relationship' });
  const watchedCoMakerContactNo = useWatch({ control, name: 'co_maker_contact_no' });

  // CBU-tier advisory (Beneficial loans only — see BENEFICIAL_LOAN_TIERS)
  const beneficialTier = useMemo(() => {
    if (!watchedProduct || !watchedProduct.startsWith('beneficial')) return null;
    return findBeneficialTier(watchedProposal);
  }, [watchedProduct, watchedProposal]);

  const cbuShortfall = beneficialTier
    ? round2(Math.max(0, beneficialTier.requiredCbu - (memberAccounts.cbuBalance || 0)))
    : 0;

  // Co-maker requirement: product-driven, or tier-driven for Beneficial loans,
  // unless the encoder has manually overridden it.
  const coMakerAutoRequired = CO_MAKER_PRODUCTS.has(watchedProduct) || Boolean(beneficialTier?.requiresCoMaker);
  const coMakerRequired = coMakerOverride === null ? coMakerAutoRequired : coMakerOverride;

  const preview = useMemo(() => {
    const amount = parseFloat(watchedProposal || 0);
    const termMonths = parseInt(watchedTerm || 0, 10);
    const monthlyInterestRate = parseFloat(watchedRate || 0);

    if (amount <= 0 || termMonths <= 0 || monthlyInterestRate < 0) {
      return null;
    }

    const extraDeductionItems = [];
    if (chargeIncluded.penalty_due && parseFloat(watchedPenaltyDue || 0) > 0) {
      extraDeductionItems.push({ label: 'Penalty Due', type: 'fixed', amount: parseFloat(watchedPenaltyDue) });
    }
    if (chargeIncluded.cbu_completion && parseFloat(watchedCbuCompletion || 0) > 0) {
      extraDeductionItems.push({ label: 'CBU Completion', type: 'fixed', amount: parseFloat(watchedCbuCompletion) });
    }
    if (chargeIncluded.petty_cash && parseFloat(watchedPettyCash || 0) > 0) {
      extraDeductionItems.push({ label: 'Petty Cash', type: 'fixed', amount: parseFloat(watchedPettyCash) });
    }
    if (chargeIncluded.membership_regulatory_fee && parseFloat(watchedMembershipRegulatoryFee || 0) > 0) {
      extraDeductionItems.push({ label: 'Regulatory Fee (Membership)', type: 'fixed', amount: parseFloat(watchedMembershipRegulatoryFee) });
    }
    if (chargeIncluded.membership_initial_savings && parseFloat(watchedMembershipInitialSavings || 0) > 0) {
      extraDeductionItems.push({ label: 'Initial Savings Deposit', type: 'fixed', amount: parseFloat(watchedMembershipInitialSavings) });
    }
    if (chargeIncluded.membership_vip_card && parseFloat(watchedMembershipVipCard || 0) > 0) {
      extraDeductionItems.push({ label: 'WELLife VIP Card', type: 'fixed', amount: parseFloat(watchedMembershipVipCard) });
    }
    otherCharges.forEach(c => {
      const amt = parseFloat(c.amount || 0) || 0;
      if (c.included && c.label.trim() && amt > 0) {
        extraDeductionItems.push({ label: c.label.trim(), type: 'fixed', amount: amt });
      }
    });
    // Annual dues has its own named param below, so it isn't duplicated here.

    return generateLoanPreview({
      amount,
      termMonths,
      monthlyInterestRate,
      paymentFrequency: watchedFrequency || 'monthly',
      loanMethod: watchedMethod || 'diminishing',
      startDate: watchedReleaseDate || new Date(),
      cbuPerPeriod: parseFloat(watchedCbuPerPeriod || 0) || 0,
      savingsPerPeriod: parseFloat(watchedSavingsPerPeriod || 0) || 0,
      serviceFeePercent: chargeIncluded.service_fee ? (parseFloat(watchedServiceFeePercent || 3.5) || 0) : 0,
      shareCapital: chargeIncluded.cbu_retention ? (parseFloat(watchedShareCapital || 0) || 0) : 0,
      regularSavings: chargeIncluded.regular_savings ? (parseFloat(watchedRegularSavings || 0) || 0) : 0,
      loanInsurance: chargeIncluded.insurance ? (parseFloat(watchedInsuranceManualAmount || 0) || 0) : 0,
      notarialFee: chargeIncluded.notarial_fee ? (parseFloat(watchedNotarialFee || 0) || 0) : 0,
      annualDues: chargeIncluded.annual_dues ? (parseFloat(watchedAnnualDues || 0) || 0) : 0,
      extraDeductionItems,
    });
  }, [
    watchedProposal,
    watchedTerm,
    watchedRate,
    watchedFrequency,
    watchedMethod,
    watchedReleaseDate,
    watchedCbuPerPeriod,
    watchedSavingsPerPeriod,
    watchedServiceFeePercent,
    watchedShareCapital,
    watchedRegularSavings,
    watchedNotarialFee,
    watchedInsuranceManualAmount,
    watchedAnnualDues,
    watchedPenaltyDue,
    watchedCbuCompletion,
    watchedPettyCash,
    watchedMembershipRegulatoryFee,
    watchedMembershipInitialSavings,
    watchedMembershipVipCard,
    otherCharges,
    chargeIncluded,
  ]);

  const proposalAmount = parseFloat(watchedProposal || 0) || 0;

  const chargeRows = useMemo(() => {
    const rows = [
      {
        key: 'service_fee',
        label: 'Service Fee',
        subtitle: 'One-time processing fee',
        typeLabel: 'Percentage',
        isPercent: true,
        rateValue: watchedServiceFeePercent,
        amount: parseFloat(watchedServiceFee || 0) || 0,
        calcText: `${parseFloat(watchedServiceFeePercent || 0) || 0}% × ${formatCurrency(proposalAmount)}`,
      },
      {
        key: 'cbu_retention',
        label: 'CBU Retention',
        subtitle: 'Capital build-up withheld from proceeds',
        typeLabel: 'Percentage',
        isPercent: true,
        rateValue: watchedCbuRetentionPercent,
        amount: parseFloat(watchedShareCapital || 0) || 0,
        calcText: `${parseFloat(watchedCbuRetentionPercent || 0) || 0}% × ${formatCurrency(proposalAmount)}`,
      },
      {
        key: 'notarial_fee',
        label: 'Legal Fees',
        subtitle: 'Notarial / documentation fee',
        typeLabel: 'Fixed Amount',
        isPercent: false,
        rateValue: watchedNotarialFee,
        amount: parseFloat(watchedNotarialFee || 0) || 0,
        calcText: 'Fixed Amount',
      },
      {
        key: 'insurance',
        label: 'CLPI (Insurance)',
        subtitle: 'Coop loan protection — (Loan Amount ÷ 1000) × 1.1 × Months',
        typeLabel: 'Formula',
        isPercent: false,
        rateValue: watchedInsuranceManualAmount,
        amount: parseFloat(watchedInsuranceManualAmount || 0) || 0,
        calcText: `(${formatCurrency(proposalAmount)} ÷ 1,000) × 1.1 × ${parseInt(watchedTerm || 0, 10) || 0} mo`,
      },
      {
        key: 'regular_savings',
        label: 'Regular Savings',
        subtitle: "Member's regular savings deposit",
        typeLabel: chargeTypeMode.regular_savings === 'percent' ? 'Percentage' : 'Fixed Amount',
        isPercent: chargeTypeMode.regular_savings === 'percent',
        typeSelectable: true,
        percentField: 'regular_savings_percent',
        rateValue: chargeTypeMode.regular_savings === 'percent' ? watchedRegularSavingsPercent : watchedRegularSavings,
        amount: parseFloat(watchedRegularSavings || 0) || 0,
        calcText: chargeTypeMode.regular_savings === 'percent'
          ? `${parseFloat(watchedRegularSavingsPercent || 0) || 0}% × ${formatCurrency(proposalAmount)}`
          : 'Fixed Amount',
      },
      {
        key: 'penalty_due',
        label: 'Penalty Due',
        subtitle: 'Optional — penalty amount due on this loan',
        typeLabel: chargeTypeMode.penalty_due === 'percent' ? 'Percentage' : 'Fixed Amount',
        isPercent: chargeTypeMode.penalty_due === 'percent',
        typeSelectable: true,
        percentField: 'penalty_due_percent',
        rateValue: chargeTypeMode.penalty_due === 'percent' ? watchedPenaltyDuePercent : watchedPenaltyDue,
        amount: parseFloat(watchedPenaltyDue || 0) || 0,
        calcText: chargeTypeMode.penalty_due === 'percent'
          ? `${parseFloat(watchedPenaltyDuePercent || 0) || 0}% × ${formatCurrency(proposalAmount)}`
          : 'Fixed Amount',
      },
      {
        key: 'annual_dues',
        label: 'Annual Due',
        subtitle: 'Optional — annual membership due',
        typeLabel: chargeTypeMode.annual_dues === 'percent' ? 'Percentage' : 'Fixed Amount',
        isPercent: chargeTypeMode.annual_dues === 'percent',
        typeSelectable: true,
        percentField: 'annual_dues_percent',
        rateValue: chargeTypeMode.annual_dues === 'percent' ? watchedAnnualDuesPercent : watchedAnnualDues,
        amount: parseFloat(watchedAnnualDues || 0) || 0,
        calcText: chargeTypeMode.annual_dues === 'percent'
          ? `${parseFloat(watchedAnnualDuesPercent || 0) || 0}% × ${formatCurrency(proposalAmount)}`
          : 'Fixed Amount',
      },
      {
        key: 'cbu_completion',
        label: 'CBU Completion',
        subtitle: "Optional — amount to complete member's required CBU",
        typeLabel: chargeTypeMode.cbu_completion === 'percent' ? 'Percentage' : 'Fixed Amount',
        isPercent: chargeTypeMode.cbu_completion === 'percent',
        typeSelectable: true,
        percentField: 'cbu_completion_percent',
        rateValue: chargeTypeMode.cbu_completion === 'percent' ? watchedCbuCompletionPercent : watchedCbuCompletion,
        amount: parseFloat(watchedCbuCompletion || 0) || 0,
        calcText: chargeTypeMode.cbu_completion === 'percent'
          ? `${parseFloat(watchedCbuCompletionPercent || 0) || 0}% × ${formatCurrency(proposalAmount)}`
          : 'Fixed Amount',
      },
      {
        key: 'petty_cash',
        label: 'Petty Cash',
        subtitle: 'Optional — petty cash release for this loan',
        typeLabel: chargeTypeMode.petty_cash === 'percent' ? 'Percentage' : 'Fixed Amount',
        isPercent: chargeTypeMode.petty_cash === 'percent',
        typeSelectable: true,
        percentField: 'petty_cash_percent',
        rateValue: chargeTypeMode.petty_cash === 'percent' ? watchedPettyCashPercent : watchedPettyCash,
        amount: parseFloat(watchedPettyCash || 0) || 0,
        calcText: chargeTypeMode.petty_cash === 'percent'
          ? `${parseFloat(watchedPettyCashPercent || 0) || 0}% × ${formatCurrency(proposalAmount)}`
          : 'Fixed Amount',
      },
      {
        key: 'membership_regulatory_fee',
        label: 'Regulatory Fee (Membership)',
        subtitle: 'Associate → Regular upgrade — Admin & Regulatory Fee',
        typeLabel: 'Fixed Amount',
        isPercent: false,
        rateValue: watchedMembershipRegulatoryFee,
        amount: parseFloat(watchedMembershipRegulatoryFee || 0) || 0,
        calcText: 'Fixed Amount',
      },
      {
        key: 'membership_initial_savings',
        label: 'Initial Savings Deposit',
        subtitle: 'Associate → Regular upgrade — opens regular savings',
        typeLabel: 'Fixed Amount',
        isPercent: false,
        rateValue: watchedMembershipInitialSavings,
        amount: parseFloat(watchedMembershipInitialSavings || 0) || 0,
        calcText: 'Fixed Amount',
      },
      {
        key: 'membership_vip_card',
        label: 'WELLife VIP Card',
        subtitle: 'Associate → Regular upgrade — 2-year validity',
        typeLabel: 'Fixed Amount',
        isPercent: false,
        rateValue: watchedMembershipVipCard,
        amount: parseFloat(watchedMembershipVipCard || 0) || 0,
        calcText: 'Fixed Amount',
      },
    ];
    return rows;
  }, [
    proposalAmount,
    watchedTerm,
    watchedServiceFeePercent,
    watchedServiceFee,
    watchedCbuRetentionPercent,
    watchedShareCapital,
    watchedNotarialFee,
    watchedInsuranceManualAmount,
    watchedRegularSavings,
    watchedRegularSavingsPercent,
    watchedPenaltyDue,
    watchedPenaltyDuePercent,
    watchedAnnualDues,
    watchedAnnualDuesPercent,
    watchedCbuCompletion,
    watchedCbuCompletionPercent,
    watchedPettyCash,
    watchedPettyCashPercent,
    chargeTypeMode,
    watchedMembershipRegulatoryFee,
    watchedMembershipInitialSavings,
    watchedMembershipVipCard,
  ]);

  const totalCharges = round2(
    chargeRows.reduce((sum, r) => sum + (chargeIncluded[r.key] ? r.amount : 0), 0) +
    otherCharges.reduce((sum, c) => sum + (c.included ? (parseFloat(c.amount || 0) || 0) : 0), 0)
  );
  const netLoanProceeds = round2(Math.max(0, proposalAmount - totalCharges));

  function handleRecalculateCharges() {
    setPreviewReady(false);
    toast.success('Charges recalculated.');
  }


  useEffect(() => {
    if (!watchedProduct || watchedProduct === 'custom') return;
    const cfg = LOAN_PRODUCT_MAP[watchedProduct];
    if (!cfg) return;
    // Existing/Ongoing loans keep the rate that was in effect when they were
    // originally released; New loans use the coop's current, updated rate.
    const rateToUse = watchedLoanType === 'existing' ? (cfg.previousRate ?? cfg.rate) : cfg.rate;
    setValue('interest_rate', rateToUse);
    setValue('loan_method', cfg.method);
    setPreviewReady(false);
  }, [watchedProduct, watchedLoanType, setValue]);

  // Payment Frequency options are scoped to the selected Loan Type — Old/
  // Existing loans only offer frequencies still using the old formula
  // (currently just Weekly), New loans only offer frequencies with the new
  // formula already implemented. If the currently selected frequency isn't
  // valid for the newly selected loan type, fall back to that list's first
  // option.
  const frequencyOptions = watchedLoanType === 'existing' ? OLD_LOAN_FREQUENCY_OPTS : NEW_LOAN_FREQUENCY_OPTS;

  useEffect(() => {
    const allowedValues = watchedLoanType === 'existing' ? OLD_FORMULA_FREQUENCY_VALUES : NEW_FORMULA_FREQUENCY_VALUES;
    if (watchedFrequency && !allowedValues.includes(watchedFrequency)) {
      setValue('repayment_frequency', allowedValues[0]);
      setPreviewReady(false);
    }
  }, [watchedLoanType, watchedFrequency, setValue]);

  useEffect(() => {
    const proposal = parseFloat(watchedProposal || 0) || 0;
    const serviceFee = proposal * ((parseFloat(watchedServiceFeePercent || 3.5) || 0) / 100);
    setValue('service_fee', serviceFee ? round2(serviceFee).toFixed(2) : '');

    const cbuRetention = proposal * ((parseFloat(watchedCbuRetentionPercent || 0) || 0) / 100);
    setValue('share_capital', cbuRetention ? round2(cbuRetention).toFixed(2) : '');

    const termMonths = parseInt(watchedTerm || 0, 10) || 0;
    const clpi = (proposal / 1000) * 1.1 * termMonths;
    setValue('insurance_manual_amount', clpi ? round2(clpi).toFixed(2) : '');

    if (chargeTypeMode.regular_savings === 'percent') {
      const regularSavingsAmt = proposal * ((parseFloat(watchedRegularSavingsPercent || 0) || 0) / 100);
      setValue('regular_savings', regularSavingsAmt ? round2(regularSavingsAmt).toFixed(2) : '');
    }

    if (chargeTypeMode.penalty_due === 'percent') {
      const amt = proposal * ((parseFloat(watchedPenaltyDuePercent || 0) || 0) / 100);
      setValue('penalty_due', amt ? round2(amt).toFixed(2) : '');
    }
    if (chargeTypeMode.annual_dues === 'percent') {
      const amt = proposal * ((parseFloat(watchedAnnualDuesPercent || 0) || 0) / 100);
      setValue('annual_dues', amt ? round2(amt).toFixed(2) : '');
    }
    if (chargeTypeMode.cbu_completion === 'percent') {
      const amt = proposal * ((parseFloat(watchedCbuCompletionPercent || 0) || 0) / 100);
      setValue('cbu_completion', amt ? round2(amt).toFixed(2) : '');
    }
    if (chargeTypeMode.petty_cash === 'percent') {
      const amt = proposal * ((parseFloat(watchedPettyCashPercent || 0) || 0) / 100);
      setValue('petty_cash', amt ? round2(amt).toFixed(2) : '');
    }

    // Keep hidden amount field in sync with proposal
    setValue('amount', watchedProposal || '');

    setPreviewReady(false);
  }, [
    watchedProposal,
    watchedServiceFeePercent,
    watchedRate,
    watchedTerm,
    watchedFrequency,
    watchedMethod,
    watchedReleaseDate,
    watchedCbuPerPeriod,
    watchedSavingsPerPeriod,
    watchedCbuRetentionPercent,
    watchedNotarialFee,
    watchedRegularSavingsPercent,
    watchedPenaltyDuePercent,
    watchedAnnualDuesPercent,
    watchedCbuCompletionPercent,
    watchedPettyCashPercent,
    chargeTypeMode,
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
      if (isEdit) return;

      const loanTypeParam = searchParams.get('loan_type');
      if (loanTypeParam === 'existing' || loanTypeParam === 'new') {
        setValue('loan_type', loanTypeParam);
      }

      const memberId = searchParams.get('member');
      if (!memberId) return;

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
          loan_type: data.loan_type || 'new',
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
          regular_savings_percent: data.regular_savings_percent || '',
          total_loan_payable: data.total_loan_payable || '',

          service_fee_percent: data.service_fee_percent || '3.5',
          cbu_retention_percent: data.cbu_retention_percent || '5.0',
          share_capital: data.share_capital || '',
          notarial_fee: data.notarial_fee || '200',
          insurance_manual_amount: data.insurance_manual_amount || data.loan_insurance || '',
          cbu_per_period: data.cbu_per_period || '25',
          savings_per_period: data.savings_per_period || '25',

          penalty_due: data.penalty_due || '',
          penalty_due_percent: data.penalty_due_percent || '',
          annual_dues: data.annual_dues || '',
          annual_dues_percent: data.annual_dues_percent || '',
          petty_cash: data.petty_cash || '',
          petty_cash_percent: data.petty_cash_percent || '',
          cbu_completion: data.cbu_completion || '',
          cbu_completion_percent: data.cbu_completion_percent || '',

          membership_regulatory_fee: data.membership_regulatory_fee || '1000',
          membership_initial_savings: data.membership_initial_savings || '500',
          membership_vip_card: data.membership_vip_card || '300',

          co_maker_name: data.co_maker_name || '',
          co_maker_member_no: data.co_maker_member_no || '',
          co_maker_relationship: data.co_maker_relationship || '',
          co_maker_contact_no: data.co_maker_contact_no || '',
        });

        setChargeTypeMode({
          regular_savings: parseFloat(data.regular_savings_percent || 0) > 0
            ? 'percent'
            : (parseFloat(data.regular_savings || 0) > 0 ? 'fixed' : 'percent'),
          penalty_due: parseFloat(data.penalty_due_percent || 0) > 0 ? 'percent' : 'fixed',
          annual_dues: parseFloat(data.annual_dues_percent || 0) > 0 ? 'percent' : 'fixed',
          cbu_completion: parseFloat(data.cbu_completion_percent || 0) > 0 ? 'percent' : 'fixed',
          petty_cash: parseFloat(data.petty_cash_percent || 0) > 0 ? 'percent' : 'fixed',
        });

        setChargeIncluded(prev => ({
          ...prev,
          membership_regulatory_fee: Boolean(data.membership_upgrade_included),
          membership_initial_savings: Boolean(data.membership_upgrade_included),
          membership_vip_card: Boolean(data.membership_upgrade_included),
        }));
        if (data.co_maker_required != null) {
          setCoMakerOverride(Boolean(data.co_maker_required));
        }

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
        cbuBalance: parseFloat(cbuAccount?.balance || 0) || 0,
        savingsBalance: parseFloat(savingsAccount?.balance || 0) || 0,
      });
    } catch {
      setMemberAccounts({
        cbuAccountNo: '',
        savingsAccountNo: '',
        cbuAccountId: '',
        savingsAccountId: '',
        cbuBalance: 0,
        savingsBalance: 0,
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

    const amount = parseFloat(values.loan_proposal || 0);
    const termMonths = parseInt(values.term_months || 0, 10);
    const monthlyInterestRate = parseFloat(values.interest_rate || 0);

    if (amount <= 0) {
      toast.error('Loan Proposal (amount) must be greater than zero.');
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

  // ── PRINT: Loan Application Preview (before the loan is actually created) ──
  function handlePrint() {
    if (!preview) {
      toast.error('Please generate the preview first.');
      return;
    }

    const values = getValues();
    const memberName = [selectedMember?.first_name, selectedMember?.last_name].filter(Boolean).join(' ') || '—';
    const printedAt = new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });

    const scheduleRowsHTML = preview.schedule.map(row => {
      const freqTotal = round2(row.total_due != null ? row.total_due : (row.principal || 0) + (row.interest || 0));
      return `
        <tr>
          <td>${row.period}</td>
          <td>${formatCurrency(row.balance || 0)}</td>
          <td>${formatCurrency(row.principal || 0)}</td>
          <td>${formatCurrency(row.interest || 0)}</td>
          <td>${formatCurrency(freqTotal)}</td>
          <td>${formatDate(row.due_date)}</td>
        </tr>
      `;
    }).join('');

    const contentHtml = `
      <div class="doc-meta-row">
        <span class="doc-title">Loan Application Preview<span class="draft-badge">Not Yet Created</span></span>
        <span class="printed-at">Printed: ${printedAt}</span>
      </div>

      <div class="info-grid">
        <div class="col">
          <h3>Borrower Information</h3>
          ${loanFormKvRow('Member Name', memberName)}
          ${loanFormKvRow('Member No.', memberProfile.member_no || '—')}
          ${loanFormKvRow('Loan Type', titleCase(values.loan_type))}
          ${loanFormKvRow('Loan Product', LOAN_PRODUCT_MAP[values.loan_product]?.label || '—')}
          ${loanFormKvRow('Purpose', values.purpose || '—')}
          ${coMakerRequired ? loanFormKvRow('Co-Maker', watchedCoMakerName?.trim() ? watchedCoMakerName : 'Required — not yet filled in') : ''}
        </div>
        <div class="col">
          <h3>Loan Terms</h3>
          ${loanFormKvRow('Loan Proposal', formatCurrency(proposalAmount))}
          ${loanFormKvRow('Interest Rate', `${values.interest_rate || 0}% / month`)}
          ${loanFormKvRow('Term', `${values.term_months || 0} months`)}
          ${loanFormKvRow('Frequency', frequencyDisplayLabel(watchedFrequency))}
          ${loanFormKvRow('Method', titleCase(watchedMethod))}
          ${loanFormKvRow('Release Date', formatDate(values.release_date))}
        </div>
      </div>

      <div class="info-grid" style="margin-bottom:14px">
        <div class="col">
          <h3>Deductions</h3>
          ${loanFormKvRow('Service Fee', formatCurrency(preview.deductions.service_fee))}
          ${loanFormKvRow('CBU Retention', formatCurrency(preview.deductions.cbu_retention))}
          ${loanFormKvRow('Notarial Fee', formatCurrency(preview.deductions.notarial_fee))}
          ${loanFormKvRow('Insurance', formatCurrency(preview.deductions.insurance))}
          ${loanFormKvRow('Total Deductions', formatCurrency(preview.deductions.total_deductions))}
          ${loanFormKvRow('Net Proceeds', formatCurrency(preview.deductions.net_proceeds), true)}
        </div>
        <div class="col">
          <h3>Computed Summary</h3>
          ${loanFormKvRow('No. of Payments', preview.summary.number_of_payments)}
          ${loanFormKvRow('Rate / Period', `${preview.summary.rate_per_period}%`)}
          ${loanFormKvRow('Loan Payment / Period', formatCurrency(preview.summary.loan_payment_per_period))}
          ${loanFormKvRow('Total / Period (w/ CBU+Savings)', formatCurrency(preview.summary.payment_per_period))}
          ${loanFormKvRow('Total Interest', formatCurrency(preview.summary.total_interest_earned))}
          ${loanFormKvRow('Total Payable', formatCurrency(preview.summary.total_payments_collected), true)}
        </div>
      </div>

      <div class="section-header">
        <span>Amortization Schedule</span>
        <span class="meta">${frequencyDisplayLabel(watchedFrequency)} · ${preview.schedule.length} payments</span>
      </div>
      <table class="schedule">
        <thead>
          <tr>
            <th style="text-align:left">No.</th>
            <th style="text-align:left">Principal</th>
            <th>Principal Amort.</th>
            <th>Interest</th>
            <th>${frequencyDisplayLabel(watchedFrequency)} Total</th>
            <th>Due Date</th>
          </tr>
        </thead>
        <tbody>${scheduleRowsHTML}</tbody>
      </table>

      <div class="totals-bar">
        <div class="tot-item">
          <span class="tot-label">Total Principal</span>
          <span class="tot-value">${formatCurrency(preview.summary.total_principal_collected)}</span>
        </div>
        <div class="tot-item">
          <span class="tot-label">Total Interest</span>
          <span class="tot-value">${formatCurrency(preview.summary.total_interest_earned)}</span>
        </div>
        <div class="tot-item">
          <span class="tot-label">Total Payable</span>
          <span class="tot-value">${formatCurrency(preview.summary.total_payments_collected)}</span>
        </div>
      </div>

      <div class="sig-block">
        <div class="sig-item"><strong>Prepared by</strong>Signature over Printed Name</div>
        <div class="sig-item"><strong>Verified by</strong>Signature over Printed Name</div>
        <div class="sig-item"><strong>Borrower's Conformity</strong>Signature over Printed Name / Date</div>
      </div>

      <div class="confidential-note">This is a draft preview only — the loan has not yet been recorded in the system.</div>
    `;

    printHtmlDocument(
      wrapWithLetterhead(contentHtml, {
        title: `Loan Application Preview — ${memberName}`,
        extraCss: loanFormPrintStyles(),
      }),
      {
        width: 1100,
        height: 900,
        delay: 400,
        onBlocked: () => toast.error('Unable to open print preview.'),
      }
    );
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

    if (coMakerRequired && !values.co_maker_name?.trim()) {
      toast.error('This loan requires a co-maker — please fill in the co-maker details.');
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

      const principalAmount = parseFloat(values.loan_proposal || values.amount || 0);
      const regularSavings = chargeIncluded.regular_savings ? (parseFloat(values.regular_savings || 0) || 0) : 0;

      const otherChargesIncluded = otherCharges
        .filter(c => c.included && c.label.trim() && parseFloat(c.amount || 0) > 0)
        .map(c => ({ label: c.label.trim(), amount: round2(parseFloat(c.amount) || 0) }));
      const otherChargesTotal = round2(otherChargesIncluded.reduce((s, c) => s + c.amount, 0));

      const payload = {
        ...values,
        source: 'manual',
        amount: principalAmount,
        balance: principalAmount,
        monthly_amortization: round2(preview.summary?.payment_per_period || 0),
        total_loan_payable: round2(preview.summary?.total_payments_collected || 0),
        service_fee: chargeIncluded.service_fee ? round2(preview.deductions?.items?.find(d => d.label?.toLowerCase().includes('service'))?.amount
          || preview.deductions?.service_fee || 0) : 0,
        loan_insurance: chargeIncluded.insurance ? round2(preview.deductions?.items?.find(d =>
          d.label?.toLowerCase().includes('protection') || d.label?.toLowerCase().includes('clpp'))?.amount
          || preview.deductions?.insurance || 0) : 0,
        loan_proposal: parseFloat(values.loan_proposal || principalAmount) || principalAmount,
        repayment_frequency: values.repayment_frequency,
        loan_method: values.loan_method,
        service_fee_percent: parseFloat(values.service_fee_percent || 3.5) || 0,
        cbu_retention_percent: parseFloat(values.cbu_retention_percent || 5.0) || 0,
        share_capital: chargeIncluded.cbu_retention ? (parseFloat(values.share_capital || 0) || 0) : 0,
        notarial_fee: chargeIncluded.notarial_fee ? (parseFloat(values.notarial_fee || 200) || 0) : 0,
        insurance_mode: 'manual',
        insurance_fixed_rate_percent: 0,
        insurance_manual_amount: chargeIncluded.insurance ? (parseFloat(values.insurance_manual_amount || 0) || 0) : 0,
        regular_savings: regularSavings,
        regular_savings_percent: chargeTypeMode.regular_savings === 'percent' ? (parseFloat(values.regular_savings_percent || 0) || 0) : 0,
        cbu_per_period: parseFloat(values.cbu_per_period || 25) || 0,
        savings_per_period: parseFloat(values.savings_per_period || 25) || 0,
        penalty_due: chargeIncluded.penalty_due ? (parseFloat(values.penalty_due || 0) || 0) : 0,
        penalty_due_percent: chargeTypeMode.penalty_due === 'percent' ? (parseFloat(values.penalty_due_percent || 0) || 0) : 0,
        annual_dues: chargeIncluded.annual_dues ? (parseFloat(values.annual_dues || 0) || 0) : 0,
        annual_dues_percent: chargeTypeMode.annual_dues === 'percent' ? (parseFloat(values.annual_dues_percent || 0) || 0) : 0,
        petty_cash: chargeIncluded.petty_cash ? (parseFloat(values.petty_cash || 0) || 0) : 0,
        petty_cash_percent: chargeTypeMode.petty_cash === 'percent' ? (parseFloat(values.petty_cash_percent || 0) || 0) : 0,
        cbu_completion: chargeIncluded.cbu_completion ? (parseFloat(values.cbu_completion || 0) || 0) : 0,
        cbu_completion_percent: chargeTypeMode.cbu_completion === 'percent' ? (parseFloat(values.cbu_completion_percent || 0) || 0) : 0,

        membership_upgrade_included: membershipUpgradeIncluded,
        membership_regulatory_fee: chargeIncluded.membership_regulatory_fee ? (parseFloat(values.membership_regulatory_fee || 0) || 0) : 0,
        membership_initial_savings: chargeIncluded.membership_initial_savings ? (parseFloat(values.membership_initial_savings || 0) || 0) : 0,
        membership_vip_card: chargeIncluded.membership_vip_card ? (parseFloat(values.membership_vip_card || 0) || 0) : 0,

        co_maker_required: coMakerRequired,
        co_maker_name: coMakerRequired ? (values.co_maker_name || '') : '',
        co_maker_member_no: coMakerRequired ? (values.co_maker_member_no || '') : '',
        co_maker_relationship: coMakerRequired ? (values.co_maker_relationship || '') : '',
        co_maker_contact_no: coMakerRequired ? (values.co_maker_contact_no || '') : '',

        preview_summary_json: JSON.stringify(preview.summary),
        preview_deductions_json: JSON.stringify({
          ...preview.deductions,
          charge_inclusion: chargeIncluded,
          other_charges: otherChargesIncluded,
          other_charges_total: otherChargesTotal,
        }),
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
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">
              Loan Details
            </h3>
            <span
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                watchedLoanType === 'existing'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {watchedLoanType === 'existing' ? 'Existing / Ongoing Loan' : 'New Loan'}
            </span>
          </div>

          {/* Row 0: Loan Type */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <Select
                label="Loan Type"
                options={LOAN_TYPE_OPTS}
                {...register('loan_type')}
              />
              <p className="text-[10px] text-gray-400 mt-0.5 pl-0.5">
                {watchedLoanType === 'existing'
                  ? 'Uses the previous interest rate for this product.'
                  : 'Uses the current, updated interest rate for this product.'}
              </p>
            </div>
          </div>

          {/* Row 1: Loan Product | Loan Proposal | Monthly Interest Rate */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <Select
                label="Loan Product"
                options={LOAN_PRODUCTS}
                {...register('loan_product')}
              />
              <p className="text-[10px] text-gray-400 mt-0.5 pl-0.5">Auto-fills rate &amp; method</p>
            </div>

            <div>
              <Input
                label="Loan Proposal"
                type="number"
                step="0.01"
                required
                error={errors.loan_proposal?.message}
                {...register('loan_proposal', {
                  required: 'Loan Proposal is required',
                  min: { value: 1, message: 'Must be > 0' },
                })}
              />
              <p className="text-[10px] text-gray-400 mt-0.5 pl-0.5">Principal amount to be released</p>
            </div>

            <div>
              <Input
                label="Monthly Interest Rate (%)"
                type="number"
                step="0.01"
                {...register('interest_rate')}
              />
              <p className="text-[10px] text-gray-400 mt-0.5 pl-0.5">Auto-set by product</p>
            </div>
          </div>

          {beneficialTier && (
            <div className={`mb-4 rounded-lg px-4 py-3 border ${
              cbuShortfall > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'
            }`}>
              <p className={`text-xs font-medium ${cbuShortfall > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>
                {beneficialTier.label} — requires {formatCurrency(beneficialTier.requiredCbu)} CBU
                {beneficialTier.requiresCoMaker ? ' + Co-Maker' : ''}
              </p>
              <p className={`text-[11px] mt-1 ${cbuShortfall > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                Member's current CBU balance: {formatCurrency(memberAccounts.cbuBalance || 0)}.{' '}
                {cbuShortfall > 0
                  ? `Short by ${formatCurrency(cbuShortfall)} — add this as "CBU Completion" below to auto-deduct it from the loan proceeds.`
                  : 'CBU requirement met.'}
                {' '}This is advisory guidance from the WELLSERVE loan products reference — confirm against actual coop policy before approving.
              </p>
            </div>
          )}

          {/* Row 2: Term (months) | Release Date | Payment Frequency */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <Input
                label="Term (months)"
                type="number"
                {...register('term_months')}
              />
              <p className="text-[10px] text-gray-400 mt-0.5 pl-0.5">Number of months</p>
            </div>

            <div>
              <Input
                label="Release Date"
                type="date"
                {...register('release_date')}
              />
              <p className="text-[10px] text-gray-400 mt-0.5 pl-0.5">Date of loan release</p>
            </div>

            <div>
              <Select
                label="Payment Frequency"
                options={frequencyOptions}
                {...register('repayment_frequency')}
              />
              <p className="text-[10px] text-gray-400 mt-0.5 pl-0.5">
                {watchedLoanType === 'existing'
                  ? 'Old loans: only old-formula frequencies are available.'
                  : 'How often payments are made'}
              </p>
            </div>
          </div>

          {/* Row 3: Loan Method | Purpose | Preview Payment / Period */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <Select
                label="Loan Method"
                options={LOAN_METHOD_OPTS}
                {...register('loan_method')}
              />
              <p className="text-[10px] text-gray-400 mt-0.5 pl-0.5">Auto-set by product</p>
            </div>

            <div>
              <Input
                label="Purpose"
                placeholder="Optional"
                {...register('purpose')}
              />
              <p className="text-[10px] text-gray-400 mt-0.5 pl-0.5">Optional</p>
            </div>

            <div>
              <Input
                label="Preview Payment / Period"
                readOnly
                value={preview ? formatCurrency(preview.summary.payment_per_period) : ''}
              />
              <p className="text-[10px] text-gray-400 mt-0.5 pl-0.5">Auto-calculated — read only</p>
            </div>
          </div>

          {/* Hidden field for monthly amortization and amount (synced from loan_proposal) */}
          <input type="hidden" {...register('monthly_amortization')} />
          <input type="hidden" {...register('amount')} />

          {/* Notes — full width */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              rows={3}
              placeholder="Optional notes..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              {...register('notes')}
            />
            <p className="text-[10px] text-gray-400 mt-0.5 pl-0.5">Optional — internal use only</p>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Co-Maker</h3>
            <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={coMakerRequired}
                onChange={e => setCoMakerOverride(e.target.checked)}
                className="rounded border-gray-300"
              />
              Requires a co-maker
            </label>
          </div>

          {coMakerOverride === null && (
            <p className="text-[11px] text-gray-400 -mt-2 mb-3">
              {coMakerAutoRequired
                ? 'Auto-suggested because of the selected loan product / CBU tier — uncheck above if not applicable.'
                : 'Not required for this product/tier — check above if this specific loan needs one anyway.'}
            </p>
          )}

          {coMakerRequired ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Co-Maker Full Name"
                required
                {...register('co_maker_name', coMakerRequired ? { required: 'Co-maker name is required' } : {})}
                error={errors.co_maker_name?.message}
              />
              <Input
                label="Co-Maker Member No."
                placeholder="If also a WELLSERVE member"
                {...register('co_maker_member_no')}
              />
              <Input
                label="Relationship to Borrower"
                placeholder="e.g. Immediate family, Active WELLife member"
                {...register('co_maker_relationship')}
              />
              <Input
                label="Co-Maker Contact No."
                {...register('co_maker_contact_no')}
              />
            </div>
          ) : (
            <p className="text-sm text-gray-400">No co-maker needed for this loan.</p>
          )}
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-start justify-between mb-1">
            <div className="flex items-center gap-2">
              <FileSpreadsheet size={16} className="text-gray-400" />
              <h3 className="text-base font-semibold text-gray-800">Loan Deductions &amp; Onboarding</h3>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={membershipUpgradeIncluded ? 'primary' : 'outline'}
                size="sm"
                onClick={toggleMembershipUpgradeBundle}
                icon={<Check size={13} />}
              >
                {membershipUpgradeIncluded ? 'Membership Upgrade Applied' : 'Apply Membership Upgrade'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRecalculateCharges}
                icon={<RotateCw size={13} />}
              >
                Recalculate
              </Button>
            </div>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            Review and confirm all applicable charges and fees for this loan.
          </p>

          {membershipUpgradeIncluded && (
            <div className="mb-4 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
              <p className="text-xs text-blue-800 font-medium">
                Associate → Regular Membership Upgrade bundle applied
              </p>
              <p className="text-[11px] text-blue-700 mt-1">
                Regulatory Fee (₱1,000), Initial Savings Deposit (₱500), and WELLife VIP Card (₱300) are now
                included below. Don't forget to also set <strong>CBU Completion</strong> to the member's CBU
                shortfall{cbuShortfall > 0 ? ` (currently ${formatCurrency(cbuShortfall)} short of the ${formatCurrency(beneficialTier?.requiredCbu || 0)} required for this tier)` : ''} —
                this is the "Share Capital" line on the coop's printed worksheet.
              </p>
            </div>
          )}

          <div className="overflow-x-auto -mx-1">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="pb-2 pl-1 font-medium">Charge / Fee</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Rate / Amount</th>
                  <th className="pb-2 font-medium">Calculation</th>
                  <th className="pb-2 font-medium text-right">Amount</th>
                  <th className="pb-2 pr-1 font-medium text-center w-10"></th>
                </tr>
              </thead>
              <tbody>
                {chargeRows.map(row => {
                  const included = chargeIncluded[row.key];
                  return (
                    <tr key={row.key} className={`border-b border-gray-50 last:border-0 ${included ? '' : 'opacity-40'}`}>
                      <td className="py-3 pl-1 pr-4 align-top">
                        <div className="text-sm font-medium text-gray-800">{row.label}</div>
                        <div className="text-[11px] text-gray-400">{row.subtitle}</div>
                      </td>
                      <td className="py-3 pr-4 align-top">
                        {row.typeSelectable ? (
                          <select
                            value={chargeTypeMode[row.key]}
                            onChange={e => setChargeType(row.key, e.target.value)}
                            disabled={!included}
                            className="text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 disabled:opacity-60"
                          >
                            <option value="fixed">Fixed Amount</option>
                            <option value="percent">Percentage</option>
                          </select>
                        ) : (
                          <span className="inline-flex items-center text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 whitespace-nowrap">
                            {row.typeLabel}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 align-top">
                        <div className="relative w-24">
                          <input
                            key={`${row.key}-${row.typeSelectable ? chargeTypeMode[row.key] : 'fixed'}`}
                            type="number"
                            step="0.01"
                            disabled={!included}
                            readOnly={row.key === 'insurance'}
                            className="w-full text-sm border border-gray-200 rounded-lg pl-2.5 pr-6 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 disabled:bg-gray-50 read-only:bg-gray-50 read-only:text-gray-500"
                            {...register(
                              row.key === 'service_fee' ? 'service_fee_percent' :
                              row.key === 'cbu_retention' ? 'cbu_retention_percent' :
                              row.key === 'notarial_fee' ? 'notarial_fee' :
                              row.key === 'insurance' ? 'insurance_manual_amount' :
                              row.typeSelectable ? (row.isPercent ? row.percentField : row.key) :
                              row.key
                            )}
                          />
                          {row.isPercent && (
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">%</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4 align-top text-xs text-gray-500 whitespace-nowrap">{row.calcText}</td>
                      <td className="py-3 pr-4 align-top text-sm font-semibold text-gray-800 text-right whitespace-nowrap">
                        {formatCurrency(row.amount)}
                      </td>
                      <td className="py-3 pr-1 align-top text-center">
                        <button
                          type="button"
                          onClick={() => toggleCharge(row.key)}
                          title={included ? 'Included — click to exclude' : 'Excluded — click to include'}
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full border transition-colors ${
                            included
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                              : 'bg-gray-50 border-gray-200 text-gray-300'
                          }`}
                        >
                          <Check size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {otherCharges.map(charge => (
                  <tr key={charge.id} className={`border-b border-gray-50 last:border-0 ${charge.included ? '' : 'opacity-40'}`}>
                    <td className="py-3 pl-1 pr-4 align-top">
                      <input
                        type="text"
                        placeholder="Charge name"
                        disabled={!charge.included}
                        value={charge.label}
                        onChange={e => updateOtherCharge(charge.id, { label: e.target.value })}
                        className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 disabled:bg-gray-50"
                      />
                      <div className="text-[11px] text-gray-400 mt-1">Custom charge</div>
                    </td>
                    <td className="py-3 pr-4 align-top">
                      <span className="inline-flex items-center text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 whitespace-nowrap">
                        Fixed Amount
                      </span>
                    </td>
                    <td className="py-3 pr-4 align-top">
                      <input
                        type="number"
                        step="0.01"
                        disabled={!charge.included}
                        value={charge.amount}
                        onChange={e => updateOtherCharge(charge.id, { amount: e.target.value })}
                        className="w-24 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 disabled:bg-gray-50"
                      />
                    </td>
                    <td className="py-3 pr-4 align-top text-xs text-gray-500 whitespace-nowrap">Fixed Amount</td>
                    <td className="py-3 pr-4 align-top text-sm font-semibold text-gray-800 text-right whitespace-nowrap">
                      {formatCurrency(parseFloat(charge.amount || 0) || 0)}
                    </td>
                    <td className="py-3 pr-1 align-top">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateOtherCharge(charge.id, { included: !charge.included })}
                          title={charge.included ? 'Included — click to exclude' : 'Excluded — click to include'}
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full border transition-colors ${
                            charge.included
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                              : 'bg-gray-50 border-gray-200 text-gray-300'
                          }`}
                        >
                          <Check size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeOtherCharge(charge.id)}
                          title="Remove charge"
                          className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mt-4 pt-4 border-t border-gray-100">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addOtherCharge}
              icon={<Plus size={14} />}
            >
              Add Other Charge
            </Button>

            <div className="w-full sm:w-64 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Total Deductions</span>
                <span className="font-medium text-gray-700">{formatCurrency(totalCharges)}</span>
              </div>
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 mt-2">
                <span className="text-xs font-medium text-emerald-700">Net Loan Proceeds</span>
                <span className="text-sm font-bold text-emerald-700">{formatCurrency(netLoanProceeds)}</span>
              </div>
            </div>
          </div>

          {/* Auto-calculated totals */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 pt-4 border-t border-gray-100">
            <div>
              <Input
                label="Total Loan Payable"
                type="number"
                step="0.01"
                readOnly
                {...register('total_loan_payable')}
              />
              <p className="text-[10px] text-gray-400 mt-0.5 pl-0.5">Auto-calculated — read only</p>
            </div>
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
                  label="Monthly Rate"
                  value={`${preview.summary.rate_per_period}%`}
                />
                <CalcCard
                  label="Loan Payment / Period"
                  value={formatCurrency(preview.summary.loan_payment_per_period)}
                  highlight
                />
                <CalcCard
                  label="Total / Period (w/ CBU+Savings)"
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
                {parseFloat(watchedPenaltyDue || 0) > 0 && (
                  <CalcCard label="Penalty Due" value={formatCurrency(parseFloat(watchedPenaltyDue))} />
                )}
                {parseFloat(watchedAnnualDues || 0) > 0 && (
                  <CalcCard label="Annual Due" value={formatCurrency(parseFloat(watchedAnnualDues))} />
                )}
                {parseFloat(watchedCbuCompletion || 0) > 0 && (
                  <CalcCard label="CBU Completion" value={formatCurrency(parseFloat(watchedCbuCompletion))} />
                )}
                {parseFloat(watchedPettyCash || 0) > 0 && (
                  <CalcCard label="Petty Cash" value={formatCurrency(parseFloat(watchedPettyCash))} />
                )}
                {chargeIncluded.membership_regulatory_fee && parseFloat(watchedMembershipRegulatoryFee || 0) > 0 && (
                  <CalcCard label="Regulatory Fee (Membership)" value={formatCurrency(parseFloat(watchedMembershipRegulatoryFee))} />
                )}
                {chargeIncluded.membership_initial_savings && parseFloat(watchedMembershipInitialSavings || 0) > 0 && (
                  <CalcCard label="Initial Savings Deposit" value={formatCurrency(parseFloat(watchedMembershipInitialSavings))} />
                )}
                {chargeIncluded.membership_vip_card && parseFloat(watchedMembershipVipCard || 0) > 0 && (
                  <CalcCard label="WELLife VIP Card" value={formatCurrency(parseFloat(watchedMembershipVipCard))} />
                )}
                {coMakerRequired && (
                  <CalcCard
                    label="Co-Maker"
                    value={watchedCoMakerName?.trim() ? watchedCoMakerName : 'Required — not yet filled in'}
                  />
                )}
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
                          'Interest',
                          (watchedFrequency === 'semi_monthly' || watchedFrequency === 'semi_monthly_old') ? 'Kinsenas Total' : (watchedFrequency === 'weekly' || watchedFrequency === 'weekly_fixed4') ? 'Weekly Total' : watchedFrequency === 'yearly' ? 'Yearly Total' : watchedFrequency === 'quarterly' ? 'Quarterly Total' : 'Monthly Total',
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
                        const freqTotal = round2((row.total_due != null ? row.total_due : (row.principal || 0) + (row.interest || 0)));
                        return (
                          <tr key={row.period} className="hover:bg-gray-50/60 text-gray-700">
                            <td className="px-3 py-2 font-mono">{row.period}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{formatCurrency(row.balance || 0)}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{formatCurrency(row.principal || 0)}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{formatCurrency(row.interest || 0)}</td>
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
            type="button"
            variant="outline"
            onClick={handlePrint}
            disabled={!preview}
            icon={<Printer size={15} />}
          >
            Print
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