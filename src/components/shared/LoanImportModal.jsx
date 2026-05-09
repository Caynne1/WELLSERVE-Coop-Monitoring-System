import { useState, useMemo } from 'react';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Info,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { formatCurrency } from '../../utils/formatters';
import {
  readExcelFile,
  parseAllSheets,
  fetchMemberLookup,
  matchMember,
  importLoans,
} from '../../services/loanImportService';

export default function LoanImportModal({ open, onClose, memberId = null, memberName = null, userId, onImported }) {
  const isMemberMode = Boolean(memberId);

  const [step, setStep] = useState('upload'); // upload | preview | result
  const [fileName, setFileName] = useState('');
  const [parsedLoans, setParsedLoans] = useState([]);
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState(null);

  function resetAll() {
    setStep('upload');
    setFileName('');
    setParsedLoans([]);
    setImporting(false);
    setParsing(false);
    setResult(null);
  }

  function handleClose() {
    resetAll();
    onClose();
  }

  // ── Upload & Parse ─────────────────────────────────────────────────────────
  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsing(true);
    setFileName(file.name);

    try {
      const wb = await readExcelFile(file);
      const loans = parseAllSheets(wb);

      if (loans.length === 0) {
        toast.error('No loan data found. Check the browser console (F12) for details. Each sheet needs "Name of Borrower:" and "Loan Principal:" labels.');
        setParsing(false);
        return;
      }

      // Match members
      if (isMemberMode) {
        loans.forEach(l => {
          l._matched_member_id = memberId;
          l._matched_member_name = memberName;
        });
      } else {
        const members = await fetchMemberLookup();
        loans.forEach(l => {
          const m = matchMember(l._borrower_name, members);
          if (m) {
            l._matched_member_id = m.id;
            l._matched_member_name = `${m.first_name} ${m.last_name}`.trim();
            l._matched_member_no = m.member_no;
          }
        });
      }

      setParsedLoans(loans);
      setStep('preview');
      toast.success(`Parsed ${loans.length} loan(s) from ${file.name}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setParsing(false);
    }
  }

  // ── Preview stats ──────────────────────────────────────────────────────────
  const matchedLoans = useMemo(() => parsedLoans.filter(l => l._matched_member_id), [parsedLoans]);
  const unmatchedLoans = useMemo(() => parsedLoans.filter(l => !l._matched_member_id), [parsedLoans]);
  const totalAmount = useMemo(() => matchedLoans.reduce((s, l) => s + (l.amount || 0), 0), [matchedLoans]);
  const totalCashOut = useMemo(() => matchedLoans.reduce((s, l) => s + (l._excel_total_cash_out || 0), 0), [matchedLoans]);
  const totalInterestEarned = useMemo(() => matchedLoans.reduce((s, l) => s + (l._excel_total_interest_earned || 0), 0), [matchedLoans]);

  function removeLoan(idx) {
    setParsedLoans(prev => prev.filter((_, i) => i !== idx));
  }

  // ── Import ─────────────────────────────────────────────────────────────────
  async function handleImport() {
    if (matchedLoans.length === 0) {
      toast.error('No matched loans to import.');
      return;
    }

    setImporting(true);
    try {
      const res = await importLoans({
        loans: parsedLoans.filter(l => l._matched_member_id),
        fixedMemberId: isMemberMode ? memberId : null,
        userId,
      });
      setResult(res);
      setStep('result');
      if (res.imported > 0) {
        toast.success(`${res.imported} loan(s) imported!`);
        onImported?.();
      }
    } catch (err) {
      toast.error('Import failed: ' + err.message);
    } finally {
      setImporting(false);
    }
  }

  // ── Expand row ─────────────────────────────────────────────────────────────
  const [expandedIdx, setExpandedIdx] = useState(null);

  return (
    <Modal open={open} onClose={handleClose} title="Import Loans from Excel" size="xl">
      <div className="min-h-[380px]">

        {/* ── STEP: Upload ── */}
        {step === 'upload' && (
          <div className="space-y-5">
            <label className={`flex flex-col items-center justify-center gap-3 p-12 border-2 border-dashed rounded-2xl cursor-pointer transition-colors ${
              parsing
                ? 'border-gray-300 bg-gray-50'
                : 'border-gray-200 bg-gray-50/50 hover:border-[#07A04E] hover:bg-emerald-50/30'
            }`}>
              {parsing ? (
                <>
                  <Loader2 size={36} className="text-[#07A04E] animate-spin" />
                  <p className="text-sm font-medium text-gray-600">Reading & parsing sheets...</p>
                </>
              ) : (
                <>
                  <FileSpreadsheet size={36} className="text-gray-300" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-600">
                      {fileName || 'Click to upload your Loan Excel file'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">.xlsx or .xls — each sheet = one borrower</p>
                  </div>
                </>
              )}
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} disabled={parsing} />
            </label>

            {isMemberMode && (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                <Info size={13} className="flex-shrink-0" />
                All imported loans will be assigned to <strong>{memberName}</strong>.
              </div>
            )}

            <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              <Info size={13} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium mb-1">Expected format:</p>
                <p>Each sheet should be one member's loan amortization — with <strong>"Name of Borrower:"</strong> in row 4, <strong>"Loan Principal:"</strong> in row 5, and the amortization table below.</p>
                <p className="mt-1 text-amber-600">The system will auto-read the borrower name, loan details, deductions, schedule, and match each to a member in the database.</p>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: Preview ── */}
        {step === 'preview' && (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
              <div className="bg-blue-50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-blue-500 font-medium uppercase tracking-wide">Sheets</p>
                <p className="text-xl font-bold text-blue-800">{parsedLoans.length}</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-emerald-500 font-medium uppercase tracking-wide">Matched</p>
                <p className="text-xl font-bold text-emerald-800">{matchedLoans.length}</p>
              </div>
              <div className={`rounded-xl p-3 text-center ${unmatchedLoans.length > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                <p className={`text-[10px] font-medium uppercase tracking-wide ${unmatchedLoans.length > 0 ? 'text-red-500' : 'text-gray-400'}`}>Unmatched</p>
                <p className={`text-xl font-bold ${unmatchedLoans.length > 0 ? 'text-red-700' : 'text-gray-300'}`}>{unmatchedLoans.length}</p>
              </div>
              <div className="bg-violet-50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-violet-500 font-medium uppercase tracking-wide">Loan Principal</p>
                <p className="text-xs font-bold text-violet-800 mt-0.5">{formatCurrency(totalAmount)}</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-amber-500 font-medium uppercase tracking-wide">Total Cash Out</p>
                <p className="text-xs font-bold text-amber-800 mt-0.5">{totalCashOut > 0 ? formatCurrency(totalCashOut) : '—'}</p>
              </div>
              <div className="bg-teal-50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-teal-500 font-medium uppercase tracking-wide">Interest Earned</p>
                <p className="text-xs font-bold text-teal-800 mt-0.5">{totalInterestEarned > 0 ? formatCurrency(totalInterestEarned) : '—'}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Paid / Active</p>
                <p className="text-xs font-bold text-gray-700 mt-0.5">
                  {matchedLoans.filter(l => l.status === 'paid').length} / {matchedLoans.filter(l => l.status === 'active').length}
                </p>
              </div>
            </div>

            {unmatchedLoans.length > 0 && !isMemberMode && (
              <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                <span>
                  {unmatchedLoans.length} loan(s) couldn't match a member — make sure the borrower name in Excel matches the member's name in the system. Unmatched loans will be skipped.
                </span>
              </div>
            )}

            {/* Loan cards */}
            <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
              {parsedLoans.map((loan, idx) => {
                const isMatched = Boolean(loan._matched_member_id);
                const isExpanded = expandedIdx === idx;
                const paidCount = loan._schedule?.filter(s => s.paid).length || 0;
                const totalPeriods = loan._schedule?.length || 0;

                return (
                  <div
                    key={idx}
                    className={`rounded-xl border transition-colors ${
                      isMatched ? 'border-gray-100 bg-white' : 'border-red-200 bg-red-50/40'
                    }`}
                  >
                    {/* Card header */}
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                      onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isMatched ? 'bg-emerald-100' : 'bg-red-100'
                      }`}>
                        {isMatched ? <CheckCircle size={14} className="text-emerald-600" /> : <XCircle size={14} className="text-red-500" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-800 truncate">{loan._borrower_name}</p>
                          <span className="text-[10px] text-gray-400">({loan._sheet_name})</span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                          {isMatched ? (
                            <span className="text-emerald-600 font-medium">→ {loan._matched_member_name}</span>
                          ) : (
                            <span className="text-red-500">No member match</span>
                          )}
                          <span>•</span>
                          <span className="capitalize">{loan.repayment_frequency?.replace('_', '-')}</span>
                          <span>•</span>
                          <span>{totalPeriods} periods ({paidCount} paid)</span>
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-gray-800">{formatCurrency(loan.amount)}</p>
                        <p className="text-xs text-gray-400">
                          Bal: {formatCurrency(loan.balance)}
                        </p>
                      </div>

                      <button
                        onClick={e => { e.stopPropagation(); removeLoan(idx); }}
                        className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0 ml-1"
                        title="Remove"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="px-4 pb-3 border-t border-gray-100">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 py-3 text-xs">
                          <div><span className="text-gray-400">Term:</span> <span className="font-medium">{loan.term_months || '—'} months</span></div>
                          <div><span className="text-gray-400">Monthly Rate:</span> <span className="font-medium">{loan.interest_rate ? `${(loan.interest_rate / 12).toFixed(2)}%` : '—'}</span></div>
                          <div><span className="text-gray-400">Amort/Period:</span> <span className="font-medium">{formatCurrency(loan.monthly_amortization || 0)}</span></div>
                          <div><span className="text-gray-400">Frequency:</span> <span className="font-medium capitalize">{loan.repayment_frequency?.replace('_', '-')}</span></div>
                          <div><span className="text-gray-400">Release:</span> <span className="font-medium">{loan.release_date || '—'}</span></div>
                          <div><span className="text-gray-400">No. of Payments:</span> <span className="font-medium">{loan._num_payments || loan._schedule?.length || '—'}</span></div>
                          <div><span className="text-gray-400">Status:</span>{' '}
                            <Badge variant={loan.status === 'paid' ? 'info' : loan.status === 'active' ? 'success' : 'warning'}>
                              {loan.status}
                            </Badge>
                          </div>
                          <div><span className="text-gray-400">Net Proceeds:</span> <span className="font-medium text-emerald-700">{formatCurrency(loan._excel_total_cash_out || loan._net_proceeds || 0)}</span></div>
                        </div>

                        {/* Excel Header Totals */}
                        <div className="py-2 border-t border-gray-50">
                          <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1">Loan Totals (from Excel)</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs">
                            <span><span className="text-gray-400">Principal:</span> <strong>{formatCurrency(loan._excel_total_principal || loan.amount)}</strong></span>
                            <span><span className="text-gray-400">Interest Earned:</span> <strong className="text-emerald-700">{formatCurrency(loan._excel_total_interest_earned || 0)}</strong></span>
                            <span><span className="text-gray-400">Total Payments:</span> <strong>{formatCurrency(loan._excel_total_payments_collected || 0)}</strong></span>
                            <span><span className="text-gray-400">Total ROI:</span> <strong>{loan._excel_total_roi_percent ? `${loan._excel_total_roi_percent}%` : '—'}</strong></span>
                          </div>
                        </div>

                        {/* Deductions */}
                        {(loan.service_fee || loan.share_capital || loan.loan_insurance || loan.regular_savings) && (
                          <div className="py-2 border-t border-gray-50">
                            <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1">Deductions</p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                              {loan.service_fee ? <span>Service Fee: <strong>{formatCurrency(loan.service_fee)}</strong></span> : null}
                              {loan.share_capital ? <span>Share Capital: <strong>{formatCurrency(loan.share_capital)}</strong></span> : null}
                              {loan.loan_insurance ? <span>Insurance: <strong>{formatCurrency(loan.loan_insurance)}</strong></span> : null}
                              {loan.regular_savings ? <span>Savings: <strong>{formatCurrency(loan.regular_savings)}</strong></span> : null}
                            </div>
                          </div>
                        )}

                        {/* CBU & Savings collected */}
                        {(loan._total_cbu_collected > 0 || loan._total_savings_collected > 0) && (
                          <div className="py-2 border-t border-gray-50">
                            <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1">CBU & Savings Collected (will be recorded as deposits)</p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                              {loan._total_cbu_collected > 0 && <span>Total CBU: <strong className="text-blue-700">{formatCurrency(loan._total_cbu_collected)}</strong></span>}
                              {loan._total_savings_collected > 0 && <span>Total Savings: <strong className="text-emerald-700">{formatCurrency(loan._total_savings_collected)}</strong></span>}
                            </div>
                          </div>
                        )}

                        {/* Mini schedule preview */}
                        {loan._schedule && loan._schedule.length > 0 && (
                          <div className="py-2 border-t border-gray-50">
                            <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1">
                              Amortization Schedule ({paidCount}/{totalPeriods} paid)
                            </p>
                            <div className="max-h-[150px] overflow-y-auto">
                              <table className="w-full text-[11px]">
                                <thead>
                                  <tr className="text-gray-400">
                                    <th className="text-left py-1 pr-2">#</th>
                                    <th className="text-left py-1 pr-2">Due Date</th>
                                    <th className="text-right py-1 pr-2">Principal</th>
                                    <th className="text-right py-1 pr-2">Interest</th>
                                    <th className="text-right py-1 pr-2">Total</th>
                                    <th className="text-right py-1 pr-2">Balance</th>
                                    <th className="text-right py-1 pr-2">CBU</th>
                                    <th className="text-right py-1 pr-2">Savings</th>
                                    <th className="text-center py-1">Paid</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {loan._schedule.map(row => (
                                    <tr key={row.period} className={row.paid ? 'text-gray-400' : 'text-gray-700'}>
                                      <td className="py-0.5 pr-2">{row.period}</td>
                                      <td className="py-0.5 pr-2">{row.due_date || '—'}</td>
                                      <td className="py-0.5 pr-2 text-right">{formatCurrency(row.principal)}</td>
                                      <td className="py-0.5 pr-2 text-right">{formatCurrency(row.interest)}</td>
                                      <td className="py-0.5 pr-2 text-right font-medium">{formatCurrency(row.payment)}</td>
                                      <td className="py-0.5 pr-2 text-right">{formatCurrency(row.balance)}</td>
                                      <td className="py-0.5 pr-2 text-right text-blue-600">{row.cbu_paid ? formatCurrency(row.cbu_paid) : '—'}</td>
                                      <td className="py-0.5 pr-2 text-right text-emerald-600">{row.savings_paid ? formatCurrency(row.savings_paid) : '—'}</td>
                                      <td className="py-0.5 text-center">
                                        {row.paid
                                          ? <CheckCircle size={11} className="text-emerald-500 inline" />
                                          : <span className="text-gray-300">—</span>
                                        }
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" onClick={() => { resetAll(); }}>
                Back
              </Button>
              <div className="flex items-center gap-3">
                <p className="text-xs text-gray-400">
                  {matchedLoans.length} loan(s) · {formatCurrency(totalAmount)}
                </p>
                <Button
                  onClick={handleImport}
                  loading={importing}
                  disabled={matchedLoans.length === 0}
                  variant="green"
                  icon={<Upload size={14} />}
                >
                  Import {matchedLoans.length} Loan{matchedLoans.length !== 1 ? 's' : ''}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: Result ── */}
        {step === 'result' && result && (
          <div className="space-y-5">
            <div className="flex flex-col items-center text-center py-8">
              {result.imported > 0 ? (
                <CheckCircle size={48} className="text-emerald-500 mb-3" />
              ) : (
                <AlertCircle size={48} className="text-amber-500 mb-3" />
              )}
              <h3 className="text-lg font-bold text-gray-800">
                {result.imported > 0 ? 'Import Complete!' : 'No Loans Imported'}
              </h3>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                <span className="flex items-center gap-1"><CheckCircle size={13} className="text-emerald-500" /> {result.imported} imported</span>
                <span className="flex items-center gap-1"><XCircle size={13} className="text-gray-400" /> {result.skipped} skipped</span>
                {result.duplicates > 0 && (
                  <span className="flex items-center gap-1"><AlertCircle size={13} className="text-amber-500" /> {result.duplicates} duplicate{result.duplicates !== 1 ? 's' : ''}</span>
                )}
              </div>
            </div>

            {result.errors?.length > 0 && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl max-h-[160px] overflow-y-auto">
                <p className="text-xs font-semibold text-red-700 mb-2">Errors & Skipped:</p>
                {result.errors.map((err, i) => (
                  <p key={i} className="text-xs text-red-600">
                    {err.sheet} ({err.borrower}): {err.error}
                  </p>
                ))}
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={handleClose} variant="green">Done</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}