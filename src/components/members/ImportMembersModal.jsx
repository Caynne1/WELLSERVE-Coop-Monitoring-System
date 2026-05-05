import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload, X, Users, CheckCircle, AlertCircle,
  Loader2, FileSpreadsheet, Download, Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { createMember, updateMember, getMembers, initializeMemberAccounts } from '../../services/memberService';
import { useAuth } from '../../context/AuthContext';
import { trackActivity } from '../../services/logService';

// ─────────────────────────────────────────────────────────────────────────────
// Template download
// ─────────────────────────────────────────────────────────────────────────────

const TEMPLATE_HEADERS = [
  'member_no','first_name','last_name','middle_initial',
  'email','phone','address','status','membership_type',
  'date_of_birth','civil_status','sex','occupation',
  'tin_no','sss_id_no','res_tel_no','date_joined',
  'beneficiary_name','beneficiary_address','beneficiary_tel',
  'recruiter_name','notes','record_type',
];

function downloadTemplate() {
  const wb = XLSX.utils.book_new();
  const wsInfo = XLSX.utils.aoa_to_sheet([
    ['WELLSERVE Coop — Members Import Template'],
    [''],
    ['INSTRUCTIONS:'],
    ['1. Fill member data starting from Row 4 in the "Members" sheet.'],
    ['2. Do NOT change column headers in Row 3.'],
    ['3. Required fields: member_no, first_name, last_name'],
    ['4. member_no must be unique.'],
    ['5. Date format: YYYY-MM-DD (e.g. 1990-01-15)'],
    ['6. status: active | inactive | suspended  (default: active)'],
    ['7. membership_type: associate | regular  (default: associate)'],
    ['8. record_type: new_member | old_member  (default: new_member)'],
  ]);
  wsInfo['!cols'] = [{ wch: 70 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Instructions');

  const wsData = XLSX.utils.aoa_to_sheet([
    ['WELLSERVE SAVINGS AND CREDIT COOPERATIVE — Members Import', ...Array(TEMPLATE_HEADERS.length - 1).fill('')],
    Array(TEMPLATE_HEADERS.length).fill(''),
    TEMPLATE_HEADERS,
    ['MEM-001','Juan','Dela Cruz','S','juan@email.com','09171234567',
     'Brgy. Sample, Ormoc City','active','associate','1990-01-15',
     'Single','Male','Teacher','123-456-789','01-2345678-9','',
     '2024-01-01','Maria Dela Cruz','Brgy. Sample, Ormoc City',
     '09179876543','Pedro Santos','','new_member'],
  ]);
  wsData['!cols'] = TEMPLATE_HEADERS.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, wsData, 'Members');
  XLSX.writeFile(wb, 'WELLSERVE_Members_Import_Template.xlsx');
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDateValue(val) {
  if (!val && val !== 0) return '';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    return val.toISOString().split('T')[0];
  }
  if (typeof val === 'number') {
    const fixed = val > 59 ? val - 1 : val;
    const date = new Date(Date.UTC(1900, 0, 1) + (fixed - 1) * 86400000);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  }
  const s = String(val).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
}

function normalizePhone(val) {
  if (!val && val !== 0) return '';
  const s = String(val).trim().replace(/[^\d+]/g, '');
  if (!s) return '';
  if (s.length === 10 && s.startsWith('9')) return '0' + s;
  return s;
}

/**
 * Normalise a raw STATUS cell value to 'regular' | 'associate' | null.
 * Returns null when the row should be SKIPPED (e.g. "MEMBERSHIP FEE ONLY").
 * Falls back to the provided default when status is empty/unrecognised.
 */
function normalizeMembershipType(rawStatus, defaultType) {
  if (!rawStatus) return defaultType;
  const s = String(rawStatus).trim().toUpperCase();

  // Members who only paid membership fee — not full members yet, skip them
  if (
    s.includes('MEMBERSHIP') &&
    !s.includes('REGULAR') &&
    !s.includes('ASSOCIATE')
  ) return null;                      // ← signal to skip this row

  if (s === 'TOTAL PAID') return null; // data noise, skip

  if (s.includes('REGULAR'))   return 'regular';
  if (s.includes('ASSOCIATE')) return 'associate';
  if (s === 'PROMO')           return 'associate';

  // Unrecognised but non-empty status → fall back to sheet default
  return defaultType;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main parser
//
// Supports two formats:
//   FORMAT A — template  (header row contains member_no / first_name / last_name)
//   FORMAT B — WELLSERVE native (header row contains SURNAME + GIVEN NAME / FIRSTNAME)
//
// For FORMAT B, column positions are detected DYNAMICALLY relative to SURNAME,
// so it handles both the standard layout (SURNAME at col 1) and shifted layouts
// like " MEMBERS OF COOP WITH PAYMENT" (SURNAME at col 5).
//
// Membership type is resolved in this priority order:
//   1. STATUS column value in the sheet  (REGULAR → regular, ASSOCIATE → associate)
//   2. Sheet name hint                   ("REGULAR" → regular)
//   3. Default                           → associate
// ─────────────────────────────────────────────────────────────────────────────

function parseFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), {
          type: 'array',
          cellDates: true,
        });

        // ── FORMAT A: template ────────────────────────────────────────────
        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName];
          const all = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
          const hIdx = all.findIndex(row =>
            ['member_no','first_name','last_name'].every(h =>
              row.map(c => String(c).trim().toLowerCase()).includes(h)
            )
          );
          if (hIdx !== -1) {
            const headers = all[hIdx].map(c => String(c).trim().toLowerCase());
            const dataRows = all.slice(hIdx + 1)
              .filter(row => row.some(c => String(c).trim() !== ''))
              .map((row, i) => {
                const obj = { _row: hIdx + i + 2, _sheet: sheetName };
                headers.forEach((h, idx) => { obj[h] = String(row[idx] ?? '').trim(); });
                return obj;
              });
            if (dataRows.length > 0) return resolve(buildFromTemplate(dataRows, sheetName));
          }
        }

        // ── FORMAT B: WELLSERVE native ────────────────────────────────────
        const allParsed = [];
        let memberCounter = 1;
        let skippedFeeOnly = 0;

        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName];
          const all = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

          // Find header row containing SURNAME
          const hIdx = all.findIndex(row => {
            const cells = row.map(c => String(c ?? '').trim().toUpperCase());
            const hasSurname = cells.includes('SURNAME');
            const hasFirstName = cells.some(c => c === 'GIVEN NAME' || c === 'FIRSTNAME' || c === 'FIRST NAME');
            return hasSurname && hasFirstName;
          });
          if (hIdx === -1) continue;

          // Positions of key columns in the header row
          const hRow = all[hIdx].map(c => String(c ?? '').trim().toUpperCase());
          const surnameIdx = hRow.findIndex(c => c === 'SURNAME');
          if (surnameIdx === -1) continue;

          // Row-number column is always the cell directly before SURNAME
          const noIdx = surnameIdx - 1;
          if (noIdx < 0) continue;

          // ── Default membership type from sheet name ──────────────────
          const sheetUpper = sheetName.trim().toUpperCase();
          let defaultType = 'associate';
          if (sheetUpper.includes('REGULAR') && !sheetUpper.includes('ASSOCIATE')) {
            defaultType = 'regular';
          }

          // ── Find STATUS column by scanning header rows above SURNAME row ─
          let statusColIdx = -1;
          for (let r = Math.max(0, hIdx - 3); r <= hIdx; r++) {
            const row = (all[r] || []).map(c => String(c ?? '').trim().toUpperCase());
            const idx = row.findIndex(c => c === 'STATUS');
            if (idx !== -1) {
              statusColIdx = idx;
              break;
            }
          }

          // ── Collect data rows ────────────────────────────────────────
          const dataRows = all.slice(hIdx + 1).filter(row => {
            const no      = row[noIdx];
            const surname = row[surnameIdx];
            return (
              no != null &&
              typeof no === 'number' &&
              no >= 1 &&
              surname != null &&
              String(surname).trim() !== ''
            );
          });

          dataRows.forEach(row => {
            const surname   = String(row[surnameIdx]     ?? '').trim().toUpperCase();
            const givenName = String(row[surnameIdx + 1] ?? '').trim().toUpperCase();
            const midName   = String(row[surnameIdx + 2] ?? '').trim();
            const address   = String(row[surnameIdx + 3] ?? '').trim();
            const dobRaw    = row[surnameIdx + 4];
            const tinRaw    = row[surnameIdx + 5];
            const phoneRaw  = row[surnameIdx + 6];
            const emailRaw  = row[surnameIdx + 7];

            if (!surname || !givenName) return;

            // Membership type: STATUS column → sheet name → default
            const rawStatus      = statusColIdx !== -1 ? row[statusColIdx] : null;
            const membershipType = normalizeMembershipType(rawStatus, defaultType);

            // null means "membership fee only" — not a full member yet, skip
            if (membershipType === null) {
              skippedFeeOnly++;
              return;
            }

            const pad = String(memberCounter).padStart(4, '0');
            allParsed.push({
              _row:    memberCounter,
              _sheet:  sheetName,
              member_no:       `MEM-${pad}`,
              last_name:       surname,
              first_name:      givenName,
              middle_initial:  midName ? midName[0].toUpperCase() : '',
              address:         address || '',
              date_of_birth:   formatDateValue(dobRaw),
              tin_no:          tinRaw  ? String(tinRaw).trim()  : '',
              phone:            normalizePhone(phoneRaw),
              email:           emailRaw ? String(emailRaw).trim() : '',
              status:          'active',
              membership_type: membershipType,
              record_type:     'old_member',
            });
            memberCounter++;
          });
        }

        if (allParsed.length === 0) {
          return reject(new Error(
            'No valid member rows found.\n' +
            'You can upload your existing WELLSERVE members list directly, ' +
            'or download the Import Template and fill it in.'
          ));
        }

        // Deduplicate by LAST_NAME + FIRST_NAME (keep first occurrence)
        const seen   = new Set();
        const deduped = [];
        allParsed.forEach(m => {
          const key = `${m.last_name}|${m.first_name}`;
          if (!seen.has(key)) {
            seen.add(key);
            deduped.push(m);
          }
        });

        // Re-number after dedup
        deduped.forEach((m, i) => {
          m.member_no = `MEM-${String(i + 1).padStart(4, '0')}`;
        });

        const sheetsUsed       = [...new Set(deduped.map(m => m._sheet))];
        const duplicatesRemoved = allParsed.length - deduped.length;

        // Type breakdown for the summary
        const regularCount   = deduped.filter(m => m.membership_type === 'regular').length;
        const associateCount = deduped.filter(m => m.membership_type === 'associate').length;

        resolve({
          format:            'native',
          members:           deduped,
          validationErrors:  [],
          sheetsUsed,
          duplicatesRemoved,
          skippedFeeOnly,
          regularCount,
          associateCount,
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

function buildFromTemplate(rows, sheetName) {
  const members = [], validationErrors = [];

  rows.forEach(row => {
    const errs = [];
    if (!row.member_no)  errs.push('member_no required');
    if (!row.first_name) errs.push('first_name required');
    if (!row.last_name)  errs.push('last_name required');

    if (errs.length) {
      validationErrors.push(`Row ${row._row}: ${errs.join(', ')}`);
      return;
    }

    members.push({
      _row:   row._row,
      _sheet: sheetName,
      member_no:           row.member_no,
      first_name:          row.first_name.toUpperCase(),
      last_name:           row.last_name.toUpperCase(),
      middle_initial:      row.middle_initial || '',
      email:               row.email || '',
      phone:               row.phone || '',
      address:             row.address || '',
      status:              ['active','inactive','suspended'].includes(row.status) ? row.status : 'active',
      membership_type:     ['associate','regular'].includes(row.membership_type) ? row.membership_type : 'associate',
      date_of_birth:       formatDateValue(row.date_of_birth),
      civil_status:        row.civil_status || '',
      sex:                 row.sex || '',
      occupation:          row.occupation || '',
      tin_no:              row.tin_no || '',
      sss_id_no:           row.sss_id_no || '',
      res_tel_no:          row.res_tel_no || '',
      date_joined:         formatDateValue(row.date_joined),
      beneficiary_name:    row.beneficiary_name || '',
      beneficiary_address: row.beneficiary_address || '',
      beneficiary_tel:     row.beneficiary_tel || '',
      recruiter_name:      row.recruiter_name || '',
      notes:               row.notes || '',
      record_type:         ['new_member','old_member'].includes(row.record_type) ? row.record_type : 'new_member',
    });
  });

  return {
    format: 'template', members, validationErrors,
    sheetsUsed: [sheetName], duplicatesRemoved: 0,
    regularCount:   members.filter(m => m.membership_type === 'regular').length,
    associateCount: members.filter(m => m.membership_type === 'associate').length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function ImportMembersModal({ onClose, onImported }) {
  const { user } = useAuth();
  const fileInputRef = useRef(null);

  const [step, setStep]               = useState('upload');
  const [fileName, setFileName]       = useState('');
  const [parseResult, setParseResult] = useState(null);
  const [progress, setProgress]       = useState(0);
  const [results, setResults]         = useState({ created: 0, updated: 0, failed: 0, errors: [] });

  const members        = parseResult?.members         ?? [];
  const parseErrors    = parseResult?.validationErrors ?? [];
  const sheetsUsed     = parseResult?.sheetsUsed       ?? [];
  const dupsRemoved    = parseResult?.duplicatesRemoved ?? 0;
  const skippedFeeOnly = parseResult?.skippedFeeOnly   ?? 0;
  const regularCount   = parseResult?.regularCount     ?? 0;
  const associateCount = parseResult?.associateCount   ?? 0;
  const formatLabel    = parseResult?.format === 'native' ? 'WELLSERVE Members List' : 'Import Template';

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const result = await parseFile(file);
      setParseResult(result);
      setStep('preview');
    } catch (err) {
      toast.error(err.message, { duration: 6000 });
    }
  }

  async function handleImport() {
    setStep('importing');
    let created = 0, updated = 0, failed = 0;
    const errors = [];

    // Build a lookup map of existing members keyed by LAST_NAME|FIRST_NAME
    let existingMap = {};
    try {
      const existing = await getMembers();
      existing.forEach(m => {
        const key = `${(m.last_name || '').toUpperCase()}|${(m.first_name || '').toUpperCase()}`;
        existingMap[key] = m;
      });
    } catch (err) {
      toast.error('Failed to load existing members: ' + err.message);
      setStep('preview');
      return;
    }

    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      setProgress(Math.round(((i + 1) / members.length) * 100));

      const payload = {};
      Object.keys(m).forEach(k => {
        if (!k.startsWith('_') && m[k] !== '' && m[k] != null) payload[k] = m[k];
      });

      const key = `${m.last_name}|${m.first_name}`;
      const existingMember = existingMap[key];

      try {
        if (existingMember) {
          // Member already exists — update their details but keep their member_no
          const { member_no: _skip, ...updatePayload } = payload;
          await updateMember(existingMember.id, updatePayload);
          updated++;
        } else {
          // New member — create + initialise accounts
          const newMember = await createMember(payload);
          await initializeMemberAccounts(newMember.id);
          created++;
        }
      } catch (err) {
        failed++;
        errors.push(`Row ${m._row} (${m.member_no} — ${m.last_name}, ${m.first_name}): ${err.message}`);
      }
    }

    try {
      await trackActivity({
        user_id: user?.id,
        action: 'import_members',
        details: `Import from "${fileName}" [${formatLabel}]: ${created} created, ${updated} updated.${failed ? ` ${failed} failed.` : ''}`,
      });
    } catch (_) {}

    setResults({ created, updated, failed, errors });
    setStep('done');
            if (created > 0 || updated > 0) onImported?.();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#D6FADC] flex items-center justify-center">
              <Users size={18} className="text-[#07A04E]" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Import Members</h2>
              <p className="text-xs text-gray-500">CBU & Savings accounts auto-created · Membership fee excluded</p>
            </div>
          </div>
          <button onClick={onClose} disabled={step === 'importing'}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 disabled:opacity-40 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                <div className="flex gap-2">
                  <Info size={15} className="text-blue-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-blue-700 mb-1">Supported formats</p>
                    <ul className="text-xs text-blue-600 space-y-0.5">
                      <li>• <strong>WELLSERVE Members List</strong> — upload your existing Excel file directly. Membership type is auto-detected from the STATUS column or sheet name.</li>
                      <li>• <strong>Import Template</strong> — download below for structured import with all DB fields.</li>
                    </ul>
                  </div>
                </div>
              </div>

              <button onClick={downloadTemplate}
                className="w-full flex items-center justify-between px-4 py-3 border border-[#07A04E]/30 bg-[#f0fdf4] rounded-xl hover:bg-[#D6FADC] transition-colors">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet size={18} className="text-[#07A04E]" />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-gray-800">Download Import Template</p>
                    <p className="text-xs text-gray-500">Optional — only needed for new data with full member details</p>
                  </div>
                </div>
                <Download size={16} className="text-[#07A04E]" />
              </button>

              <div onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-2xl p-12 flex flex-col items-center gap-4 cursor-pointer hover:border-[#07A04E] hover:bg-[#f0fdf4] transition-all group">
                <div className="w-14 h-14 rounded-2xl bg-[#D6FADC] group-hover:bg-[#bbf7d0] flex items-center justify-center transition-colors">
                  <Upload size={24} className="text-[#07A04E]" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-700">Click to upload your Excel file</p>
                  <p className="text-xs text-gray-400 mt-1">.xlsx or .xls — template OR existing WELLSERVE members list</p>
                </div>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
              </div>
            </div>
          )}

          {/* Preview */}
          {step === 'preview' && (
            <div className="space-y-3">
              {/* Summary */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <FileSpreadsheet size={15} className="text-[#07A04E]" />
                  <span className="font-medium text-gray-600 truncate max-w-[200px]">{fileName}</span>
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[11px] rounded-full font-medium">{formatLabel}</span>
                  <span className="text-gray-400">·</span>
                  <span className="font-semibold text-[#07A04E]">{members.length} members</span>
                </div>
                <button onClick={() => { setStep('upload'); setParseResult(null); setFileName(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                  <X size={13} /> Change file
                </button>
              </div>

              {/* Type breakdown */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700">{regularCount}</div>
                  <div>
                    <p className="text-xs font-semibold text-blue-700">Regular Members</p>
                    <p className="text-[11px] text-blue-500">Full pledge</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-100 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-sm font-bold text-purple-700">{associateCount}</div>
                  <div>
                    <p className="text-xs font-semibold text-purple-700">Associate Members</p>
                    <p className="text-[11px] text-purple-500">Entry membership</p>
                  </div>
                </div>
              </div>

              {/* Sheets used / dedup notice */}
              {(sheetsUsed.length > 0 || dupsRemoved > 0 || skippedFeeOnly > 0) && (
                <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                  {sheetsUsed.length > 0 && (
                    <span>Sheets: {sheetsUsed.map(s => `"${s}"`).join(', ')}</span>
                  )}
                  {dupsRemoved > 0 && (
                    <span className="text-amber-600">· {dupsRemoved} duplicate{dupsRemoved !== 1 ? 's' : ''} removed</span>
                  )}
                  {skippedFeeOnly > 0 && (
                    <span className="text-gray-400">· {skippedFeeOnly} "Membership Fee Only" skipped</span>
                  )}
                </div>
              )}

              {parseErrors.length > 0 && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-xl">
                  <p className="text-xs font-semibold text-red-600 mb-1">Skipped rows:</p>
                  <ul className="space-y-0.5 max-h-20 overflow-y-auto">
                    {parseErrors.map((e, i) => <li key={i} className="text-xs text-red-500">{e}</li>)}
                  </ul>
                </div>
              )}

              {/* Table */}
              <div className="border border-gray-100 rounded-xl overflow-auto max-h-[340px]">
                <table className="w-full text-xs min-w-[860px]">
                  <thead className="bg-gray-50 text-gray-500 uppercase tracking-wide sticky top-0 z-10">
                    <tr>
                      {['#','member_no','last_name','first_name','M.I.','phone','email','address','dob','tin','type'].map(h => (
                        <th key={h} className="px-3 py-2 text-left whitespace-nowrap font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-gray-600">{m.member_no}</td>
                        <td className="px-3 py-2 font-semibold text-gray-800">{m.last_name}</td>
                        <td className="px-3 py-2 text-gray-700">{m.first_name}</td>
                        <td className="px-3 py-2 text-gray-500">{m.middle_initial || '—'}</td>
                        <td className="px-3 py-2 text-gray-500">{m.phone || '—'}</td>
                        <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate">{m.email || '—'}</td>
                        <td className="px-3 py-2 text-gray-500 max-w-[130px] truncate">{m.address || '—'}</td>
                        <td className="px-3 py-2 text-gray-500">{m.date_of_birth || '—'}</td>
                        <td className="px-3 py-2 text-gray-500">{m.tin_no || '—'}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            m.membership_type === 'regular'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-purple-100 text-purple-700'
                          }`}>{m.membership_type}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Importing */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center gap-6 py-12">
              <div className="w-16 h-16 rounded-2xl bg-[#D6FADC] flex items-center justify-center">
                <Loader2 size={28} className="text-[#07A04E] animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700">Importing members…</p>
                <p className="text-xs text-gray-400 mt-1">Please don't close this window.</p>
              </div>
              <div className="w-64 space-y-1.5">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Progress</span><span>{progress}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#07A04E] rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-xs text-gray-400 text-center">
                  {Math.round(progress * members.length / 100)} of {members.length}
                </p>
              </div>
            </div>
          )}

          {/* Done */}
          {step === 'done' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl">
                <CheckCircle size={22} className="text-[#07A04E] flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-gray-800">Import complete</p>
                  <div className="flex gap-4 mt-1">
                    {results.created > 0 && (
                      <span className="text-xs text-[#07A04E] font-medium">
                        ✦ {results.created} new member{results.created !== 1 ? 's' : ''} created
                      </span>
                    )}
                    {results.updated > 0 && (
                      <span className="text-xs text-blue-600 font-medium">
                        ↻ {results.updated} existing member{results.updated !== 1 ? 's' : ''} updated
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">CBU and savings accounts created for new members only.</p>
                </div>
              </div>
              {results.failed > 0 && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle size={16} className="text-red-500" />
                    <p className="text-sm font-semibold text-red-700">{results.failed} failed</p>
                  </div>
                  <ul className="space-y-1 max-h-40 overflow-y-auto">
                    {results.errors.map((e, i) => <li key={i} className="text-xs text-red-600">{e}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center">
          <p className="text-xs text-gray-400">
            {step === 'preview' && `${members.length} members ready · CBU + Savings accounts will be auto-created`}
          </p>
          <div className="flex gap-3">
            {step !== 'importing' && step !== 'done' && (
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">
                Cancel
              </button>
            )}
            {step === 'preview' && members.length > 0 && (
              <button onClick={handleImport}
                className="flex items-center gap-2 px-5 py-2 bg-[#07A04E] hover:bg-[#06923f] text-white text-sm font-semibold rounded-xl shadow-sm transition-colors">
                <Users size={15} /> Import {members.length} Members
              </button>
            )}
            {step === 'done' && (
              <button onClick={onClose}
                className="flex items-center gap-2 px-5 py-2 bg-[#07A04E] hover:bg-[#06923f] text-white text-sm font-semibold rounded-xl transition-colors">
                <CheckCircle size={15} /> Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}