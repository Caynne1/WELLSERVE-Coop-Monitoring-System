import { useState, useRef } from 'react';
import {
  Upload,
  X,
  Users,
  CheckCircle,
  AlertCircle,
  Loader2,
  FileSpreadsheet,
  Download,
  Info,
  ChevronDown,
  ChevronUp,
  SkipForward,
  RefreshCcw,
} from 'lucide-react';

import toast from 'react-hot-toast';

import { useAuth } from '../../context/AuthContext';

import { trackActivity } from '../../services/logService';

import {
  parseImportFile,
  batchImportMembers,
  downloadImportTemplate,
} from '../../services/memberImportService';

// ─────────────────────────────────────────────────────────────
// SMALL STAT CARD
// ─────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color = 'gray',
  sub,
}) {
  const colors = {
    green:
      'bg-[#f0fdf4] border-[#bbf7d0] text-[#07A04E]',
    blue:
      'bg-blue-50 border-blue-200 text-blue-700',
    purple:
      'bg-purple-50 border-purple-200 text-purple-700',
    amber:
      'bg-amber-50 border-amber-200 text-amber-700',
    red:
      'bg-red-50 border-red-200 text-red-700',
    gray:
      'bg-gray-50 border-gray-200 text-gray-600',
  };

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl border ${colors[color]}`}
    >
      <span className="text-2xl font-bold">
        {value}
      </span>

      <div>
        <p className="text-xs font-semibold">
          {label}
        </p>

        {sub && (
          <p className="text-[11px] opacity-70 mt-0.5">
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ERROR LIST
// ─────────────────────────────────────────────────────────────

function ErrorList({
  title,
  errors,
  colorClass = 'red',
}) {
  const [open, setOpen] = useState(false);

  if (!errors?.length) return null;

  const cls =
    colorClass === 'amber'
      ? 'bg-amber-50 border-amber-100 text-amber-700'
      : 'bg-red-50 border-red-100 text-red-700';

  return (
    <div
      className={`p-3 border rounded-xl ${cls}`}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between"
      >
        <span className="text-xs font-semibold">
          {title} ({errors.length})
        </span>

        {open ? (
          <ChevronUp size={14} />
        ) : (
          <ChevronDown size={14} />
        )}
      </button>

      {open && (
        <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
          {errors.map((e, i) => (
            <li
              key={i}
              className="text-[11px]"
            >
              {typeof e === 'string'
                ? e
                : `Row ${e.row}${
                    e.sheet
                      ? ` [${e.sheet}]`
                      : ''
                  }: ${e.errors?.join(', ')}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAPPED FIELD BADGES
// ─────────────────────────────────────────────────────────────

function MappedFieldsBadge({ fields }) {
  const [show, setShow] = useState(false);

  if (!fields?.length) return null;

  return (
    <div>
      <button
        onClick={() => setShow(v => !v)}
        className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1"
      >
        {show ? (
          <ChevronUp size={11} />
        ) : (
          <ChevronDown size={11} />
        )}

        {fields.length} columns detected
      </button>

      {show && (
        <div className="flex flex-wrap gap-1 mt-2">
          {fields.map(field => (
            <span
              key={field}
              className="px-2 py-1 rounded-md text-[10px] font-medium bg-[#D6FADC] text-[#07A04E]"
            >
              {field}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

export default function ImportMembersModal({
  onClose,
  onImported,
}) {
  const { user } = useAuth();

  const fileInputRef = useRef(null);

  const [step, setStep] =
    useState('upload');

  const [fileName, setFileName] =
    useState('');

  const [parseResult, setParseResult] =
    useState(null);

  const [progress, setProgress] =
    useState(0);

  const [progressMsg, setProgressMsg] =
    useState('');

  const [results, setResults] =
    useState(null);

  const [isParsing, setIsParsing] =
    useState(false);

  const members =
    parseResult?.members ?? [];

  const parseErrors =
    parseResult?.validationErrors ?? [];

  const duplicatesInFile =
    parseResult?.duplicatesInFile ?? 0;

  const totalDetected =
    parseResult?.totalDetected ?? 0;

  const regularCount =
    parseResult?.regularCount ?? 0;

  const associateCount =
    parseResult?.associateCount ?? 0;

  const mappedFields =
    parseResult?.mappedFields ?? [];

  // ─────────────────────────────────────────────────────────────
  // FILE CHANGE
  // ─────────────────────────────────────────────────────────────

  async function handleFileChange(e) {
    const file =
      e.target.files?.[0];

    if (!file) return;

    const ext = file.name
      .split('.')
      .pop()
      .toLowerCase();

    if (
      !['xlsx', 'xls', 'csv'].includes(ext)
    ) {
      toast.error(
        'Unsupported file type.'
      );

      return;
    }

    setFileName(file.name);

    setIsParsing(true);

    try {
      const result =
        await parseImportFile(file);

      setParseResult(result);

      setStep('preview');

      toast.success(
        `${result.members.length} members detected`
      );
    } catch (err) {
      toast.error(err.message, {
        duration: 8000,
      });
    } finally {
      setIsParsing(false);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // DROP
  // ─────────────────────────────────────────────────────────────

  function handleDrop(e) {
    e.preventDefault();

    const file =
      e.dataTransfer.files?.[0];

    if (file) {
      handleFileChange({
        target: {
          files: [file],
        },
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // IMPORT
  // ─────────────────────────────────────────────────────────────

  async function handleImport() {
    setStep('importing');

    setProgress(0);

    try {
      const importResults =
        await batchImportMembers(
          members,
          (
            current,
            total,
            message
          ) => {
            setProgress(
              total > 0
                ? Math.round(
                    (current / total) *
                      100
                  )
                : 0
            );

            setProgressMsg(message);
          }
        );

      await trackActivity({
        user_id: user?.id,

        action: 'import_members',

        details: `
          Imported from "${fileName}"
          | Created: ${importResults.created}
          | Updated: ${importResults.updated}
          | Failed: ${importResults.failed}
        `,
      });

      setResults(importResults);

      setStep('done');

      window.dispatchEvent(
        new Event('members-imported')
      );

      onImported?.();

      toast.success(
        'Import completed successfully.'
      );
    } catch (err) {
      toast.error(
        'Import failed: ' +
          err.message
      );

      setStep('preview');
    }
  }

  // ─────────────────────────────────────────────────────────────
  // RESET
  // ─────────────────────────────────────────────────────────────

  function resetUpload() {
    setStep('upload');

    setParseResult(null);

    setFileName('');

    setResults(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  // ─────────────────────────────────────────────────────────────
  // UI
  // ─────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onDragOver={e =>
        e.preventDefault()
      }
      onDrop={
        step === 'upload'
          ? handleDrop
          : undefined
      }
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[95vh] flex flex-col">

        {/* HEADER */}

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#D6FADC] flex items-center justify-center">
              <Users
                size={20}
                className="text-[#07A04E]"
              />
            </div>

            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Import Members
              </h2>

              <p className="text-xs text-gray-500">
                Supports messy Excel,
                CSV, multi-header,
                merged cells
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={
              step === 'importing'
            }
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        {/* BODY */}

        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* UPLOAD */}

          {step === 'upload' && (
            <div className="space-y-5">

              {/* INFO */}

              <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                <div className="flex gap-3">
                  <Info
                    size={18}
                    className="text-blue-500 mt-0.5"
                  />

                  <div>
                    <p className="text-sm font-semibold text-blue-700">
                      Smart Flexible Import
                    </p>

                    <ul className="mt-2 text-xs text-blue-600 space-y-1">
                      <li>
                        • Supports messy
                        Excel formats
                      </li>

                      <li>
                        • Detects merged
                        headers
                      </li>

                      <li>
                        • Auto-detects
                        columns
                      </li>

                      <li>
                        • Prevents
                        incorrect mapping
                      </li>

                      <li>
                        • Imports all
                        valid rows
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* TEMPLATE */}

              <button
                onClick={
                  downloadImportTemplate
                }
                className="w-full flex items-center justify-between px-4 py-3 border border-[#07A04E]/20 bg-[#f0fdf4] rounded-xl hover:bg-[#D6FADC]"
              >
                <div className="flex items-center gap-3">
                  <FileSpreadsheet
                    size={18}
                    className="text-[#07A04E]"
                  />

                  <div className="text-left">
                    <p className="text-sm font-semibold">
                      Download Import
                      Template
                    </p>

                    <p className="text-xs text-gray-500">
                      Optional
                      structured
                      template
                    </p>
                  </div>
                </div>

                <Download
                  size={16}
                  className="text-[#07A04E]"
                />
              </button>

              {/* DROPZONE */}

              <div
                onClick={() =>
                  !isParsing &&
                  fileInputRef.current?.click()
                }
                className={`border-2 border-dashed rounded-2xl p-16 flex flex-col items-center justify-center gap-4 transition-all ${
                  isParsing
                    ? 'border-[#07A04E] bg-[#f0fdf4]'
                    : 'border-gray-200 hover:border-[#07A04E] hover:bg-[#f0fdf4] cursor-pointer'
                }`}
              >
                <div className="w-16 h-16 rounded-2xl bg-[#D6FADC] flex items-center justify-center">
                  {isParsing ? (
                    <Loader2
                      size={28}
                      className="text-[#07A04E] animate-spin"
                    />
                  ) : (
                    <Upload
                      size={28}
                      className="text-[#07A04E]"
                    />
                  )}
                </div>

                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-700">
                    {isParsing
                      ? 'Analyzing file...'
                      : 'Click or drag file here'}
                  </p>

                  <p className="text-xs text-gray-400 mt-1">
                    XLSX · XLS · CSV
                  </p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={
                    handleFileChange
                  }
                />
              </div>
            </div>
          )}

          {/* PREVIEW */}

          {step === 'preview' && (
            <div className="space-y-4">

              {/* FILE */}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <FileSpreadsheet
                    size={15}
                    className="text-[#07A04E]"
                  />

                  <span className="font-medium">
                    {fileName}
                  </span>
                </div>

                <button
                  onClick={
                    resetUpload
                  }
                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                  <RefreshCcw size={12} />
                  Change File
                </button>
              </div>

              {/* STATS */}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard
                  label="Detected"
                  value={
                    totalDetected
                  }
                  color="gray"
                  sub="rows"
                />

                <StatCard
                  label="Ready"
                  value={
                    members.length
                  }
                  color="green"
                  sub="valid"
                />

                <StatCard
                  label="Regular"
                  value={
                    regularCount
                  }
                  color="blue"
                />

                <StatCard
                  label="Associate"
                  value={
                    associateCount
                  }
                  color="purple"
                />
              </div>

              {/* DUP */}

              {duplicatesInFile >
                0 && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl">
                  <SkipForward
                    size={12}
                  />

                  {
                    duplicatesInFile
                  }{' '}
                  duplicates removed
                </div>
              )}

              {/* MAPPED */}

              <MappedFieldsBadge
                fields={
                  mappedFields
                }
              />

              {/* ERRORS */}

              <ErrorList
                title="Skipped Rows"
                errors={
                  parseErrors
                }
                colorClass="amber"
              />

              {/* TABLE */}

              <div className="border border-gray-100 rounded-xl overflow-auto max-h-[500px]">
                <table className="w-full text-xs min-w-[1400px]">
                  <thead className="bg-gray-50 sticky top-0 z-10 border-b border-gray-100">
                    <tr>
                      {[
                        '#',
                        'Member No',
                        'Last Name',
                        'First Name',
                        'MI',
                        'DOB',
                        'Date Joined',
                        'Civil Status',
                        'Sex',
                        'Occupation',
                        'Phone',
                        'Telephone',
                        'Email',
                        'TIN',
                        'SSS',
                        'Recruiter',
                        'Membership',
                        'Total Paid',
                        'Type',
                        'Status',
                      ].map(h => (
                        <th
                          key={h}
                          className="px-3 py-2 text-left whitespace-nowrap font-semibold text-gray-600"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {members.map(
                      (m, i) => (
                        <tr
                          key={i}
                          className={
                            i % 2 === 0
                              ? 'bg-white'
                              : 'bg-gray-50/60'
                          }
                        >
                          <td className="px-3 py-2">
                            {i + 1}
                          </td>

                          <td className="px-3 py-2">
                            {
                              m.member_no
                            }
                          </td>

                          <td className="px-3 py-2 font-semibold">
                            {
                              m.last_name
                            }
                          </td>

                          <td className="px-3 py-2">
                            {
                              m.first_name
                            }
                          </td>

                          <td className="px-3 py-2">
                            {
                              m.middle_initial
                            }
                          </td>

                          <td className="px-3 py-2">
                            {
                              m.date_of_birth
                            }
                          </td>

                          <td className="px-3 py-2">
                            {
                              m.date_joined
                            }
                          </td>

                          <td className="px-3 py-2">
                            {
                              m.civil_status
                            }
                          </td>

                          <td className="px-3 py-2">
                            {m.sex}
                          </td>

                          <td className="px-3 py-2">
                            {
                              m.occupation
                            }
                          </td>

                          <td className="px-3 py-2">
                            {
                              m.phone
                            }
                          </td>

                          <td className="px-3 py-2">
                            {
                              m.res_tel_no
                            }
                          </td>

                          <td className="px-3 py-2">
                            {
                              m.email
                            }
                          </td>

                          <td className="px-3 py-2">
                            {
                              m.tin_no
                            }
                          </td>

                          <td className="px-3 py-2">
                            {
                              m.sss_id_no
                            }
                          </td>

                          <td className="px-3 py-2">
                            {
                              m.recruiter_name
                            }
                          </td>

                          <td className="px-3 py-2">
                            ₱
                            {Number(
                              m.membership_paid ||
                                0
                            ).toLocaleString()}
                          </td>

                          <td className="px-3 py-2">
                            ₱
                            {Number(
                              m.total_paid ||
                                0
                            ).toLocaleString()}
                          </td>

                          <td className="px-3 py-2">
                            <span className="px-2 py-1 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">
                              {
                                m.membership_type
                              }
                            </span>
                          </td>

                          <td className="px-3 py-2">
                            <span
                              className={`px-2 py-1 rounded-full text-[10px] font-semibold ${
                                m.status ===
                                'active'
                                  ? 'bg-[#D6FADC] text-[#07A04E]'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {
                                m.status
                              }
                            </span>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* IMPORTING */}

          {step ===
            'importing' && (
            <div className="flex flex-col items-center justify-center gap-6 py-16">
              <div className="w-16 h-16 rounded-2xl bg-[#D6FADC] flex items-center justify-center">
                <Loader2
                  size={28}
                  className="text-[#07A04E] animate-spin"
                />
              </div>

              <div className="text-center">
                <p className="text-sm font-semibold">
                  Importing
                  members...
                </p>

                <p className="text-xs text-gray-400 mt-1">
                  {progressMsg}
                </p>
              </div>

              <div className="w-80">
                <div className="flex justify-between text-xs mb-2">
                  <span>
                    Progress
                  </span>

                  <span>
                    {progress}%
                  </span>
                </div>

                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#07A04E] transition-all"
                    style={{
                      width: `${progress}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* DONE */}

          {step === 'done' &&
            results && (
              <div className="space-y-5">

                <div className="flex items-start gap-3 p-4 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl">
                  <CheckCircle
                    size={22}
                    className="text-[#07A04E]"
                  />

                  <div>
                    <p className="font-semibold">
                      Import Complete
                    </p>

                    <p className="text-xs text-gray-500 mt-1">
                      Dashboard,
                      reports, tabs,
                      analytics, and
                      member lists
                      have been
                      refreshed.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard
                    label="Created"
                    value={
                      results.created
                    }
                    color="green"
                  />

                  <StatCard
                    label="Updated"
                    value={
                      results.updated
                    }
                    color="blue"
                  />

                  <StatCard
                    label="Skipped"
                    value={
                      results.skipped
                    }
                    color="amber"
                  />

                  <StatCard
                    label="Failed"
                    value={
                      results.failed
                    }
                    color="red"
                  />
                </div>

                <ErrorList
                  title="Import Errors"
                  errors={
                    results.errors
                  }
                />
              </div>
            )}
        </div>

        {/* FOOTER */}

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <div className="text-xs text-gray-500">
            {step ===
              'preview' && (
              <>
                {
                  members.length
                }{' '}
                members ready
                for import
              </>
            )}
          </div>

          <div className="flex gap-3">
            {step !==
              'importing' &&
              step !==
                'done' && (
                <button
                  onClick={
                    onClose
                  }
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
              )}

            {step ===
              'preview' &&
              members.length >
                0 && (
                <button
                  onClick={
                    handleImport
                  }
                  className="flex items-center gap-2 px-5 py-2 bg-[#07A04E] hover:bg-[#06923f] text-white text-sm font-semibold rounded-xl"
                >
                  <Users
                    size={15}
                  />

                  Import{' '}
                  {
                    members.length
                  }{' '}
                  Members
                </button>
              )}

            {step ===
              'done' && (
              <button
                onClick={
                  onClose
                }
                className="flex items-center gap-2 px-5 py-2 bg-[#07A04E] hover:bg-[#06923f] text-white text-sm font-semibold rounded-xl"
              >
                <CheckCircle
                  size={15}
                />

                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}