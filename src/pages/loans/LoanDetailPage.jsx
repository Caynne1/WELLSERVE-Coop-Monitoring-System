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
import * as XLSX from  'xlsx';

const statusVariant = {
  active: 'success',
  ongoing: 'success',
  paid: 'info',
  defaulted: 'danger',
  pending: 'warning',
};

function parseJsonSafely(value, fallback = null) {
  if (!value) return fallback;

  if (typeof value === 'object') return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function titleCase(value) {
  if (!value) return '—';
  return String(value)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, m => m.toUpperCase());
}

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

  if (loading) {
    return <div className="flex justify-center py-24"><Spinner /></div>;
  }

  if (!loan) return null;

  const memberName = `${loan.members?.first_name || ''} ${loan.members?.last_name || ''}`.trim();
  function handlePrint() {
    const printWindow = window.open('', '_blank', 'width=1200,height=900');
    if (!printWindow) {
      toast.error('Unable to open print preview.');
      return;
    }

    const summaryRows = [
      ['Member', memberName || '—'],
      ['Member No.', loan.members?.member_no || '—'],
      ['Loan Amount', formatCurrency(loan.amount)],
      ['Outstanding Balance', formatCurrency(loan.balance ?? loan.amount)],
      ['Monthly Interest Rate', loan.interest_rate ? `${loan.interest_rate}%` : '—'],
      ['Term', loan.term_months ? `${loan.term_months} months` : '—'],
      ['Payment Frequency', frequencyDisplayLabel(loan.repayment_frequency || 'monthly')],
      ['Loan Method', titleCase(loan.loan_method || 'diminishing')],
      ['Payment / Period', formatCurrency(previewSummary?.payment_per_period ?? loan.monthly_amortization ?? 0)],
      ['Release Date', formatDate(loan.release_date)],
      ['Due Date', formatDate(loan.due_date)],
      ['Status', loan.status || '—'],
      ['Purpose', loan.purpose || '—'],
      ['Notes', loan.notes || '—'],
    ];

    const deductionRows = [
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
    ];

    const scheduleHtml = scheduleRows.map((row, idx) => `
      <tr>
        <td>${row.payment_no ?? idx + 1}</td>
        <td>${formatDate(row.due_date)}</td>
        <td>${row.beginning_balance !== null && row.beginning_balance !== undefined ? formatCurrency(row.beginning_balance) : '—'}</td>
        <td>${formatCurrency(row.principal_amount ?? row.principal ?? 0)}</td>
        <td>${formatCurrency(row.interest_amount ?? row.interest ?? 0)}</td>
        <td>${formatCurrency(row.cbu_amount ?? 0)}</td>
        <td>${formatCurrency(row.savings_amount ?? 0)}</td>
        <td>${formatCurrency(row.total_due ?? row.payment ?? 0)}</td>
        <td>${formatCurrency(row.ending_balance ?? row.balance ?? 0)}</td>
      </tr>
    `).join('');

    const keyValueTable = (title, rows) => `
      <h2>${title}</h2>
      <table class="kv">
        <tbody>
          ${rows.map(([label, value]) => `
            <tr>
              <td class="label">${label}</td>
              <td>${value}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    printWindow.document.write(`
      <html>
        <head>
          <title>Loan ${loan.loan_no || ''}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #222; }
            h1 { margin: 0 0 8px; font-size: 22px; }
            h2 { margin: 24px 0 10px; font-size: 16px; }
            p.meta { margin: 0 0 18px; color: #666; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; }
            th { background: #f5f5f5; }
            .kv .label { width: 220px; font-weight: bold; background: #fafafa; }
          </style>
        </head>
        <body>
          <h1>Loan Details</h1>
          <p class="meta">Loan No.: ${loan.loan_no || '—'} | Printed: ${new Date().toLocaleString()}</p>

          ${keyValueTable('Loan Summary', summaryRows)}
          ${keyValueTable('Deductions & Net Proceeds', deductionRows)}

          <h2>Amortization Schedule</h2>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Due Date</th>
                <th>Beginning Balance</th>
                <th>Principal</th>
                <th>Interest</th>
                <th>CBU</th>
                <th>Savings</th>
                <th>Total Due</th>
                <th>Ending Balance</th>
              </tr>
            </thead>
            <tbody>
              ${scheduleHtml}
            </tbody>
          </table>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              icon={<Printer size={14} />}
              onClick={handlePrint}
            >
              Print
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
              {deductionsOpen ? (
                <ChevronUp size={16} className="text-gray-400" />
              ) : (
                <ChevronDown size={16} className="text-gray-400" />
              )}
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

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Computed Summary</h3>

            <div className="grid grid-cols-2 gap-3">
              <MiniStat
                label="No. of Payments"
                value={String(previewSummary?.number_of_payments ?? scheduleRows.length ?? 0)}
              />
              <MiniStat
                label="Rate / Period"
                value={`${previewSummary?.rate_per_period_percent ?? 0}%`}
              />
              <MiniStat
                label="Payment / Period"
                value={formatCurrency(previewSummary?.payment_per_period ?? loan.monthly_amortization ?? 0)}
                highlight
              />
              <MiniStat
                label="Method"
                value={titleCase(previewSummary?.loan_method ?? loan.loan_method ?? 'diminishing')}
              />
              <MiniStat
                label="Frequency"
                value={frequencyDisplayLabel(previewSummary?.payment_frequency ?? loan.repayment_frequency ?? 'monthly')}
              />
              <MiniStat
                label="ROI"
                value={`${previewSummary?.total_roi_percent ?? 0}%`}
              />
              <MiniStat
                label="Total Interest"
                value={formatCurrency(previewSummary?.total_interest_earned ?? 0)}
              />
              <MiniStat
                label="Total Payments"
                value={formatCurrency(previewSummary?.total_payments_collected ?? loan.total_loan_payable ?? 0)}
              />
            </div>
          </div>
        </div>
      </div>

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
          {scheduleOpen ? (
            <ChevronUp size={16} className="text-gray-400" />
          ) : (
            <ChevronDown size={16} className="text-gray-400" />
          )}
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
                        {[
                          '#',
                          'Due Date',
                          'Beginning Balance',
                          'Principal',
                          'Interest',
                          'CBU',
                          'Savings',
                          'Total Due',
                          'Ending Balance',
                        ].map(h => (
                          <th
                            key={h}
                            className="px-4 py-2.5 text-left font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {scheduleRows.map((row, idx) => (
                        <tr key={`${row.payment_no || idx}-${row.due_date || idx}`} className="hover:bg-gray-50/60 text-gray-700">
                          <td className="px-4 py-2.5 font-mono text-gray-400 whitespace-nowrap">
                            {row.payment_no ?? idx + 1}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {formatDate(row.due_date)}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {row.beginning_balance !== null && row.beginning_balance !== undefined
                              ? formatCurrency(row.beginning_balance)
                              : '—'}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {formatCurrency(row.principal_amount ?? row.principal ?? 0)}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {formatCurrency(row.interest_amount ?? row.interest ?? 0)}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {formatCurrency(row.cbu_amount ?? 0)}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {formatCurrency(row.savings_amount ?? 0)}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap font-medium">
                            {formatCurrency(row.total_due ?? row.payment ?? 0)}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {formatCurrency(row.ending_balance ?? row.balance ?? 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
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
      <p className={`text-sm font-semibold ${highlight ? 'text-blue-700' : 'text-gray-800'}`}>
        {value}
      </p>
    </div>
  );
}