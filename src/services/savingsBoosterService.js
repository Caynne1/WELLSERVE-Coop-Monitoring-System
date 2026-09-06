export const SAVINGS_BOOSTER_DEFAULTS = {
  weeklyDeposit: 70,
  initialDeposit: 350,
  months: 12,
  weeksRequired: 48,
  maturityDays: 365,
  maturityMonths: 13,
  annualInterestRate: 0.52,
};

function roundMoney(value) {
  return Math.round((Number(value || 0) + 1e-9) * 100) / 100;
}

function parseDateOnly(value) {
  if (!value) return null;
  const datePart = String(value).slice(0, 10);
  const parts = datePart.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}

function toDateOnly(value) {
  return value?.toISOString().slice(0, 10) || null;
}

export function getBoosterConfig(slot = {}) {
  return {
    weeklyDeposit: Number(slot.weekly_deposit || SAVINGS_BOOSTER_DEFAULTS.weeklyDeposit),
    initialDeposit: Number(slot.initial_deposit || SAVINGS_BOOSTER_DEFAULTS.initialDeposit),
    months: SAVINGS_BOOSTER_DEFAULTS.months,
    weeksRequired: Number(slot.weeks_required || SAVINGS_BOOSTER_DEFAULTS.weeksRequired),
    maturityDays: Number(slot.maturity_days || SAVINGS_BOOSTER_DEFAULTS.maturityDays),
    maturityMonths: Number(slot.maturity_months || SAVINGS_BOOSTER_DEFAULTS.maturityMonths),
    annualInterestRate: Number(slot.annual_interest_rate ?? SAVINGS_BOOSTER_DEFAULTS.annualInterestRate),
  };
}

export function getExpectedBoosterDeposit(slot = {}) {
  const config = getBoosterConfig(slot);
  return roundMoney(config.initialDeposit + (config.weeksRequired * config.weeklyDeposit));
}

export function getBoosterDepositWeeks(amount, slot = {}) {
  const config = getBoosterConfig(slot);
  const value = Math.max(0, Number(amount || 0));
  if (value <= 0 || config.weeklyDeposit <= 0) return 0;

  const totalBefore = Math.max(0, Number(slot.total_deposited || 0));
  const weeklyBefore = Math.max(0, totalBefore - config.initialDeposit);
  const weeklyAfter = Math.max(0, totalBefore + value - config.initialDeposit);

  return Math.max(0, Math.min(
    config.weeksRequired,
    Math.floor(weeklyAfter / config.weeklyDeposit)
  ) - Math.min(
    config.weeksRequired,
    Math.floor(weeklyBefore / config.weeklyDeposit)
  ));
}

export function getBoosterMaturityDate(startDate, slot = {}) {
  const start = parseDateOnly(startDate);
  if (!start) return null;
  start.setUTCDate(start.getUTCDate() + getBoosterConfig(slot).maturityDays);
  return toDateOnly(start);
}

export function buildSavingsBoosterSchedule(slot = {}) {
  const config = getBoosterConfig(slot);
  let cumulativeCapital = config.initialDeposit;

  return Array.from({ length: config.months }, (_, index) => {
    const weeklyPayments = Math.min(4, Math.max(0, config.weeksRequired - (index * 4)));
    const weeklyContribution = roundMoney(weeklyPayments * config.weeklyDeposit);
    cumulativeCapital = roundMoney(cumulativeCapital + weeklyContribution);

    return {
      month: index + 1,
      weeklyPayments,
      weeklyContribution,
      cumulativeCapital,
    };
  });
}

export function calculateSavingsBoosterLedger(slot = {}) {
  const config = getBoosterConfig(slot);
  const totalDeposited = roundMoney(Math.max(0, Number(slot.total_deposited || 0)));
  const status = String(slot.status || 'active').toLowerCase();
  const expectedTotal = getExpectedBoosterDeposit(slot);
  const inferredWeeks = Math.min(
    config.weeksRequired,
    Math.floor(Math.max(0, totalDeposited - config.initialDeposit) / config.weeklyDeposit)
  );
  const weeksDeposited = Math.min(
    config.weeksRequired,
    Math.max(Number(slot.weeks_deposited || 0), inferredWeeks)
  );
  const initialDepositPaid = totalDeposited >= config.initialDeposit;
  const contributionsComplete = initialDepositPaid
    && weeksDeposited >= config.weeksRequired
    && totalDeposited >= expectedTotal;
  const isForfeited = status === 'forfeited';
  const isMatured = status === 'matured' || status === 'released' || status === 'withdrawn';
  const earnsInterest = isMatured && contributionsComplete && !isForfeited;
  const interestEarned = earnsInterest
    ? roundMoney(totalDeposited * config.annualInterestRate)
    : 0;
  const projectedInterest = isForfeited
    ? 0
    : roundMoney(expectedTotal * config.annualInterestRate);
  const receivableAtMaturity = isForfeited || isMatured
    ? roundMoney(totalDeposited + interestEarned)
    : roundMoney(expectedTotal + projectedInterest);

  return {
    schedule: buildSavingsBoosterSchedule(slot),
    expectedTotal,
    totalDeposited,
    initialDepositPaid,
    weeklyDeposited: roundMoney(Math.max(0, totalDeposited - Math.min(totalDeposited, config.initialDeposit))),
    interestEarned,
    projectedInterest,
    receivableAtMaturity,
    withdrawableAmount: isMatured ? roundMoney(totalDeposited + interestEarned) : 0,
    weeksDeposited,
    weeksRemaining: Math.max(0, config.weeksRequired - weeksDeposited),
    remainingDeposit: roundMoney(Math.max(0, expectedTotal - totalDeposited)),
    contributionsComplete,
    maturityDate: slot.maturity_date || getBoosterMaturityDate(slot.start_date, slot),
  };
}

export function buildSavingsBoosterUpdate(slot = {}, overrides = {}) {
  const merged = { ...slot, ...overrides };
  const config = getBoosterConfig(merged);
  const ledger = calculateSavingsBoosterLedger(merged);

  return {
    total_deposited: ledger.totalDeposited,
    weeks_deposited: ledger.weeksDeposited,
    interest_earned: ledger.interestEarned,
    withdrawable_amount: ledger.withdrawableAmount,
    expected_total_deposit: ledger.expectedTotal,
    maturity_date: ledger.maturityDate,
    weekly_deposit: config.weeklyDeposit,
    initial_deposit: config.initialDeposit,
    annual_interest_rate: config.annualInterestRate,
    weeks_required: config.weeksRequired,
    maturity_days: config.maturityDays,
    maturity_months: config.maturityMonths,
  };
}
