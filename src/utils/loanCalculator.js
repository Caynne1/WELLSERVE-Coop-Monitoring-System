const DEFAULT_CBU_PER_PERIOD = 25;
const DEFAULT_SAVINGS_PER_PERIOD = 25;

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function getPaymentsPerYear(frequency = 'monthly') {
  switch (frequency) {
    case 'weekly':
      return 52;
    case 'semi_monthly':
      return 24;
    case 'monthly':
      return 12;
    case 'quarterly':
      return 4;
    case 'yearly':
      return 1;
    default:
      return 12;
  }
}

export function frequencyPeriodLabel(frequency = 'monthly') {
  switch (frequency) {
    case 'weekly':
      return 'week';
    case 'semi_monthly':
      return 'semi-month';
    case 'monthly':
      return 'month';
    case 'quarterly':
      return 'quarter';
    case 'yearly':
      return 'year';
    default:
      return 'period';
  }
}

export function frequencyDisplayLabel(frequency = 'monthly') {
  switch (frequency) {
    case 'weekly':
      return 'Weekly';
    case 'semi_monthly':
      return 'Semi-Monthly';
    case 'monthly':
      return 'Monthly';
    case 'quarterly':
      return 'Quarterly';
    case 'yearly':
      return 'Yearly';
    default:
      return 'Custom';
  }
}

export function computeDisplayPeriods(termMonths = 0, frequency = 'monthly') {
  const months = safeNumber(termMonths);
  const payments = computeNumberOfPayments(months, frequency);
  return payments;
}

export function computeNumberOfPayments(termMonths = 0, frequency = 'monthly') {
  const months = safeNumber(termMonths);

  if (months <= 0) return 0;

  switch (frequency) {
    case 'weekly':
      return Math.round(months * (52 / 12));
    case 'semi_monthly':
      return Math.round(months * 2);
    case 'monthly':
      return Math.round(months);
    case 'quarterly':
      return Math.max(1, Math.round(months / 3));
    case 'yearly':
      return Math.max(1, Math.round(months / 12));
    default:
      return Math.round(months);
  }
}

export function getRatePerPeriod(monthlyRatePercent = 0, frequency = 'monthly') {
  const monthlyRateDecimal = safeNumber(monthlyRatePercent) / 100;

  switch (frequency) {
    case 'weekly':
      return monthlyRateDecimal / 4;
    case 'semi_monthly':
      return monthlyRateDecimal / 2;
    case 'monthly':
      return monthlyRateDecimal;
    case 'quarterly':
      return monthlyRateDecimal * 3;
    case 'yearly':
      return monthlyRateDecimal * 12;
    default:
      return monthlyRateDecimal;
  }
}

export function addPeriodsToDate(dateInput, frequency = 'monthly', count = 1) {
  const base = new Date(dateInput);
  if (Number.isNaN(base.getTime())) return new Date();

  const d = new Date(base);

  switch (frequency) {
    case 'weekly':
      d.setDate(d.getDate() + (7 * count));
      return d;
    case 'semi_monthly':
      d.setDate(d.getDate() + (15 * count));
      return d;
    case 'monthly':
      d.setMonth(d.getMonth() + count);
      return d;
    case 'quarterly':
      d.setMonth(d.getMonth() + (3 * count));
      return d;
    case 'yearly':
      d.setFullYear(d.getFullYear() + count);
      return d;
    default:
      d.setMonth(d.getMonth() + count);
      return d;
  }
}

export function computePaymentByFrequency(monthlyPayment = 0, frequency = 'monthly') {
  const payment = safeNumber(monthlyPayment);

  switch (frequency) {
    case 'weekly':
      return round2((payment * 12) / 52);
    case 'semi_monthly':
      return round2(payment / 2);
    case 'monthly':
      return round2(payment);
    case 'quarterly':
      return round2(payment * 3);
    case 'yearly':
      return round2(payment * 12);
    default:
      return round2(payment);
  }
}

/**
 * Kept for backward compatibility with current code that still imports this.
 * This is the old amortization-style monthly computation using a flat-style formula.
 * It is intentionally preserved so older pages don't break while we refactor.
 */
