import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SAVINGS_BOOSTER_DEFAULTS,
  buildSavingsBoosterSchedule,
  calculateSavingsBoosterLedger,
  getBoosterDepositWeeks,
  getBoosterMaturityDate,
} from './savingsBoosterService.js';

test('uses the confirmed product configuration', () => {
  assert.equal(SAVINGS_BOOSTER_DEFAULTS.initialDeposit, 350);
  assert.equal(SAVINGS_BOOSTER_DEFAULTS.weeklyDeposit, 70);
  assert.equal(SAVINGS_BOOSTER_DEFAULTS.weeksRequired, 48);
  assert.equal(SAVINGS_BOOSTER_DEFAULTS.annualInterestRate, 0.52);
});

test('computes the complete program example', () => {
  const ledger = calculateSavingsBoosterLedger({
    total_deposited: 3710,
    weeks_deposited: 48,
    status: 'matured',
  });

  assert.equal(ledger.expectedTotal, 3710);
  assert.equal(ledger.interestEarned, 1929.20);
  assert.equal(ledger.withdrawableAmount, 5639.20);
});

test('does not recognize interest before maturity', () => {
  const ledger = calculateSavingsBoosterLedger({
    total_deposited: 3710,
    weeks_deposited: 48,
    status: 'active',
  });

  assert.equal(ledger.interestEarned, 0);
  assert.equal(ledger.withdrawableAmount, 0);
  assert.equal(ledger.receivableAtMaturity, 5639.20);
});

test('forfeited accounts receive capital only', () => {
  const ledger = calculateSavingsBoosterLedger({
    total_deposited: 1050,
    weeks_deposited: 10,
    status: 'forfeited',
  });

  assert.equal(ledger.interestEarned, 0);
  assert.equal(ledger.projectedInterest, 0);
  assert.equal(ledger.receivableAtMaturity, 1050);
});

test('builds 48 weekly targets plus the initial deposit', () => {
  const schedule = buildSavingsBoosterSchedule();

  assert.equal(schedule.length, 12);
  assert.equal(schedule[0].cumulativeCapital, 630);
  assert.equal(schedule[11].cumulativeCapital, 3710);
  assert.equal(schedule.reduce((sum, row) => sum + row.weeklyPayments, 0), 48);
});

test('counts weekly payments only after the initial deposit', () => {
  assert.equal(getBoosterDepositWeeks(350, { total_deposited: 0 }), 0);
  assert.equal(getBoosterDepositWeeks(70, { total_deposited: 350 }), 1);
  assert.equal(getBoosterDepositWeeks(140, { total_deposited: 420 }), 2);
});

test('maturity is exactly 365 days after the start date', () => {
  assert.equal(getBoosterMaturityDate('2026-01-01'), '2027-01-01');
  assert.equal(getBoosterMaturityDate('2024-02-29'), '2025-02-28');
});
