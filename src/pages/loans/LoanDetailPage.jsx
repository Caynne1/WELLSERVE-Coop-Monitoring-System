import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Edit2,
  Calendar,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Printer,
  Download,
  FileText,
  History,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';

import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';

import { getLoanById, getLoanPaymentHistory, updateLoanApprovalStatus } from '../../services/loanService';
import { getAuditHistory } from '../../services/logService';
import { useAuth } from '../../context/AuthContext';
import LoanScheduleTable from '../../components/shared/LoanScheduleTable';
import {
  buildScheduleByFrequency,
  computeTotalRoiPercent,
  frequencyDisplayLabel,
  frequencyPeriodLabel,
} from '../../utils/loanCalculator';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { printHtmlDocument } from '../../utils/print';
import * as XLSX from 'xlsx';

const statusVariant = {
  active: 'success',
  ongoing: 'success',
  paid: 'info',
  defaulted: 'danger',
  pending: 'warning',
};

// Row status badge colors for the printed schedule
const ROW_STATUS_STYLE = {
  paid:      { bg: '#d1fae5', color: '#065f46', label: 'Paid' },
  unpaid:    { bg: '#f3f4f6', color: '#6b7280', label: 'Unpaid' },
  overdue:   { bg: '#fee2e2', color: '#991b1b', label: 'Overdue' },
  partial:   { bg: '#fef3c7', color: '#92400e', label: 'Partial' },
};

function parseJsonSafely(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function titleCase(value) {
  if (!value) return '—';
  return String(value).replaceAll('_', ' ').replace(/\b\w/g, m => m.toUpperCase());
}

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function round4(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 10000) / 10000;
}

function periodsPerMonth(frequency = 'monthly') {
  const map = {
    weekly: 4,
    weekly_fixed4: 4,
    semi_monthly: 2,
    semi_monthly_old: 2,
    monthly: 1,
    monthly_old: 1,
    chattel: 1,
    quarterly: 1 / 3,
    yearly: 1 / 12,
  };
  return map[frequency] || 1;
}

function estimateInterestFromTerms(loan, rows, monthlyRate) {
  const principal = Number(loan?.amount || 0);
  const rate = Number(monthlyRate || 0) / 100;
  const frequency = loan?.repayment_frequency || 'monthly';
  const weeklyOldTotal = frequency === 'weekly'
    ? Number(loan?.term_months || 0) * 30 / 7
    : 0;
  const count = frequency === 'weekly' && weeklyOldTotal > 0
    ? Math.ceil(weeklyOldTotal)
    : Math.max(1, rows?.length || 0);
  if (principal <= 0 || rate <= 0 || count <= 0) return 0;

  const ratePerPeriod = frequency === 'weekly'
    ? rate / 4
    : rate / periodsPerMonth(frequency);
  if ((loan?.loan_method || '').toLowerCase() === 'straight') {
    return round2(principal * ratePerPeriod * count);
  }

  const amort = frequency === 'weekly' && weeklyOldTotal > 0
    ? round2(principal / weeklyOldTotal)
    : principal / count;
  let balance = principal;
  let interest = 0;
  for (let i = 0; i < count; i += 1) {
    const beginBalance = round2(balance);
    interest = round2(interest + round2(beginBalance * ratePerPeriod));
    const principalAmort = i === count - 1 ? beginBalance : amort;
    balance = Math.max(0, round2(beginBalance - principalAmort));
  }
  return round2(interest);
}

// ─── Print helpers ────────────────────────────────────────────────────────────

/**
 * Generates the shared <style> block injected into every print window.
 */