export function computeMonthlyAmortization(principal = 0, annualRate = 0, termMonths = 0) {
  const p = safeNumber(principal);
  const rAnnual = safeNumber(annualRate);
  const n = safeNumber(termMonths);

  if (p <= 0 || n <= 0) return 0;

  const monthlyRate = rAnnual / 12;

  if (monthlyRate <= 0) {
    return round2(p / n);
  }

  const payment = p * (monthlyRate / (1 - Math.pow(1 + monthlyRate, -n)));
  return round2(payment);
}

export function computeLoanDeductions({
  amount = 0,
  serviceFeePercent = 2,
  cbuRetentionPercent = 2.5,
  notarialFee = 200,
  insuranceMode = 'fixed',
  insuranceAmount = 0,
  insuranceFixedRatePercent = 0,
}) {
  const principal = safeNumber(amount);
  const serviceFee = round2(principal * (safeNumber(serviceFeePercent) / 100));
  const cbuRetention = round2(principal * (safeNumber(cbuRetentionPercent) / 100));
  const notarial = round2(safeNumber(notarialFee));

  let insurance = 0;
  if (insuranceMode === 'manual') {
    insurance = round2(safeNumber(insuranceAmount));
  } else {
    insurance = round2(principal * (safeNumber(insuranceFixedRatePercent) / 100));
  }

  const totalDeductions = round2(serviceFee + cbuRetention + notarial + insurance);
  const netProceeds = round2(principal - totalDeductions);

  return {
    service_fee: serviceFee,
    cbu_retention: cbuRetention,
    notarial_fee: notarial,
    insurance,
    total_deductions: totalDeductions,
    net_proceeds: netProceeds,
  };
}

export function generateLoanSchedule({
  amount = 0,
  termMonths = 0,
  monthlyInterestRate = 2.5,
  paymentFrequency = 'monthly',
  loanMethod = 'diminishing',
  startDate = new Date(),
  cbuPerPeriod = DEFAULT_CBU_PER_PERIOD,
  savingsPerPeriod = DEFAULT_SAVINGS_PER_PERIOD,
}) {
  const principal = round2(safeNumber(amount));
  const numberOfPayments = computeNumberOfPayments(termMonths, paymentFrequency);
  const ratePerPeriod = getRatePerPeriod(monthlyInterestRate, paymentFrequency);
  const cbu = round2(safeNumber(cbuPerPeriod));
  const savings = round2(safeNumber(savingsPerPeriod));

  if (principal <= 0 || numberOfPayments <= 0) {
    return {
      schedule: [],
      totals: {
        principal: 0,
        interest: 0,
        cbu: 0,
        savings: 0,
        total_payment: 0,
        payment_per_period: 0,
        number_of_payments: 0,
        roi_percent: 0,
      },
      meta: {
        rate_per_period: round2(ratePerPeriod * 100),
        payment_frequency: paymentFrequency,
        period_label: frequencyPeriodLabel(paymentFrequency),
        loan_method: loanMethod,
      },
    };
  }

  const fixedPrincipal = round2(principal / numberOfPayments);
  let runningBalance = principal;

  let totalPrincipal = 0;
  let totalInterest = 0;
  let totalCbu = 0;
  let totalSavings = 0;

  const schedule = [];

  for (let i = 1; i <= numberOfPayments; i += 1) {
    const beginningBalance = round2(runningBalance);

    let principalAmount = fixedPrincipal;
    if (i === numberOfPayments) {
      principalAmount = round2(beginningBalance);
    }

    let interestAmount = 0;

    if (loanMethod === 'straight') {
      interestAmount = round2(principal * ratePerPeriod);
    } else {
      interestAmount = round2(beginningBalance * ratePerPeriod);
    }

    const totalDue = round2(principalAmount + interestAmount + cbu + savings);
    const endingBalance = round2(beginningBalance - principalAmount);
    const dueDate = addPeriodsToDate(startDate, paymentFrequency, i - 1);

    schedule.push({
      payment_no: i,
      due_date: dueDate,
      beginning_balance: beginningBalance,
      principal_amount: principalAmount,
      interest_amount: interestAmount,
      cbu_amount: cbu,
      savings_amount: savings,
      total_due: totalDue,
      ending_balance: endingBalance < 0 ? 0 : endingBalance,
      status: 'unpaid',
    });

    totalPrincipal = round2(totalPrincipal + principalAmount);
    totalInterest = round2(totalInterest + interestAmount);
    totalCbu = round2(totalCbu + cbu);
    totalSavings = round2(totalSavings + savings);

    runningBalance = endingBalance;
  }

  const totalPayment = round2(totalPrincipal + totalInterest + totalCbu + totalSavings);
  const paymentPerPeriod = schedule[0]?.total_due || 0;
  const roiPercent = principal > 0 ? round2((totalInterest / principal) * 100) : 0;

  return {
    schedule,
    totals: {
      principal: totalPrincipal,
      interest: totalInterest,
      cbu: totalCbu,
      savings: totalSavings,
      total_payment: totalPayment,
      payment_per_period: paymentPerPeriod,
      number_of_payments: numberOfPayments,
      roi_percent: roiPercent,
    },
    meta: {
      rate_per_period: round2(ratePerPeriod * 100),
      payment_frequency: paymentFrequency,
      period_label: frequencyPeriodLabel(paymentFrequency),
      loan_method: loanMethod,
    },
  };
}

