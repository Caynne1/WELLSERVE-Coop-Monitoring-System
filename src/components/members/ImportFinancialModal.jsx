import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload, X, CheckCircle, AlertCircle, Loader2,
  FileSpreadsheet, Download, ChevronDown, Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../services/supabase';
import { createTransaction } from '../../services/transactionService';
import { createMembership } from '../../services/membershipService';
import { trackActivity } from '../../services/logService';
import { useAuth } from '../../context/AuthContext';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MEMBERSHIP_FEES = {
  associate: { membership_fee: 300,  cbu: 1000, savings: 500  },
  regular:   { membership_fee: 1800, cbu: 4000, savings: 1000 },
};

const TODAY = new Date().toISOString().split('T')[0];

// ─────────────────────────────────────────────────────────────────────────────
// Import type definitions
// ─────────────────────────────────────────────────────────────────────────────

const IMPORT_TYPES = [
  {
    key: 'membership',
    label: 'Membership + CBU + Savings',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
    nativeSupported: true,
    description: 'Full member setup — membership fee, CBU & savings from your WELLSERVE Excel',
    headers: ['member_no', 'membership_type', 'membership_fee_paid', 'cbu_balance', 'savings_balance'],
    sampleRow: ['MEM-001', 'associate', '300', '1000', '500'],
    notes: [
      'member_no must match an existing member',
      'membership_type: associate | regular',
      'membership_fee_paid: amount already paid (e.g. 300 or 1800)',
      'cbu_balance: current CBU balance',
      'savings_balance: current savings balance',
      'Creates membership record, CBU account, savings account + transactions for each.',
      'Existing records are updated, not duplicated.',
    ],
  },
  {
    key: 'cbu',
    label: 'CBU (Capital Build-Up)',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
    nativeSupported: true,
    description: 'Update CBU balances — upload WELLSERVE Excel or use template',
    headers: ['member_no', 'balance', 'status'],
    sampleRow: ['MEM-001', '5000.00', 'active'],
    notes: [
      'member_no must match an existing member',
      'balance: numeric (e.g. 5000.00)',
      'status: active | inactive  (default: active)',
      'Existing accounts are updated. A deposit transaction is recorded.',
    ],
  },
  {
    key: 'savings',
    label: 'Savings',
    color: 'bg-green-50 text-green-700 border-green-200',
    dot: 'bg-green-500',
    nativeSupported: true,
    description: 'Update Savings balances — upload WELLSERVE Excel or use template',
    headers: ['member_no', 'balance', 'status'],
    sampleRow: ['MEM-001', '2500.00', 'active'],
    notes: [
      'member_no must match an existing member',
      'balance: numeric (e.g. 2500.00)',
      'status: active | inactive  (default: active)',
      'Existing accounts are updated. A deposit transaction is recorded.',
    ],
  },
  {
    key: 'loans',
    label: 'Loans',
    color: 'bg-orange-50 text-orange-700 border-orange-200',
    dot: 'bg-orange-500',
    nativeSupported: false,
    description: 'Import loan records using the download template',
    headers: ['member_no','loan_no','amount','balance','interest_rate','term_months','monthly_amortization','release_date','due_date','status','purpose','notes'],
    sampleRow: ['MEM-001','LN-2024-001','50000.00','45000.00','3','12','4500.00','2024-01-15','2025-01-15','active','Business capital',''],
    notes: [
      'member_no must match an existing member',
      'loan_no must be unique — existing loan_no rows are skipped',
      'Dates: YYYY-MM-DD',
      'interest_rate: percent (e.g. 3 for 3%)',
      'status: active | paid | restructured | defaulted  (default: active)',
    ],
  },
  {
    key: 'time_deposits',
    label: 'Time Deposits',
    color: 'bg-purple-50 text-purple-700 border-purple-200',
    dot: 'bg-purple-500',
    nativeSupported: false,
    description: 'Import time deposit records using the download template',
    headers: ['member_no','name','age','birth_date','address','terms','amount','interest_rate','date_applied','termination_date','beneficiary_name','status'],
    sampleRow: ['MEM-001','Juan Dela Cruz','34','1990-01-15','Brgy. Sample','12','10000.00','4.5','2024-01-15','2025-01-15','Maria Dela Cruz','Active'],
    notes: [
      'member_no is optional but links to an existing member',
      'name is required',
      'terms: number of months',
      'Dates: YYYY-MM-DD',
      'status: Active | Terminated | Matured  (default: Active)',
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function safeNum(val) {
  const n = parseFloat(String(val ?? '').replace(/[^\d.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function downloadTemplate(typeConfig) {
  const wb = XLSX.utils.book_new();
  const wsInfo = XLSX.utils.aoa_to_sheet([
    [`WELLSERVE Coop — ${typeConfig.label} Import Template`],
    [''],
    ['NOTES:'],
    ...typeConfig.notes.map(n => [`• ${n}`]),
    [''],
    ['Fill data starting from Row 4 in the Data sheet. Do NOT change headers.'],
  ]);
  wsInfo['!cols'] = [{ wch: 70 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Instructions');

  const wsData = XLSX.utils.aoa_to_sheet([
    [`WELLSERVE — ${typeConfig.label} Import`, ...Array(typeConfig.headers.length - 1).fill('')],
    Array(typeConfig.headers.length).fill(''),
    typeConfig.headers,
    typeConfig.sampleRow,
  ]);
  wsData['!cols'] = typeConfig.headers.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, wsData, 'Data');
  XLSX.writeFile(wb, `WELLSERVE_${typeConfig.key}_Import_Template.xlsx`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Native Excel parsers (reads WELLSERVE members list format)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse ASSOCIATE MEMBERS + REGULAR MEMBERS sheets.
 * Returns rows with: last_name, first_name, cbu_balance, savings_balance, membership_type
 */
function parseNativeMembership(wb) {
  const SHEET_TYPE = {
    'ASSOCIATE MEMBERS': 'associate',
    'REGULAR MEMBERS':   'regular',
  };

  const rows = [];

  for (const sheetName of wb.SheetNames) {
    const membershipType = SHEET_TYPE[sheetName.trim()];
    if (!membershipType) continue;

    const ws = wb.Sheets[sheetName];
    const all = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

    const hIdx = all.findIndex(row =>
      row.some(c => String(c ?? '').trim().toUpperCase() === 'SURNAME')
    );
    if (hIdx === -1) continue;

    const hRow = all[hIdx].map(c => String(c ?? '').trim().toUpperCase());
    const surnameIdx = hRow.findIndex(c => c === 'SURNAME');
    if (surnameIdx < 1) continue;

    const noIdx = surnameIdx - 1;

    // CBU always col 6, Savings always col 7 in these sheets
    all.slice(hIdx + 1).forEach((row, i) => {
      const no      = row[noIdx];
      const surname = row[surnameIdx];
      if (no == null || typeof no !== 'number' || no < 1 || !String(surname ?? '').trim()) return;

      const cbuBal     = safeNum(row[6]);
      const savingsBal = safeNum(row[7]);
      const fees       = MEMBERSHIP_FEES[membershipType];

      rows.push({
        _row:            i + hIdx + 2,
        _sheet:          sheetName,
        _format:         'native',
        last_name:       String(row[surnameIdx]     ?? '').trim().toUpperCase(),
        first_name:      String(row[surnameIdx + 1] ?? '').trim().toUpperCase(),
        membership_type: membershipType,
        membership_fee:  fees.membership_fee,
        cbu_balance:     cbuBal  > 0 ? cbuBal  : fees.cbu,
        savings_balance: savingsBal > 0 ? savingsBal : fees.savings,
      });
    });
  }

  return rows.length > 0 ? rows : null;
}

/**
 * Parse CBU or Savings balance from ASSOCIATE MEMBERS + REGULAR MEMBERS sheets.
 */
function parseNativeCBUSavings(wb, accountType) {
  const balCol = accountType === 'cbu' ? 6 : 7;
  const rows   = [];

  for (const sheetName of wb.SheetNames) {
    const ws  = wb.Sheets[sheetName];
    const all = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

    const hIdx = all.findIndex(row => {
      const cells = row.map(c => String(c ?? '').trim().toUpperCase());
      return (
        cells.some(c => c === 'SURNAME') &&
        cells.some(c => c === 'FIRSTNAME' || c === 'GIVEN NAME' || c === 'FIRST NAME')
      );
    });
    if (hIdx === -1) continue;

    const hasCBU = all.slice(0, hIdx + 1).some(row =>
      row.some(c => String(c ?? '').trim().toUpperCase() === 'CBU')
    );
    if (!hasCBU) continue;

    const hRow      = all[hIdx].map(c => String(c ?? '').trim().toUpperCase());
    const surnameIdx = hRow.findIndex(c => c === 'SURNAME');
    if (surnameIdx < 1) continue;

    all.slice(hIdx + 1).forEach((row, i) => {
      const no      = row[surnameIdx - 1];
      const surname = row[surnameIdx];
      if (no == null || typeof no !== 'number' || no < 1 || !String(surname ?? '').trim()) return;

      const balance = safeNum(row[balCol]);
      if (balance <= 0) return;

      rows.push({
        _row:       i + hIdx + 2,
        _sheet:     sheetName,
        _format:    'native',
        last_name:  String(row[surnameIdx]     ?? '').trim().toUpperCase(),
        first_name: String(row[surnameIdx + 1] ?? '').trim().toUpperCase(),
        balance,
      });
    });
  }

  if (rows.length === 0) return null;

  // Dedup by name — keep highest balance
  const seen = new Map();
  rows.forEach(r => {
    const k = `${r.last_name}|${r.first_name}`;
    if (!seen.has(k) || r.balance > seen.get(k).balance) seen.set(k, r);
  });
  return [...seen.values()];
}

/**
 * Template format parser — finds header row by matching expected column names.
 */
function parseTemplateFormat(wb, expectedHeaders) {
  for (const sheetName of wb.SheetNames) {
    const ws  = wb.Sheets[sheetName];
    const all = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const hIdx = all.findIndex(row =>
      expectedHeaders.slice(0, 2).every(h =>
        row.map(c => String(c).trim().toLowerCase()).includes(h.toLowerCase())
      )
    );
    if (hIdx === -1) continue;

    const headers = all[hIdx].map(c => String(c).trim().toLowerCase());
    const rows = all.slice(hIdx + 1)
      .filter(row => row.some(c => String(c).trim() !== ''))
      .map((row, i) => {
        const obj = { _row: hIdx + i + 2, _sheet: sheetName, _format: 'template' };
        headers.forEach((h, idx) => { obj[h] = String(row[idx] ?? '').trim(); });
        return obj;
      });

    if (rows.length > 0) return rows;
  }
  return null;
}

function parseFile(file, typeConfig) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });

        if (typeConfig.nativeSupported) {
          let nativeRows = null;

          if (typeConfig.key === 'membership')
            nativeRows = parseNativeMembership(wb);
          else if (typeConfig.key === 'cbu' || typeConfig.key === 'savings')
            nativeRows = parseNativeCBUSavings(wb, typeConfig.key);

          if (nativeRows) return resolve({ rows: nativeRows, format: 'native' });
        }

        const templateRows = parseTemplateFormat(wb, typeConfig.headers);
        if (templateRows) return resolve({ rows: templateRows, format: 'template' });

        reject(new Error(
          typeConfig.nativeSupported
            ? 'No valid data found. Upload your WELLSERVE Excel directly, or download and fill the template.'
            : 'No valid data found. Download the template, fill it in, and upload it.'
        ));
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Member + account cache
// ─────────────────────────────────────────────────────────────────────────────

async function buildCache() {
  const [{ data: members }, { data: accounts }] = await Promise.all([
    supabase.from('members').select('id, member_no, first_name, last_name'),
    supabase.from('accounts').select('id, member_id, account_type, balance'),
  ]);

  const byNo   = {};
  const byName = {};
  (members || []).forEach(m => {
    if (m.member_no) byNo[m.member_no] = m;
    const k = `${(m.last_name || '').toUpperCase()}|${(m.first_name || '').toUpperCase()}`;
    byName[k] = m;
  });

  // accountMap: member_id → { cbu: account, savings: account }
  const accountMap = {};
  (accounts || []).forEach(a => {
    if (!accountMap[a.member_id]) accountMap[a.member_id] = {};
    accountMap[a.member_id][a.account_type] = a;
  });

  return { byNo, byName, accountMap };
}

function lookupMember(row, cache) {
  if (row._format === 'native') {
    const k = `${row.last_name}|${row.first_name}`;
    return cache.byName[k] || null;
  }
  return row.member_no ? cache.byNo[row.member_no] : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Upsert account + record transaction
// ─────────────────────────────────────────────────────────────────────────────

async function upsertAccount(memberId, accountType, balance, status = 'active') {
  const { data: existing } = await supabase
    .from('accounts')
    .select('id')
    .eq('member_id', memberId)
    .eq('account_type', accountType)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('accounts')
      .update({ balance, status })
      .eq('id', existing.id);
    if (error) throw error;
    return { id: existing.id, isNew: false };
  }

  const { data, error } = await supabase
    .from('accounts')
    .insert({ member_id: memberId, account_type: accountType, balance, status })
    .select()
    .single();
  if (error) throw error;
  return { id: data.id, isNew: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-type import logic
// ─────────────────────────────────────────────────────────────────────────────

async function importMembership(rows, cache, userId, onProgress) {
  let created = 0, updated = 0, failed = 0;
  const errors = [];

  // Fetch existing memberships to avoid duplicates
  const { data: existingMs } = await supabase
    .from('member_memberships')
    .select('member_id, membership_type');
  const existingMSet = new Set((existingMs || []).map(m => m.member_id));

  for (let i = 0; i < rows.length; i++) {
    onProgress(Math.round(((i + 1) / rows.length) * 100));
    const row    = rows[i];
    const member = lookupMember(row, cache);

    if (!member) {
      failed++;
      errors.push(`Row ${row._row}: "${row.last_name ?? row.member_no}" not found in database`);
      continue;
    }

    try {
      const mType   = row.membership_type || 'associate';
      const fees    = MEMBERSHIP_FEES[mType] || MEMBERSHIP_FEES.associate;
      const mFee    = safeNum(row.membership_fee_paid || row.membership_fee) || fees.membership_fee;
      const cbuBal  = safeNum(row.cbu_balance)     || fees.cbu;
      const savBal  = safeNum(row.savings_balance) || fees.savings;

      // ── 1. Membership record ────────────────────────────────────────────
      const hasMembership = existingMSet.has(member.id);
      if (!hasMembership) {
        await createMembership({
          member_id:      member.id,
          membership_type: mType,
          fee_required:   fees.membership_fee,
          fee_paid_now:   mFee,
          is_historical:  true,
          created_by:     userId,
          notes:          'Historical import',
        });

        // Membership payment transaction
        await createTransaction({
          member_id:        member.id,
          category:         'membership',
          type:             'membership_payment',
          amount:           mFee,
          transaction_date: TODAY,
          notes:            `Historical ${mType} membership payment (import)`,
          created_by:       userId,
        });
      }

      // ── 2. CBU account + transaction ────────────────────────────────────
      const { isNew: cbuIsNew } = await upsertAccount(member.id, 'cbu', cbuBal);
      const { data: cbuAcc } = await supabase
        .from('accounts').select('id').eq('member_id', member.id).eq('account_type', 'cbu').single();

      await createTransaction({
        member_id:        member.id,
        account_id:       cbuAcc?.id || null,
        category:         'cbu',
        type:             'deposit',
        amount:           cbuBal,
        transaction_date: TODAY,
        notes:            `Historical CBU ${cbuIsNew ? 'initial deposit' : 'balance update'} (import)`,
        created_by:       userId,
      });

      // ── 3. Savings account + transaction ────────────────────────────────
      const { isNew: savIsNew } = await upsertAccount(member.id, 'savings', savBal);
      const { data: savAcc } = await supabase
        .from('accounts').select('id').eq('member_id', member.id).eq('account_type', 'savings').single();

      await createTransaction({
        member_id:        member.id,
        account_id:       savAcc?.id || null,
        category:         'savings',
        type:             'deposit',
        amount:           savBal,
        transaction_date: TODAY,
        notes:            `Historical savings ${savIsNew ? 'initial deposit' : 'balance update'} (import)`,
        created_by:       userId,
      });

      hasMembership ? updated++ : created++;
    } catch (err) {
      failed++;
      errors.push(`Row ${row._row} (${row.last_name ?? row.member_no}): ${err.message}`);
    }
  }

  return { created, updated, failed, errors };
}

async function importCBUSavings(rows, accountType, cache, userId, onProgress) {
  let created = 0, updated = 0, failed = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    onProgress(Math.round(((i + 1) / rows.length) * 100));
    const row    = rows[i];
    const member = lookupMember(row, cache);

    if (!member) {
      failed++;
      errors.push(`Row ${row._row}: "${row.last_name ?? row.member_no}" not found in database`);
      continue;
    }

    const balance = safeNum(row.balance);
    const status  = ['active','inactive'].includes(row.status) ? row.status : 'active';

    try {
      const { id: accountId, isNew } = await upsertAccount(member.id, accountType, balance, status);
      isNew ? created++ : updated++;

      // Record a transaction for the deposit/balance update
      await createTransaction({
        member_id:        member.id,
        account_id:       accountId,
        category:         accountType,
        type:             'deposit',
        amount:           balance,
        transaction_date: TODAY,
        notes:            `Historical ${accountType.toUpperCase()} ${isNew ? 'initial deposit' : 'balance update'} (import)`,
        created_by:       userId,
      });
    } catch (err) {
      failed++;
      errors.push(`Row ${row._row} (${row.last_name ?? row.member_no}): ${err.message}`);
    }
  }

  return { created, updated, failed, errors };
}

async function importLoans(rows, cache, userId, onProgress) {
  let created = 0, skipped = 0, failed = 0;
  const errors = [];

  const { data: existingLoans } = await supabase.from('loans').select('loan_no');
  const existingNos = new Set((existingLoans || []).map(l => l.loan_no).filter(Boolean));

  for (let i = 0; i < rows.length; i++) {
    onProgress(Math.round(((i + 1) / rows.length) * 100));
    const row    = rows[i];
    const member = lookupMember(row, cache);

    if (!member) { failed++; errors.push(`Row ${row._row}: "${row.member_no}" not found`); continue; }
    if (row.loan_no && existingNos.has(row.loan_no)) { skipped++; continue; }

    const validStatuses = ['active','paid','restructured','defaulted'];
    const payload = {
      member_id:            member.id,
      loan_no:              row.loan_no || null,
      amount:               safeNum(row.amount),
      balance:              safeNum(row.balance),
      interest_rate:        safeNum(row.interest_rate),
      term_months:          parseInt(row.term_months) || 0,
      monthly_amortization: safeNum(row.monthly_amortization),
      release_date:         row.release_date || null,
      due_date:             row.due_date || null,
      status:               validStatuses.includes(row.status) ? row.status : 'active',
      purpose:              row.purpose || null,
      notes:                row.notes || null,
    };

    try {
      const { error } = await supabase.from('loans').insert(payload);
      if (error) throw error;
      if (row.loan_no) existingNos.add(row.loan_no);
      created++;
    } catch (err) {
      failed++;
      errors.push(`Row ${row._row} (${row.member_no}): ${err.message}`);
    }
  }

  return { created, updated: 0, skipped, failed, errors };
}

async function importTimeDeposits(rows, cache, userId, onProgress) {
  let created = 0, failed = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    onProgress(Math.round(((i + 1) / rows.length) * 100));
    const row    = rows[i];
    let memberId = null;

    if (row.member_no) {
      const member = lookupMember(row, cache);
      if (!member) { failed++; errors.push(`Row ${row._row}: "${row.member_no}" not found`); continue; }
      memberId = member.id;
    }

    if (!row.name?.trim()) { failed++; errors.push(`Row ${row._row}: name is required`); continue; }

    const validStatuses = ['Active','Terminated','Matured'];
    const payload = {
      member_id:        memberId,
      name:             row.name.trim(),
      age:              parseInt(row.age) || null,
      birth_date:       row.birth_date || null,
      address:          row.address || null,
      terms:            parseInt(row.terms) || 0,
      amount:           safeNum(row.amount),
      interest_rate:    safeNum(row.interest_rate),
      date_applied:     row.date_applied || null,
      termination_date: row.termination_date || null,
      beneficiary_name: row.beneficiary_name || null,
      status:           validStatuses.includes(row.status) ? row.status : 'Active',
    };

    try {
      const { error } = await supabase.from('time_deposits').insert(payload);
      if (error) throw error;
      created++;
    } catch (err) {
      failed++;
      errors.push(`Row ${row._row}: ${err.message}`);
    }
  }

  return { created, updated: 0, failed, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function ImportFinancialModal({ onClose, onImported }) {
  const { user } = useAuth();
  const fileInputRef = useRef(null);

  const [selectedType, setSelectedType] = useState(null);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [step, setStep]                 = useState('select');
  const [fileName, setFileName]         = useState('');
  const [parseResult, setParseResult]   = useState(null);
  const [progress, setProgress]         = useState(0);
  const [results, setResults]           = useState(null);

  const typeConfig = IMPORT_TYPES.find(t => t.key === selectedType);
  const rows       = parseResult?.rows   ?? [];
  const format     = parseResult?.format ?? '';

  function selectType(key) {
    setSelectedType(key);
    setTypeMenuOpen(false);
    setStep('upload');
    setParseResult(null);
    setFileName('');
    setResults(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file || !typeConfig) return;
    setFileName(file.name);
    try {
      const result = await parseFile(file, typeConfig);
      setParseResult(result);
      setStep('preview');
    } catch (err) {
      toast.error(err.message, { duration: 6000 });
    }
  }

  async function handleImport() {
    if (!typeConfig) return;
    setStep('importing');
    setProgress(5);

    try {
      const cache = await buildCache();
      setProgress(15);

      const onProg = (p) => setProgress(15 + Math.round(p * 0.82));
      const userId = user?.id ?? null;

      let result;
      if      (selectedType === 'membership')    result = await importMembership(rows, cache, userId, onProg);
      else if (selectedType === 'cbu')           result = await importCBUSavings(rows, 'cbu',     cache, userId, onProg);
      else if (selectedType === 'savings')       result = await importCBUSavings(rows, 'savings', cache, userId, onProg);
      else if (selectedType === 'loans')         result = await importLoans(rows, cache, userId, onProg);
      else if (selectedType === 'time_deposits') result = await importTimeDeposits(rows, cache, userId, onProg);

      setProgress(100);

      // ── Activity log ──────────────────────────────────────────────────
      const summary = [
        result.created > 0 ? `${result.created} created`      : '',
        result.updated > 0 ? `${result.updated} updated`      : '',
        result.skipped > 0 ? `${result.skipped} skipped`      : '',
        result.failed  > 0 ? `${result.failed}  failed`       : '',
      ].filter(Boolean).join(', ');

      try {
        await trackActivity({
          userId,
          module:      selectedType,
          action:      'import',
          description: `${typeConfig.label} import from "${fileName}" [${format}]: ${summary}.`,
        });
      } catch (_) {}

      setResults(result);
      setStep('done');
      if ((result.created || 0) + (result.updated || 0) > 0) onImported?.();
    } catch (err) {
      toast.error('Import failed: ' + err.message);
      setStep('preview');
    }
  }

  function resetUpload() {
    setStep('upload');
    setParseResult(null);
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // Preview columns per type + format
  const previewCols = (() => {
    if (!typeConfig) return [];
    if (format === 'native') {
      if (selectedType === 'membership')
        return ['last_name','first_name','membership_type','membership_fee','cbu_balance','savings_balance','_sheet'];
      return ['last_name','first_name','balance','_sheet'];
    }
    return typeConfig.headers.slice(0, 7);
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
              <FileSpreadsheet size={18} className="text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Import Financial Data</h2>
              <p className="text-xs text-gray-500">Transactions and activity logs recorded automatically</p>
            </div>
          </div>
          <button onClick={onClose} disabled={step === 'importing'}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 disabled:opacity-40 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Type selector */}
          {step !== 'done' && (
            <div className="relative">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">What are you importing?</p>
              <button
                onClick={() => setTypeMenuOpen(v => !v)}
                disabled={step === 'importing'}
                className={`w-full flex items-center justify-between px-4 py-3 border rounded-xl text-sm font-medium transition-colors
                  ${typeConfig ? `${typeConfig.color} border` : 'border-gray-200 text-gray-500 bg-gray-50 hover:bg-gray-100'}
                  disabled:opacity-50`}
              >
                <div className="flex items-center gap-2">
                  {typeConfig && <span className={`w-2 h-2 rounded-full ${typeConfig.dot}`} />}
                  {typeConfig ? typeConfig.label : 'Select import type…'}
                </div>
                <ChevronDown size={16} className={`transition-transform ${typeMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {typeMenuOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                  {IMPORT_TYPES.map(t => (
                    <button key={t.key} onClick={() => selectType(t.key)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm hover:bg-gray-50 transition-colors ${selectedType === t.key ? 'bg-gray-50' : ''}`}>
                      <span className={`w-2 h-2 rounded-full ${t.dot}`} />
                      <div>
                        <p className="font-medium text-gray-800">{t.label}</p>
                        <p className="text-xs text-gray-400">{t.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Select prompt */}
          {step === 'select' && (
            <div className="border-2 border-dashed border-gray-200 rounded-2xl p-10 flex flex-col items-center gap-2 text-center">
              <FileSpreadsheet size={32} className="text-gray-300" />
              <p className="text-sm text-gray-400">Select an import type above to get started</p>
            </div>
          )}

          {/* Upload */}
          {step === 'upload' && typeConfig && (
            <div className="space-y-4">
              {typeConfig.nativeSupported && (
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                  <div className="flex gap-2">
                    <Info size={15} className="text-blue-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-blue-700 mb-1">Supported formats</p>
                      <ul className="text-xs text-blue-600 space-y-0.5">
                        {selectedType === 'membership' ? (
                          <>
                            <li>• <strong>WELLSERVE Excel</strong> — upload directly. Reads from "ASSOCIATE MEMBERS" and "REGULAR MEMBERS" sheets. Creates membership record, CBU account, savings account, and a transaction for each.</li>
                            <li>• <strong>Template</strong> — download below for manual entry by member_no.</li>
                          </>
                        ) : (
                          <>
                            <li>• <strong>WELLSERVE Excel</strong> — upload directly. Reads {selectedType.toUpperCase()} balances from "ASSOCIATE MEMBERS" and "REGULAR MEMBERS" sheets. A deposit transaction is recorded per member.</li>
                            <li>• <strong>Template</strong> — download below for entry by member_no.</li>
                          </>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {!typeConfig.nativeSupported && (
                <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl">
                  <p className="text-xs font-semibold text-gray-600 mb-1.5">Column requirements:</p>
                  <ul className="space-y-0.5">
                    {typeConfig.notes.map((n, i) => <li key={i} className="text-xs text-gray-500">• {n}</li>)}
                  </ul>
                </div>
              )}

              <button onClick={() => downloadTemplate(typeConfig)}
                className="w-full flex items-center justify-between px-4 py-3 border border-amber-200 bg-amber-50 rounded-xl hover:bg-amber-100 transition-colors">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet size={18} className="text-amber-600" />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-gray-800">Download {typeConfig.label} Template</p>
                    <p className="text-xs text-gray-500">
                      {typeConfig.nativeSupported ? 'Optional — only needed for manual entry by member_no' : 'Excel template with correct columns + sample row'}
                    </p>
                  </div>
                </div>
                <Download size={16} className="text-amber-600" />
              </button>

              <div onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-2xl p-10 flex flex-col items-center gap-4 cursor-pointer hover:border-amber-400 hover:bg-amber-50/50 transition-all group">
                <div className="w-14 h-14 rounded-2xl bg-amber-100 group-hover:bg-amber-200 flex items-center justify-center transition-colors">
                  <Upload size={24} className="text-amber-600" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-700">Click to upload your Excel file</p>
                  <p className="text-xs text-gray-400 mt-1">.xlsx or .xls</p>
                </div>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
              </div>
            </div>
          )}

          {/* Preview */}
          {step === 'preview' && typeConfig && (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <FileSpreadsheet size={15} className="text-amber-600" />
                  <span className="font-medium text-gray-600 max-w-[180px] truncate">{fileName}</span>
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[11px] rounded-full">
                    {format === 'native' ? 'WELLSERVE Excel' : 'Import Template'}
                  </span>
                  <span className="text-gray-400">·</span>
                  <span className="font-semibold text-amber-600">{rows.length} rows</span>
                </div>
                <button onClick={resetUpload}
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                  <X size={13} /> Change file
                </button>
              </div>

              {/* What will be recorded notice */}
              {selectedType === 'membership' && (
                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <p className="text-xs font-semibold text-emerald-700 mb-1">Per member, this will record:</p>
                  <div className="flex flex-wrap gap-2">
                    {['Membership record','Membership payment tx','CBU account + deposit tx','Savings account + deposit tx'].map(l => (
                      <span key={l} className="text-[11px] bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5">{l}</span>
                    ))}
                  </div>
                </div>
              )}
              {(selectedType === 'cbu' || selectedType === 'savings') && (
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
                  <Info size={13} />
                  Existing accounts are updated. A deposit transaction is recorded for each member.
                </div>
              )}

              <div className="border border-gray-100 rounded-xl overflow-auto max-h-[340px]">
                <table className="w-full text-xs min-w-[500px]">
                  <thead className="bg-gray-50 text-gray-500 uppercase tracking-wide sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">#</th>
                      {previewCols.map(h => (
                        <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                        {previewCols.map(h => (
                          <td key={h} className="px-3 py-2 text-gray-700 max-w-[160px] truncate">
                            {h === '_sheet'
                              ? <span className="bg-gray-100 text-gray-500 rounded-full px-2 py-0.5 text-[10px]">{row[h]}</span>
                              : h === 'membership_type'
                                ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${row[h] === 'regular' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{row[h]}</span>
                                : (row[h] != null && row[h] !== '' ? row[h] : '—')}
                          </td>
                        ))}
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
              <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center">
                <Loader2 size={28} className="text-amber-600 animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700">Importing {typeConfig?.label}…</p>
                <p className="text-xs text-gray-400 mt-1">Recording transactions — please don't close this window.</p>
              </div>
              <div className="w-64 space-y-1.5">
                <div className="flex justify-between text-xs text-gray-500"><span>Progress</span><span>{progress}%</span></div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>
          )}

          {/* Done */}
          {step === 'done' && results && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl">
                <CheckCircle size={22} className="text-[#07A04E] flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-gray-800">{typeConfig?.label} import complete</p>
                  <div className="flex flex-wrap gap-3 mt-1.5">
                    {results.created > 0 && <span className="text-xs text-[#07A04E] font-medium">✦ {results.created} created</span>}
                    {results.updated > 0 && <span className="text-xs text-blue-600 font-medium">↻ {results.updated} updated</span>}
                    {results.skipped > 0 && <span className="text-xs text-gray-400 font-medium">⊘ {results.skipped} skipped (duplicate)</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Transactions and activity logs recorded.</p>
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

              <button onClick={() => { setStep('select'); setSelectedType(null); setResults(null); setParseResult(null); }}
                className="text-sm text-amber-600 hover:text-amber-700 font-medium">
                ← Import another type
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center">
          <p className="text-xs text-gray-400">
            {step === 'preview' && `${rows.length} rows ready · transactions will be recorded`}
          </p>
          <div className="flex gap-3">
            {step !== 'importing' && step !== 'done' && (
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">Cancel</button>
            )}
            {step === 'preview' && rows.length > 0 && (
              <button onClick={handleImport}
                className="flex items-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors">
                <Upload size={15} /> Import {rows.length} Records
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