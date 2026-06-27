import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  ArrowLeft, Save, UserPlus, DollarSign, Archive, CheckCircle,
  ChevronRight, User, Users, Baby, Star
} from 'lucide-react';
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
import { supabase } from '../../services/supabase';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
];

const MEMBERSHIP_TYPE_OPTIONS = [
  { value: 'associate', label: 'Associate' },
  { value: 'regular', label: 'Regular / Fullpledge' },
  { value: 'kiddy', label: 'Kiddy Savings' },
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

const SAVINGS_TYPE_OPTIONS = [
  { value: 'regular_savings', label: 'Regular Savings Account' },
  { value: 'educational_savings', label: 'Educational Savings Account' },
];

// New members (joining now) — current fee structure effective 2026
const NEW_MEMBER_BREAKDOWN = {
  associate: {
    label: 'Associate Membership',
    items: [
      { key: 'membership_fee', label: 'Membership Fee',   amount: 100, category: 'membership' },
      { key: 'vip_card',       label: 'WELLife VIP Card', amount: 300, category: 'membership' },
      { key: 'cbu',            label: 'Initial CBU',      amount: 500, category: 'cbu'        },
    ],
  },
  regular: {
    label: 'Regular / Fullpledge Membership',
    items: [
      { key: 'membership_fee',  label: 'Membership Fee',          amount: 100,  category: 'membership', group: 'Associate Package' },
      { key: 'vip_card',        label: 'WELLife VIP Card',        amount: 300,  category: 'membership', group: 'Associate Package' },
      { key: 'cbu_assoc',       label: 'Initial CBU',             amount: 500,  category: 'cbu',        group: 'Associate Package' },
      { key: 'admin_fees',      label: 'Admin & Regulatory Fees', amount: 1000, category: 'membership', group: 'Regular Package'   },
      { key: 'savings_deposit', label: 'Initial Savings Deposit', amount: 500,  category: 'savings',    group: 'Regular Package'   },
      { key: 'min_cbu',         label: 'Minimum CBU',             amount: 3500, category: 'cbu',        group: 'Regular Package'   },
    ],
  },
  kiddy: {
    label: 'Kiddy & Youth Savings Membership',
    items: [
      { key: 'kiddy_membership_fee', label: 'Membership Fee',          amount: 50,  category: 'membership' },
      { key: 'kiddy_regulatory_fee', label: 'Regulatory Fee',          amount: 200, category: 'membership' },
      { key: 'kiddy_savings',        label: 'Initial Savings Deposit', amount: 50,  category: 'savings'    },
    ],
  },
};

const ALL_NEW_ITEM_KEYS = [
  'membership_fee', 'vip_card', 'cbu', 'cbu_assoc',
  'admin_fees', 'savings_deposit', 'min_cbu',
  'kiddy_membership_fee', 'kiddy_regulatory_fee', 'kiddy_savings',
];

const OLD_MEMBER_BREAKDOWN = {
  associate: { label: 'Entry Membership',      membership_fee: 300,  cbu: 1000, savings: 500  },
  regular:   { label: 'Full Pledge Member',    membership_fee: 1800, cbu: 4000, savings: 1000 },
};

// ─── Membership type selector shown before form ────────────────────────────

const MEMBERSHIP_CARDS = [
  {
    value: 'associate',
    icon: User,
    title: 'Associate Member',
    description: 'Entry-level membership with basic cooperative benefits.',
    badge: '₱900 total',
    badgeColor: 'bg-blue-100 text-blue-700',
    borderColor: 'border-blue-200',
    hoverBorder: 'hover:border-blue-400',
    selectedBorder: 'border-blue-500',
    selectedBg: 'bg-blue-50',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    items: ['₱100 Membership Fee', '₱300 WELLife VIP Card', '₱500 Initial CBU'],
  },
  {
    value: 'regular',
    icon: Star,
    title: 'Regular / Fullpledge',
    description: 'Full cooperative membership with complete voting rights.',
    badge: '₱5,900 total',
    badgeColor: 'bg-indigo-100 text-indigo-700',
    borderColor: 'border-indigo-200',
    hoverBorder: 'hover:border-indigo-400',
    selectedBorder: 'border-indigo-500',
    selectedBg: 'bg-indigo-50',
    iconBg: 'bg-indigo-100',
    iconColor: 'text-indigo-600',
    items: ['Associate Package (₱900)', '₱1,000 Admin & Regulatory Fees', '₱500 Initial Savings Deposit', '₱3,500 Minimum CBU'],
  },
  {
    value: 'kiddy',
    icon: Baby,
    title: 'Kiddy & Youth Savings',
    description: 'Savings membership for children and youth members.',
    badge: '₱300 total',
    badgeColor: 'bg-teal-100 text-teal-700',
    borderColor: 'border-teal-200',
    hoverBorder: 'hover:border-teal-400',
    selectedBorder: 'border-teal-500',
    selectedBg: 'bg-teal-50',
    iconBg: 'bg-teal-100',
    iconColor: 'text-teal-700',
    items: ['₱50 Membership Fee', '₱200 Regulatory Fee', '₱50 Initial Savings Deposit'],
  },
];

function MembershipTypeSelector({ onSelect }) {
  const [selected, setSelected] = useState(null);

  return (
    <div className="space-y-6">
      <div className="text-center py-2">
        <p className="text-sm text-gray-500 mt-1">
          Select the membership type to continue with registration
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {MEMBERSHIP_CARDS.map((card) => {
          const Icon = card.icon;
          const isSelected = selected === card.value;
          return (
            <button
              key={card.value}
              type="button"
              onClick={() => setSelected(card.value)}
              className={`
                text-left p-5 rounded-2xl border-2 transition-all duration-150 outline-none
                focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-400
                ${isSelected
                  ? `${card.selectedBorder} ${card.selectedBg} shadow-md`
                  : `${card.borderColor} bg-white ${card.hoverBorder} hover:shadow-sm`
                }
              `}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${card.iconBg}`}>
                  <Icon size={20} className={card.iconColor} />
                </div>
                {isSelected && (
                  <CheckCircle size={18} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                )}
              </div>
              <div className="mb-3">
                <h3 className="font-semibold text-gray-900 text-sm leading-tight">{card.title}</h3>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{card.description}</p>
              </div>
              <ul className="space-y-1 mb-3">
                {card.items.map((item) => (
                  <li key={item} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <span className="w-1 h-1 rounded-full bg-gray-400 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${card.badgeColor}`}>
                {card.badge}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex justify-end pt-2">
        <Button
          type="button"
          disabled={!selected}
          onClick={() => selected && onSelect(selected)}
          icon={<ChevronRight size={15} />}
        >
          Continue with {selected ? MEMBERSHIP_CARDS.find(c => c.value === selected)?.title : 'Selected Type'}
        </Button>
      </div>
    </div>
  );
}

// ─── Helper ────────────────────────────────────────────────────────────────

async function createInvoiceStrict(args, label) {
  try {
    return await createInvoiceForPayment(args);
  } catch (e) {
    console.error(`[${label}] Invoice creation failed:`, e);
    throw new Error(e?.message || `${label} invoice creation failed.`);
  }
}

// ─── Section wrapper ────────────────────────────────────────────────────────

function FormSection({ title, children, inModal, colorClass = 'border-gray-100' }) {
  return (
    <section className={inModal ? `bg-gray-50 border ${colorClass} rounded-xl p-5` : 'space-y-4'}>
      <h3 className={`text-sm font-semibold text-gray-700 mb-4 pb-2 border-b ${colorClass}`}>
        {title}
      </h3>
      {children}
    </section>
  );
}

// ─── Kiddy-specific form fields ────────────────────────────────────────────

function KiddyFormFields({ register, errors, watch, setValue, inModal,
  paymentOption, paymentMode, breakdown, itemPaidMap, totalPaidSoFar, total, isEdit }) {

  const savingsType = watch('kiddy_savings_type');
  const kiddyItem = breakdown?.items?.find(i => i.key === 'kiddy_savings');
  const paid = kiddyItem ? (itemPaidMap[kiddyItem.key] || 0) : 0;
  const remaining = kiddyItem ? Math.max(0, kiddyItem.amount - paid) : 0;
  const isFull = kiddyItem ? (paid >= kiddyItem.amount && kiddyItem.amount > 0) : false;
  const referenceRequired = ['GCash', 'Bank Transfer', 'Check'].includes(paymentMode);

  return (
    <>
      {/* Child / Youth Information */}
      <FormSection title="Child / Youth Information" inModal={inModal} colorClass="border-teal-100">
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
          <Input label="Member Number" placeholder="e.g. KY-2024-001" {...register('member_no')} />
          <Input
            label="Date of Application"
            type="date"
            {...register('date_joined')}
          />
          <Input
            label="Date of Birth"
            type="date"
            required
            error={errors.date_of_birth?.message}
            {...register('date_of_birth', { required: 'Date of birth is required' })}
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
          <Input
            label="Place of Birth"
            placeholder="City/Municipality, Province"
            {...register('place_of_birth')}
          />
          <Input
            label="School"
            placeholder="Name of school"
            {...register('school')}
          />
          <Input
            label="Grade / Year Level"
            placeholder="e.g. Grade 5"
            {...register('grade_year_level')}
          />
          <div className="sm:col-span-2">
            <Input
              label="Home Address"
              placeholder="House No., Street, Barangay, City"
              {...register('address')}
            />
          </div>
        </div>
      </FormSection>

      {/* Parent / Guardian Information */}
      <FormSection title="Parent / Guardian Information" inModal={inModal} colorClass="border-sky-100">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Name of Parent / Guardian"
            required
            error={errors.guardian_name?.message}
            {...register('guardian_name', { required: 'Guardian name is required' })}
          />
          <Input
            label="Relationship to Applicant"
            placeholder="e.g. Mother, Father, Guardian"
            {...register('guardian_relationship')}
          />
          <Input
            label="Contact Number"
            placeholder="+63 9XX XXX XXXX"
            {...register('phone')}
          />
          <Input
            label="Address (if different from child's)"
            {...register('guardian_address')}
          />
          <Input
            label="Valid ID Presented"
            placeholder="e.g. PhilSys ID, Driver's License"
            {...register('guardian_valid_id')}
          />
          <Input
            label="ID Number"
            {...register('guardian_id_number')}
          />
        </div>
      </FormSection>

      {/* Savings Option */}
      {!isEdit && (
        <FormSection title="Savings Option" inModal={inModal} colorClass="border-teal-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                value: 'regular_savings',
                label: 'Regular Savings Account',
                details: [
                  'Initial Savings Deposit: ₱50.00',
                  'Interest Rate: 3% per annum',
                  'Withdrawal allowed during Birthday or Christmas',
                ],
                color: 'teal',
              },
              {
                value: 'educational_savings',
                label: 'Educational Savings Account',
                details: [
                  'Minimum Monthly Savings: ₱500.00',
                  'Interest Rate: 6% per annum',
                  'Locked-in until member reaches 18 years old',
                  'Withdrawals not allowed before maturity',
                ],
                color: 'amber',
              },
            ].map((opt) => {
              const isSelected = savingsType === opt.value;
              const colorMap = {
                teal:  { border: 'border-teal-300',  bg: 'bg-teal-50',  text: 'text-teal-700',  ring: 'ring-teal-400'  },
                amber: { border: 'border-amber-300', bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-400' },
              };
              const c = colorMap[opt.color];
              return (
                <label
                  key={opt.value}
                  className={`
                    flex flex-col gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all
                    ${isSelected ? `${c.border} ${c.bg}` : 'border-gray-200 bg-white hover:border-gray-300'}
                  `}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      value={opt.value}
                      className="accent-teal-600"
                      {...register('kiddy_savings_type')}
                    />
                    <span className={`text-sm font-semibold ${isSelected ? c.text : 'text-gray-700'}`}>
                      {opt.label}
                    </span>
                  </div>
                  <ul className="ml-5 space-y-0.5">
                    {opt.details.map((d) => (
                      <li key={d} className="text-xs text-gray-500 flex items-start gap-1.5">
                        <span className="mt-1 w-1 h-1 rounded-full bg-gray-400 flex-shrink-0" />
                        {d}
                      </li>
                    ))}
                  </ul>
                </label>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 mt-2 italic">
            * A minimum Savings Deposit balance of ₱500.00 is required to earn interest.
          </p>
        </FormSection>
      )}

      {/* Membership Fees */}
      {!isEdit && breakdown && (
        <FormSection title="Membership Fees" inModal={inModal} colorClass="border-teal-100">
          <div className="rounded-xl border border-teal-100 bg-gradient-to-br from-teal-50 via-sky-50 to-amber-50/70 p-4 space-y-2">
            {breakdown.items.map((item) => (
              <div key={item.key} className="flex justify-between text-sm text-gray-700">
                <span>{item.label}</span>
                <span className="font-medium">₱{item.amount.toLocaleString()}.00</span>
              </div>
            ))}
            <div className="border-t border-teal-200 pt-2 mt-2 flex justify-between font-bold text-teal-900 text-sm">
              <span>TOTAL</span>
              <span>₱{total.toLocaleString()}.00</span>
            </div>
          </div>

          {/* Onboarding Payment */}
          <div className="mt-4 p-4 rounded-xl border bg-white border-teal-100 space-y-4">
            <div className="flex items-center gap-2 text-teal-800">
              <DollarSign size={15} />
              <h4 className="text-sm font-semibold">Onboarding Payment</h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select label="Payment Option" options={PAYMENT_OPTION_OPTIONS} {...register('payment_option')} />
              {paymentOption !== 'none' && (
                <Input label="Payment Date" type="date" {...register('payment_date')} />
              )}
            </div>

            {paymentOption !== 'none' && kiddyItem && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="relative">
                    <Input
                      label={`${kiddyItem.label} (₱${kiddyItem.amount.toLocaleString()})`}
                      type="number" step="0.01" min="0"
                      placeholder="0.00"
                      disabled={paymentOption !== 'partial'}
                      {...register(`paid_${kiddyItem.key}`)}
                    />
                    <p className={`text-xs mt-0.5 ${isFull ? 'text-emerald-600 font-medium' : 'text-gray-400'}`}>
                      {isFull ? '✓ Fully paid' : `Remaining: ₱${remaining.toLocaleString()}`}
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-teal-50 border border-teal-100 text-sm flex justify-between font-semibold">
                  <span>Total Paid Now</span>
                  <span className={totalPaidSoFar > 0 ? 'text-emerald-700' : 'text-gray-400'}>
                    ₱{totalPaidSoFar.toLocaleString()}
                    <span className="font-normal text-gray-400 ml-1">/ ₱{total.toLocaleString()}</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="SI # / OR No." placeholder="Enter receipt number" {...register('invoice_no')} />
                  <Select label="Mode of Payment" options={PAYMENT_MODE_OPTIONS} {...register('payment_mode')} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Reference / Account / Check No."
                    placeholder="Optional for Cash, required for GCash/Bank/Check"
                    {...register('payment_reference')}
                  />
                  <Input label="Payment Notes" placeholder="Optional notes" {...register('payment_notes')} />
                </div>
              </div>
            )}
          </div>
        </FormSection>
      )}

      {/* Account Details */}
      {!isEdit && (
        <FormSection title="Account Details" inModal={inModal} colorClass="border-sky-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Savings Account No."
              placeholder="Assigned by office"
              {...register('savings_account_no')}
            />
            <Select label="Status" options={STATUS_OPTIONS} {...register('status')} />
          </div>
        </FormSection>
      )}

      {/* Account Details in edit mode */}
      {isEdit && (
        <FormSection title="Account Details" inModal={inModal} colorClass="border-sky-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Savings Account No."
              placeholder="Enter Savings account number"
              {...register('savings_account_no')}
            />
            <Select label="Status" options={STATUS_OPTIONS} {...register('status')} />
          </div>
        </FormSection>
      )}

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Remarks / Notes</label>
        <textarea
          rows={3}
          placeholder="Optional remarks..."
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
          {...register('notes')}
        />
      </div>
    </>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

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

  // Step: 'select_type' | 'fill_form' — only relevant for add mode
  const [step, setStep] = useState(isEdit ? 'fill_form' : 'select_type');

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
      // Kiddy-specific
      place_of_birth: '',
      school: '',
      grade_year_level: '',
      guardian_name: '',
      guardian_relationship: '',
      guardian_address: '',
      guardian_valid_id: '',
      guardian_id_number: '',
      kiddy_savings_type: 'regular_savings',
      // New member payment fields
      payment_option: 'none',
      payment_date: '',
      paid_membership_fee: '',
      paid_vip_card: '',
      paid_cbu: '',
      paid_cbu_assoc: '',
      paid_admin_fees: '',
      paid_savings_deposit: '',
      paid_min_cbu: '',
      paid_kiddy_membership_fee: '',
      paid_kiddy_regulatory_fee: '',
      paid_kiddy_savings: '',
      invoice_no: '',
      payment_mode: '',
      payment_reference: '',
      payment_notes: '',
      cbu_account_no: '',
      savings_account_no: '',
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
    },
  });

  const recordType     = watch('record_type');
  const membershipType = watch('membership_type');
  const paymentOption  = watch('payment_option');
  const paymentMode    = watch('payment_mode');
  const paymentReference = watch('payment_reference');
  const hasTimeDep     = watch('has_time_deposit');

  const isOldMember = recordType === 'old_member';
  const isKiddy = !isOldMember && membershipType === 'kiddy';

  const breakdownMap = isOldMember ? OLD_MEMBER_BREAKDOWN : NEW_MEMBER_BREAKDOWN;
  const breakdown = breakdownMap[membershipType];

  const oldManualMFRaw  = watch('old_manual_membership_fee');
  const oldManualCBURaw = watch('old_manual_cbu');
  const oldManualSavRaw = watch('old_manual_savings');

  const oldDefaults = OLD_MEMBER_BREAKDOWN[membershipType] || { membership_fee: 0, cbu: 0, savings: 0 };
  const oldEffectiveMF    = isOldMember ? (parseFloat(oldManualMFRaw)  || oldDefaults.membership_fee) : 0;
  const oldEffectiveCBU   = isOldMember ? (parseFloat(oldManualCBURaw) || oldDefaults.cbu)            : 0;
  const oldEffectiveSav   = isOldMember ? (parseFloat(oldManualSavRaw) || oldDefaults.savings)        : 0;
  const oldEffectiveTotal = oldEffectiveMF + oldEffectiveCBU + oldEffectiveSav;

  const itemPaidRaw = watch(ALL_NEW_ITEM_KEYS.map(k => `paid_${k}`));
  const itemPaidMap = Object.fromEntries(ALL_NEW_ITEM_KEYS.map((k, i) => [k, parseFloat(itemPaidRaw[i]) || 0]));

  const total = breakdown?.items
    ? breakdown.items.reduce((s, i) => s + i.amount, 0)
    : oldEffectiveTotal;

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

    if (isOldMember) {
      setValue('old_manual_membership_fee', '');
      setValue('old_manual_cbu', '');
      setValue('old_manual_savings', '');
    }

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
        place_of_birth: data.place_of_birth || '',
        school: data.school || '',
        grade_year_level: data.grade_year_level || '',
        guardian_name: data.guardian_name || '',
        guardian_relationship: data.guardian_relationship || '',
        guardian_address: data.guardian_address || '',
        guardian_valid_id: data.guardian_valid_id || '',
        guardian_id_number: data.guardian_id_number || '',
        kiddy_savings_type: data.kiddy_savings_type || 'regular_savings',
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

      // ── MEMBER NUMBER UNIQUENESS PRE-CHECK ────────────────────────────────
      // Kiddy has its own independent number sequence; Associate & Regular share one.
      // This prevents a duplicate DB error with a clear user-facing message.
      if (values.member_no?.trim() && !isEdit) {
        const memberNo = values.member_no.trim();
        const membershipType = values.membership_type;

        let query = supabase
          .from('members')
          .select('id')
          .eq('member_no', memberNo);

        if (membershipType === 'kiddy') {
          query = query.eq('membership_type', 'kiddy');
        } else {
          query = query.neq('membership_type', 'kiddy');
        }

        const { data: existing, error: checkError } = await query.limit(1);

        if (checkError) {
          toast.error('Could not validate member number. Please try again.');
          return;
        }
        if (existing && existing.length > 0) {
          const scope = membershipType === 'kiddy' ? 'Kiddy' : 'Associate/Regular';
          toast.error(`Member number "${memberNo}" already exists in the ${scope} membership list.`);
          return;
        }
      }
      // ─────────────────────────────────────────────────────────────────────
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
        // Kiddy extras
        place_of_birth: values.place_of_birth || null,
        school: values.school || null,
        grade_year_level: values.grade_year_level || null,
        guardian_name: values.guardian_name || null,
        guardian_relationship: values.guardian_relationship || null,
        guardian_address: values.guardian_address || null,
        guardian_valid_id: values.guardian_valid_id || null,
        guardian_id_number: values.guardian_id_number || null,
        kiddy_savings_type: values.membership_type === 'kiddy' ? (values.kiddy_savings_type || 'regular_savings') : null,
      };

      // ── EDIT FLOW ──────────────────────────────────────────────────
      if (isEdit) {
        await updateMember(memberId, payload);

        const existingAccounts = await getAccountsByMemberId(memberId);
        const cbuAccount = (existingAccounts || []).find(a => String(a.account_type).toLowerCase() === 'cbu');
        const savingsAccount = (existingAccounts || []).find(a => String(a.account_type).toLowerCase() === 'savings');

        if (cbuAccount) await updateAccount(cbuAccount.id, { account_no: values.cbu_account_no || null });
        if (savingsAccount) await updateAccount(savingsAccount.id, { account_no: values.savings_account_no || null });

        toast.success('Member updated successfully');
        trackActivity({ userId: user?.id, module: 'member', action: 'update', description: `Updated member: ${values.first_name} ${values.last_name}` });

        if (inModal) { onUpdated?.(memberId); onClose?.(); }
        else navigate(`/members/${memberId}`);
        return;
      }

      const selectedBreakdownMap = values.record_type === 'old_member' ? OLD_MEMBER_BREAKDOWN : NEW_MEMBER_BREAKDOWN;
      const selectedBreakdown = selectedBreakdownMap[values.membership_type];

      // ── OLD MEMBER FLOW ────────────────────────────────────────────
      if (values.record_type === 'old_member') {
        if (!values.date_joined) {
          toast.error('Original membership date is required for historical records.');
          return;
        }
        if (values.has_time_deposit) {
          if (!values.td_date_applied || !values.td_terms || !values.td_amount || values.td_interest_rate === '') {
            toast.error('Please fill in all required Time Deposit fields.');
            return;
          }
        }

        const oldBD = OLD_MEMBER_BREAKDOWN[values.membership_type] || { membership_fee: 0, cbu: 0, savings: 0 };
        const effectiveMF    = parseFloat(values.old_manual_membership_fee) || oldBD.membership_fee;
        const effectiveCBU   = parseFloat(values.old_manual_cbu)            || oldBD.cbu;
        const effectiveSav   = parseFloat(values.old_manual_savings)        || oldBD.savings;
        const effectiveTotal = effectiveMF + effectiveCBU + effectiveSav;

        if (effectiveTotal <= 0) { toast.error('Membership total must be greater than zero.'); return; }

        const newMember = await createMember({ ...payload, record_type: 'old_member' });
        const newMemberId = newMember.id;
        const memberName = `${newMember.first_name || ''} ${newMember.last_name || ''}`.trim();

        await initializeMemberAccounts(newMemberId);
        const accounts = await getAccountsByMemberId(newMemberId);
        const cbuAccount = accounts.find(a => String(a.account_type).toLowerCase() === 'cbu');
        const savingsAccount = accounts.find(a => String(a.account_type).toLowerCase() === 'savings');

        if (cbuAccount) await updateAccount(cbuAccount.id, { account_no: values.cbu_account_no || null, balance: parseFloat(values.old_cbu_balance) || 0 });
        if (savingsAccount) await updateAccount(savingsAccount.id, { account_no: values.savings_account_no || null, balance: parseFloat(values.old_savings_balance) || 0 });

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

        if (inModal) { onCreated?.(newMemberId); onClose?.(); }
        else navigate(`/members/${newMemberId}`);
        return;
      }

      // ── KIDDY MEMBERSHIP FLOW ──────────────────────────────────────
      if (values.membership_type === 'kiddy') {
        const kiddyBreakdown = NEW_MEMBER_BREAKDOWN.kiddy;
        const kiddyItem = kiddyBreakdown.items.find(i => i.key === 'kiddy_savings');
        const paymentDate = values.payment_date || new Date().toISOString().split('T')[0];

        let kiddySavingsPaid = 0;

        if (values.payment_option !== 'none') {
          const paid = parseFloat(values[`paid_${kiddyItem.key}`]) || 0;
          if (paid < 0) { toast.error(`${kiddyItem.label} amount cannot be negative.`); return; }
          if (paid > kiddyItem.amount) { toast.error(`${kiddyItem.label} cannot exceed ₱${kiddyItem.amount.toLocaleString()}.`); return; }
          kiddySavingsPaid = paid;
        }

        const kiddyTotalPaid = kiddySavingsPaid;

        if (values.payment_option !== 'none' && kiddyTotalPaid <= 0) {
          toast.error('Enter the initial savings deposit amount.');
          return;
        }

        if (kiddyTotalPaid > 0) {
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
        const savingsAccount = accounts.find(a => String(a.account_type).toLowerCase() === 'savings');

        if (savingsAccount && values.savings_account_no) {
          await updateAccount(savingsAccount.id, { account_no: values.savings_account_no });
        }

        const refreshedAccounts = await getAccountsByMemberId(newMemberId);
        const refreshedSavingsAccount = refreshedAccounts.find(a => String(a.account_type).toLowerCase() === 'savings');

        const paymentModeNote = [values.payment_reference?.trim(), values.payment_notes?.trim()].filter(Boolean).join(' | ') || null;

        let kiddyInitPaymentNotes = null;
        if (kiddyTotalPaid > 0) {
          kiddyInitPaymentNotes = JSON.stringify({ kiddy_savings: kiddySavingsPaid });
        }

        const kiddyMembershipRecord = await createMembership({
          member_id: newMemberId,
          membership_type: 'kiddy',
          fee_required: total,
          fee_paid_now: kiddyTotalPaid,
          payment_notes: kiddyInitPaymentNotes,
          created_by: user.id,
        });

        if (kiddySavingsPaid > 0) {
          if (!refreshedSavingsAccount) throw new Error('Savings account not found after member initialization.');
          await createTransaction({
            member_id: newMemberId,
            account_id: refreshedSavingsAccount.id,
            category: 'savings',
            type: 'deposit',
            amount: kiddySavingsPaid,
            reference: values.payment_reference?.trim() || refreshedSavingsAccount.account_no || null,
            notes: [kiddyItem.label, values.payment_notes?.trim()].filter(Boolean).join(' — '),
            created_by: user.id,
            transaction_date: paymentDate,
            payment_mode: values.payment_mode,
            payment_mode_note: paymentModeNote,
          });
        }

        if (kiddyTotalPaid > 0) {
          await createInvoiceStrict(
            {
              invoice_no: values.invoice_no.trim(),
              payment_type: 'membership',
              member_id: newMemberId,
              member_name: memberName || 'Member',
              amount: kiddyTotalPaid,
              purpose: `${kiddyItem.label}: ${formatCurrency(kiddySavingsPaid)}`,
              ref_id: kiddyMembershipRecord?.id || null,
              created_by: user.id,
              date: paymentDate,
              payment_mode: values.payment_mode,
              payment_mode_note: paymentModeNote,
              notes: [`${kiddyItem.label}: ${formatCurrency(kiddySavingsPaid)}`, values.payment_notes?.trim() || null].filter(Boolean).join(' | '),
            },
            'Kiddy savings onboarding payment'
          );
        }

        toast.success('Kiddy Savings member added successfully.');
        trackActivity({ userId: user?.id, module: 'member', action: 'create', description: `Added new Kiddy Savings member: ${values.first_name} ${values.last_name}` });

        if (inModal) { onCreated?.(newMemberId); onClose?.(); }
        else navigate(`/members/${newMemberId}`);
        return;
      }

      // ── NEW MEMBER FLOW (Associate & Regular) ──────────────────────
      const paymentDate = values.payment_date || new Date().toISOString().split('T')[0];

      let postedMembershipPaid = 0;
      let postedCbuPaid = 0;
      let postedSavingsPaid = 0;

      if (values.payment_option !== 'none') {
        for (const item of selectedBreakdown.items) {
          const paid = parseFloat(values[`paid_${item.key}`]) || 0;
          if (paid < 0) { toast.error(`${item.label} amount cannot be negative.`); return; }
          if (paid > item.amount) { toast.error(`${item.label} cannot exceed ₱${item.amount.toLocaleString()}.`); return; }
          if (item.category === 'membership') postedMembershipPaid += paid;
          else if (item.category === 'cbu')   postedCbuPaid        += paid;
          else if (item.category === 'savings') postedSavingsPaid  += paid;
        }
      }

      const totalPaid = postedMembershipPaid + postedCbuPaid + postedSavingsPaid;

      if (values.payment_option !== 'none' && totalPaid <= 0) { toast.error('Enter at least one onboarding payment amount.'); return; }

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

      if (cbuAccount && values.cbu_account_no) await updateAccount(cbuAccount.id, { account_no: values.cbu_account_no });
      if (savingsAccount && values.savings_account_no) await updateAccount(savingsAccount.id, { account_no: values.savings_account_no });

      const refreshedAccounts = await getAccountsByMemberId(newMemberId);
      const refreshedCbuAccount = refreshedAccounts.find(a => String(a.account_type).toLowerCase() === 'cbu');
      const refreshedSavingsAccount = refreshedAccounts.find(a => String(a.account_type).toLowerCase() === 'savings');

      const paymentModeNote = [values.payment_reference?.trim(), values.payment_notes?.trim()].filter(Boolean).join(' | ') || null;

      const feeRequired = selectedBreakdown.items
        ? selectedBreakdown.items.reduce((s, i) => s + i.amount, 0)
        : selectedBreakdown.membership_fee;

      let initPaymentNotes = null;
      if (totalPaid > 0) {
        const noteObj = {};
        selectedBreakdown.items.forEach(item => {
          const paid = parseFloat(values[`paid_${item.key}`]) || 0;
          if (paid > 0) noteObj[item.key] = paid;
        });
        initPaymentNotes = JSON.stringify(noteObj);
      }

      const membershipRecord = await createMembership({
        member_id: newMemberId,
        membership_type: values.membership_type,
        fee_required: feeRequired,
        fee_paid_now: totalPaid,
        payment_notes: initPaymentNotes,
        created_by: user.id,
      });

      if (postedMembershipPaid > 0) {
        const membershipItems = selectedBreakdown.items.filter(i => i.category === 'membership');
        await createTransaction({
          member_id: newMemberId,
          account_id: null,
          category: 'membership',
          type: 'payment',
          amount: postedMembershipPaid,
          reference: values.payment_reference?.trim() || null,
          notes: membershipItems.map(i => `${i.label}: ${formatCurrency(parseFloat(values[`paid_${i.key}`]) || 0)}`).join(' | '),
          created_by: user.id,
          transaction_date: paymentDate,
          payment_mode: values.payment_mode,
          payment_mode_note: paymentModeNote,
        });
      }

      if (postedCbuPaid > 0 && refreshedCbuAccount) {
        const cbuItems = selectedBreakdown.items.filter(i => i.category === 'cbu');
        await createTransaction({
          member_id: newMemberId,
          account_id: refreshedCbuAccount.id,
          category: 'cbu',
          type: 'deposit',
          amount: postedCbuPaid,
          reference: values.payment_reference?.trim() || refreshedCbuAccount.account_no || null,
          notes: cbuItems.map(i => `${i.label}: ${formatCurrency(parseFloat(values[`paid_${i.key}`]) || 0)}`).join(' | '),
          created_by: user.id,
          transaction_date: paymentDate,
          payment_mode: values.payment_mode,
          payment_mode_note: paymentModeNote,
        });
      }

      if (postedSavingsPaid > 0 && refreshedSavingsAccount) {
        const savingsItems = selectedBreakdown.items.filter(i => i.category === 'savings');
        await createTransaction({
          member_id: newMemberId,
          account_id: refreshedSavingsAccount.id,
          category: 'savings',
          type: 'deposit',
          amount: postedSavingsPaid,
          reference: values.payment_reference?.trim() || refreshedSavingsAccount.account_no || null,
          notes: savingsItems.map(i => `${i.label}: ${formatCurrency(parseFloat(values[`paid_${i.key}`]) || 0)}`).join(' | '),
          created_by: user.id,
          transaction_date: paymentDate,
          payment_mode: values.payment_mode,
          payment_mode_note: paymentModeNote,
        });
      }

      if (totalPaid > 0) {
        const invoiceBreakdown = selectedBreakdown.items
          .filter(i => (parseFloat(values[`paid_${i.key}`]) || 0) > 0)
          .map(i => `${i.label}: ${formatCurrency(parseFloat(values[`paid_${i.key}`]) || 0)}`);

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
            notes: [...invoiceBreakdown, values.payment_notes?.trim() || null].filter(Boolean).join(' | '),
          },
          'Combined onboarding payment'
        );
      }

      toast.success('Member added successfully.');
      trackActivity({ userId: user?.id, module: 'member', action: 'create', description: `Added new member: ${values.first_name} ${values.last_name}` });

      if (inModal) { onCreated?.(newMemberId); onClose?.(); }
      else navigate(`/members/${newMemberId}`);

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

  // ── Step 1: Membership type selector (add mode only) ───────────────────────
  if (!isEdit && step === 'select_type') {
    const selector = (
      <MembershipTypeSelector
        onSelect={(type) => {
          setValue('membership_type', type);
          setStep('fill_form');
        }}
      />
    );

    if (inModal) {
      return <div className="max-h-[78vh] overflow-y-auto pr-1 p-1">{selector}</div>;
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
          title="Add New Member"
          subtitle="Register a new cooperative member"
        />
        <div className="mt-6">{selector}</div>
      </div>
    );
  }

  // ── Step 2: Form ───────────────────────────────────────────────────────────

  // Determine accent colors based on membership type
  const accentConfig = {
    kiddy:     { label: 'Kiddy & Youth Savings', color: 'teal',   chipBg: 'bg-teal-100',   chipText: 'text-teal-700'   },
    associate: { label: 'Associate Member',       color: 'blue',   chipBg: 'bg-blue-100',   chipText: 'text-blue-700'   },
    regular:   { label: 'Regular / Fullpledge',   color: 'indigo', chipBg: 'bg-indigo-100', chipText: 'text-indigo-700' },
  };
  const accent = accentConfig[membershipType] || accentConfig.associate;

  const content = isKiddy ? (
    // ── KIDDY FORM ─────────────────────────────────────────────────────────
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Kiddy header banner */}
      <div className="p-3 bg-gradient-to-r from-teal-50 via-sky-50 to-amber-50 border border-teal-100 rounded-xl text-sm text-teal-800 flex items-start gap-3">
        <Baby size={16} className="flex-shrink-0 mt-0.5 text-teal-600" />
        <div>
          <strong>Kiddy & Youth Savings Membership</strong>
          <span className="ml-2 text-teal-700 font-normal">
            — Requires ₱50 Membership Fee, ₱200 Regulatory Fee, and ₱50 Initial Savings Deposit.
          </span>
        </div>
      </div>

      <KiddyFormFields
        register={register}
        errors={errors}
        watch={watch}
        setValue={setValue}
        inModal={inModal}
        paymentOption={paymentOption}
        paymentMode={paymentMode}
        breakdown={breakdown}
        itemPaidMap={itemPaidMap}
        totalPaidSoFar={totalPaidSoFar}
        total={total}
        isEdit={isEdit}
      />

      <div className="flex items-center justify-between gap-3 pt-2 sticky bottom-0 bg-white border-t border-gray-100 py-3">
        {!isEdit && (
          <button
            type="button"
            onClick={() => setStep('select_type')}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft size={14} />
            Change type
          </button>
        )}
        <div className="flex items-center gap-3 ml-auto">
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
            {isEdit ? 'Save Changes' : 'Add Kiddy Member'}
          </Button>
        </div>
      </div>
    </form>
  ) : (
    // ── ASSOCIATE / REGULAR FORM ───────────────────────────────────────────
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

      {/* Info banner */}
      {!isEdit && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700 flex items-start gap-2">
          <UserPlus size={16} className="flex-shrink-0 mt-0.5" />
          <span>
            Register the member and optionally post initial onboarding payments at the same time.
            Historical records are only added via <strong>Import Members</strong>.
          </span>
        </div>
      )}

      {/* Old member badge in edit */}
      {isEdit && recordType === 'old_member' && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          <Archive size={14} />
          <span className="font-medium">Historical Record — Old Member</span>
          <span className="text-amber-600 text-xs">· Encoded from pre-system records</span>
        </div>
      )}

      {/* Personal Information */}
      <FormSection title="Personal Information" inModal={inModal}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input label="First Name" required error={errors.first_name?.message} {...register('first_name', { required: 'First name is required' })} />
          <Input label="Last Name" required error={errors.last_name?.message} {...register('last_name', { required: 'Last name is required' })} />
          <Input label="M.I." placeholder="M" {...register('middle_initial')} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Input label="Member Number" placeholder="e.g. MBR-2024-001" {...register('member_no')} />
          <Input
            label={isOldMember ? 'Original Membership Date *' : 'Date Joined'}
            type="date"
            required={isOldMember}
            error={errors.date_joined?.message}
            {...register('date_joined', { required: isOldMember ? 'Original membership date is required.' : false })}
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
            <Input label="Complete Address" placeholder="House No., Street, Barangay, City" {...register('address')} />
          </div>
        </div>
      </FormSection>

      {/* Contact & Membership */}
      <FormSection title="Contact & Membership" inModal={inModal}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Email"
            type="email"
            error={errors.email?.message}
            {...register('email', { pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Invalid email' } })}
          />
          <Input label="Mobile No." placeholder="+63 9XX XXX XXXX" {...register('phone')} />
          <Input label="Res. Tel. No." {...register('res_tel_no')} />
          <Input label="Referred By" placeholder="Leave blank for Self" {...register('recruiter_name')} />
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

                {isOldMember && (
                  <div className="space-y-3 text-sm">
                    <p className="text-xs text-amber-600 mb-3">
                      Standard amounts are pre-filled. Leave a field blank to use the default, or type a new value to override.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { field: 'old_manual_membership_fee', label: 'Membership Entry', def: oldDefaults.membership_fee },
                        { field: 'old_manual_cbu',            label: 'Initial CBU',      def: oldDefaults.cbu            },
                        { field: 'old_manual_savings',        label: 'Initial Savings',  def: oldDefaults.savings        },
                      ].map(({ field, label, def }) => (
                        <div key={field}>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            {label}
                            <span className="ml-1 text-amber-500 font-normal">(default ₱{def.toLocaleString()})</span>
                          </label>
                          <input
                            type="number" step="0.01" min="0"
                            placeholder={String(def)}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                            {...register(field)}
                          />
                        </div>
                      ))}
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

          {/* Onboarding Payment — Associate & Regular */}
          {!isEdit && !isOldMember && breakdown && (
            <div className="sm:col-span-2 mt-2">
              <div className="p-4 rounded-xl border bg-green-50/40 border-green-100">
                <div className="flex items-center gap-2 mb-3 text-green-800">
                  <DollarSign size={16} />
                  <h4 className="text-sm font-semibold">Onboarding Payment Option</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select label="Payment Option" options={PAYMENT_OPTION_OPTIONS} {...register('payment_option')} />
                  {paymentOption !== 'none' && (
                    <Input label="Payment Date" type="date" {...register('payment_date')} />
                  )}
                </div>

                {breakdown.items && (() => {
                  const isDisabled = paymentOption !== 'partial';
                  const hasGroups  = breakdown.items.some(i => i.group);
                  const groups     = hasGroups ? [...new Set(breakdown.items.map(i => i.group))] : [null];
                  return (
                    <div className="mt-4 space-y-4">
                      {groups.map(grp => {
                        const grpItems = grp ? breakdown.items.filter(i => i.group === grp) : breakdown.items;
                        return (
                          <div key={grp || 'flat'}>
                            {grp && <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">{grp}</p>}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              {grpItems.map(item => {
                                const paid = itemPaidMap[item.key] || 0;
                                const remaining = Math.max(0, item.amount - paid);
                                const isFull = paid >= item.amount && item.amount > 0;
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

                {paymentOption !== 'none' && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                      <Input label="SI#" placeholder="Enter SI# manually" {...register('invoice_no')} />
                      <Select label="Mode of Payment" options={PAYMENT_MODE_OPTIONS} {...register('payment_mode')} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                      <Input label="Reference / Account / Check No." placeholder="Optional for Cash, required for GCash/Bank/Check" {...register('payment_reference')} />
                      <Input label="Payment Notes" placeholder="Optional notes" {...register('payment_notes')} />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </FormSection>

      {/* Old Member: Historical Balances */}
      {!isEdit && isOldMember && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border bg-amber-50/30 border-amber-100">
            <h4 className="text-sm font-semibold text-amber-800 mb-1">
              Historical Account Balances
              <span className="ml-2 text-xs font-normal text-amber-600">(Optional)</span>
            </h4>
            <p className="text-xs text-amber-700 mb-4">
              Enter the member's existing account balances from your records. These will be set directly — no transaction will be recorded since these pre-date the system.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="CBU Account No." placeholder="Enter CBU account number" {...register('cbu_account_no')} />
              <Input label="CBU Balance" type="number" step="0.01" min="0" placeholder="0.00" {...register('old_cbu_balance')} />
              <Input label="Savings Account No." placeholder="Enter Savings account number" {...register('savings_account_no')} />
              <Input label="Savings Balance" type="number" step="0.01" min="0" placeholder="0.00" {...register('old_savings_balance')} />
            </div>
          </div>

          <div className="p-4 rounded-xl border bg-violet-50/30 border-violet-100">
            <label className="flex items-center gap-3 cursor-pointer mb-3">
              <input type="checkbox" className="w-4 h-4 accent-violet-600" {...register('has_time_deposit')} />
              <span className="text-sm font-semibold text-violet-800">This member had a Time Deposit</span>
            </label>
            {hasTimeDep && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                <Input label="Date Applied *" type="date" {...register('td_date_applied')} />
                <Input label="Terms (months) *" type="number" min="1" placeholder="e.g. 12" {...register('td_terms')} />
                <Input label="Amount *" type="number" step="0.01" min="0.01" placeholder="0.00" {...register('td_amount')} />
                <Input label="Interest Rate (%) *" type="number" step="0.01" min="0" placeholder="e.g. 5.00" {...register('td_interest_rate')} />
                <Input label="Termination / Maturity Date" type="date" {...register('td_termination_date')} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Account Details */}
      {(isEdit || (!isEdit && !isOldMember)) && (
        <div className="p-4 rounded-xl border bg-purple-50/40 border-purple-100">
          <h4 className="text-sm font-semibold text-purple-800 mb-3">Account Details</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="CBU Account No." placeholder="Enter CBU account number" {...register('cbu_account_no')} />
            <Input label="Savings Account No." placeholder="Enter Savings account number" {...register('savings_account_no')} />
          </div>
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
        <textarea
          rows={3}
          placeholder="Optional notes..."
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          {...register('notes')}
        />
      </div>

      <div className="flex items-center justify-between gap-3 pt-2 sticky bottom-0 bg-white border-t border-gray-100 py-3">
        {!isEdit && (
          <button
            type="button"
            onClick={() => setStep('select_type')}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft size={14} />
            Change type
          </button>
        )}
        <div className="flex items-center gap-3 ml-auto">
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
      </div>
    </form>
  );

  // ── Wrapper ──────────────────────────────────────────────────────────────
  if (inModal) {
    return (
      <div className="max-h-[78vh] overflow-y-auto pr-1">
        {/* Membership type chip */}
        {!isEdit && (
          <div className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full mb-4 ${accent.chipBg} ${accent.chipText}`}>
            {accent.label}
          </div>
        )}
        {content}
      </div>
    );
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

      <div className="flex items-center gap-3 mb-1">
        <PageHeader
          title={isEdit ? 'Edit Member' : 'Add New Member'}
          subtitle={isEdit ? 'Update member registration information' : 'Register a new cooperative member'}
        />
        {!isEdit && (
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full self-start mt-1 ${accent.chipBg} ${accent.chipText}`}>
            {accent.label}
          </span>
        )}
      </div>

      <div className="mt-6 space-y-6">{content}</div>
    </div>
  );
}

export default function MemberFormPage() {
  return <MemberFormContent />;
}
