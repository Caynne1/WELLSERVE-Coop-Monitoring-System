/**
 * ═══════════════════════════════════════════════════════════════════════
 * WELLSERVE COOPERATIVE — UNIFIED LOAN COMPUTATION ENGINE
 * ═══════════════════════════════════════════════════════════════════════
 *
 * This is the ONE and ONLY source of truth for all loan calculations.
 *
 * Both loan recording methods use this engine:
 *   • IMPORTED  — from Excel migration (old records 2023-2026)
 *   • MANUAL    — manually encoded new loans going forward
 *
 * The formulas, interest computation, deductions, and schedule generation
 * are IDENTICAL for both. The only difference is the data source.
 *
 * FORMULA REFERENCE (Declining Balance):
 *   Principal Amort  = Loan Amount / Number of Payments
 *   Interest         = Remaining Balance × Periodic Rate
 *   Periodic Rate    = Monthly Rate / periods-per-month
 *   Remaining Bal    = Previous Balance − Principal Amort
 *   Total Payment    = Principal + Interest + CBU + Savings + Penalties
 *   Cash Out         = Loan Amount − Total Deductions
 * ═══════════════════════════════════════════════════════════════════════
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/** Default monthly interest rate (%) for cooperative loans. */
export const DEFAULT_MONTHLY_RATE = 2;

/** Loan recording sources */
export const LOAN_SOURCE = {
  MANUAL:   'manual',
  IMPORTED: 'imported',
};

/** Loan statuses */
export const LOAN_STATUS = {
  ACTIVE:   'active',
  PAID:     'paid',
  OVERDUE:  'overdue',
  PARTIAL:  'partial',
  PENDING:  'pending',
};

/** Frequency configuration: periods per year, date-advance unit */
const FREQUENCY = {
  // Calendar-accurate: 52 weeks / 12 months ≈ 4.33 weeks per month.
  // A 3-month loan = 13 payments. Mathematically matches real elapsed time.
  weekly:        { periodsPerYear: 52, advance: (d, n) => { d.setDate(d.getDate() + 7 * n); return d; } },
  // Fixed-4-weeks-per-month: 48 weeks / 12 months = 4 weeks per month exactly.
  // A 3-month loan = 12 payments. Matches WELLSERVE's printed worksheet convention.
  weekly_fixed4: { periodsPerYear: 48, advance: (d, n) => { d.setDate(d.getDate() + 7 * n); return d; } },
  semi_monthly:{ periodsPerYear: 24, advance: (d, n) => { d.setDate(d.getDate() + 15 * n); return d; } },
  monthly:     { periodsPerYear: 12, advance: (d, n) => { d.setMonth(d.getMonth() + n); return d; } },
  // 'monthly_old' — WELLSERVE's old worksheet formula for monthly loans:
  // Payment / Period = Loan Amount / Number of Payments (no separate
  // interest line added, same as the old 'weekly' convention). Same
  // calendar advance and periods-per-year as 'monthly' — only the
  // principal/interest treatment in computeSchedule differs.
  monthly_old: { periodsPerYear: 12, advance: (d, n) => { d.setMonth(d.getMonth() + n); return d; } },
  chattel:     { periodsPerYear: 12, advance: (d, n) => { d.setMonth(d.getMonth() + n); return d; } },
  quarterly:   { periodsPerYear:  4, advance: (d, n) => { d.setMonth(d.getMonth() + 3 * n); return d; } },
  yearly:      { periodsPerYear:  1, advance: (d, n) => { d.setFullYear(d.getFullYear() + n); return d; } },
};

// ── Math helpers ──────────────────────────────────────────────────────────────

/** Round to 2 decimal places (banker-safe). */
export function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

/** Round to 4 decimal places. */
export function round4(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 10000) / 10000;
}

/** Safe number — returns 0 for NaN/null/undefined. */
export function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// ── Frequency helpers ─────────────────────────────────────────────────────────

/**
 * Exact (unrounded-to-whole-period) total number of weekly periods, per
 * WELLSERVE's printed worksheet formula:
 *   TOTAL = Term (months) × 30 / 7   (kept to 4 decimal places)
 * This TOTAL is used as the divisor for the fixed principal amortization
 * per period (Loan Amount ÷ TOTAL), while the actual number of scheduled
 * installments is the ceiling of TOTAL (see computeNumberOfPayments).
 * Applies ONLY to the 'weekly' (Old) frequency — 'weekly_fixed4' (New)
 * keeps its original interest-bearing calendar formula, unchanged.
 */
