import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  FileSpreadsheet,
  Loader2,
  Upload,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { trackActivity } from '../../services/logService';
import {
  analyzeMembershipMasterlist,
  importMembershipMasterlistMigration,
} from '../../services/membershipMasterlistMigrationService';

function formatMoney(value) {
  return Number(value || 0).toLocaleString('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  });
}

function SummaryCard({ label, value, sub, tone = 'gray' }) {
  const tones = {
    green: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    blue: 'bg-blue-50 border-blue-100 text-blue-700',
    amber: 'bg-amber-50 border-amber-100 text-amber-700',
    red: 'bg-red-50 border-red-100 text-red-700',
    gray: 'bg-gray-50 border-gray-100 text-gray-700',
  };

  return (
    <div className={`rounded-xl border p-4 ${tones[tone] || tones.gray}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs opacity-70">{sub}</p>}
    </div>
  );
}

export default function MembershipMasterlistMigrationModal({ open, onClose, onImported }) {
  const { user } = useAuth();
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [results, setResults] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });
  const [migrationDate, setMigrationDate] = useState(new Date().toISOString().slice(0, 10));

  const summary = analysis?.summary;
  const rows = analysis?.rows || [];
  const canImport = rows.length > 0 && !isImporting;

  const previewRows = useMemo(() => rows, [rows]);

  function resetState() {
    setFile(null);
    setAnalysis(null);
    setResults(null);
    setProgress({ current: 0, total: 0, message: '' });
    setMigrationDate(new Date().toISOString().slice(0, 10));
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
      toast.error('Please upload the membership masterlist Excel file.');
      return;
    }

    setFile(selected);
    setResults(null);
    setAnalysis(null);
    setIsAnalyzing(true);
    try {
      const parsed = await analyzeMembershipMasterlist(selected);
      setAnalysis(parsed);
      toast.success(`${parsed.summary.total} members detected for migration.`);
    } catch (error) {
      toast.error(error.message || 'Failed to analyze masterlist.');
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleImport() {
    if (!canImport) return;
    setIsImporting(true);
    setResults(null);
    try {
      const importResults = await importMembershipMasterlistMigration(rows, {
        sourceFile: analysis.sourceFile,
        migrationDate,
        createdBy: user?.id || null,
        onProgress: (current, total, message) => setProgress({ current, total, message }),
      });

      setResults(importResults);
      await trackActivity({
        userId: user?.id,
        module: 'member',
        action: 'migration_import',
        description: `Membership masterlist migration: ${importResults.membersCreated} created, ${importResults.membersUpdated} updated, ${importResults.failed} failed.`,
      });
      window.dispatchEvent(new Event('members-imported'));
      window.dispatchEvent(new Event('dashboard-refresh'));
      onImported?.();
      toast.success('Membership masterlist migration completed.');
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      toast.error(error.message || 'Migration import failed.');
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Membership Masterlist Migration" size="3xl">
      <div className="space-y-5">
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Dry-run first, import second.</p>
              <p className="mt-1 text-xs leading-relaxed">
                This tool is only for the 2026 WELLServe membership masterlist format. It analyzes the workbook,
                skips blank/TOTAL rows, then imports members, memberships, CBU, savings, and beginning-balance transactions
                only after you confirm. Missing phone or email is allowed when the member has a name and payment record.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_220px]">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isAnalyzing || isImporting}
            className="flex min-h-[120px] items-center justify-center rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/40 px-4 text-center transition hover:border-emerald-400 hover:bg-emerald-50 disabled:opacity-60"
          >
            <div>
              {isAnalyzing ? (
                <Loader2 size={28} className="mx-auto animate-spin text-emerald-600" />
              ) : (
                <FileSpreadsheet size={30} className="mx-auto text-emerald-600" />
              )}
              <p className="mt-2 text-sm font-semibold text-gray-800">
                {file ? file.name : 'Upload WELLServe MEMBERSHIP MASTERLIST 2026.xlsx'}
              </p>
              <p className="mt-1 text-xs text-gray-500">Excel files only. No database changes happen during analysis.</p>
            </div>
          </button>

          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Migration Date</label>
            <input
              type="date"
              value={migrationDate}
              onChange={event => setMigrationDate(event.target.value)}
              className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              disabled={isImporting}
            />
            <p className="mt-2 text-xs text-gray-400">
              Imported beginning-balance transactions will use this date.
            </p>
          </div>
        </div>

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
              <SummaryCard label="Members" value={summary.total} sub="Rows ready" tone="green" />
              <SummaryCard label="To Create" value={summary.databasePreview?.membersToCreate || 0} sub="Not found in DB" tone="green" />
              <SummaryCard label="To Update" value={summary.databasePreview?.membersToUpdate || 0} sub="Matched existing DB rows" tone="blue" />
              <SummaryCard label="Warnings" value={analysis.warnings.length} sub="Review before import" tone={analysis.warnings.length ? 'amber' : 'gray'} />
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <SummaryCard label="Regular" value={summary.byType?.regular || 0} sub={`Sheet count: ${summary.sheetCounts?.regular || 0}`} tone="blue" />
              <SummaryCard label="Associate" value={summary.byType?.associate || 0} sub={`Sheet count: ${summary.sheetCounts?.associate || 0}`} tone="amber" />
              <SummaryCard label="Closed" value={summary.byType?.closed_account || 0} sub={`Sheet count: ${summary.sheetCounts?.closed || 0}`} tone="gray" />
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
              <SummaryCard label="Membership Paid" value={formatMoney(summary.totals.membership_paid)} />
              <SummaryCard label="CBU" value={formatMoney(summary.totals.cbu)} />
              <SummaryCard label="Savings" value={formatMoney(summary.totals.savings)} />
              <SummaryCard label="WELLife VIP" value={formatMoney(summary.totals.wellife_vip)} />
              <SummaryCard label="Total Paid" value={formatMoney(summary.totals.total_paid)} />
              <SummaryCard label="Old Package Req." value={formatMoney(summary.totals.old_package_required)} sub="Associate 1,800 / Regular 6,800" tone="amber" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 bg-white">
                <div className="border-b border-gray-100 px-4 py-3">
                  <p className="text-sm font-semibold text-gray-800">Preview Rows ({rows.length})</p>
                </div>
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-3 py-2 text-left">No.</th>
                        <th className="px-3 py-2 text-left">Member</th>
                        <th className="px-3 py-2 text-left">Type</th>
                        <th className="px-3 py-2 text-right">Old Package</th>
                        <th className="px-3 py-2 text-right">CBU</th>
                        <th className="px-3 py-2 text-right">Savings</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {previewRows.map(row => (
                        <tr key={`${row.row_no}-${row.display_name}`}>
                          <td className="px-3 py-2 text-gray-500">{row.member_no}</td>
                          <td className="px-3 py-2 font-medium text-gray-800">{row.display_name}</td>
                          <td className="px-3 py-2 capitalize text-gray-600">{row.membership_type.replace('_', ' ')}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{row.membership_type === 'closed_account' ? '-' : formatMoney(row.old_breakdown_total)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(row.cbu_balance)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(row.savings_balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white">
                <div className="border-b border-gray-100 px-4 py-3">
                  <p className="text-sm font-semibold text-gray-800">Warnings & Checks</p>
                </div>
                <div className="max-h-72 space-y-2 overflow-auto p-4">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-gray-50 p-2">Skipped blank rows: <strong>{summary.skippedBlank}</strong></div>
                    <div className="rounded-lg bg-gray-50 p-2">Skipped TOTAL rows: <strong>{summary.skippedTotals}</strong></div>
                    <div className="rounded-lg bg-gray-50 p-2">Skipped no payment: <strong>{summary.skippedNoPayment || 0}</strong></div>
                    <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">Accepted without phone: <strong>{summary.missing.phone}</strong></div>
                    <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">Accepted without email: <strong>{summary.missing.email}</strong></div>
                  </div>
                  {analysis.warnings.length === 0 ? (
                    <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
                      <CheckCircle size={16} />
                      No membership matching warnings.
                    </div>
                  ) : (
                    analysis.warnings.map((warning, index) => (
                      <div key={index} className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                        <strong>Row {warning.row}: {warning.member}</strong>
                        <p className="mt-1">{warning.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {isImporting && (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <div className="flex items-center justify-between text-sm text-emerald-800">
              <span className="font-semibold">{progress.message || 'Importing...'}</span>
              <span>{progress.current}/{progress.total}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-100">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all"
                style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {results && (
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-sm font-semibold text-gray-800">Import Results</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
              <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">Members created: <strong>{results.membersCreated}</strong></div>
              <div className="rounded-lg bg-blue-50 p-2 text-blue-700">Members updated: <strong>{results.membersUpdated}</strong></div>
              <div className="rounded-lg bg-gray-50 p-2">Accounts created: <strong>{results.accountsCreated}</strong></div>
              <div className="rounded-lg bg-gray-50 p-2">Accounts updated: <strong>{results.accountsUpdated}</strong></div>
              <div className="rounded-lg bg-gray-50 p-2">Memberships created: <strong>{results.membershipsCreated}</strong></div>
              <div className="rounded-lg bg-gray-50 p-2">Memberships updated: <strong>{results.membershipsUpdated}</strong></div>
              <div className="rounded-lg bg-gray-50 p-2">Transactions created: <strong>{results.transactionsCreated}</strong></div>
              <div className="rounded-lg bg-red-50 p-2 text-red-700">Failed rows: <strong>{results.failed}</strong></div>
            </div>
            {results.errors?.length > 0 && (
              <div className="mt-3 max-h-32 overflow-auto rounded-xl bg-red-50 p-3 text-xs text-red-700">
                {results.errors.map((error, index) => <p key={index}>{error}</p>)}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
          <Button type="button" variant="outline" onClick={handleClose} disabled={isAnalyzing || isImporting}>
            Close
          </Button>
          <Button
            type="button"
            variant="green"
            icon={isImporting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            onClick={handleImport}
            disabled={!canImport || isAnalyzing || isImporting}
          >
            Confirm Import
          </Button>
        </div>
      </div>
    </Modal>
  );
}
