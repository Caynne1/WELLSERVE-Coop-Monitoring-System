/**
 * loanCalculator.js — Backward-compatibility shim
 *
 * All loan computation logic lives in src/engine/loanEngine.js
 * This file re-exports everything so existing imports don't break.
 */

// ── Single import block — no duplication ──────────────────────────────────────

import {
  round2,
  round4,
  safeNum,
  computeNumberOfPayments,
  computeWeeklyTotalPeriods,
  getRatePerPeriod,
  advanceDueDate,
  toDateStr,
  frequencyLabel,
  periodLabel,
  computeSchedule,
  computeDeductions,
  buildScheduleSummary,
  applyPaymentToSchedule,
  computeLoanStatus,
  DEFAULT_MONTHLY_RATE,
  LOAN_SOURCE,
  LOAN_STATUS,
} from '../engine/loanEngine';

// ── Named re-exports (legacy names used across the codebase) ──────────────────

export { round2, round4, safeNum, toDateStr };
export { computeNumberOfPayments, computeNumberOfPayments as computeDisplayPeriods };
export { computeWeeklyTotalPeriods };
export { getRatePerPeriod, advanceDueDate };
export { computeSchedule as generateLoanSchedule };
export { computeDeductions as computeLoanDeductions };
export { buildScheduleSummary, applyPaymentToSchedule, computeLoanStatus };
export { frequencyLabel as frequencyDisplayLabel };
export { periodLabel as frequencyPeriodLabel };
export { DEFAULT_MONTHLY_RATE, LOAN_SOURCE, LOAN_STATUS };

// ── Local helpers ─────────────────────────────────────────────────────────────

/** Payments per year for a given frequency. */
export function getPaymentsPerYear(frequency = 'monthly') {
  const map = { weekly: 52, semi_monthly: 24, monthly: 12, chattel: 12, quarterly: 4, yearly: 1 };
  return map[frequency] || 12;
}

/** Legacy flat monthly amortization (straight-line / PMT formula). */
export function computeMonthlyAmortization(principal = 0, annualRate = 0, termMonths = 0) {
  const p = safeNum(principal);
  const r = safeNum(annualRate);
  const n = safeNum(termMonths);
  if (p <= 0 || n <= 0) return 0;
  const mr = r / 12;
  if (mr <= 0) return round2(p / n);
  return round2(p * (mr / (1 - Math.pow(1 + mr, -n))));
}

/** Scale a monthly payment amount to a different frequency. */
export function computePaymentByFrequency(monthlyPayment = 0, frequency = 'monthly') {
  const p = safeNum(monthlyPayment);
  const map = {
    weekly:       round2((p * 12) / 52),
    weekly_fixed4: round2(p / 4),
    semi_monthly: round2(p / 2),
    monthly:      p,
    chattel:      p,
    quarterly:    round2(p * 3),
    yearly:       round2(p * 12),
  };
  return map[frequency] ?? p;
}

/**
 * compareWeeklyConventions — computes the weekly installment under both
 * weekly conventions (calendar 52wk/yr vs fixed-4wks/month) side by side,
 * so an encoder can compare against the coop's printed worksheet.
 */
export function compareWeeklyConventions({
  amount = 0,
  termMonths = 0,
  monthlyInterestRate = DEFAULT_MONTHLY_RATE,
  loanMethod = 'diminishing',
  startDate = new Date(),
  cbuPerPeriod = 0,
  savingsPerPeriod = 0,
} = {}) {
  const base = { amount, termMonths, monthlyRatePercent: monthlyInterestRate, method: loanMethod, startDate, cbuPerPeriod, savingsPerPeriod };
  const calendar = computeSchedule({ ...base, frequency: 'weekly' });
  const fixed4 = computeSchedule({ ...base, frequency: 'weekly_fixed4' });
  return {
    calendar: {
      numPayments: calendar.totals?.number_of_payments || 0,
      paymentPerPeriod: calendar.totals?.payment_per_period || 0,
      totalInterest: calendar.totals?.interest || 0,
    },
    fixed4: {
      numPayments: fixed4.totals?.number_of_payments || 0,
      paymentPerPeriod: fixed4.totals?.payment_per_period || 0,
      totalInterest: fixed4.totals?.interest || 0,
    },
  };
}