export function computeWeeklyTotalPeriods(termMonths) {
  const months = safeNum(termMonths);
  if (months <= 0) return 0;
  return round4((months * 30) / 7);
}

/**
 * Number of payment periods for a given term and frequency.
 * @param {number} termMonths
 * @param {string} frequency
 * @returns {number}
 */
export function computeNumberOfPayments(termMonths, frequency = 'monthly') {
  const months = safeNum(termMonths);
  if (months <= 0) return 0;
  if (frequency === 'weekly') {
    const total = computeWeeklyTotalPeriods(months);
    return Math.max(1, Math.ceil(total));
  }
  const cfg = FREQUENCY[frequency] || FREQUENCY.monthly;
  return Math.max(1, Math.round(months * (cfg.periodsPerYear / 12)));
}

/**
 * Periodic interest rate (decimal) from monthly rate percent.
 * @param {number} monthlyRatePercent  e.g. 2  (meaning 2%)
 * @param {string} frequency
 * @returns {number}  e.g. 0.02 for 2% monthly
 */
export function getRatePerPeriod(monthlyRatePercent, frequency = 'monthly') {
  const monthly = safeNum(monthlyRatePercent) / 100;
  const cfg = FREQUENCY[frequency] || FREQUENCY.monthly;
  // Periods per month = periodsPerYear / 12
  return round2(monthly / (cfg.periodsPerYear / 12) * 10000) / 10000;
}

/**
 * Advance a date by N periods for the given frequency.
 * Handles date-only strings safely (no UTC timezone shift).
 * @param {string|Date} dateInput
 * @param {string} frequency
 * @param {number} periods
 * @returns {Date}
 */
export function advanceDueDate(dateInput, frequency = 'monthly', periods = 1) {
  let base;
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    const [y, m, d] = dateInput.trim().split('-').map(Number);
    base = new Date(y, m - 1, d);
  } else {
    base = new Date(dateInput);
  }
  if (Number.isNaN(base.getTime())) base = new Date();

  const d = new Date(base);
  const cfg = FREQUENCY[frequency] || FREQUENCY.monthly;
  return cfg.advance(d, periods);
}

/**
 * ISO date string (YYYY-MM-DD) from a Date or string.
 */
