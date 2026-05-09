import * as XLSX from 'xlsx';
import { supabase } from './supabase';
import { createLoan, findDuplicateLoan } from './loanService';
import { createTransaction } from './transactionService';
import { getAccountsByMemberId } from './accountService';
import {
  normalizeImportedScheduleRow,
  buildLoanRecord,
  computeLoanStatus,
  loanFingerprint,
  round2,
  safeNum,
  LOAN_SOURCE,
} from '../engine/loanEngine';

// ── Excel reading ──────────────────────────────────────────────────────────────

export function readExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
        resolve(wb);
      } catch (err) {
        reject(new Error('Failed to read Excel file: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsArrayBuffer(file);
  });
}

export function getSheetNames(workbook) {
  return workbook.SheetNames || [];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseDate(val) {
  if (!val) return null;

  // Use local date components to avoid UTC timezone shift (e.g. Philippines UTC+8:
  // "2025-09-15 00:00 local" → "2025-09-14 16:00 UTC" → toISOString() gives wrong date)
  if (val instanceof Date && !isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const s = String(val).trim();
  if (!s) return null;

  // Try parsing string — use local components to avoid UTC shift
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  }

  // Try MM/DD/YYYY or DD/MM/YYYY
  const parts = s.split(/[/\-\.]/);
  if (parts.length === 3) {
    const [a, b, c] = parts.map(Number);
    if (c > 100) return `${c}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
    if (a > 100) return `${a}-${String(b).padStart(2, '0')}-${String(c).padStart(2, '0')}`;
  }

  return null;
}

function num(val) {
  if (val === null || val === undefined || val === '' || val === '-') return 0;
  const n = Number(String(val).replace(/[₱,\s]/g, ''));
  return isNaN(n) ? 0 : n;
}

function findCellValue(rows, labelPart, colOffset = 1) {
  const label = labelPart.toLowerCase();
  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      if (String(row[c] || '').toLowerCase().includes(label)) {
        return row[c + colOffset] ?? null;
      }
    }
  }
  return null;
}

function mapFrequency(val) {
  const v = String(val || '').toLowerCase();
  if (v.includes('semi') || v.includes('quencena') || v.includes('kinsenas') || v.includes('quincenal')) return 'semi_monthly';
  if (v.includes('chattel')) return 'chattel';
  if (v.includes('week')) return 'weekly';
  if (v.includes('quarter')) return 'quarterly';
  if (v.includes('year') || v.includes('annual')) return 'yearly';
  return 'monthly';
}

// ── Parse one sheet into a loan object ─────────────────────────────────────────

export function parseSheetLoan(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return null;

  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
  if (raw.length < 8) {
    console.warn(`[loanImport] Sheet "${sheetName}": too few rows (${raw.length})`);
    return null;
  }

  // ── Helper: search rows for a label and return the first numeric value found
  //    to the right of it (checks up to maxOffset columns ahead) ──────────────
  function findVal(rows, labelPart, maxOffset = 4) {
    const label = labelPart.toLowerCase();
    for (const row of rows) {
      for (let c = 0; c < row.length; c++) {
        if (String(row[c] || '').toLowerCase().includes(label)) {
          for (let o = 1; o <= maxOffset; o++) {
            const v = num(row[c + o]);
            if (v > 0) return v;
          }
        }
      }
    }
    return null;
  }

  // ── Title: detect semi-monthly from title row ─────────────────────────────
  let isSemiMonthly = false;
  for (let i = 0; i < Math.min(10, raw.length); i++) {
    const a = String(raw[i]?.[0] || '').toUpperCase();
    if (a.includes('AMORTIZATION')) { isSemiMonthly = a.includes('SEMI'); break; }
  }

  // ── Borrower name ─────────────────────────────────────────────────────────
  let borrowerName = '';
  for (let i = 0; i < Math.min(10, raw.length); i++) {
    for (let c = 0; c < Math.min(6, (raw[i] || []).length); c++) {
      if (String(raw[i][c] || '').toLowerCase().includes('borrower')) {
        borrowerName = String(raw[i][c + 1] || '').trim();
        console.log(`[loanImport] "${sheetName}": borrower "${borrowerName}" at row ${i}`);
        break;
      }
    }
    if (borrowerName) break;
  }
  if (!borrowerName) {
    console.warn(`[loanImport] "${sheetName}": no borrower found`);
    return null;
  }

  // ── Loan Principal ────────────────────────────────────────────────────────
  let principal = 0, principalRow = -1;
  for (let i = 0; i < Math.min(12, raw.length); i++) {
    for (let c = 0; c < Math.min(6, (raw[i] || []).length); c++) {
      if (String(raw[i][c] || '').toLowerCase().includes('loan principal')) {
        principal = num(raw[i][c + 1]);
        principalRow = i;
        console.log(`[loanImport] "${sheetName}": principal ${principal} at row ${i}`);
        break;
      }
    }
    if (principal) break;
  }
  if (!principal) { console.warn(`[loanImport] "${sheetName}": no principal`); return null; }

  const headerRows = raw.slice(0, principalRow + 12);

  // ── Term months ───────────────────────────────────────────────────────────
  let termMonths = null;
  for (let i = principalRow; i < Math.min(principalRow + 3, raw.length); i++) {
    for (let c = 0; c < (raw[i] || []).length; c++) {
      const l = String(raw[i][c] || '').toLowerCase();
      if (l.includes('term') && l.includes('month')) {
        termMonths = num(raw[i][c + 1]) || null;
        break;
      }
    }
    if (termMonths) break;
  }

  // ── Monthly interest rate (stored as decimal in Excel e.g. 0.02) ─────────
  let monthlyRate = 0;
  for (let i = 0; i < Math.min(12, raw.length); i++) {
    for (let c = 0; c < Math.min(6, (raw[i] || []).length); c++) {
      const l = String(raw[i][c] || '').toLowerCase();
      if (l.includes('monthly') && l.includes('int')) {
        monthlyRate = num(raw[i][c + 1]) || 0;
        break;
      }
    }
    if (monthlyRate) break;
  }
  // Convert decimal (0.02) to annual % (24) for storage
  const annualRatePercent = Math.round(monthlyRate * 12 * 10000) / 100;
  const semiMonthlyRate = monthlyRate / 2;

  // ── Payment Frequency ─────────────────────────────────────────────────────
  let freqRaw = '';
  for (let i = 0; i < Math.min(12, raw.length); i++) {
    for (let c = 0; c < (raw[i] || []).length; c++) {
      if (String(raw[i][c] || '').toLowerCase().includes('payment frequency')) {
        freqRaw = String(raw[i][c + 1] || ''); break;
      }
    }
    if (freqRaw) break;
  }
  const frequency = mapFrequency(freqRaw || (isSemiMonthly ? 'semi_monthly' : 'monthly'));

  // ── Number of Payments ────────────────────────────────────────────────────
  let numPayments = null;
  for (let i = 0; i < Math.min(12, raw.length); i++) {
    for (let c = 0; c < (raw[i] || []).length; c++) {
      if (String(raw[i][c] || '').toLowerCase().includes('number of payment')) {
        numPayments = num(raw[i][c + 1]) || null; break;
      }
    }
    if (numPayments) break;
  }

  // ── Start Date ────────────────────────────────────────────────────────────
  let startDate = null;
  for (let i = 0; i < Math.min(12, raw.length); i++) {
    for (let c = 0; c < Math.min(6, (raw[i] || []).length); c++) {
      if (String(raw[i][c] || '').toLowerCase().includes('start date')) {
        startDate = parseDate(raw[i][c + 1]) || null; break;
      }
    }
    if (startDate) break;
  }

  // ── Excel header summary values (read directly, no recomputation) ─────────
  // These are shown verbatim in the loan detail page.
  const excelTotalCashOut          = findVal(headerRows, 'Total Cash Out');
  const excelTotalPrincipal        = findVal(headerRows, 'Total Principal Collected');
  const excelTotalInterestEarned   = findVal(headerRows, 'Total Interest Earned');
  const excelTotalPaymentsCollected = findVal(headerRows, 'Total Payments Collected');
  const excelPaymentPerPeriod      = findVal(headerRows, 'Total Payment per Period');

  // Total ROI — stored as decimal (e.g. 0.1853) in Excel
  let excelTotalRoi = null;
  for (const row of headerRows) {
    for (let c = 0; c < row.length; c++) {
      if (String(row[c] || '').toLowerCase().includes('total roi')) {
        for (let o = 1; o <= 4; o++) {
          const v = row[c + o];
          if (v !== '' && v !== null && v !== undefined && num(v) > 0) {
            excelTotalRoi = Math.round(num(v) * 10000) / 100; // convert to %
            break;
          }
        }
        break;
      }
    }
    if (excelTotalRoi) break;
  }

  // ── Find amortization schedule header row ─────────────────────────────────
  let schedHeaderIdx = -1;
  for (let i = principalRow; i < Math.min(25, raw.length); i++) {
    const a = String(raw[i]?.[0] || '').toLowerCase();
    if (a.includes('no.') || a.includes('no of payment') || a.includes('# of payment')) {
      schedHeaderIdx = i;
      break;
    }
  }

  const schedule = [];
  let actualPayCol = -1, actualCbuCol = -1, actualSavingsCol = -1;
  let scheduledCbuCol = -1, scheduledSavingsCol = -1, grandTotalCol = -1, dueDateCol = -1;

  if (schedHeaderIdx >= 0) {
    // ── Detect column layout from schedule header row ─────────────────────
    //
    // Layout A (Sheet1/2 — has LOAN TOTAL column):
    //   C=PrinAmort | D=Interest | E=LOAN TOTAL | F=CBU | G=Savings | H=GrandTotal | I=DueDate
    //
    // Layout B (Sheet3 — no LOAN TOTAL column):
    //   C=PrinAmort | D=Interest | E=CBU | F=Savings | G=GrandTotal | H=DueDate
    //
    const hdr = raw[schedHeaderIdx] || [];
    let hasLoanTotalCol = false;

    for (let c = 4; c < Math.min(12, hdr.length); c++) {
      const h = String(hdr[c] || '').toLowerCase();
      if (h.includes('loan total') || h.includes('loantotal')) {
        hasLoanTotalCol = true;
        // Layout A: E=LoanTotal, F=CBU, G=Savings, H=GrandTotal
        scheduledCbuCol   = c + 1;
        scheduledSavingsCol = c + 2;
        grandTotalCol     = c + 3;
        break;
      }
    }

    if (!hasLoanTotalCol) {
      // Layout B: E=CBU, F=Savings, G=GrandTotal
      // Check that col 4 (E) header is CBU-like
      scheduledCbuCol   = 4;
      scheduledSavingsCol = 5;
      grandTotalCol     = 6;
    }

    // ── Detect due date column via "PAYMENT SCHEDULE" label (explicit, no ambiguity) ──
    // The Excel has "PAYMENT SCHEDULE" as a header label right above the due date column.
    // Sheet1/2: Row 9 col I (index 8). Sheet3: Row 9 col H (index 7).
    for (let i = Math.max(0, schedHeaderIdx - 4); i <= schedHeaderIdx + 1; i++) {
      const row = raw[i]; if (!row) continue;
      for (let c = grandTotalCol + 1; c < Math.min(18, row.length); c++) {
        if (String(row[c] || '').toLowerCase().includes('payment schedule')) {
          dueDateCol = c; break;
        }
      }
      if (dueDateCol >= 0) break;
    }
    // Fallback: find first column with actual Date objects in data rows
    if (dueDateCol < 0) {
      for (let ri = schedHeaderIdx + 2; ri < schedHeaderIdx + 5 && ri < raw.length; ri++) {
        const row = raw[ri]; if (!row) continue;
        for (let c = grandTotalCol + 1; c < Math.min(16, row.length); c++) {
          if (row[c] instanceof Date) { dueDateCol = c; break; }
        }
        if (dueDateCol >= 0) break;
      }
    }
    if (dueDateCol < 0) dueDateCol = grandTotalCol + 1;

    // ── Payment tracking columns (right side) ─────────────────────────────
    for (let i = Math.max(0, schedHeaderIdx - 4); i <= schedHeaderIdx + 1; i++) {
      const row = raw[i]; if (!row) continue;
      for (let c = dueDateCol; c < Math.min(24, row.length); c++) {
        const v = String(row[c] || '').toLowerCase().trim();
        if (v.includes('loan payment only') && actualPayCol < 0)   actualPayCol = c;
        if (v === 'cbu' && actualCbuCol < 0)                        actualCbuCol = c;
        if (v === 'savings' && actualSavingsCol < 0)                actualSavingsCol = c;
      }
    }

    // ── Parse schedule rows ───────────────────────────────────────────────
    for (let i = schedHeaderIdx + 1; i < raw.length; i++) {
      const row        = raw[i];
      const periodVal  = row[0];
      const period     = num(periodVal);
      const aStr       = String(periodVal || '').toLowerCase().trim();
      const bStr       = String(row[1]   || '').toLowerCase().trim();

      // Stop at TOTAL row — Excel puts "total"/"TOTAL" in col A or col B
      if (aStr === 'total' || aStr === 'totals' || bStr === 'total' || bStr === 'totals') break;

      // Hard stop at numPayments (prevents deduction rows from being parsed as schedule)
      if (numPayments && schedule.length >= numPayments) break;

      // Only process rows with a valid period number > 0
      // This skips: period 0 (starting balance), TOTAL row, deduction rows, blank rows
      if (period <= 0) continue;

      // ── CORRECT loan total: always principal + interest ─────────────────
      // Never read column 4 blindly — it might be CBU (Sheet3 Layout B)
      const principalAmort = num(row[2]);
      const interestAmt    = num(row[3]);
      const loanTotal    = round2(principalAmort + interestAmt);
      const scheduledCbu = scheduledCbuCol >= 0 ? num(row[scheduledCbuCol]) : 0;
      const scheduledSav = scheduledSavingsCol >= 0 ? num(row[scheduledSavingsCol]) : 0;
      const totalDue     = round2(loanTotal + scheduledCbu + scheduledSav);
      const balanceVal   = num(row[1]);
      const dueDate      = dueDateCol >= 0 ? parseDate(row[dueDateCol]) : null;

      // ── Payment tracking ──────────────────────────────────────────────
      let paidAmount = 0, cbuPaid = 0, savingsPaid = 0;

      if (actualPayCol >= 0) {
        paidAmount = num(row[actualPayCol]);
        if (actualCbuCol >= 0) cbuPaid = num(row[actualCbuCol]);
        if (actualSavingsCol >= 0) savingsPaid = num(row[actualSavingsCol]);

        // Accumulate sub-rows immediately following
        let j = i + 1;
        while (j < raw.length) {
          const sub = raw[j];
          const subPer  = String(sub?.[0] || '').trim();
          const subPrin = num(sub?.[2]);
          const subPay  = num(sub?.[actualPayCol]);
          const subCbu  = actualCbuCol >= 0 ? num(sub?.[actualCbuCol]) : 0;
          const subSav  = actualSavingsCol >= 0 ? num(sub?.[actualSavingsCol]) : 0;
          if (subPer === '' && subPrin === 0 && (subPay > 0 || subCbu > 0 || subSav > 0)) {
            paidAmount += subPay; cbuPaid += subCbu; savingsPaid += subSav; j++;
          } else { break; }
        }
      }

      const isPaid = paidAmount > 0;

      schedule.push({
        period,
        due_date:     dueDate,
        balance:      round2(balanceVal),
        principal:    round2(principalAmort),
        interest:     round2(interestAmt),
        payment:      loanTotal,    // loan-only total (principal + interest)
        total_due:    totalDue,     // full total (includes CBU + savings)
        cbu_paid:     round2(scheduledCbu),
        savings_paid: round2(scheduledSav),
        paid:         isPaid,
        paid_amount:  round2(paidAmount),
      });
    }
  }

  // ── CBU & Savings totals from TOTAL row ───────────────────────────────────
  let totalCbuCollected = schedule.reduce((s, r) => s + (r.cbu_paid || 0), 0);
  let totalSavingsCollected = schedule.reduce((s, r) => s + (r.savings_paid || 0), 0);
  if (schedHeaderIdx >= 0) {
    for (let i = schedHeaderIdx + 1; i < raw.length; i++) {
      const label = String(raw[i]?.[0] || raw[i]?.[1] || '').toLowerCase().trim();
      if (label === 'total' || label === 'totals') {
        if (actualCbuCol >= 0 && num(raw[i][actualCbuCol]) > 0)      totalCbuCollected = num(raw[i][actualCbuCol]);
        if (actualSavingsCol >= 0 && num(raw[i][actualSavingsCol]) > 0) totalSavingsCollected = num(raw[i][actualSavingsCol]);
        break;
      }
    }
  }

  // ── Deductions section (after schedule) ──────────────────────────────────
  let serviceFee = null, shareCapital = null, regularSavings = null, loanInsurance = null;
  let previousLoanBalance = null, annualDues = null, notarialFee = null;
  let netProceeds = null;
  const otherDeductions = [];

  const deductStartIdx = schedHeaderIdx + (numPayments || 15);
  for (let i = deductStartIdx; i < raw.length; i++) {
    const label = String(raw[i]?.[0] || '').toLowerCase().trim();
    const val   = num(raw[i]?.[2]);

    if (label.includes('service fee') && val)                             serviceFee          = val;
    else if ((label.includes('share capital') || (label.includes('cbu') && !label.includes('protection'))) && val)
                                                                          shareCapital        = val;
    else if ((label.includes('reg. savings') || label.includes('regular savings')) && val)
                                                                          regularSavings      = val;
    else if ((label.includes('protection plan') || label.includes('clpp') || label.includes('insurance')) && val)
                                                                          loanInsurance       = val;
    else if ((label.includes('prev') && label.includes('loan')) && val)   previousLoanBalance = val;
    else if (label.includes('annual dues') && val)                        annualDues          = val;
    else if (label.includes('notarial') && val)                           notarialFee         = val;
    else if (label.includes('net proceed')) {
      // Net proceeds is labeled in Col A and value is in Col C (same row for Sheet2/3)
      // For Sheet1 the value is on the row above
      const valSameRow = num(raw[i]?.[2]);
      if (valSameRow > 0) {
        netProceeds = valSameRow;
      } else {
        // Check row above
        const valAbove = num(raw[i - 1]?.[2]);
        if (valAbove > 0) netProceeds = valAbove;
      }
      break;
    }
    else if (label.length > 2 && val > 0 && !label.includes('deduction') && !label.includes('note')) {
      // Capture any other named deductions (MEMBERSHIP, T-SHIRT, etc.)
      otherDeductions.push({ label: String(raw[i]?.[0] || '').trim(), amount: val });
    }
  }

  // Net proceeds fallback: use "Total Cash Out" from the header
  if (!netProceeds) netProceeds = excelTotalCashOut;

  // ── Balance & status ──────────────────────────────────────────────────────
  let currentBalance = principal, status = 'active', foundExplicitBalance = false;
  for (let i = schedHeaderIdx >= 0 ? schedHeaderIdx : 0; i < raw.length; i++) {
    const row = raw[i]; if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c] || '').toLowerCase().replace(/\s/g, '');
      if (v.includes('fullypaid') || v.includes('fullpaid')) {
        currentBalance = 0; status = 'paid'; foundExplicitBalance = true;
      }
      if (v === 'balance' && !foundExplicitBalance) {
        for (let o = 1; o <= 3; o++) {
          const raw2 = row[c + o];
          if (raw2 === null || raw2 === undefined || raw2 === '') continue;
          const bv = num(raw2);
          if (bv >= 0 && String(raw2).trim() !== '') {
            currentBalance = bv; foundExplicitBalance = true;
            if (bv === 0) status = 'paid';
            break;
          }
        }
      }
    }
  }
  if (!foundExplicitBalance && schedule.length > 0) {
    if (schedule.every(s => s.paid)) { currentBalance = 0; status = 'paid'; }
    else {
      const unpaid = round2(schedule.filter(s => !s.paid).reduce((sum, s) => sum + s.principal, 0));
      if (unpaid > 0) currentBalance = unpaid;
    }
  }

  const nextUnpaid = schedule.find(s => !s.paid);
  const dueDate = nextUnpaid?.due_date || schedule[schedule.length - 1]?.due_date || null;

  return {
    // Internal metadata
    _sheet_name:            sheetName,
    _borrower_name:         borrowerName,
    _matched_member_id:     null,
    _matched_member_name:   null,
    _matched_member_no:     null,
    _schedule:              schedule,
    _periods_paid:          schedule.filter(s => s.paid).length,
    _total_cbu_collected:   totalCbuCollected,
    _total_savings_collected: totalSavingsCollected,
    _other_deductions:      otherDeductions,

    // Excel header summary (stored verbatim — these are displayed as-is)
    _excel_total_cash_out:           netProceeds,
    _excel_total_principal:          excelTotalPrincipal || principal,
    _excel_total_interest_earned:    excelTotalInterestEarned,
    _excel_total_payments_collected: excelTotalPaymentsCollected,
    _excel_payment_per_period:       excelPaymentPerPeriod,
    _excel_total_roi_percent:        excelTotalRoi,

    // Loan fields
    amount:               principal,
    balance:              currentBalance,
    interest_rate:        annualRatePercent,
    term_months:          termMonths,
    monthly_amortization: excelPaymentPerPeriod,
    release_date:         startDate,
    due_date:             dueDate,
    status,
    purpose:              null,
    notes:                null,
    repayment_frequency:  frequency,
    loan_method:          'diminishing',
    service_fee:          serviceFee,
    share_capital:        shareCapital,
    loan_insurance:       loanInsurance,
    regular_savings:      regularSavings,
    previous_loan_balance: previousLoanBalance,
    annual_dues:          annualDues,
    notarial_fee:         notarialFee,
    total_loan_payable:   excelTotalPaymentsCollected || (principal + (excelTotalInterestEarned || 0)),
    loan_proposal:        principal,
    loan_no:              null,
  };
}

// ── Parse all sheets ───────────────────────────────────────────────────────────

export function parseAllSheets(workbook) {
  const names = getSheetNames(workbook);
  console.log(`[loanImport] Found ${names.length} sheet(s):`, names);
  
  const loans = names
    .map(name => { 
      try { 
        const result = parseSheetLoan(workbook, name); 
        if (!result) console.warn(`[loanImport] Sheet "${name}" returned null`);
        return result;
      } catch (err) { 
        console.error(`[loanImport] Sheet "${name}" error:`, err);
        return null; 
      } 
    })
    .filter(Boolean);
  
  console.log(`[loanImport] Parsed ${loans.length} loan(s) from ${names.length} sheet(s)`);
  return loans;
}

// ── Member matching ────────────────────────────────────────────────────────────

export async function fetchMemberLookup() {
  const { data, error } = await supabase
    .from('members')
    .select('id, first_name, last_name, middle_initial, member_no');
  if (error) throw error;

  return (data || []).map(m => ({
    ...m,
    full_name: `${m.first_name || ''} ${m.last_name || ''}`.trim().toLowerCase(),
    full_name_reversed: `${m.last_name || ''} ${m.first_name || ''}`.trim().toLowerCase(),
    last_comma_first: `${m.last_name || ''}, ${m.first_name || ''}`.trim().toLowerCase(),
    full_with_mi: `${m.first_name || ''} ${m.middle_initial || ''} ${m.last_name || ''}`.replace(/\s+/g, ' ').trim().toLowerCase(),
    last_comma_first_mi: `${m.last_name || ''}, ${m.first_name || ''} ${m.middle_initial || ''}`.replace(/\s+/g, ' ').trim().toLowerCase(),
  }));
}

export function matchMember(borrowerName, members) {
  if (!borrowerName) return null;
  const name = borrowerName.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();

  // 1. Exact match
  for (const m of members) {
    if ([m.full_name, m.full_name_reversed, m.last_comma_first, m.full_with_mi, m.last_comma_first_mi].includes(name))
      return m;
  }

  // 2. Parse name and do part matching
  let first, last;
  if (name.includes(',')) {
    [last, first] = name.split(',').map(s => s.trim().split(/\s+/)[0]);
  } else {
    const words = name.split(/\s+/).filter(Boolean);
    first = words[0] || '';
    last = words[words.length - 1] || '';
  }

  if (first && last) {
    const match = members.find(m => {
      const fn = (m.first_name || '').toLowerCase();
      const ln = (m.last_name || '').toLowerCase();
      return (fn.includes(first) || first.includes(fn)) && (ln.includes(last) || last.includes(ln));
    });
    if (match) return match;
  }

  // 3. All significant words match
  const words = name.replace(',', ' ').split(/\s+/).filter(w => w.length > 1);
  if (words.length >= 2) {
    return members.find(m => {
      const combined = `${m.first_name} ${m.middle_initial} ${m.last_name}`.toLowerCase();
      return words.every(w => combined.includes(w));
    }) || null;
  }

  return null;
}

// ── Import execution ───────────────────────────────────────────────────────────

export async function importLoans({ loans, fixedMemberId = null, userId }) {
  const results = { imported: 0, skipped: 0, duplicates: 0, errors: [] };

  // Build a fingerprint set of existing loans to detect duplicates
  let existingFingerprints = new Set();
  try {
    const { data: existing } = await supabase
      .from('loans')
      .select('member_id, release_date, amount')
      .eq('source', LOAN_SOURCE.IMPORTED);
    (existing || []).forEach(l => {
      existingFingerprints.add(loanFingerprint(l.member_id, l.release_date, l.amount));
    });
  } catch { /* non-critical — continue without duplicate check */ }

  for (let i = 0; i < loans.length; i++) {
    const loan = loans[i];
    if (loan._skip) { results.skipped++; continue; }

    const memberId = fixedMemberId || loan._matched_member_id;
    if (!memberId) {
      results.skipped++;
      results.errors.push({
        row: i + 1, sheet: loan._sheet_name, borrower: loan._borrower_name,
        error: `No matching member for "${loan._borrower_name}"`,
      });
      continue;
    }

    // Duplicate detection
    const fp = loanFingerprint(memberId, loan.release_date, loan.amount);
    if (existingFingerprints.has(fp)) {
      results.duplicates++;
      results.errors.push({
        row: i + 1, sheet: loan._sheet_name, borrower: loan._borrower_name,
        error: `Duplicate — loan for this member (${loan.release_date}, ₱${loan.amount}) already exists.`,
      });
      continue;
    }

    try {
      // Normalize schedule rows using the engine
      const rawSchedule = loan._schedule || [];
      const normalizedSchedule = rawSchedule.map(normalizeImportedScheduleRow);

      // Build deduction items from all imported data
      const deductionItems = [];
      if (safeNum(loan.service_fee) > 0)           deductionItems.push({ label: 'Service Fee',                type: 'fixed', amount: safeNum(loan.service_fee) });
      if (safeNum(loan.share_capital) > 0)         deductionItems.push({ label: 'CBU (Share Capital)',        type: 'fixed', amount: safeNum(loan.share_capital) });
      if (safeNum(loan.regular_savings) > 0)       deductionItems.push({ label: 'Regular Savings',           type: 'fixed', amount: safeNum(loan.regular_savings) });
      if (safeNum(loan.loan_insurance) > 0)        deductionItems.push({ label: 'Coop Loan Protection Plan', type: 'fixed', amount: safeNum(loan.loan_insurance) });
      if (safeNum(loan.previous_loan_balance) > 0) deductionItems.push({ label: 'Previous Loan Balance',     type: 'fixed', amount: safeNum(loan.previous_loan_balance) });
      if (safeNum(loan.annual_dues) > 0)           deductionItems.push({ label: 'Annual Dues',               type: 'fixed', amount: safeNum(loan.annual_dues) });
      if (safeNum(loan.notarial_fee) > 0)          deductionItems.push({ label: 'Notarial Fee',              type: 'fixed', amount: safeNum(loan.notarial_fee) });
      (loan._other_deductions || []).forEach(d => deductionItems.push({ label: d.label, type: 'fixed', amount: safeNum(d.amount) }));

      // Use the unified engine to build the DB record
      const record = buildLoanRecord(
        {
          memberId,
          loanNo:              loan.loan_no || null,
          amount:              loan.amount,
          balance:             loan.balance,
          termMonths:          loan.term_months,
          monthlyRatePercent:  safeNum(loan.interest_rate) / 12,
          frequency:           loan.repayment_frequency || 'monthly',
          method:              loan.loan_method || 'diminishing',
          startDate:           loan.release_date,
          dueDate:             loan.due_date,
          status:              loan.status,
          purpose:             loan.purpose,
          notes:               `[Imported from Excel — ${loan._sheet_name}]`,
          cbuPerPeriod:        0,
          savingsPerPeriod:    0,
          deductionItems,
          serviceFee:          loan.service_fee,
          shareCapital:        loan.share_capital,
          regularSavings:      loan.regular_savings,
          loanInsurance:       loan.loan_insurance,
          notarialFee:         loan.notarial_fee,
        },
        LOAN_SOURCE.IMPORTED,
        normalizedSchedule
      );

      // Override preview_summary_json with EXACT Excel header values
      // These are the source of truth for the loan detail display
      const excelSummary = {
        ...JSON.parse(record.preview_summary_json || '{}'),
        // Verbatim from Excel header rows
        total_cash_out:           loan._excel_total_cash_out,
        total_principal_collected: loan._excel_total_principal || loan.amount,
        total_interest_earned:    loan._excel_total_interest_earned,
        total_payments_collected: loan._excel_total_payments_collected,
        payment_per_period:       loan._excel_payment_per_period || loan.monthly_amortization,
        total_roi_percent:        loan._excel_total_roi_percent,
        number_of_payments:       loan._num_payments || normalizedSchedule.length,
        paid_periods:             loan._periods_paid,
      };

      // Override deductions with exact Excel net proceeds
      const excelDeductions = {
        ...JSON.parse(record.preview_deductions_json || '{}'),
        net_proceeds: loan._excel_total_cash_out,
      };

      const finalRecord = {
        ...record,
        // Preserve exact imported balance (engine may have recomputed it)
        balance:                loan.balance,
        status:                 loan.status,
        previous_loan_balance:  safeNum(loan.previous_loan_balance) || null,
        annual_dues:            safeNum(loan.annual_dues) || null,
        notarial_fee:           safeNum(loan.notarial_fee) || null,
        preview_summary_json:   JSON.stringify(excelSummary),
        preview_deductions_json: JSON.stringify(excelDeductions),
      };

      await createLoan({ ...finalRecord, source: 'imported' });

      // Mark fingerprint as imported to prevent duplicates in same batch
      existingFingerprints.add(fp);

      // Create CBU and Savings deposit transactions
      const totalCbu = loan._total_cbu_collected || 0;
      const totalSav = loan._total_savings_collected || 0;
      const txDate = loan.release_date || new Date().toISOString().split('T')[0];

      if (totalCbu > 0 || totalSav > 0) {
        try {
          const accounts = await getAccountsByMemberId(memberId);
          const cbuAccount = (accounts || []).find(a => String(a.account_type).toLowerCase() === 'cbu');
          const savingsAccount = (accounts || []).find(a => String(a.account_type).toLowerCase() === 'savings');

          if (totalCbu > 0 && cbuAccount) {
            await createTransaction({
              member_id: memberId, account_id: cbuAccount.id,
              category: 'cbu', type: 'deposit', amount: totalCbu,
              reference: cbuAccount.account_no || null,
              notes: `[Imported] CBU collected — ${loan._borrower_name} (${loan._sheet_name})`,
              created_by: userId, transaction_date: txDate, payment_mode: null,
            });
          }
          if (totalSav > 0 && savingsAccount) {
            await createTransaction({
              member_id: memberId, account_id: savingsAccount.id,
              category: 'savings', type: 'deposit', amount: totalSav,
              reference: savingsAccount.account_no || null,
              notes: `[Imported] Savings collected — ${loan._borrower_name} (${loan._sheet_name})`,
              created_by: userId, transaction_date: txDate, payment_mode: null,
            });
          }
        } catch (txErr) {
          console.warn(`[loanImport] CBU/Savings tx failed for ${loan._borrower_name}:`, txErr.message);
        }
      }

      results.imported++;
    } catch (err) {
      results.errors.push({
        row: i + 1, sheet: loan._sheet_name, borrower: loan._borrower_name,
        error: err.message,
      });
    }
  }

  return results;
}