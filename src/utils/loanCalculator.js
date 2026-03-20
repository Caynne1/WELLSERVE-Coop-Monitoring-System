/**
 * Computes monthly amortization using the standard reducing-balance formula.
 * @param {number} principal - Loan amount
 * @param {number} annualRate - Annual interest rate as a decimal (e.g. 0.12 for 12%)
 * @param {number} termMonths - Number of monthly payments
 */
export function computeMonthlyAmortization(principal, annualRate, termMonths) {
  if (!annualRate || annualRate === 0) return principal / termMonths;
  const r = annualRate / 12;
  return (principal * r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
}

export function computeTotalInterest(principal, annualRate, termMonths) {
  const monthly = computeMonthlyAmortization(principal, annualRate, termMonths);
  return monthly * termMonths - principal;
}

export function buildAmortizationSchedule(principal, annualRate, termMonths, startDate = new Date()) {
  const monthly = computeMonthlyAmortization(principal, annualRate, termMonths);
  const r = annualRate / 12;
  const schedule = [];
  let balance = principal;

  for (let i = 1; i <= termMonths; i++) {
    const interest = balance * r;
    const principalPaid = monthly - interest;
    balance -= principalPaid;
    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + i);

    schedule.push({
      period: i,
      dueDate: dueDate.toISOString().split('T')[0],
      payment: monthly,
      principal: principalPaid,
      interest,
      balance: Math.max(0, balance),
    });
  }
  return schedule;
}