function printStyles() {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Arial', sans-serif;
      font-size: 11px;
      color: #1f2937;
      padding: 28px 32px;
      background: #fff;
    }
    /* ── Letterhead ── */
    .letterhead {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid #059669;
      padding-bottom: 12px;
      margin-bottom: 18px;
    }
    .letterhead-left .coop-name {
      font-size: 18px;
      font-weight: 800;
      letter-spacing: 0.12em;
      color: #111827;
    }
    .letterhead-left .coop-sub {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: #059669;
      margin-top: 2px;
    }
    .letterhead-right {
      text-align: right;
      font-size: 10px;
      color: #6b7280;
      line-height: 1.6;
    }
    .letterhead-right strong { color: #111827; font-size: 12px; }
    /* ── Document title ── */
    .doc-title {
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #059669;
      margin-bottom: 14px;
    }
    /* ── Two-column info grid ── */
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 24px;
      margin-bottom: 18px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      overflow: hidden;
    }
    .info-grid .col { padding: 10px 14px; }
    .info-grid .col:first-child { border-right: 1px solid #e5e7eb; }
    .info-grid h3 {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #6b7280;
      margin-bottom: 8px;
    }
    .kv-row {
      display: flex;
      justify-content: space-between;
      padding: 3px 0;
      border-bottom: 1px solid #f3f4f6;
      font-size: 10.5px;
    }
    .kv-row:last-child { border-bottom: none; }
    .kv-row .kv-label { color: #6b7280; }
    .kv-row .kv-value { font-weight: 600; color: #111827; text-align: right; }
    .kv-row.highlight .kv-label { color: #059669; font-weight: 600; }
    .kv-row.highlight .kv-value { color: #059669; font-size: 12px; }
    /* ── Section header ── */
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-bottom: none;
      border-radius: 6px 6px 0 0;
      padding: 7px 12px;
      margin-bottom: 0;
    }
    .section-header span {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #374151;
    }
    .section-header .meta { font-size: 10px; color: #6b7280; font-weight: 400; text-transform: none; letter-spacing: 0; }
    /* ── Schedule table ── */
    table.schedule {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #e5e7eb;
      border-radius: 0 0 6px 6px;
      overflow: hidden;
      font-size: 10px;
    }
    table.schedule thead tr {
      background: #059669;
      color: #fff;
    }
    table.schedule thead th {
      padding: 6px 8px;
      text-align: right;
      font-weight: 600;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      white-space: nowrap;
    }
    table.schedule thead th:first-child,
    table.schedule thead th:nth-child(2) { text-align: left; }
    table.schedule tbody tr { border-bottom: 1px solid #f3f4f6; }
    table.schedule tbody tr:last-child { border-bottom: none; }
    table.schedule tbody tr:nth-child(even) { background: #f9fafb; }
    table.schedule tbody td {
      padding: 5px 8px;
      text-align: right;
      color: #374151;
      white-space: nowrap;
    }
    table.schedule tbody td:first-child,
    table.schedule tbody td:nth-child(2) { text-align: left; }
    table.schedule tfoot tr { background: #f3f4f6; border-top: 2px solid #d1d5db; }
    table.schedule tfoot td {
      padding: 6px 8px;
      font-weight: 700;
      text-align: right;
      font-size: 10px;
    }
    table.schedule tfoot td:first-child { text-align: left; }
    .status-pill {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 99px;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    /* ── Totals summary bar ── */
    .totals-bar {
      display: flex;
      justify-content: flex-end;
      gap: 24px;
      margin-top: 10px;
      padding: 8px 14px;
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      border-radius: 6px;
      font-size: 10.5px;
    }
    .totals-bar .tot-item { display: flex; flex-direction: column; align-items: flex-end; }
    .totals-bar .tot-label { color: #6b7280; font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; }
    .totals-bar .tot-value { font-weight: 700; color: #065f46; font-size: 12px; }
    /* ── Signature block ── */
    .sig-block {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 24px;
      margin-top: 32px;
    }
    .sig-item { border-top: 1px solid #9ca3af; padding-top: 6px; font-size: 10px; color: #6b7280; }
    .sig-item strong { display: block; font-size: 10.5px; color: #111827; margin-bottom: 2px; }
    /* ── Footer ── */
    .print-footer {
      margin-top: 24px;
      padding-top: 10px;
      border-top: 1px solid #e5e7eb;
      font-size: 9px;
      color: #9ca3af;
      display: flex;
      justify-content: space-between;
    }
    @media print {
      body { padding: 16px 20px; }
      @page { margin: 12mm; size: A4 portrait; }
    }
  `;
}

/**
 * Shared letterhead HTML.
 */
function letterheadHTML(loanNo, printedAt) {
  return `
    <div class="letterhead">
      <div class="letterhead-left">
        <div class="coop-name">WELLSERVE</div>
        <div class="coop-sub">Credit Cooperative</div>
      </div>
      <div class="letterhead-right">
        <strong>Loan No.: ${loanNo || '—'}</strong><br/>
        Printed: ${printedAt}<br/>
        This document is system-generated.
      </div>
    </div>
  `;
}

/**
 * Renders a key-value row.
 */
function kvRow(label, value, highlight = false) {
  return `
    <div class="kv-row${highlight ? ' highlight' : ''}">
      <span class="kv-label">${label}</span>
      <span class="kv-value">${value}</span>
    </div>
  `;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LoanDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile, isAdmin, hasPermission } = useAuth();
  const canEdit = hasPermission('loans', 'edit');

  const [loan, setLoan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [deductionsOpen, setDeductionsOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [auditHistory, setAuditHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [approvalSaving, setApprovalSaving] = useState(false);

  useEffect(() => {
    getLoanById(id)
      .then(setLoan)
      .catch(() => {
        toast.error('Loan not found');
        navigate('/loans');
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  useEffect(() => {
    if (!id) return;
    setHistoryLoading(true);
    Promise.all([
      getLoanPaymentHistory(id).catch(() => []),
      getAuditHistory(id, 'loan').catch(() => []),
    ]).then(([payments, audit]) => {
      setPaymentHistory(payments);
      setAuditHistory(audit);
    }).finally(() => setHistoryLoading(false));
  }, [id]);

  async function handleApprovalChange(newStatus) {
    if (!loan) return;
    const isApprovalDecision = newStatus === 'approved' || newStatus === 'rejected';
    if (isApprovalDecision) {
      if (!canApproveLoan) {
        toast.error('Only the Credit Committee can approve or reject loans.');
        return;
      }
    } else if (!canEdit) {
      toast.error('You do not have permission to edit loans');
      return;
    }
    setApprovalSaving(true);
    try {
      const updated = await updateLoanApprovalStatus(loan.id, newStatus);
      setLoan(prev => ({ ...prev, status: updated.status, approval_status: updated.approval_status }));
      toast.success(`Loan marked as ${newStatus}`);
    } catch {
      toast.error('Failed to update approval status');
    } finally {
      setApprovalSaving(false);
    }
  }

  const previewSummary = useMemo(
    () => parseJsonSafely(loan?.preview_summary_json, null),
    [loan?.preview_summary_json]
  );
  const previewDeductions = useMemo(
    () => parseJsonSafely(loan?.preview_deductions_json, null),
    [loan?.preview_deductions_json]
  );
  const previewSchedule = useMemo(
    () => parseJsonSafely(loan?.preview_schedule_json, []),
    [loan?.preview_schedule_json]
  );

  const fallbackSchedule = useMemo(() => {
    if (!loan) return [];
    const annualRateDecimal = ((parseFloat(loan.interest_rate) || 0) / 100) * 12;
    const { schedule } = buildScheduleByFrequency(
      loan.amount,
      annualRateDecimal,
      loan.term_months,
      loan.release_date ? (() => { const s = loan.release_date.split('T')[0]; const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); })() : new Date(),
      loan.repayment_frequency || 'monthly'
    );
    return schedule.map(row => ({
      payment_no: row.period,
      due_date: row.dueDate,
      beginning_balance: null,
      principal_amount: row.principal,
      interest_amount: row.interest,
      cbu_amount: 0,
      savings_amount: 0,
      total_due: row.payment,
      ending_balance: row.balance,
      status: 'unpaid',
    }));
  }, [loan]);

  const scheduleRows = previewSchedule?.length ? previewSchedule : fallbackSchedule;
  const canApproveLoan =
    isAdmin ||
    profile?.role === 'credit_committee' ||
    hasPermission('loans', 'approve');

  if (loading) return <div className="flex justify-center py-24"><Spinner /></div>;
  if (!loan) return null;

  const memberName = `${loan.members?.first_name || ''} ${loan.members?.last_name || ''}`.trim();
  const printedAt = new Date().toLocaleString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  // ── Totals for footer row ──────────────────────────────────────────────────
  const totalPrincipal = scheduleRows.reduce((s, r) => s + (r.principal_amount ?? r.principal ?? 0), 0);
  const totalInterest  = scheduleRows.reduce((s, r) => s + (r.interest_amount  ?? r.interest  ?? 0), 0);
  const deductionItems = Array.isArray(previewDeductions?.items) ? previewDeductions.items : [];
  const deductionAmount = (matcher, fallback = 0) => {
    const item = deductionItems.find(d => matcher.test(d.label || ''));
    return item ? Number(item.amount || 0) : Number(fallback || 0);
  };
  const monthlyInterestRate = previewSummary?.monthly_interest_rate != null
    ? Number(previewSummary.monthly_interest_rate)
    : Number(loan.interest_rate || 0);
  const weeklyInterestRate = previewSummary?.weekly_interest_rate != null
    ? Number(previewSummary.weekly_interest_rate)
    : round4(monthlyInterestRate / 4);
  const ratePerPeriod = previewSummary?.rate_per_period ?? previewSummary?.rate_per_period_percent ?? 0;
  const summaryInterest = Number(previewSummary?.total_interest_earned || 0);
  const summaryPayments = Number(previewSummary?.total_payments_collected || previewSummary?.total_loan_payable || loan.total_loan_payable || 0);
  const estimatedInterest = estimateInterestFromTerms(loan, scheduleRows, monthlyInterestRate);
  const computedTotalInterest = summaryInterest > 0
    ? summaryInterest
    : totalInterest > 0
      ? totalInterest
      : summaryPayments > (loan.amount || 0)
        ? round2(summaryPayments - (loan.amount || 0))
        : estimatedInterest;
  const summaryLoanPayable = Number(previewSummary?.total_loan_payable || 0);
  const computedTotalLoanPayable = summaryLoanPayable > (loan.amount || 0)
    ? summaryLoanPayable
    : round2((loan.amount || totalPrincipal) + computedTotalInterest);
  const computedPaymentPerPeriod =
    previewSummary?.loan_payment_per_period ??
    previewSummary?.payment_per_period ??
    loan.monthly_amortization ??
    0;
  const totalCashOut = Number(
    previewSummary?.total_cash_out ??
    previewDeductions?.net_proceeds ??
    ((loan.amount || 0) - (loan.service_fee || 0) - (loan.share_capital || 0) - (loan.regular_savings || 0) - (loan.loan_insurance || 0))
  );
  const summaryRoi = Number(previewSummary?.total_roi_percent || 0);
  const computedRoi = totalCashOut > 0
    ? computeTotalRoiPercent(computedTotalLoanPayable, totalCashOut)
    : summaryRoi > 0
      ? summaryRoi
      : loan.amount > 0
        ? round2((computedTotalInterest / loan.amount) * 100)
        : 0;
  const annualDuesAmount = previewDeductions?.annual_dues ?? deductionAmount(/annual/i, loan.annual_dues || 0);

  // ── Schedule table rows HTML ───────────────────────────────────────────────
  function scheduleRowsHTML(rows) {
    return rows.map((row, idx) => {
      const st = row.status || 'unpaid';
      const style = ROW_STATUS_STYLE[st] || ROW_STATUS_STYLE.unpaid;
      return `
        <tr>
          <td>${row.payment_no ?? idx + 1}</td>
          <td>${formatDate(row.due_date)}</td>
          <td>${row.beginning_balance != null ? formatCurrency(row.beginning_balance) : '—'}</td>
          <td>${formatCurrency(row.principal_amount ?? row.principal ?? 0)}</td>
          <td>${formatCurrency(row.interest_amount  ?? row.interest  ?? 0)}</td>
          <td>${formatCurrency(row.ending_balance ?? row.balance ?? 0)}</td>
          <td>
            <span class="status-pill" style="background:${style.bg};color:${style.color}">
              ${style.label}
            </span>
          </td>
        </tr>
      `;
    }).join('');
  }

  // ── Schedule table footer HTML ─────────────────────────────────────────────
  function scheduleFooterHTML() {
    return `
      <tfoot>
        <tr>
          <td colspan="3">Totals (${scheduleRows.length} payments)</td>
          <td>${formatCurrency(totalPrincipal)}</td>
          <td>${formatCurrency(totalInterest)}</td>
          <td colspan="2"></td>
        </tr>
      </tfoot>
    `;
  }

  // ── PRINT: Full Loan Detail + Amortization Schedule ───────────────────────
  function handlePrint() {
    printHtmlDocument(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8"/>
        <title>Loan ${loan.loan_no || ''} — Detail & Amortization</title>
        <style>${printStyles()}</style>
      </head>
      <body>
        ${letterheadHTML(loan.loan_no, printedAt)}

        <div class="doc-title">Loan Detail &amp; Amortization Schedule</div>

        <div class="info-grid">
          <div class="col">
            <h3>Borrower Information</h3>
            ${kvRow('Member Name', memberName || '—')}
            ${kvRow('Member No.', loan.members?.member_no || '—')}
            ${kvRow('Loan No.', loan.loan_no || '—')}
            ${kvRow('Purpose', loan.purpose || '—')}
            ${kvRow('Status', titleCase(loan.status || '—'))}
          </div>
          <div class="col">
            <h3>Loan Terms</h3>
            ${kvRow('Loan Amount', formatCurrency(loan.amount))}
            ${kvRow('Outstanding Balance', formatCurrency(loan.balance ?? loan.amount), true)}
            ${kvRow('Monthly Interest Rate', `${round2(monthlyInterestRate)}%`)}
            ${kvRow('Weekly Interest', `${round4(weeklyInterestRate)}%`)}
            ${kvRow('Term', loan.term_months ? `${loan.term_months} months` : '—')}
            ${kvRow('Frequency', frequencyDisplayLabel(loan.repayment_frequency || 'monthly'))}
            ${kvRow('Method', titleCase(loan.loan_method || 'diminishing'))}
            ${kvRow('Payment / Period', formatCurrency(computedPaymentPerPeriod), true)}
            ${kvRow('Release Date', formatDate(loan.release_date))}
            ${kvRow('Due Date', formatDate(loan.due_date))}
          </div>
        </div>

        <div class="info-grid" style="margin-bottom:18px">
          <div class="col">
            <h3>Deductions</h3>
            ${kvRow('Loan Proposal', formatCurrency(loan.loan_proposal || loan.amount || 0))}
            ${kvRow(`Service Fee (${loan.service_fee_percent ?? 2}%)`, formatCurrency(previewDeductions?.service_fee ?? loan.service_fee ?? 0))}
            ${kvRow(`CBU Retention (${loan.cbu_retention_percent ?? 2.5}%)`, formatCurrency(previewDeductions?.cbu_retention ?? 0))}
            ${kvRow('Notarial Fee', formatCurrency(previewDeductions?.notarial_fee ?? loan.notarial_fee ?? 0))}
            ${kvRow(`Insurance (${titleCase(loan.insurance_mode || 'fixed')})`, formatCurrency(previewDeductions?.insurance ?? loan.loan_insurance ?? 0))}
            ${kvRow('CBU', formatCurrency(loan.share_capital ?? 0))}
            ${kvRow('Regular Savings', formatCurrency(loan.regular_savings ?? 0))}
            ${kvRow('Annual Dues', formatCurrency(annualDuesAmount))}
            ${kvRow('Total Deductions', formatCurrency(previewDeductions?.total_deductions ?? 0))}
          </div>
          <div class="col">
            <h3>Computed Summary</h3>
            ${kvRow('No. of Payments', previewSummary?.number_of_payments ?? scheduleRows.length)}
            ${kvRow('Rate / Period', `${ratePerPeriod}%`)}
            ${kvRow('Total Interest', formatCurrency(computedTotalInterest))}
            ${kvRow('ROI (%)', `${computedRoi}%`)}
            ${kvRow('Total Payments', formatCurrency(computedTotalLoanPayable))}
            ${kvRow('Net Proceeds', formatCurrency(previewDeductions?.net_proceeds ?? loan.amount ?? 0), true)}
          </div>
        </div>

        <div class="section-header">
          <span>Amortization Schedule</span>
          <span class="meta">${frequencyDisplayLabel(loan.repayment_frequency || 'monthly')} · ${scheduleRows.length} payments</span>
        </div>
        <table class="schedule">
          <thead>
            <tr>
              <th style="text-align:left">#</th>
              <th style="text-align:left">Due Date</th>
              <th>Beg. Balance</th>
              <th>Principal</th>
              <th>Interest</th>
              <th>End. Balance</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${scheduleRowsHTML(scheduleRows)}</tbody>
          ${scheduleFooterHTML()}
        </table>

        <div class="totals-bar">
          <div class="tot-item">
            <span class="tot-label">Total Principal</span>
            <span class="tot-value">${formatCurrency(totalPrincipal)}</span>
          </div>
          <div class="tot-item">
            <span class="tot-label">Total Interest</span>
            <span class="tot-value">${formatCurrency(totalInterest)}</span>
          </div>
          <div class="tot-item">
            <span class="tot-label">Total Payable</span>
            <span class="tot-value">${formatCurrency(computedTotalLoanPayable)}</span>
          </div>
        </div>

        <div class="sig-block">
          <div class="sig-item"><strong>Prepared by</strong>Signature over Printed Name</div>
          <div class="sig-item"><strong>Verified by</strong>Signature over Printed Name</div>
          <div class="sig-item"><strong>Borrower's Conformity</strong>Signature over Printed Name / Date</div>
        </div>

        <div class="print-footer">
          <span>WELLSERVE Credit Cooperative — Confidential</span>
          <span>Printed: ${printedAt}</span>
        </div>
      </body>
      </html>
    `, {
      width: 1100,
      height: 900,
      delay: 400,
      onBlocked: () => toast.error('Unable to open print preview.'),
    });
  }

  // ── PRINT: Member Billing Statement ───────────────────────────────────────
  function handlePrintBillingStatement() {
    // Find next unpaid row for "next due" callout
    const nextDue = scheduleRows.find(r => (r.status || 'unpaid') !== 'paid');
    const paidCount = scheduleRows.filter(r => r.status === 'paid').length;

    printHtmlDocument(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8"/>
        <title>Billing Statement — ${memberName}</title>
        <style>
          ${printStyles()}
          .hero-box {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 12px;
            margin-bottom: 18px;
          }
          .hero-card {
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            padding: 10px 14px;
            text-align: center;
          }
          .hero-card.green { border-color: #a7f3d0; background: #ecfdf5; }
          .hero-card.red   { border-color: #fca5a5; background: #fef2f2; }
          .hero-card .hc-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280; margin-bottom: 4px; }
          .hero-card .hc-value { font-size: 18px; font-weight: 800; color: #111827; }
          .hero-card.green .hc-value { color: #065f46; }
          .hero-card.red   .hc-value { color: #991b1b; }
          .next-due-box {
            background: #fffbeb;
            border: 1px solid #fde68a;
            border-radius: 6px;
            padding: 10px 14px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 18px;
          }
          .next-due-box .nd-label { font-size: 10px; color: #92400e; font-weight: 600; }
          .next-due-box .nd-amount { font-size: 16px; font-weight: 800; color: #92400e; }
          .next-due-box .nd-date   { font-size: 10px; color: #6b7280; margin-top: 2px; }
          .note-box {
            margin-top: 18px;
            padding: 10px 14px;
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            font-size: 10px;
            color: #6b7280;
            line-height: 1.6;
          }
        </style>
      </head>
      <body>
        ${letterheadHTML(loan.loan_no, printedAt)}

        <div class="doc-title">Member Billing Statement</div>

        <div class="info-grid" style="margin-bottom:16px">
          <div class="col">
            <h3>Borrower</h3>
            ${kvRow('Name', memberName || '—')}
            ${kvRow('Member No.', loan.members?.member_no || '—')}
            ${kvRow('Loan No.', loan.loan_no || '—')}
          </div>
          <div class="col">
            <h3>Loan Terms</h3>
            ${kvRow('Original Amount', formatCurrency(loan.amount))}
            ${kvRow('Interest Rate', loan.interest_rate ? `${loan.interest_rate}% / month` : '—')}
            ${kvRow('Term', loan.term_months ? `${loan.term_months} months` : '—')}
            ${kvRow('Frequency', frequencyDisplayLabel(loan.repayment_frequency || 'monthly'))}
            ${kvRow('Release Date', formatDate(loan.release_date))}
            ${kvRow('Maturity Date', formatDate(loan.due_date))}
          </div>
        </div>

        <div class="hero-box">
          <div class="hero-card">
            <div class="hc-label">Original Loan</div>
            <div class="hc-value">${formatCurrency(loan.amount)}</div>
          </div>
          <div class="hero-card red">
            <div class="hc-label">Outstanding Balance</div>
            <div class="hc-value">${formatCurrency(loan.balance ?? loan.amount)}</div>
          </div>
          <div class="hero-card green">
            <div class="hc-label">Payments Made</div>
            <div class="hc-value">${paidCount} / ${scheduleRows.length}</div>
          </div>
        </div>

        ${nextDue ? `
          <div class="next-due-box">
            <div>
              <div class="nd-label">⚠ Next Payment Due</div>
              <div class="nd-date">Payment #${nextDue.payment_no} · ${formatDate(nextDue.due_date)}</div>
            </div>
            <div class="nd-amount">${formatCurrency(nextDue.total_due ?? nextDue.payment ?? 0)}</div>
          </div>
        ` : `
          <div class="next-due-box" style="background:#ecfdf5;border-color:#a7f3d0">
            <div class="nd-label" style="color:#065f46">✓ Loan Fully Paid</div>
          </div>
        `}

        <div class="section-header">
          <span>Payment Schedule</span>
          <span class="meta">${scheduleRows.length} payments · ${frequencyDisplayLabel(loan.repayment_frequency || 'monthly')}</span>
        </div>
        <table class="schedule">
          <thead>
            <tr>
              <th style="text-align:left">#</th>
              <th style="text-align:left">Due Date</th>
              <th>Principal</th>
              <th>Interest</th>
              <th>Balance</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${scheduleRows.map((row, idx) => {
              const st = row.status || 'unpaid';
              const style = ROW_STATUS_STYLE[st] || ROW_STATUS_STYLE.unpaid;
              const isNext = nextDue && row.payment_no === nextDue.payment_no;
              return `
                <tr style="${isNext ? 'background:#fffbeb;' : ''}">
                  <td>${row.payment_no ?? idx + 1}</td>
                  <td>${formatDate(row.due_date)}</td>
                  <td>${formatCurrency(row.principal_amount ?? row.principal ?? 0)}</td>
                  <td>${formatCurrency(row.interest_amount  ?? row.interest  ?? 0)}</td>
                  <td>${formatCurrency(row.ending_balance ?? row.balance ?? 0)}</td>
                  <td>
                    <span class="status-pill" style="background:${style.bg};color:${style.color}">
                      ${style.label}${isNext ? ' ◀' : ''}
                    </span>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2">Totals</td>
              <td>${formatCurrency(totalPrincipal)}</td>
              <td>${formatCurrency(totalInterest)}</td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>

        <div class="note-box">
          <strong>Important:</strong> Please present this billing statement when making payments at the cooperative office.
          Payments should be made on or before the due date to avoid penalties.
          For inquiries, contact the WELLSERVE Credit Cooperative office.
        </div>

        <div class="sig-block">
          <div class="sig-item"><strong>Issued by</strong>Signature over Printed Name / Date</div>
          <div class="sig-item"><strong>Received by (Member)</strong>Signature over Printed Name / Date</div>
          <div class="sig-item"></div>
        </div>

        <div class="print-footer">
          <span>WELLSERVE Credit Cooperative — Member Copy</span>
          <span>Generated: ${printedAt}</span>
        </div>
      </body>
      </html>
    `, {
      width: 900,
      height: 900,
      delay: 400,
      onBlocked: () => toast.error('Unable to open print preview.'),
    });
  }

  // ── Excel Export ──────────────────────────────────────────────────────────
  function handleExportExcel() {
    try {
      const workbook = XLSX.utils.book_new();

      const summarySheet = XLSX.utils.aoa_to_sheet([
        ['Loan Summary'],
        [],
        ['Member', memberName || '—'],
        ['Member No.', loan.members?.member_no || '—'],
        ['Loan No.', loan.loan_no || '—'],
        ['Loan Amount', loan.amount || 0],
        ['Outstanding Balance', loan.balance ?? loan.amount ?? 0],
        ['Monthly Interest Rate', `${round2(monthlyInterestRate)}%`],
        ['Weekly Interest', `${round4(weeklyInterestRate)}%`],
        ['Term', loan.term_months ? `${loan.term_months} months` : '—'],
        ['Payment Frequency', frequencyDisplayLabel(loan.repayment_frequency || 'monthly')],
        ['Loan Method', titleCase(loan.loan_method || 'diminishing')],
        ['Payment / Period', computedPaymentPerPeriod],
        ['Total Interest Earned', computedTotalInterest],
        ['Total Payments Collected', computedTotalLoanPayable],
        ['Total ROI (%)', `${computedRoi}%`],
        ['Release Date', formatDate(loan.release_date)],
        ['Due Date', formatDate(loan.due_date)],
        ['Status', loan.status || '—'],
        ['Purpose', loan.purpose || '—'],
        ['Notes', loan.notes || '—'],
      ]);

      const deductionsSheet = XLSX.utils.aoa_to_sheet([
        ['Deductions & Net Proceeds'],
        [],
        ['Loan Proposal', loan.loan_proposal || loan.amount || 0],
        ['Service Fee %', `${loan.service_fee_percent ?? 2}%`],
        ['Service Fee', previewDeductions?.service_fee ?? loan.service_fee ?? 0],
        ['CBU Retention %', `${loan.cbu_retention_percent ?? 2.5}%`],
        ['CBU Retention', previewDeductions?.cbu_retention ?? 0],
        ['Notarial Fee', previewDeductions?.notarial_fee ?? loan.notarial_fee ?? 0],
        ['Insurance Mode', titleCase(loan.insurance_mode || 'fixed')],
        ['Insurance', previewDeductions?.insurance ?? loan.loan_insurance ?? 0],
        ['CBU', loan.share_capital ?? 0],
        ['Regular Savings', loan.regular_savings ?? 0],
        ['Annual Dues', annualDuesAmount],
        ['Total Deductions', previewDeductions?.total_deductions ?? 0],
        ['Net Proceeds', previewDeductions?.net_proceeds ?? (loan.amount || 0)],
      ]);

      const scheduleSheet = XLSX.utils.json_to_sheet(
        scheduleRows.map((row, idx) => ({
          No: row.payment_no ?? idx + 1,
          'Due Date': formatDate(row.due_date),
          'Beginning Balance': row.beginning_balance ?? '',
          Principal: row.principal_amount ?? row.principal ?? 0,
          Interest: row.interest_amount ?? row.interest ?? 0,
          'Ending Balance': row.ending_balance ?? row.balance ?? 0,
          Status: titleCase(row.status || 'unpaid'),
        }))
      );

      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Loan Summary');
      XLSX.utils.book_append_sheet(workbook, deductionsSheet, 'Deductions');
      XLSX.utils.book_append_sheet(workbook, scheduleSheet, 'Schedule');
      XLSX.writeFile(workbook, `loan_${loan.loan_no || loan.id}.xlsx`);
      toast.success('Loan Excel exported.');
    } catch (error) {
      toast.error(error.message || 'Failed to export Excel.');
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <button
        onClick={() => navigate('/loans')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors"
      >
        <ArrowLeft size={16} /> Back to Loans
      </button>

      <PageHeader
        title={`Loan ${loan.loan_no || ''}`}
        subtitle={memberName || 'Loan Details'}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            {/* Billing Statement — member-facing */}
            <Button
              variant="outline"
              icon={<FileText size={14} />}
              onClick={handlePrintBillingStatement}
            >
              Billing Statement
            </Button>

            {/* Full detail + amortization print */}
            <Button
              variant="outline"
              icon={<Printer size={14} />}
              onClick={handlePrint}
            >
              Print Detail
            </Button>

            <Button
              variant="outline"
              icon={<Download size={14} />}
              onClick={handleExportExcel}
            >
              Excel
            </Button>

            {canEdit && (
            <Button
              icon={<Edit2 size={14} />}
              onClick={() => navigate(`/loans/${id}/edit`)}
            >
              Edit
            </Button>
            )}
          </div>
        }
      />

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Loan Summary — matching Excel header format */}
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
            {[
              ['Member', memberName || '—'],
              ['Member No.', loan.members?.member_no || '—'],
              ['Loan Type', <Badge key="loan_type" variant={loan.loan_type === 'existing' ? 'warning' : 'success'}>{loan.loan_type === 'existing' ? 'Existing / Ongoing' : 'New Loan'}</Badge>],
              ['Loan Principal', formatCurrency(loan.amount)],
              ['Outstanding Balance', <span key="bal" className="text-lg font-bold text-red-600">{formatCurrency(loan.balance ?? loan.amount)}</span>],
              ['Monthly Interest Rate', `${round2(monthlyInterestRate)}%`],
              ['Weekly Interest', `${round4(weeklyInterestRate)}%`],
              ['Start Date', formatDate(loan.release_date)],
              ['Loan Term (Months)', loan.term_months ? `${loan.term_months} months` : '—'],
              ['Payment Frequency', <Badge key="freq" variant="default">{frequencyDisplayLabel(loan.repayment_frequency || 'monthly')}</Badge>],
              ['No. of Payments', previewSummary?.number_of_payments ?? scheduleRows.length ?? '—'],
              ['Total Payment per Period', formatCurrency(computedPaymentPerPeriod)],
              ['Total Cash Out (Net Proceeds)', formatCurrency(previewDeductions?.net_proceeds ?? (loan.amount - (loan.service_fee || 0) - (loan.share_capital || 0) - (loan.regular_savings || 0) - (loan.loan_insurance || 0)))],
              ['Total Principal Collected', formatCurrency(totalPrincipal)],
              ['Total Interest Earned', <span key="int" className="text-emerald-700 font-semibold">{formatCurrency(computedTotalInterest)}</span>],
              ['Total Payments Collected', formatCurrency(computedTotalLoanPayable)],
              ['Total ROI (%)', <span key="roi" className="text-emerald-700 font-semibold">{computedRoi}%</span>],
              ['Status', <Badge key="status" variant={statusVariant[loan.status] || 'default'}>{loan.status}</Badge>],
              ['Purpose', loan.purpose || '—'],
              ['Notes', loan.notes || '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between px-5 py-3 text-sm gap-4">
                <span className="text-gray-400 font-medium w-52 flex-shrink-0">{label}</span>
                <span className="text-gray-900 text-right">{value}</span>
              </div>
            ))}
          </div>

          {/* Deductions */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setDeductionsOpen(v => !v)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={15} className="text-gray-400" />
                <span className="text-sm font-semibold text-gray-700">Deductions & Net Proceeds</span>
              </div>
              {deductionsOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
            </button>

            {deductionsOpen && (
              <div className="border-t border-gray-100 divide-y divide-gray-50">
                {[
                  ['Loan Proposal', formatCurrency(loan.loan_proposal || loan.amount || 0)],
                  [`Service Fee (${loan.service_fee_percent ?? 2}%)`, formatCurrency(previewDeductions?.service_fee ?? loan.service_fee ?? 0)],
                  ['CBU (Share Capital)', formatCurrency(loan.share_capital ?? 0)],
                  ['Regular Savings', formatCurrency(loan.regular_savings ?? 0)],
                  ['Coop Loan Protection Plan', formatCurrency(previewDeductions?.insurance ?? loan.loan_insurance ?? 0)],
                  ['Annual Dues', formatCurrency(annualDuesAmount)],
                  ['Notarial Fee', formatCurrency(previewDeductions?.notarial_fee ?? loan.notarial_fee ?? 0)],
                  ['Total Deductions', <span key="td" className="font-semibold text-red-600">{formatCurrency(
                    (previewDeductions?.total_deductions ?? 0) ||
                    ((loan.service_fee || 0) + (loan.share_capital || 0) + (loan.regular_savings || 0) + (loan.loan_insurance || 0))
                  )}</span>],
                  ['Net Proceeds', <span key="np" className="font-semibold text-emerald-700">{formatCurrency(
                    previewDeductions?.net_proceeds ??
                    ((loan.amount || 0) - (loan.service_fee || 0) - (loan.share_capital || 0) - (loan.regular_savings || 0) - (loan.loan_insurance || 0))
                  )}</span>],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between px-5 py-3 text-sm gap-4">
                    <span className="text-gray-400 font-medium w-52 flex-shrink-0">{label}</span>
                    <span className="text-gray-900 text-right">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Computed Summary sidebar */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Computed Summary</h3>
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="No. of Payments" value={String(previewSummary?.number_of_payments ?? scheduleRows.length ?? 0)} />
              <MiniStat label="Rate / Period" value={`${ratePerPeriod}%`} />
              <MiniStat label="Payment / Period" value={formatCurrency(computedPaymentPerPeriod)} highlight />
              <MiniStat label="Method" value={titleCase(previewSummary?.loan_method ?? loan.loan_method ?? 'diminishing')} />
              <MiniStat label="Frequency" value={frequencyDisplayLabel(previewSummary?.payment_frequency ?? loan.repayment_frequency ?? 'monthly')} />
              <MiniStat label="ROI" value={`${computedRoi}%`} />
              <MiniStat label="Total Interest" value={formatCurrency(computedTotalInterest)} />
              <MiniStat label="Total Payments" value={formatCurrency(computedTotalLoanPayable)} />
            </div>
          </div>

          {/* Quick print card */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-emerald-700 mb-1">Print options</p>
            <p className="text-xs text-emerald-600 mb-3 leading-relaxed">
              <strong>Billing Statement</strong> — member-facing copy with next due highlighted.<br/>
              <strong>Print Detail</strong> — full internal record with deductions &amp; amortization.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={handlePrintBillingStatement}
                className="flex items-center gap-2 text-xs font-medium text-emerald-700 hover:text-emerald-900 transition-colors"
              >
                <FileText size={13} /> Billing Statement
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 text-xs font-medium text-emerald-700 hover:text-emerald-900 transition-colors"
              >
                <Printer size={13} /> Full Detail &amp; Schedule
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Amortization Schedule — Excel format */}
      <div className="mt-6">
        <LoanScheduleTable
          schedule={scheduleRows}
          frequency={loan.repayment_frequency || 'monthly'}
          loanAmount={loan.amount || 0}
          monthlyInterestRate={monthlyInterestRate}
          defaultOpen={scheduleOpen}
          showPaymentTracking={true}
          title="Amortization Schedule"
        />
      </div>

      {/* Payment History */}
      <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          type="button"
          onClick={() => setHistoryOpen(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <History size={15} className="text-gray-400" />
            <span className="text-sm font-semibold text-gray-700">Payment History</span>
            {paymentHistory.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                {paymentHistory.length}
              </span>
            )}
          </div>
          {historyOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </button>

        {historyOpen && (
          <div className="border-t border-gray-100">
            {historyLoading ? (
              <div className="flex justify-center py-6"><Spinner /></div>
            ) : paymentHistory.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">No payment records found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-gray-100">
                      {['Date', 'Amount', 'Mode', 'Reference', 'Notes', 'Recorded By'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {paymentHistory.map(tx => (
                      <tr key={tx.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                          {formatDate(tx.transaction_date || tx.created_at)}
                        </td>
                        <td className="px-4 py-3 font-semibold text-emerald-700 tabular-nums">
                          {formatCurrency(tx.amount)}
                        </td>
                        <td className="px-4 py-3">
                          {tx.payment_mode ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700">
                              {tx.payment_mode}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                          {tx.reference || '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px] truncate">
                          {tx.notes || tx.payment_mode_note || '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {tx.created_by_name || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t border-gray-100">
                      <td className="px-4 py-3 text-xs font-semibold text-gray-600">
                        Total Paid ({paymentHistory.length} payments)
                      </td>
                      <td className="px-4 py-3 font-bold text-emerald-700 tabular-nums">
                        {formatCurrency(paymentHistory.reduce((s, t) => s + (t.amount || 0), 0))}
                      </td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Approval Workflow */}
      {(loan.approval_status !== undefined) && (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <CheckCircle2 size={15} className="text-gray-400" />
            Approval Workflow
          </h3>
          <div className="flex flex-wrap items-center gap-3">
            {[
              { value: 'draft',     label: 'Draft',     icon: Clock,         color: 'text-gray-600',  bg: 'bg-gray-100' },
              { value: 'credit_committee_approval', label: 'Credit Committee Approval', icon: Clock, color: 'text-amber-700', bg: 'bg-amber-50' },
              { value: 'approved',  label: 'Approved',  icon: CheckCircle2,  color: 'text-green-700', bg: 'bg-green-50' },
              { value: 'rejected',  label: 'Rejected',  icon: XCircle,       color: 'text-red-700',   bg: 'bg-red-50' },
              { value: 'released',  label: 'Released',  icon: CheckCircle2,  color: 'text-blue-700',  bg: 'bg-blue-50' },
            ].map(({ value, label, icon: Icon, color, bg }) => (
              <button
                key={value}
                disabled={
                  approvalSaving ||
                  loan.status === value ||
                  (['approved', 'rejected'].includes(value) ? !canApproveLoan : !canEdit)
                }
                onClick={() => handleApprovalChange(value)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border
                  ${loan.status === value || loan.approval_status === value
                    ? `${bg} ${color} border-current ring-2 ring-offset-1 ring-current/30`
                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-100'
                  }`}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Audit Trail */}
      <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          type="button"
          onClick={() => setAuditOpen(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-gray-400" />
            <span className="text-sm font-semibold text-gray-700">Audit Trail</span>
            {auditHistory.length > 0 && (
              <span className="ml-1 text-xs text-gray-400">({auditHistory.length} events)</span>
            )}
          </div>
          {auditOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </button>

        {auditOpen && (
          <div className="border-t border-gray-100">
            {historyLoading ? (
              <div className="flex justify-center py-6"><Spinner /></div>
            ) : auditHistory.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">No audit events found.</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {auditHistory.map(log => (
                  <div key={log.id} className="px-5 py-3 flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-gray-700 capitalize">{log.action}</span>
                        {log.user_name && (
                          <span className="text-xs text-gray-400">by {log.user_name}</span>
                        )}
                        <span className="text-xs text-gray-300">
                          {new Date(log.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {log.description && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{log.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, highlight = false }) {
  return (
    <div className={`rounded-lg p-3 border ${highlight ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100'}`}>
      <p className="text-[11px] text-gray-400 mb-1">{label}</p>
      <p className={`text-sm font-semibold ${highlight ? 'text-blue-700' : 'text-gray-800'}`}>{value}</p>
    </div>
  );
}