/**
 * generateLoanPreview — used by LoanFormPage for live computation preview.
 * Accepts legacy flat params and delegates to the engine.
 *
 * `extraDeductionItems` accepts any additional { label, type, value|amount }
 * entries (penalty due, annual dues, CBU completion, petty cash, membership
 * upgrade fees, custom "other charges", etc.) so the preview's Total
 * Deductions / Net Proceeds always match whatever is actually toggled on
 * in the UI — instead of silently omitting them.
 */
export function generateLoanPreview({
  amount = 0,
  termMonths = 0,
  monthlyInterestRate = DEFAULT_MONTHLY_RATE,
  paymentFrequency = 'monthly',
  loanMethod = 'diminishing',
  startDate = new Date(),
  cbuPerPeriod = 0,
  savingsPerPeriod = 0,
  serviceFeePercent = 2,
  notarialFee = 0,
  shareCapital = 0,
  regularSavings = 0,
  loanInsurance = 0,
  previousLoanBalance = 0,
  annualDues = 0,
  extraDeductionItems = [],
} = {}) {
  const scheduleResult = computeSchedule({
    amount,
    termMonths,
    monthlyRatePercent: monthlyInterestRate,
    frequency: paymentFrequency,
    method: loanMethod,
    startDate,
    cbuPerPeriod,
    savingsPerPeriod,
  });

  const principal = safeNum(amount);

  const deductionItems = [];
  if (serviceFeePercent)    deductionItems.push({ label: `Service Fee (${serviceFeePercent}%)`, type: 'percent', value: serviceFeePercent });
  if (shareCapital)         deductionItems.push({ label: 'CBU (Share Capital)',           type: 'fixed', amount: safeNum(shareCapital) });
  if (regularSavings)       deductionItems.push({ label: 'Regular Savings',               type: 'fixed', amount: safeNum(regularSavings) });
  if (loanInsurance)        deductionItems.push({ label: 'Coop Loan Protection Plan',     type: 'fixed', amount: safeNum(loanInsurance) });
  if (notarialFee)          deductionItems.push({ label: 'Notarial Fee',                  type: 'fixed', amount: safeNum(notarialFee) });
  if (previousLoanBalance)  deductionItems.push({ label: 'Previous Loan Balance',        type: 'fixed', amount: safeNum(previousLoanBalance) });
  if (annualDues)           deductionItems.push({ label: 'Annual Dues',                   type: 'fixed', amount: safeNum(annualDues) });

  (extraDeductionItems || []).forEach(item => {
    const amt = safeNum(item.amount ?? item.value);
    if (amt) deductionItems.push({ ...item, amount: amt });
  });

  const deductions = computeDeductions({ loanAmount: principal, deductions: deductionItems });
  const summary    = buildScheduleSummary(scheduleResult.schedule, {
    amount: principal, frequency: paymentFrequency, method: loanMethod,
  });

  return {
    schedule: scheduleResult.schedule,
    totals:   scheduleResult.totals,
    summary: {
      ...summary,
      total_cash_out:          deductions.net_proceeds,
      total_payments_collected: scheduleResult.totals.total_payment,
    },
    deductions,
  };
}

/**
 * buildScheduleByFrequency — backward compat for LoanDetailPage fallback display.
 */
export function buildScheduleByFrequency(
  amount,
  annualRateDecimal,
  termMonths,
  releaseDate,
  frequency = 'monthly'
) {
  const monthlyRatePercent = safeNum(annualRateDecimal) * 100 / 12;
  const result = computeSchedule({
    amount,
    termMonths,
    monthlyRatePercent,
    frequency,
    method:         'diminishing',
    startDate:      releaseDate || new Date(),
    cbuPerPeriod:   0,
    savingsPerPeriod: 0,
  });

  return {
    isManual: false,
    schedule: result.schedule.map(r => ({
      period:    r.period,
      dueDate:   r.due_date,
      payment:   round2(r.principal + r.interest),
      principal: r.principal,
      interest:  r.interest,
      balance:   r.balance,
    })),
  };
}