export function generateLoanPreview({
  amount = 0,
  termMonths = 0,
  monthlyInterestRate = 2.5,
  paymentFrequency = 'monthly',
  loanMethod = 'diminishing',
  startDate = new Date(),
  cbuPerPeriod = DEFAULT_CBU_PER_PERIOD,
  savingsPerPeriod = DEFAULT_SAVINGS_PER_PERIOD,
  serviceFeePercent = 2,
  cbuRetentionPercent = 2.5,
  notarialFee = 200,
  insuranceMode = 'fixed',
  insuranceAmount = 0,
  insuranceFixedRatePercent = 0,
}) {
  const scheduleResult = generateLoanSchedule({
    amount,
    termMonths,
    monthlyInterestRate,
    paymentFrequency,
    loanMethod,
    startDate,
    cbuPerPeriod,
    savingsPerPeriod,
  });

  const deductions = computeLoanDeductions({
    amount,
    serviceFeePercent,
    cbuRetentionPercent,
    notarialFee,
    insuranceMode,
    insuranceAmount,
    insuranceFixedRatePercent,
  });

  const totalCashOut = deductions.net_proceeds;
  const totalPrincipalCollected = scheduleResult.totals.principal;
  const totalInterestEarned = scheduleResult.totals.interest;
  const totalPaymentsCollected = scheduleResult.totals.total_payment;

  return {
    schedule: scheduleResult.schedule,
    summary: {
      total_cash_out: round2(totalCashOut),
      total_principal_collected: round2(totalPrincipalCollected),
      total_interest_earned: round2(totalInterestEarned),
      total_payments_collected: round2(totalPaymentsCollected),
      total_roi_percent: scheduleResult.totals.roi_percent,
      payment_per_period: scheduleResult.totals.payment_per_period,
      number_of_payments: scheduleResult.totals.number_of_payments,
      rate_per_period_percent: scheduleResult.meta.rate_per_period,
      payment_frequency: scheduleResult.meta.payment_frequency,
      period_label: scheduleResult.meta.period_label,
      loan_method: scheduleResult.meta.loan_method,
    },
    deductions,
  };
}

/**
 * Backward-compatible helper for existing LoanDetailPage view.
 * Returns a schedule shape similar to the old page's expectation.
 */
export function buildScheduleByFrequency(
  amount,
  annualRateDecimal,
  termMonths,
  releaseDate,
  frequency = 'monthly'
) {
  const monthlyRatePercent = safeNumber(annualRateDecimal) * 100 / 12;

  const result = generateLoanSchedule({
    amount,
    termMonths,
    monthlyInterestRate: monthlyRatePercent,
    paymentFrequency: frequency,
    loanMethod: 'diminishing',
    startDate: releaseDate || new Date(),
    cbuPerPeriod: 0,
    savingsPerPeriod: 0,
  });

  return {
    isManual: false,
    schedule: result.schedule.map(row => ({
      period: row.payment_no,
      dueDate: row.due_date,
      payment: round2(row.principal_amount + row.interest_amount),
      principal: row.principal_amount,
      interest: row.interest_amount,
      balance: row.ending_balance,
    })),
  };
}