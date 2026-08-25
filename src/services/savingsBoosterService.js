export const SAVINGS_BOOSTER_DEFAULTS = {
  weeklyDeposit: 70,
  initialDeposit: 350,
  months: 12,
  weeksRequired: 52,
  maturityMonths: 13,
  monthlyInterestRate: 0.0375,
  transactionFeeRate: 0.15,
};

const MONTHLY_WEEK_SLOTS = [
  4, 4, 4, 4, 4, 4,
  4, 4, 4, 4, 4, 4,
];

function roundMoney(value) {
  return Math.round((Number(value || 0) + 1e-9) * 100) / 100;
}

export function getBoosterConfig(slot = {}) {
  return {
    weeklyDeposit: Number(slot.weekly_deposit || SAVINGS_BOOSTER_DEFAULTS.weeklyDeposit),
    initialDeposit: Number(slot.initial_deposit || SAVINGS_BOOSTER_DEFAULTS.initialDeposit),
    months: SAVINGS_BOOSTER_DEFAULTS.months,
    weeksRequired: Number(slot.weeks_required || SAVINGS_BOOSTER_DEFAULTS.weeksRequired),
    maturityMonths: Number(slot.maturity_months || SAVINGS_BOOSTER_DEFAULTS.maturityMonths),
    monthlyInterestRate: Number(slot.monthly_interest_rate ?? SAVINGS_BOOSTER_DEFAULTS.monthlyInterestRate),
    transactionFeeRate: Number(slot.transaction_fee_rate ?? SAVINGS_BOOSTER_DEFAULTS.transactionFeeRate),
  };
}

export function getExpectedBoosterDeposit(slot = {}) {
  const config = getBoosterConfig(slot);
  return config.initialDeposit + ((config.weeksRequired - 5) * config.weeklyDeposit);
}

export function getBoosterDepositWeeks(amount, slot = {}) {
  const config = getBoosterConfig(slot);
  const value = Number(amount || 0);
  if (value <= 0 || config.weeklyDeposit <= 0) return 0;
  return Math.max(1, Math.round(value / config.weeklyDeposit));
}

export function getBoosterMaturityDate(startDate, slot = {}) {
  if (!startDate) return null;
  const config = getBoosterConfig(slot);
  const d = new Date(startDate);
  if (Number.isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + config.maturityMonths);
  return d.toISOString().split('T')[0];
}

export function buildSavingsBoosterSchedule(totalDeposited = 0, slot = {}) {
  const config = getBoosterConfig(slot);
  let remaining = Math.max(0, Number(totalDeposited || 0));

  return MONTHLY_WEEK_SLOTS.map((weeks, index) => {
    const monthlyLimit = index === 0
      ? config.initialDeposit + ((weeks - 1) * config.weeklyDeposit)
      : weeks * config.weeklyDeposit;
    const amount = Math.min(remaining, Math.max(0, monthlyLimit));
    remaining -= amount;
    return {
      month: index + 1,
      amount,
      weeksCovered: config.weeklyDeposit > 0 ? Math.round(amount / config.weeklyDeposit) : 0,
    };
  });
}

export function calculateSavingsBoosterInterest(totalDeposited = 0, slot = {}) {
  const config = getBoosterConfig(slot);
  const schedule = buildSavingsBoosterSchedule(totalDeposited, slot);
  const interest = schedule.reduce((sum, row, index) => {
    if (row.amount <= 0) return sum;
    const weight = index === 0 ? config.months : index;
    return sum + (row.amount * config.monthlyInterestRate * weight);
  }, 0);
  return Number(interest.toFixed(2));
}

export function calculateSavingsBoosterLedger(slot = {}) {
  const totalDeposited = Number(slot.total_deposited || 0);
  const status = String(slot.status || 'active').toLowerCase();
  const expectedTotal = getExpectedBoosterDeposit(slot);
  const grossInterest = status === 'forfeited'
    ? 0
    : calculateSavingsBoosterInterest(totalDeposited, slot);
  const config = getBoosterConfig(slot);
  const rawTransactionFee = status === 'forfeited'
    ? 0
    : grossInterest * config.transactionFeeRate;
  const transactionFee = roundMoney(rawTransactionFee);
  const netInterest = roundMoney(grossInterest - rawTransactionFee);
  const withdrawableAmount = roundMoney(totalDeposited + netInterest);
  const weeksDeposited = Number(slot.weeks_deposited || getBoosterDepositWeeks(totalDeposited, slot));

  return {
    schedule: buildSavingsBoosterSchedule(totalDeposited, slot),
    expectedTotal,
    totalDeposited,
    grossInterest,
    transactionFee,
    netInterest,
    withdrawableAmount,
    weeksDeposited,
    remainingDeposit: Math.max(0, expectedTotal - totalDeposited),
    maturityDate: slot.maturity_date || getBoosterMaturityDate(slot.start_date, slot),
  };
}

export function buildSavingsBoosterUpdate(slot = {}, overrides = {}) {
  const merged = { ...slot, ...overrides };
  const ledger = calculateSavingsBoosterLedger(merged);
  return {
    total_deposited: ledger.totalDeposited,
    weeks_deposited: ledger.weeksDeposited,
    interest_earned: ledger.netInterest,
    transaction_fee: ledger.transactionFee,
    withdrawable_amount: ledger.withdrawableAmount,
    expected_total_deposit: ledger.expectedTotal,
    maturity_date: ledger.maturityDate,
    weekly_deposit: getBoosterConfig(merged).weeklyDeposit,
    initial_deposit: getBoosterConfig(merged).initialDeposit,
    monthly_interest_rate: getBoosterConfig(merged).monthlyInterestRate,
    transaction_fee_rate: getBoosterConfig(merged).transactionFeeRate,
    weeks_required: getBoosterConfig(merged).weeksRequired,
    maturity_months: getBoosterConfig(merged).maturityMonths,
  };
}
