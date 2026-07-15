import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { useAuth } from '../../context/AuthContext';
import {
  FINANCIAL_MIGRATION_CATEGORIES,
  analyzeFinancialMonitoringWorkbook,
  confirmFinancialMonitoringMigration,
  getFinancialMigrationTargetPage,
} from '../../services/financialMonitoringMigrationService';

function SummaryCard({ label, value, sub, tone = 'gray' }) {
  const tones = {
    green: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    red: 'bg-red-50 border-red-100 text-red-700',
    amber: 'bg-amber-50 border-amber-100 text-amber-700',
    blue: 'bg-blue-50 border-blue-100 text-blue-700',
    gray: 'bg-gray-50 border-gray-100 text-gray-700',
  };

  return (
    <div className={`rounded-xl border p-4 ${tones[tone] || tones.gray}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs opacity-70">{sub}</p>}
    </div>
  );
}

function TypeBadge({ type }) {
  const isIn = type === 'cash_in';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${isIn ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
      {isIn ? 'IN' : 'OUT'}
    </span>
  );
}

function StatusBadge({ status }) {
  const needsReview = status === 'Needs Review';
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${needsReview ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
      {status}
    </span>
  );
}

function RouteSummaryRow({ label, count, amount }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
      <div>
        <p className="text-xs font-semibold text-gray-700">{label}</p>
        <p className="text-[11px] text-gray-400">Imported / Historical tab</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold tabular-nums text-gray-800">{count}</p>
        <p className="text-[11px] font-medium tabular-nums text-gray-500">{formatCurrency(amount)}</p>
      </div>
    </div>
  );
}

export default function FinancialMigrationImportModal({ open, onClose }) {
  const { user } = useAuth();
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [categoryOverrides, setCategoryOverrides] = useState({});

  const rawRows = analysis?.rows || [];
  const rows = useMemo(() => rawRows.map(row => {
    const hasOverride = Object.prototype.hasOwnProperty.call(categoryOverrides, row.id);
    const finalCategory = categoryOverrides[row.id] || row.final_category || row.category || 'NEEDS MANUAL REVIEW';
    const needsReview = !hasOverride && (row.import_status === 'Needs Review' || row.confidence === 'low' || row.accounting_class === 'Needs Review');
    return {
      ...row,
      final_category: finalCategory,
      target_page: getFinancialMigrationTargetPage(finalCategory, row.type),
      import_status: needsReview || finalCategory === 'NEEDS MANUAL REVIEW' ? 'Needs Review' : 'Ready for Review',
    };
  }), [rawRows, categoryOverrides]);
  const summary = analysis?.summary;
  const firstDate = rows[0]?.date;
  const lastDate = rows[rows.length - 1]?.date;
  const reviewCount = rows.filter(row => row.import_status === 'Needs Review').length;
  const routeSummary = useMemo(() => {
    const initial = {
      'Fund Monitoring': { count: 0, amount: 0 },
      'Imported Expenses': { count: 0, amount: 0 },
      'Imported Vouchers': { count: 0, amount: 0 },
      'Imported Checks': { count: 0, amount: 0 },
      'Imported Loan Payments': { count: 0, amount: 0 },
      'Imported Membership': { count: 0, amount: 0 },
      'Imported CBU': { count: 0, amount: 0 },
      'Imported Savings': { count: 0, amount: 0 },
      'Imported Time Deposit': { count: 0, amount: 0 },
      'Needs Review': { count: 0, amount: 0 },
    };

    rows.forEach(row => {
      if (row.import_status === 'Needs Review') {
        initial['Needs Review'].count += 1;
        initial['Needs Review'].amount += row.amount;
        return;
      }

      initial['Fund Monitoring'].count += 1;
      initial['Fund Monitoring'].amount += row.amount;

      if (row.final_category.includes('LOAN RELEASE')) {
        ['Imported Expenses', 'Imported Vouchers', 'Imported Checks'].forEach(key => {
          initial[key].count += 1;
          initial[key].amount += row.amount;
        });
        return;
      }

      if (row.final_category.includes('LOAN PAYMENT') || row.final_category.includes('LOAN ONLY') || row.final_category === 'INTEREST') {
        initial['Imported Loan Payments'].count += 1;
        initial['Imported Loan Payments'].amount += row.amount;
        return;
      }

      if (row.final_category.includes('MEMBERSHIP')) {
        initial['Imported Membership'].count += 1;
        initial['Imported Membership'].amount += row.amount;
        return;
      }

      if (row.final_category.includes('CBU')) {
        initial['Imported CBU'].count += 1;
        initial['Imported CBU'].amount += row.amount;
        return;
      }

      if (row.final_category.includes('SAVINGS')) {
        initial['Imported Savings'].count += 1;
        initial['Imported Savings'].amount += row.amount;
        return;
      }

      if (row.final_category.includes('TIME DEPOSIT')) {
        initial['Imported Time Deposit'].count += 1;
        initial['Imported Time Deposit'].amount += row.amount;
        return;
      }

      if (row.type === 'cash_out') {
        initial['Imported Expenses'].count += 1;
        initial['Imported Expenses'].amount += row.amount;
      }
    });

    return Object.entries(initial)
      .filter(([, item]) => item.count > 0)
      .map(([label, item]) => ({ label, ...item }));
  }, [rows]);

  function resetState() {
    setFile(null);
    setAnalysis(null);
    setCategoryOverrides({});
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleClose() {
    if (isAnalyzing || isImporting) return;
    resetState();
    onClose?.();
  }

  async function handleFileChange(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;

    const ext = selected.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls'].includes(ext)) {
      toast.error('Please upload an Excel monitoring file.');
      return;
    }

    setFile(selected);
    setAnalysis(null);
    setCategoryOverrides({});
    setIsAnalyzing(true);
    try {
      const result = await analyzeFinancialMonitoringWorkbook(selected);
      setAnalysis(result);
      toast.success(`${result.summary.totalRows} cash ledger rows detected.`);
    } catch (error) {
      toast.error(error.message || 'Failed to analyze financial monitoring file.');
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleConfirmImport() {
    if (!analysis || reviewCount > 0 || isImporting) return;

    setIsImporting(true);
    try {
      const result = await confirmFinancialMonitoringMigration({
        analysis,
        rows,
        createdBy: user?.id || null,
      });
      toast.success(`Imported ${result.importedRows} historical financial row(s).`);
      resetState();
      onClose?.();
      window.location.reload();
    } catch (error) {
      toast.error(error.message || 'Failed to import historical financial records.');
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Financial Migration Import" size="3xl">
      <div className="space-y-5">
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Phase 5 imports reviewed historical ledger records.</p>
              <p className="mt-1 text-xs leading-relaxed">
                This tool analyzes the BDO ACCOUNT MONITORING sheet and keeps the preview wording close to the Excel file:
                DATE, PARTICULARS, CHECK #, voucher #, WITHDRAWAL/EXPENSES, DEPOSIT, and CASH/CHECK.
                Confirm Import saves reviewed rows as imported historical records in the migration audit tables, transactions,
                and fund transactions. Normal approval, voucher, check release, and loan workflows are not triggered.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isAnalyzing || isImporting}
          className="flex min-h-[120px] w-full items-center justify-center rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/40 px-4 text-center transition hover:border-emerald-400 hover:bg-emerald-50 disabled:opacity-60"
        >
          <div>
            {isAnalyzing ? (
              <Loader2 size={28} className="mx-auto animate-spin text-emerald-600" />
            ) : (
              <FileSpreadsheet size={30} className="mx-auto text-emerald-600" />
            )}
            <p className="mt-2 text-sm font-semibold text-gray-800">
              {file ? file.name : 'Upload ACCOUNT MONITORING Excel file'}
            </p>
            <p className="mt-1 text-xs text-gray-500">Upload one year at a time. Analysis does not change the database.</p>
          </div>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          className="hidden"
        />

        {summary && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <SummaryCard label="Rows Detected" value={summary.totalRows} sub={summary.sheetName} tone="blue" />
              <SummaryCard label="Cash In" value={formatCurrency(summary.cashIn)} sub="Passbook deposits" tone="green" />
              <SummaryCard label="Cash Out" value={formatCurrency(summary.cashOut)} sub="Passbook withdrawals" tone="red" />
              <SummaryCard label="Net Cash Flow" value={formatCurrency(summary.netCashFlow)} sub="Cash in minus cash out" tone={summary.netCashFlow >= 0 ? 'green' : 'red'} />
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <SummaryCard label="True Income" value={formatCurrency(summary.trueIncome)} sub="Classified income only" tone="green" />
              <SummaryCard label="True Expenses" value={formatCurrency(summary.trueExpenses)} sub="Classified expenses only" tone="red" />
              <SummaryCard label="Est. Profit/Loss" value={formatCurrency(summary.profitLoss)} sub="Income minus expenses" tone={summary.profitLoss >= 0 ? 'green' : 'red'} />
              <SummaryCard label="Needs Review" value={reviewCount} sub={`${summary.warnings} original warning(s)`} tone={reviewCount ? 'amber' : 'gray'} />
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Import Routing Summary</p>
                  <p className="text-xs text-gray-400">
                    Preview of where reviewed rows would appear as migrated historical records. Nothing is saved yet.
                  </p>
                </div>
                <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${reviewCount ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  {reviewCount ? `${reviewCount} row(s) still need review` : 'Ready to import'}
                </span>
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {routeSummary.map(item => (
                  <RouteSummaryRow key={item.label} label={item.label} count={item.count} amount={item.amount} />
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Preview Rows</p>
                  <p className="text-xs text-gray-400">
                    Showing all {rows.length} parsed cash movements from {analysis.sourceFile}
                    {firstDate && lastDate ? ` (${formatDate(firstDate)} to ${formatDate(lastDate)})` : ''}
                  </p>
                </div>
                <CheckCircle size={18} className="text-emerald-500" />
              </div>

              <div className="max-h-[360px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Excel Row</th>
                      <th className="px-3 py-2 text-left">DATE</th>
                      <th className="px-3 py-2 text-center">IN/OUT</th>
                      <th className="px-3 py-2 text-right">WITHDRAWAL/EXPENSES / DEPOSIT</th>
                      <th className="px-3 py-2 text-left">Suggested Excel Category</th>
                      <th className="px-3 py-2 text-left">Final Category</th>
                      <th className="px-3 py-2 text-left">Target Page</th>
                      <th className="px-3 py-2 text-left">Record Type</th>
                      <th className="px-3 py-2 text-left">Import Status</th>
                      <th className="px-3 py-2 text-left">PARTICULARS</th>
                      <th className="px-3 py-2 text-left">CHECK # / voucher # / CASH/CHECK</th>
                      <th className="px-3 py-2 text-right">BALANCE</th>
                      <th className="px-3 py-2 text-right">TOTAL DEPOSITED</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map(row => (
                      <tr key={row.id} className="hover:bg-gray-50/60">
                        <td className="px-3 py-2 text-gray-400">{row.source_row}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-700">{formatDate(row.date)}</td>
                        <td className="px-3 py-2 text-center"><TypeBadge type={row.type} /></td>
                        <td className={`px-3 py-2 text-right font-semibold tabular-nums ${row.type === 'cash_in' ? 'text-emerald-700' : 'text-red-600'}`}>
                          {formatCurrency(row.amount)}
                        </td>
                        <td className="px-3 py-2 text-gray-700">{row.category}</td>
                        <td className="px-3 py-2 min-w-[220px]">
                          <select
                            value={row.final_category}
                            onChange={event => setCategoryOverrides(current => ({ ...current, [row.id]: event.target.value }))}
                            className={`w-full rounded-lg border px-2 py-1.5 text-xs font-semibold outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 ${row.import_status === 'Needs Review' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-gray-200 bg-white text-gray-700'}`}
                          >
                            {FINANCIAL_MIGRATION_CATEGORIES.map(category => (
                              <option key={category} value={category}>{category}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 min-w-[180px] text-xs font-medium text-gray-600">{row.target_page}</td>
                        <td className="px-3 py-2 min-w-[150px] text-xs text-gray-500">{row.record_type}</td>
                        <td className="px-3 py-2"><StatusBadge status={row.import_status} /></td>
                        <td className="px-3 py-2 min-w-[240px] text-gray-600">{row.description || '-'}</td>
                        <td className="px-3 py-2 min-w-[140px] text-gray-500">{row.reference || '-'}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums text-gray-700">
                          {row.balance ? formatCurrency(row.balance) : '-'}
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums text-gray-700">
                          {row.total_deposited ? formatCurrency(row.total_deposited) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {analysis.warnings.length > 0 && (
              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-800">Warnings</p>
                <div className="mt-2 max-h-28 overflow-auto space-y-1">
                  {analysis.warnings.slice(0, 20).map((warning, index) => (
                    <p key={`${warning.row}-${index}`} className="text-xs text-amber-700">
                      Row {warning.row}: {warning.message} ({formatCurrency(warning.amount)})
                    </p>
                  ))}
                  {analysis.warnings.length > 20 && (
                    <p className="text-xs text-amber-700">And {analysis.warnings.length - 20} more warning(s).</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-3 border-t border-gray-100 pt-4">
        <Button type="button" variant="outline" onClick={handleClose} disabled={isAnalyzing || isImporting}>
          Close
        </Button>
        <Button
          type="button"
          variant="primary"
          icon={isImporting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          onClick={handleConfirmImport}
          disabled={!analysis || reviewCount > 0 || isAnalyzing || isImporting}
        >
          {reviewCount > 0 ? 'Resolve reviews before import' : isImporting ? 'Importing...' : 'Confirm Import'}
        </Button>
      </div>
    </Modal>
  );
}