export function toDateStr(d) {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Display label for a frequency. */
export function frequencyLabel(frequency) {
  const map = {
    weekly: 'Weekly (Old)',
    weekly_fixed4: 'Weekly (New)',
    semi_monthly: 'Quencena',
    monthly: 'Monthly',
    monthly_old: 'Monthly (Old)',
    chattel: 'Chattel',
    quarterly: 'Quarterly',
    yearly: 'Yearly',
  };
  return map[frequency] || 'Monthly';
}

/** Period label (singular) for a frequency. */
export function periodLabel(frequency) {
  const map = {
    weekly: 'week',
    weekly_fixed4: 'week',
    semi_monthly: 'quencena',
    monthly: 'month',
    monthly_old: 'month',
    chattel: 'month',
    quarterly: 'quarter',
    yearly: 'year',
  };
  return map[frequency] || 'period';
}

// ── Core: Amortization Schedule ───────────────────────────────────────────────

/**
 * Generate a full amortization schedule (declining balance method).
 *
 * This is the SINGLE schedule generator used for ALL loans.
 * Both MANUAL and IMPORTED loans ultimately produce this format.
 *
 * @param {Object} params
 * @param {number}  params.amount              Loan principal
 * @param {number}  params.termMonths          Loan term in months
 * @param {number}  params.monthlyRatePercent  Monthly interest rate (e.g. 2 for 2%)
 * @param {string}  params.frequency           Payment frequency
 * @param {string}  [params.method='diminishing'] 'diminishing' or 'straight'
 * @param {string|Date} [params.startDate]     Release/start date
 * @param {number}  [params.cbuPerPeriod=0]    Fixed CBU per period
 * @param {number}  [params.savingsPerPeriod=0] Fixed savings per period
 * @param {number}  [params.numPayments]       Override number of payments (for imports)
 *
 * @returns {{ schedule: Array, totals: Object, meta: Object }}
 */
export function computeSchedule({
  amount = 0,
  termMonths = 0,
  monthlyRatePercent = DEFAULT_MONTHLY_RATE,
  frequency = 'monthly',
  method = 'diminishing',
  startDate = new Date(),
  cbuPerPeriod = 0,
  savingsPerPeriod = 0,
  numPayments: numPaymentsOverride = null,
}) {
  const principal = round2(safeNum(amount));
  const cbu = round2(safeNum(cbuPerPeriod));
  const savings = round2(safeNum(savingsPerPeriod));
  const ratePerPeriod = getRatePerPeriod(safeNum(monthlyRatePercent), frequency);

  const numPayments = numPaymentsOverride != null
    ? Math.max(1, safeNum(numPaymentsOverride))
    : computeNumberOfPayments(termMonths, frequency);

  if (principal <= 0 || numPayments <= 0) {
    return {
      schedule: [],
      totals: {
        principal: 0, interest: 0, cbu: 0, savings: 0,
        total_payment: 0, payment_per_period: 0, number_of_payments: 0, roi_percent: 0,
      },
      meta: { rate_per_period: round2(ratePerPeriod * 100), frequency, method },
    };
  }

  // WELLSERVE worksheet formula for the 'weekly' (Old) frequency:
  //   TOTAL = Term (months) × 30 / 7
  //   Payment / Period = Loan Amount ÷ TOTAL   (no separate interest added)
  // Division uses the full-precision TOTAL (not pre-rounded to 4 decimals)
  // so the resulting per-period payment rounds correctly to 2 decimals.
  // The actual number of scheduled installments is ceil(TOTAL) — see
  // computeNumberOfPayments — since a schedule needs whole rows, but the
  // payment divisor itself stays at full precision.
  //
  // 'monthly_old' follows the same "no separate interest" worksheet
  // convention, but uses the plain (integer) number of payments as the
  // divisor — Payment / Period = Loan Amount / Number of Payments.
  //
  // 'weekly_fixed4' (New) and all other frequencies are unaffected: the
  // divisor is simply the (integer) number of payments, and interest is
  // still computed normally.
  const isOldWeeklyFrequency = frequency === 'weekly';
  const isOldNoInterestFrequency = isOldWeeklyFrequency || frequency === 'monthly_old';
  const weeklyTotalExact = safeNum(termMonths) * 30 / 7; // full precision, not pre-rounded
  const principalDivisor = (isOldWeeklyFrequency && numPaymentsOverride == null)
    ? Math.max(weeklyTotalExact, 0.0001)
    : numPayments;

  const fixedPrincipalAmort = round2(principal / principalDivisor);
  let runningBalance = principal;

  let sumPrincipal = 0;
  let sumInterest = 0;
  let sumCbu = 0;
  let sumSavings = 0;
  const schedule = [];

  for (let i = 1; i <= numPayments; i++) {
    const beginBalance = round2(runningBalance);

    // Last period absorbs rounding remainder
    const principalAmort = (i === numPayments) ? round2(beginBalance) : fixedPrincipalAmort;

    // Interest on beginning balance (diminishing) or original principal (straight).
    // The 'weekly' and 'monthly_old' (Old) frequencies follow WELLSERVE's
    // worksheet formula, where the per-period payment is simply Loan Amount
    // ÷ Number of Payments with no separate interest line added on top —
    // so interest is not charged per period here.
    const interest = isOldNoInterestFrequency
      ? 0
      : method === 'straight'
        ? round2(principal * ratePerPeriod)
        : round2(beginBalance * ratePerPeriod);

    const loanTotal = round2(principalAmort + interest);
    const totalDue = round2(loanTotal + cbu + savings);
    const endBalance = Math.max(0, round2(beginBalance - principalAmort));
    const dueDate = toDateStr(advanceDueDate(startDate, frequency, i));

    schedule.push({
      period: i,
      due_date: dueDate,
      balance: endBalance,         // remaining principal (matches Excel "Principal" column)
      principal: principalAmort,   // principal amortization this period
      interest,                    // interest this period
      payment: loanTotal,          // loan total (principal + interest)
      total_due: totalDue,         // with CBU + savings
      cbu_paid: cbu,               // scheduled CBU
      savings_paid: savings,       // scheduled savings
      paid: false,
      paid_amount: 0,
    });

    sumPrincipal = round2(sumPrincipal + principalAmort);
    sumInterest = round2(sumInterest + interest);
    sumCbu = round2(sumCbu + cbu);
    sumSavings = round2(sumSavings + savings);
    runningBalance = endBalance;
  }

  const totalPayment = round2(sumPrincipal + sumInterest + sumCbu + sumSavings);
  const paymentPerPeriod = schedule[0]?.total_due || 0;
  const roiPercent = principal > 0 ? round2((sumInterest / principal) * 100) : 0;

  return {
    schedule,
    totals: {
      principal: sumPrincipal,
      interest: sumInterest,
      cbu: sumCbu,
      savings: sumSavings,
      total_payment: totalPayment,
      payment_per_period: paymentPerPeriod,
      number_of_payments: numPayments,
      roi_percent: roiPercent,
    },
    meta: {
      rate_per_period: round2(ratePerPeriod * 100),
      frequency,
      period_label: periodLabel(frequency),
      method,
    },
  };
}

// ── Core: Deductions ──────────────────────────────────────────────────────────

/**
 * Compute all deductions and net proceeds from a configurable deduction spec.
 * Nothing is hardcoded — pass in whatever deductions apply to this loan.
 *
 * @param {Object} params
 * @param {number} params.loanAmount
 * @param {Array}  [params.deductions]  Array of { label, type, value }
 *   type: 'percent' (of loanAmount) | 'fixed' | 'manual' (explicit amount)
 *
 * Standard deduction labels (for reference):
 *   service_fee, cbu, regular_savings, clpp, previous_balance,
 *   annual_dues, notarial_fee, other
 *
 * @returns {{ items: Array, total: number, net_proceeds: number }}
 */
export function computeDeductions({ loanAmount = 0, deductions = [] }) {
  const principal = safeNum(loanAmount);

  const items = deductions.map(d => {
    let amount = 0;
    if (d.type === 'percent') {
      amount = round2(principal * (safeNum(d.value) / 100));
    } else {
      amount = round2(safeNum(d.amount ?? d.value));
    }
    return { ...d, amount };
  });

  const total = round2(items.reduce((s, d) => s + d.amount, 0));
  const net_proceeds = round2(Math.max(0, principal - total));

  return { items, total, net_proceeds };
}

/**
 * Build a standard deductions array from the flat loan fields
 * stored in the database (for both imported and manual loans).
 *
 * @param {Object} loan  DB loan row
 * @returns {{ items, total, net_proceeds }}
 */
export function buildDeductionsFromLoan(loan) {
  const deductions = [];

  if (safeNum(loan.service_fee) > 0) {
    deductions.push({ label: `Service Fee (${loan.service_fee_percent ?? 2}%)`, type: 'fixed', amount: safeNum(loan.service_fee) });
  }
  if (safeNum(loan.share_capital) > 0) {
    deductions.push({ label: 'CBU (Share Capital)', type: 'fixed', amount: safeNum(loan.share_capital) });
  }
  if (safeNum(loan.regular_savings) > 0) {
    deductions.push({ label: 'Regular Savings', type: 'fixed', amount: safeNum(loan.regular_savings) });
  }
  if (safeNum(loan.loan_insurance) > 0) {
    deductions.push({ label: 'Coop Loan Protection Plan', type: 'fixed', amount: safeNum(loan.loan_insurance) });
  }
  if (safeNum(loan.previous_loan_balance) > 0) {
    deductions.push({ label: 'Previous Loan Balance', type: 'fixed', amount: safeNum(loan.previous_loan_balance) });
  }
  if (safeNum(loan.annual_dues) > 0) {
    deductions.push({ label: 'Annual Dues', type: 'fixed', amount: safeNum(loan.annual_dues) });
  }
  if (safeNum(loan.notarial_fee) > 0) {
    deductions.push({ label: 'Notarial Fee', type: 'fixed', amount: safeNum(loan.notarial_fee) });
  }

  return computeDeductions({ loanAmount: safeNum(loan.amount), deductions });
}

// ── Core: Payment allocation ──────────────────────────────────────────────────

/**
 * Apply a payment amount to the next unpaid period(s) of a schedule.
 * Returns the updated schedule — does NOT mutate the original.
 *
 * @param {Array}  schedule       Amortization schedule array
 * @param {number} paymentAmount  Amount being paid
 * @returns {{ schedule: Array, applied: number, remaining: number }}
 */
export function applyPaymentToSchedule(schedule, paymentAmount) {
  if (!Array.isArray(schedule) || schedule.length === 0) {
    return { schedule: [], applied: 0, remaining: safeNum(paymentAmount) };
  }

  let remaining = round2(safeNum(paymentAmount));
  let applied = 0;
  const updated = schedule.map(r => ({ ...r }));

  for (let i = 0; i < updated.length; i++) {
    const row = updated[i];
    if (row.paid) continue;

    const rowDue = round2(row.remaining_due ?? row.total_due ?? row.payment ?? 0);
    if (rowDue <= 0) continue;

    if (remaining >= rowDue) {
      // Full payment of this period
      row.paid = true;
      row.paid_amount = rowDue;
      row.paid_at = new Date().toISOString();
      row.remaining_due = 0;
      row.partial_paid = false;
      applied = round2(applied + rowDue);
      remaining = round2(remaining - rowDue);
    } else if (remaining > 0) {
      // Partial payment
      row.paid = false;
      row.partial_paid = true;
      row.paid_amount = round2((row.paid_amount || 0) + remaining);
      row.partial_paid_amount = row.paid_amount;
      row.remaining_due = round2(rowDue - row.paid_amount);
      row.last_partial_paid_at = new Date().toISOString();
      applied = round2(applied + remaining);
      remaining = 0;
      break;
    } else {
      break;
    }
  }

  return { schedule: updated, applied, remaining };
}

// ── Core: Loan status ─────────────────────────────────────────────────────────

/**
 * Determine the correct loan status from balance + due date + schedule.
 * @param {number} balance      Current outstanding balance
 * @param {string} dueDate      Loan due/maturity date (YYYY-MM-DD)
 * @param {Array}  [schedule]   Schedule array (optional)
 * @returns {string} LOAN_STATUS value
 */
export function computeLoanStatus(balance, dueDate, schedule = []) {
  const bal = safeNum(balance);
  if (bal <= 0) return LOAN_STATUS.PAID;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Check if any unpaid period is overdue
  if (Array.isArray(schedule) && schedule.length > 0) {
    const nextUnpaid = schedule.find(r => !r.paid);
    if (nextUnpaid?.due_date) {
      const due = new Date(nextUnpaid.due_date);
      due.setHours(0, 0, 0, 0);
      if (due < today) return LOAN_STATUS.OVERDUE;
    }
    const anyPartial = schedule.some(r => r.partial_paid);
    if (anyPartial) return LOAN_STATUS.PARTIAL;
  } else if (dueDate) {
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    if (due < today) return LOAN_STATUS.OVERDUE;
  }

  return LOAN_STATUS.ACTIVE;
}

// ── Core: Schedule summary ────────────────────────────────────────────────────

/**
 * Build the preview_summary_json object from a schedule + loan params.
 * This is what gets stored in the DB and displayed in the UI.
 */
export function buildScheduleSummary(schedule, loanParams = {}) {
  if (!Array.isArray(schedule) || schedule.length === 0) return {};

  const paidRows = schedule.filter(r => r.paid);
  const unpaidRows = schedule.filter(r => !r.paid);
  const nextUnpaid = unpaidRows[0] || null;

  const totalPrincipal = round2(schedule.reduce((s, r) => s + (r.principal || 0), 0));
  const totalInterest = round2(schedule.reduce((s, r) => s + (r.interest || 0), 0));
  const totalCbu = round2(schedule.reduce((s, r) => s + (r.cbu_paid || 0), 0));
  const totalSavings = round2(schedule.reduce((s, r) => s + (r.savings_paid || 0), 0));
  const totalPayment = round2(totalPrincipal + totalInterest + totalCbu + totalSavings);

  const principal = safeNum(loanParams.amount ?? loanParams.loan_amount ?? totalPrincipal);
  const roiPercent = principal > 0 ? round2((totalInterest / principal) * 100) : 0;

  return {
    number_of_payments: schedule.length,
    paid_periods: paidRows.length,
    rate_per_period: loanParams.rate_per_period ?? 0,
    payment_per_period: schedule[0]?.total_due || 0,
    payment_frequency: loanParams.frequency || loanParams.repayment_frequency || 'monthly',
    loan_method: loanParams.method || loanParams.loan_method || 'diminishing',
    total_principal_collected: totalPrincipal,
    total_interest_earned: totalInterest,
    total_cbu_collected: totalCbu,
    total_savings_collected: totalSavings,
    total_payments_collected: totalPayment,
    total_roi_percent: roiPercent,
    next_due_date: nextUnpaid?.due_date || null,
    next_due_amount: round2(nextUnpaid?.remaining_due ?? nextUnpaid?.total_due ?? nextUnpaid?.payment ?? 0),
  };
}

// ── Loan record builder ───────────────────────────────────────────────────────

/**
 * Build a complete loan DB payload from params.
 * Used by BOTH manual encoding and Excel import.
 *
 * @param {Object} params         Loan parameters
 * @param {string} source         LOAN_SOURCE.MANUAL | LOAN_SOURCE.IMPORTED
 * @param {Array}  [importedSchedule] Pre-existing schedule (for imports — skip recompute)
 * @returns {Object}  Ready-to-insert DB payload
 */
export function buildLoanRecord(params, source = LOAN_SOURCE.MANUAL, importedSchedule = null) {
  const {
    memberId,
    loanNo,
    amount,
    balance: importedBalance,
    termMonths,
    monthlyRatePercent = DEFAULT_MONTHLY_RATE,
    frequency = 'monthly',
    method = 'diminishing',
    startDate,
    dueDate,
    status: importedStatus,
    purpose,
    notes,
    cbuPerPeriod = 0,
    savingsPerPeriod = 0,
    deductionItems = [],
  } = params;

  const principal = safeNum(amount);

  // ── Schedule ──────────────────────────────────────────────────────────────
  // IMPORTED loans: use the pre-existing schedule (source of truth = Excel)
  // MANUAL loans: compute fresh from engine
  let schedule, totals, meta;

  if (source === LOAN_SOURCE.IMPORTED && importedSchedule && importedSchedule.length > 0) {
    schedule = importedSchedule;
    totals = {
      principal: round2(schedule.reduce((s, r) => s + (r.principal || 0), 0)),
      interest: round2(schedule.reduce((s, r) => s + (r.interest || 0), 0)),
      cbu: round2(schedule.reduce((s, r) => s + (r.cbu_paid || 0), 0)),
      savings: round2(schedule.reduce((s, r) => s + (r.savings_paid || 0), 0)),
      number_of_payments: schedule.length,
      payment_per_period: schedule[0]?.total_due || 0,
    };
    totals.total_payment = round2(totals.principal + totals.interest + totals.cbu + totals.savings);
    totals.roi_percent = principal > 0 ? round2((totals.interest / principal) * 100) : 0;
    meta = { frequency, period_label: periodLabel(frequency), method };
  } else {
    // Compute fresh (manual loans, or re-compute if requested)
    const result = computeSchedule({
      amount: principal,
      termMonths: safeNum(termMonths),
      monthlyRatePercent,
      frequency,
      method,
      startDate: startDate || new Date(),
      cbuPerPeriod: safeNum(cbuPerPeriod),
      savingsPerPeriod: safeNum(savingsPerPeriod),
    });
    schedule = result.schedule;
    totals = result.totals;
    meta = result.meta;
  }

  // ── Balance ────────────────────────────────────────────────────────────────
  // IMPORTED: use the imported balance (= source of truth)
  // MANUAL: start at full principal
  const balance = source === LOAN_SOURCE.IMPORTED && importedBalance != null
    ? round2(safeNum(importedBalance))
    : principal;

  // ── Status ─────────────────────────────────────────────────────────────────
  const status = source === LOAN_SOURCE.IMPORTED && importedStatus
    ? importedStatus
    : computeLoanStatus(balance, dueDate, schedule);

  // ── Deductions ─────────────────────────────────────────────────────────────
  const deductions = computeDeductions({ loanAmount: principal, deductions: deductionItems });

  // ── Summary ────────────────────────────────────────────────────────────────
  const summary = buildScheduleSummary(schedule, {
    amount: principal,
    rate_per_period: meta.rate_per_period ?? 0,
    frequency,
    method,
  });

  // ── Due date ───────────────────────────────────────────────────────────────
  const nextUnpaid = schedule.find(r => !r.paid);
  const finalDueDate = nextUnpaid?.due_date || dueDate || summary.next_due_date;

  return {
    // Core fields
    member_id: memberId,
    loan_no: loanNo || null,
    amount: principal,
    balance,
    status,
    source,                          // 'manual' | 'imported'
    purpose: purpose || null,
    notes: notes || null,

    // Rate & term
    interest_rate: round2(safeNum(monthlyRatePercent) * 12), // store as annual %
    term_months: safeNum(termMonths) || null,
    repayment_frequency: frequency,
    loan_method: method,
    monthly_amortization: totals.payment_per_period,

    // Dates
    release_date: startDate ? toDateStr(new Date(startDate)) : null,
    due_date: finalDueDate,

    // Deduction flat fields (for compatibility + display)
    loan_proposal: principal,
    service_fee: deductions.items.find(d => d.label?.toLowerCase().includes('service'))?.amount || safeNum(params.serviceFee),
    share_capital: deductions.items.find(d => d.label?.toLowerCase().includes('cbu'))?.amount || safeNum(params.shareCapital),
    regular_savings: deductions.items.find(d => d.label?.toLowerCase().includes('savings'))?.amount || safeNum(params.regularSavings),
    loan_insurance: deductions.items.find(d => d.label?.toLowerCase().includes('protection') || d.label?.toLowerCase().includes('clpp'))?.amount || safeNum(params.loanInsurance),
    previous_loan_balance: deductions.items.find(d => d.label?.toLowerCase().includes('previous'))?.amount || 0,
    annual_dues: deductions.items.find(d => d.label?.toLowerCase().includes('annual'))?.amount || 0,
    notarial_fee: deductions.items.find(d => d.label?.toLowerCase().includes('notarial'))?.amount || safeNum(params.notarialFee),
    total_loan_payable: totals.total_payment,

    // CBU & savings per period
    cbu_per_period: safeNum(cbuPerPeriod),
    savings_per_period: safeNum(savingsPerPeriod),

    // JSON columns
    preview_schedule_json: JSON.stringify(schedule),
    preview_summary_json: JSON.stringify(summary),
    preview_deductions_json: JSON.stringify({
      items: deductions.items,
      total: deductions.total,
      net_proceeds: deductions.net_proceeds,
      ...deductions,
    }),
  };
}

// ── Import-specific: normalize Excel schedule ─────────────────────────────────

/**
 * Normalize a schedule row from Excel import into the standard engine format.
 * Handles various field name conventions from different Excel files.
 *
 * @param {Object} row  Raw row from import parser
 * @returns {Object}  Normalized schedule row
 */
export function normalizeImportedScheduleRow(row) {
  const paid_amount = safeNum(row.paid_amount);
  const total_due = safeNum(row.total_due ?? row.payment);
  const paid = row.paid === true || (paid_amount > 0 && paid_amount >= total_due);

  return {
    period: safeNum(row.period),
    due_date: row.due_date || null,
    balance: round2(safeNum(row.balance)),               // remaining principal
    principal: round2(safeNum(row.principal)),           // principal amortization
    interest: round2(safeNum(row.interest)),             // interest
    payment: round2(safeNum(row.payment ?? row.total_due)),  // loan total
    total_due: round2(total_due),
    cbu_paid: round2(safeNum(row.cbu_paid)),
    savings_paid: round2(safeNum(row.savings_paid)),
    paid,
    paid_amount: round2(paid_amount),
    remaining_due: paid ? 0 : round2(Math.max(0, total_due - paid_amount)),
  };
}

// ── Duplicate detection ───────────────────────────────────────────────────────

/**
 * Generate a fingerprint string for duplicate detection during import.
 * Two loans are considered duplicates if they have the same member,
 * release date, and amount.
 */
export function loanFingerprint(memberId, releaseDate, amount) {
  return `${memberId}|${releaseDate || ''}|${round2(safeNum(amount))}`;
}