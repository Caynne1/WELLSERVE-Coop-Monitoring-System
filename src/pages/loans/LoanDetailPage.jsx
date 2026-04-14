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
} from 'lucide-react';
import toast from 'react-hot-toast';

import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';

import { getLoanById } from '../../services/loanService';
import {
  buildScheduleByFrequency,
  frequencyDisplayLabel,
  frequencyPeriodLabel,
} from '../../utils/loanCalculator';
import { formatCurrency, formatDate } from '../../utils/formatters';
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

  const [loan, setLoan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [deductionsOpen, setDeductionsOpen] = useState(true);

  useEffect(() => {
    getLoanById(id)
      .then(setLoan)
      .catch(() => {
        toast.error('Loan not found');
        navigate('/loans');
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

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
      loan.release_date ? new Date(loan.release_date) : new Date(),
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
  const totalCBU       = scheduleRows.reduce((s, r) => s + (r.cbu_amount       ?? 0), 0);
  const totalSavings   = scheduleRows.reduce((s, r) => s + (r.savings_amount   ?? 0), 0);
  const totalDue       = scheduleRows.reduce((s, r) => s + (r.total_due        ?? r.payment   ?? 0), 0);

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
          <td>${formatCurrency(row.cbu_amount     ?? 0)}</td>
          <td>${formatCurrency(row.savings_amount ?? 0)}</td>
          <td><strong>${formatCurrency(row.total_due ?? row.payment ?? 0)}</strong></td>
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
          <td>${formatCurrency(totalCBU)}</td>
          <td>${formatCurrency(totalSavings)}</td>
          <td><strong>${formatCurrency(totalDue)}</strong></td>
          <td colspan="2"></td>
        </tr>
      </tfoot>
    `;
  }

  // ── PRINT: Full Loan Detail + Amortization Schedule ───────────────────────
  function handlePrint() {
    const pw = window.open('', '_blank', 'width=1100,height=900');
    if (!pw) { toast.error('Unable to open print preview.'); return; }

    pw.document.write(`
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
            ${kvRow('Interest Rate', loan.interest_rate ? `${loan.interest_rate}% / month` : '—')}
            ${kvRow('Term', loan.term_months ? `${loan.term_months} months` : '—')}
            ${kvRow('Frequency', frequencyDisplayLabel(loan.repayment_frequency || 'monthly'))}
            ${kvRow('Method', titleCase(loan.loan_method || 'diminishing'))}
            ${kvRow('Payment / Period', formatCurrency(previewSummary?.payment_per_period ?? loan.monthly_amortization ?? 0), true)}
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
            ${kvRow('Share Capital', formatCurrency(loan.share_capital ?? 0))}
            ${kvRow('Regular Savings', formatCurrency(loan.regular_savings ?? 0))}
            ${kvRow('Total Deductions', formatCurrency(previewDeductions?.total_deductions ?? 0))}
          </div>
          <div class="col">
            <h3>Computed Summary</h3>
            ${kvRow('No. of Payments', previewSummary?.number_of_payments ?? scheduleRows.length)}
            ${kvRow('Rate / Period', `${previewSummary?.rate_per_period_percent ?? 0}%`)}
            ${kvRow('Total Interest', formatCurrency(previewSummary?.total_interest_earned ?? totalInterest))}
            ${kvRow('Total Payable', formatCurrency(previewSummary?.total_payments_collected ?? totalDue))}
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
              <th>CBU</th>
              <th>Savings</th>
              <th>Total Due</th>
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
            <span class="tot-value">${formatCurrency(totalDue)}</span>
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
    `);
    pw.document.close();
    pw.focus();
    setTimeout(() => pw.print(), 400);
  }

  // ── PRINT: Member Billing Statement ───────────────────────────────────────
  function handlePrintBillingStatement() {
    const pw = window.open('', '_blank', 'width=900,height=900');
    if (!pw) { toast.error('Unable to open print preview.'); return; }

    // Find next unpaid row for "next due" callout
    const nextDue = scheduleRows.find(r => (r.status || 'unpaid') !== 'paid');
    const paidCount = scheduleRows.filter(r => r.status === 'paid').length;

    pw.document.write(`
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
              <th>CBU</th>
              <th>Savings</th>
              <th>Total Due</th>
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
                  <td>${formatCurrency(row.cbu_amount     ?? 0)}</td>
                  <td>${formatCurrency(row.savings_amount ?? 0)}</td>
                  <td><strong>${formatCurrency(row.total_due ?? row.payment ?? 0)}</strong></td>
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
              <td>${formatCurrency(totalCBU)}</td>
              <td>${formatCurrency(totalSavings)}</td>
              <td><strong>${formatCurrency(totalDue)}</strong></td>
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
    `);
    pw.document.close();
    pw.focus();
    setTimeout(() => pw.print(), 400);
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
        ['Monthly Interest Rate', loan.interest_rate ? `${loan.interest_rate}%` : '—'],
        ['Term', loan.term_months ? `${loan.term_months} months` : '—'],
        ['Payment Frequency', frequencyDisplayLabel(loan.repayment_frequency || 'monthly')],
        ['Loan Method', titleCase(loan.loan_method || 'diminishing')],
        ['Payment / Period', previewSummary?.payment_per_period ?? loan.monthly_amortization ?? 0],
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
        ['Share Capital', loan.share_capital ?? 0],
        ['Regular Savings', loan.regular_savings ?? 0],
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
          CBU: row.cbu_amount ?? 0,
          Savings: row.savings_amount ?? 0,
          'Total Due': row.total_due ?? row.payment ?? 0,
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

            <Button
              icon={<Edit2 size={14} />}
              onClick={() => navigate(`/loans/${id}/edit`)}
            >
              Edit
            </Button>
          </div>
        }
      />

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Loan Summary */}
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
            {[
              ['Member', memberName || '—'],
              ['Member No.', loan.members?.member_no || '—'],
              ['Loan Amount', formatCurrency(loan.amount)],
              ['Outstanding Balance', formatCurrency(loan.balance ?? loan.amount)],
              ['Monthly Interest Rate', loan.interest_rate ? `${loan.interest_rate}%` : '—'],
              ['Term', loan.term_months ? `${loan.term_months} months` : '—'],
              ['Payment Frequency', frequencyDisplayLabel(loan.repayment_frequency || 'monthly')],
              ['Loan Method', titleCase(loan.loan_method || 'diminishing')],
              ['Payment / Period', formatCurrency(loan.monthly_amortization)],
              ['Release Date', formatDate(loan.release_date)],
              ['Due Date', formatDate(loan.due_date)],
              ['Status', <Badge key="status" variant={statusVariant[loan.status] || 'default'}>{loan.status}</Badge>],
              ['Purpose', loan.purpose || '—'],
              ['Notes', loan.notes || '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between px-5 py-3 text-sm gap-4">
                <span className="text-gray-400 font-medium w-44 flex-shrink-0">{label}</span>
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
                  ['Service Fee %', `${loan.service_fee_percent ?? 2}%`],
                  ['Service Fee', formatCurrency(previewDeductions?.service_fee ?? loan.service_fee ?? 0)],
                  ['CBU Retention %', `${loan.cbu_retention_percent ?? 2.5}%`],
                  ['CBU Retention', formatCurrency(previewDeductions?.cbu_retention ?? 0)],
                  ['Notarial Fee', formatCurrency(previewDeductions?.notarial_fee ?? loan.notarial_fee ?? 0)],
                  ['Insurance Mode', titleCase(loan.insurance_mode || 'fixed')],
                  ['Insurance', formatCurrency(previewDeductions?.insurance ?? loan.loan_insurance ?? 0)],
                  ['Share Capital', formatCurrency(loan.share_capital ?? 0)],
                  ['Regular Savings', formatCurrency(loan.regular_savings ?? 0)],
                  ['Total Deductions', formatCurrency(previewDeductions?.total_deductions ?? 0)],
                  ['Net Proceeds', formatCurrency(previewDeductions?.net_proceeds ?? (loan.amount || 0))],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between px-5 py-3 text-sm gap-4">
                    <span className="text-gray-400 font-medium w-44 flex-shrink-0">{label}</span>
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
              <MiniStat label="Rate / Period" value={`${previewSummary?.rate_per_period_percent ?? 0}%`} />
              <MiniStat label="Payment / Period" value={formatCurrency(previewSummary?.payment_per_period ?? loan.monthly_amortization ?? 0)} highlight />
              <MiniStat label="Method" value={titleCase(previewSummary?.loan_method ?? loan.loan_method ?? 'diminishing')} />
              <MiniStat label="Frequency" value={frequencyDisplayLabel(previewSummary?.payment_frequency ?? loan.repayment_frequency ?? 'monthly')} />
              <MiniStat label="ROI" value={`${previewSummary?.total_roi_percent ?? 0}%`} />
              <MiniStat label="Total Interest" value={formatCurrency(previewSummary?.total_interest_earned ?? 0)} />
              <MiniStat label="Total Payments" value={formatCurrency(previewSummary?.total_payments_collected ?? loan.total_loan_payable ?? 0)} />
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

      {/* Amortization Schedule */}
      <div className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          type="button"
          onClick={() => setScheduleOpen(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Calendar size={15} className="text-gray-400" />
            <span className="text-sm font-semibold text-gray-700">Amortization Schedule</span>
            <span className="text-xs text-gray-400">
              ({frequencyDisplayLabel(loan.repayment_frequency || 'monthly')})
            </span>
          </div>
          {scheduleOpen
            ? <ChevronUp size={16} className="text-gray-400" />
            : <ChevronDown size={16} className="text-gray-400" />}
        </button>

        {scheduleOpen && (
          <div className="border-t border-gray-100">
            {scheduleRows.length === 0 ? (
              <div className="px-5 py-6 text-center text-sm text-gray-400">
                No schedule available.
              </div>
            ) : (
              <>
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex flex-wrap gap-4 text-xs text-gray-600">
                  <span>
                    <span className="font-medium text-gray-800">{scheduleRows.length}</span>{' '}
                    {frequencyPeriodLabel(loan.repayment_frequency || 'monthly')}s
                  </span>
                  <span>
                    Payment / period:{' '}
                    <span className="font-medium text-gray-800">
                      {formatCurrency(previewSummary?.payment_per_period ?? loan.monthly_amortization ?? 0)}
                    </span>
                  </span>
                  <span>
                    Total payable:{' '}
                    <span className="font-medium text-gray-800">
                      {formatCurrency(previewSummary?.total_payments_collected ?? loan.total_loan_payable ?? 0)}
                    </span>
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        {['#', 'Due Date', 'Beg. Balance', 'Principal', 'Interest', 'CBU', 'Savings', 'Total Due', 'End. Balance', 'Status'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {scheduleRows.map((row, idx) => {
                        const st = row.status || 'unpaid';
                        const style = ROW_STATUS_STYLE[st] || ROW_STATUS_STYLE.unpaid;
                        return (
                          <tr key={`${row.payment_no || idx}-${row.due_date || idx}`} className="hover:bg-gray-50/60 text-gray-700">
                            <td className="px-4 py-2.5 font-mono text-gray-400 whitespace-nowrap">{row.payment_no ?? idx + 1}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(row.due_date)}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              {row.beginning_balance != null ? formatCurrency(row.beginning_balance) : '—'}
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap">{formatCurrency(row.principal_amount ?? row.principal ?? 0)}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap">{formatCurrency(row.interest_amount  ?? row.interest  ?? 0)}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap">{formatCurrency(row.cbu_amount     ?? 0)}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap">{formatCurrency(row.savings_amount ?? 0)}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap font-medium">{formatCurrency(row.total_due ?? row.payment ?? 0)}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap">{formatCurrency(row.ending_balance ?? row.balance ?? 0)}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              <span
                                className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase"
                                style={{ background: style.bg, color: style.color }}
                              >
                                {style.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {/* Totals footer */}
                    <tfoot>
                      <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold text-gray-700">
                        <td className="px-4 py-2.5" colSpan={3}>Totals</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">{formatCurrency(totalPrincipal)}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">{formatCurrency(totalInterest)}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">{formatCurrency(totalCBU)}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">{formatCurrency(totalSavings)}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">{formatCurrency(totalDue)}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="px-5 py-2.5 border-t border-gray-100 bg-gray-50/50">
                  <p className="text-xs text-gray-400">
                    This schedule is for preview and reference. Actual payment posting should still follow your transaction ledger and repayment process.
                  </p>
                </div>
              </>
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