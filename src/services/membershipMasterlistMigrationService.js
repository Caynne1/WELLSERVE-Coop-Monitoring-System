import * as XLSX from 'xlsx';
import { supabase } from './supabase';
import { createTransaction } from './transactionService';

const REQUIRED_SHEETS = ['MASTERLIST', 'REGULAR', 'ASSOCIATE', 'CLOSED ACCOUNT'];
const MIGRATION_SOURCE = 'WELLServe Membership Masterlist Migration';

const OLD_MEMBERSHIP_BREAKDOWN = {
  associate: {
    label: 'Old Associate Membership',
    membership_entry: 300,
    cbu: 1000,
    savings: 500,
  },
  regular: {
    label: 'Old Regular / Fullpledge Membership',
    membership_entry: 1800,
    cbu: 4000,
    savings: 1000,
  },
};

function getOldBreakdown(type) {
  return OLD_MEMBERSHIP_BREAKDOWN[type] || OLD_MEMBERSHIP_BREAKDOWN.regular;
}

function getOldBreakdownTotal(type) {
  const breakdown = getOldBreakdown(type);
  return breakdown.membership_entry + breakdown.cbu + breakdown.savings;
}

function savingsAfterWellifeVip(row) {
  return Math.max(0, (row.savings_balance || 0) - (row.wellife_vip || 0));
}

function clean(value) {
  return String(value ?? '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanUpper(value) {
  return clean(value).toUpperCase();
}

function formatMemberNo(value) {
  const text = clean(value);
  if (!text) return '';
  return /^\d+$/.test(text) ? text.padStart(4, '0') : text;
}

function money(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = parseFloat(String(value).replace(/[₱,\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizePhone(value) {
  const text = clean(value);
  if (!text || text.toUpperCase() === 'NONE') return '';
  return text;
}

function normalizeEmail(value) {
  const text = clean(value);
  if (!text || text.toUpperCase() === 'NONE') return '';
  return text;
}

function nameKey(lastName, firstName, middleName = '', { ignoreMiddle = false } = {}) {
  const parts = [
    cleanUpper(lastName).replace(/\./g, ''),
    cleanUpper(firstName).replace(/\./g, ''),
  ];
  if (!ignoreMiddle) parts.push(cleanUpper(middleName).replace(/\./g, ''));
  return parts.join('|');
}

function truthyMark(value) {
  const text = clean(value).toLowerCase();
  return value === 1 || text === '1' || text === 'x' || text === 'yes' || text === 'true';
}

function hasPaymentRecord(row) {
  return [
    row.membership_paid,
    row.cbu_balance,
    row.savings_balance,
    row.wellife_vip,
    row.total_paid,
  ].some(amount => Number(amount || 0) > 0);
}

function readWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        resolve(XLSX.read(event.target.result, { type: 'array', cellDates: true, raw: true }));
      } catch (error) {
        reject(new Error(`Failed to read Excel file: ${error.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read Excel file.'));
    reader.readAsArrayBuffer(file);
  });
}

function sheetRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
}

function readNameSheet(workbook, sheetName) {
  return sheetRows(workbook, sheetName)
    .slice(2)
    .map((row, index) => ({
      row_no: index + 3,
      last_name: clean(row[1]),
      first_name: clean(row[2]),
      middle_initial: clean(row[3]),
    }))
    .filter(row => row.last_name || row.first_name)
    .map(row => ({
      ...row,
      key: nameKey(row.last_name, row.first_name, row.middle_initial),
      looseKey: nameKey(row.last_name, row.first_name, '', { ignoreMiddle: true }),
    }));
}

function buildTypeLookup(workbook) {
  const regularRows = readNameSheet(workbook, 'REGULAR');
  const associateRows = readNameSheet(workbook, 'ASSOCIATE');
  const closedRows = readNameSheet(workbook, 'CLOSED ACCOUNT');
  const exact = new Map();
  const loose = new Map();
  const warnings = [];

  const add = (rows, type) => {
    rows.forEach(row => {
      exact.set(row.key, type);
      if (!loose.has(row.looseKey)) {
        loose.set(row.looseKey, type);
      }
    });
  };

  add(regularRows, 'regular');
  add(associateRows, 'associate');
  add(closedRows, 'closed_account');

  return { exact, loose, regularRows, associateRows, closedRows, warnings };
}

function inferMembershipType(row, lookup, warnings) {
  const statusText = cleanUpper(row.status_label);
  if (statusText.includes('REGULAR')) return 'regular';
  if (statusText.includes('ASSOCIATE')) return 'associate';
  if (statusText.includes('CLOSED')) return 'closed_account';

  const exactType = lookup.exact.get(row.key);
  if (exactType) return exactType;

  const looseType = lookup.loose.get(row.looseKey);
  if (looseType) {
    warnings.push({
      row: row.row_no,
      member: row.display_name,
      message: `Matched as ${looseType} using last name and first name because middle name differed or was blank.`,
    });
    return looseType;
  }

  warnings.push({
    row: row.row_no,
    member: row.display_name,
    message: 'Could not match membership type from REGULAR, ASSOCIATE, or CLOSED ACCOUNT sheets. Defaulted to regular.',
  });
  return 'regular';
}

function parseMasterlist(workbook) {
  const missingSheets = REQUIRED_SHEETS.filter(sheet => !workbook.SheetNames.includes(sheet));
  if (missingSheets.length) {
    throw new Error(`Missing required sheet(s): ${missingSheets.join(', ')}`);
  }

  const lookup = buildTypeLookup(workbook);
  const warnings = [...lookup.warnings];
  const rows = sheetRows(workbook, 'MASTERLIST');
  const members = [];
  let skippedBlank = 0;
  let skippedTotals = 0;
  let skippedNoPayment = 0;

  rows.slice(2).forEach((row, index) => {
    const rowNo = index + 3;
    const lastName = clean(row[1]);
    const firstName = clean(row[2]);
    const middleName = clean(row[3]);
    const totalMarker = cleanUpper(row[1]);

    if (!lastName && !firstName) {
      skippedBlank += 1;
      return;
    }

    if (totalMarker === 'TOTAL') {
      skippedTotals += 1;
      return;
    }

    const member = {
      row_no: rowNo,
      member_no: formatMemberNo(row[0]),
      last_name: cleanUpper(lastName),
      first_name: cleanUpper(firstName),
      middle_initial: cleanUpper(middleName).charAt(0),
      address: clean(row[4]),
      date_joined: dateValue(row[5]),
      date_of_birth: dateValue(row[6]),
      civil_status: clean(row[7]),
      sex: truthyMark(row[8]) ? 'Male' : truthyMark(row[9]) ? 'Female' : '',
      occupation: clean(row[10]),
      tin_no: clean(row[11]),
      sss_id_no: clean(row[12]),
      email: normalizeEmail(row[13]),
      phone: normalizePhone(row[14]),
      res_tel_no: clean(row[15]),
      recruiter_name: clean(row[16]),
      membership_paid: money(row[17]),
      cbu_balance: money(row[18]),
      savings_balance: money(row[19]),
      wellife_vip: money(row[20]),
      promo_free: clean(row[21]),
      total_paid: money(row[22]),
      status_label: clean(row[23]),
      status_marker: clean(row[24]),
    };

    member.key = nameKey(member.last_name, member.first_name, member.middle_initial);
    member.looseKey = nameKey(member.last_name, member.first_name, '', { ignoreMiddle: true });
    member.display_name = `${member.last_name}, ${member.first_name}${member.middle_initial ? ` ${member.middle_initial}.` : ''}`;
    member.membership_type = inferMembershipType(member, lookup, warnings);
    member.status = member.membership_type === 'closed_account' ? 'closed' : 'active';
    member.member_no = member.member_no || formatMemberNo(members.length + 1);
    member.record_type = 'old_member';
    member.membership_structure = 'old';
    member.old_breakdown = getOldBreakdown(member.membership_type === 'closed_account' ? 'regular' : member.membership_type);
    member.old_breakdown_total = getOldBreakdownTotal(member.membership_type === 'closed_account' ? 'regular' : member.membership_type);

    if (!hasPaymentRecord(member)) {
      skippedNoPayment += 1;
      return;
    }

    members.push(member);
  });

  return {
    members,
    warnings,
    skippedBlank,
    skippedTotals,
    skippedNoPayment,
    sheetCounts: {
      regular: lookup.regularRows.length,
      associate: lookup.associateRows.length,
      closed: lookup.closedRows.length,
    },
  };
}

function summarize(rows, extra = {}) {
  const byType = rows.reduce((acc, row) => {
    acc[row.membership_type] = (acc[row.membership_type] || 0) + 1;
    return acc;
  }, {});

  const totals = rows.reduce((acc, row) => {
    acc.membership_paid += row.membership_paid || 0;
    acc.cbu += row.cbu_balance || 0;
    acc.savings += savingsAfterWellifeVip(row);
    acc.wellife_vip += row.wellife_vip || 0;
    acc.total_paid += row.total_paid || 0;
    acc.old_package_required += row.membership_type === 'closed_account' ? 0 : row.old_breakdown_total || 0;
    return acc;
  }, {
    membership_paid: 0,
    cbu: 0,
    savings: 0,
    wellife_vip: 0,
    total_paid: 0,
    old_package_required: 0,
  });

  return {
    total: rows.length,
    byType,
    totals,
    missing: {
      date_joined: rows.filter(row => !row.date_joined).length,
      date_of_birth: rows.filter(row => !row.date_of_birth).length,
      phone: rows.filter(row => !row.phone).length,
      email: rows.filter(row => !row.email).length,
    },
    ...extra,
  };
}

export async function analyzeMembershipMasterlist(file) {
  const workbook = await readWorkbook(file);
  const parsed = parseMasterlist(workbook);
  const existingCache = await fetchExistingMembers();
  const databasePreview = parsed.members.reduce((acc, row) => {
    const existing =
      existingCache.byNo.get(String(row.member_no)) ||
      existingCache.byName.get(row.key);
    if (existing) acc.membersToUpdate += 1;
    else acc.membersToCreate += 1;
    return acc;
  }, { membersToCreate: 0, membersToUpdate: 0 });

  return {
    sourceFile: file.name,
    rows: parsed.members,
    warnings: parsed.warnings,
    skippedBlank: parsed.skippedBlank,
    skippedTotals: parsed.skippedTotals,
    sheetCounts: parsed.sheetCounts,
    summary: summarize(parsed.members, {
      skippedBlank: parsed.skippedBlank,
      skippedTotals: parsed.skippedTotals,
      skippedNoPayment: parsed.skippedNoPayment,
      sheetCounts: parsed.sheetCounts,
      warningCount: parsed.warnings.length,
      databasePreview,
    }),
  };
}

async function fetchExistingMembers() {
  const { data, error } = await supabase
    .from('members')
    .select('id, member_no, first_name, last_name, middle_initial');
  if (error) throw error;

  const byNo = new Map();
  const byName = new Map();
  (data || []).forEach(member => {
    if (member.member_no) {
      byNo.set(String(member.member_no), member);
      byNo.set(formatMemberNo(member.member_no), member);
    }
    byName.set(nameKey(member.last_name, member.first_name, member.middle_initial), member);
  });

  return { byNo, byName };
}

async function upsertMember(row, existingCache) {
  const payload = {
    member_no: formatMemberNo(row.member_no) || null,
    first_name: row.first_name,
    last_name: row.last_name,
    middle_initial: row.middle_initial || '',
    address: row.address || '',
    date_joined: row.date_joined,
    date_of_birth: row.date_of_birth,
    civil_status: row.civil_status || '',
    sex: row.sex || '',
    occupation: row.occupation || '',
    tin_no: row.tin_no || '',
    sss_id_no: row.sss_id_no || '',
    email: row.email || '',
    phone: row.phone || '',
    res_tel_no: row.res_tel_no || '',
    recruiter_name: row.recruiter_name || '',
    membership_type: row.membership_type === 'closed_account' ? 'regular' : row.membership_type,
    membership_paid: row.membership_paid || 0,
    total_paid: row.total_paid || 0,
    record_type: row.record_type || 'old_member',
    status: row.status,
  };

  const existing =
    existingCache.byNo.get(String(row.member_no)) ||
    existingCache.byName.get(row.key);

  if (existing) {
    const { error } = await supabase.from('members').update(payload).eq('id', existing.id);
    if (error) throw error;
    return { id: existing.id, action: 'updated' };
  }

  const { data, error } = await supabase.from('members').insert(payload).select('id').single();
  if (error) throw error;
  return { id: data.id, action: 'created' };
}

async function upsertMembership(memberId, row, createdBy) {
  if (row.membership_type === 'closed_account') return 'skipped';

  const baseMembershipPayment = row.total_paid
    ? Math.max(0, row.total_paid - (row.wellife_vip || 0))
    : ((row.membership_paid || 0) + (row.cbu_balance || 0) + savingsAfterWellifeVip(row));
  const totalPaid = baseMembershipPayment + (row.wellife_vip || 0);
  const feeRequired = totalPaid || row.old_breakdown_total || getOldBreakdownTotal(row.membership_type);
  const feePaid = Math.min(totalPaid || 0, feeRequired);
  const breakdown = row.old_breakdown || getOldBreakdown(row.membership_type);

  const { data: existing, error: fetchError } = await supabase
    .from('member_memberships')
    .select('id')
    .eq('member_id', memberId)
    .limit(1);
  if (fetchError) throw fetchError;

  const payload = {
    member_id: memberId,
    membership_type: row.membership_type,
    fee_required: feeRequired,
    fee_paid: feePaid,
    status: 'active',
    notes: `${MIGRATION_SOURCE} from ${row.source_file || 'Excel masterlist'} | Old structure: Entry/Regulatory ${breakdown.membership_entry}, CBU ${breakdown.cbu}, Savings ${breakdown.savings}`,
    created_by: createdBy || null,
  };

  if (existing?.[0]?.id) {
    const { error } = await supabase
      .from('member_memberships')
      .update(payload)
      .eq('id', existing[0].id);
    if (error) throw error;
    return { id: existing[0].id, action: 'updated' };
  }

  const { data, error } = await supabase.from('member_memberships').insert(payload).select('id').single();
  if (error) throw error;
  return { id: data.id, action: 'created' };
}

async function upsertAccount(memberId, accountType, balance) {
  const { data: existing, error: fetchError } = await supabase
    .from('accounts')
    .select('id')
    .eq('member_id', memberId)
    .eq('account_type', accountType)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const payload = {
    member_id: memberId,
    account_type: accountType,
    balance: 0,
    status: 'active',
  };

  if (existing?.id) {
    return { id: existing.id, action: 'updated' };
  }

  const { data, error } = await supabase.from('accounts').insert(payload).select('id').single();
  if (error) throw error;
  return { id: data.id, action: 'created' };
}

async function hasMembershipPayment({ membershipId, memberId, amount, notes }) {
  const { data, error } = await supabase
    .from('membership_payments')
    .select('id, notes')
    .eq('member_membership_id', membershipId)
    .eq('member_id', memberId)
    .eq('amount', amount)
    .limit(20);
  if (error) throw error;
  return (data || []).some(row => row.notes === notes);
}

async function createMembershipPayment({ membershipId, memberId, amount, date, notes, createdBy }) {
  if (!amount || amount <= 0 || !membershipId) return 'skipped';
  if (await hasMembershipPayment({ membershipId, memberId, amount, notes })) return 'skipped';

  const { error } = await supabase.from('membership_payments').insert({
    member_membership_id: membershipId,
    member_id: memberId,
    amount,
    payment_date: date,
    notes,
    created_by: createdBy || null,
  });
  if (error) throw error;
  return 'created';
}

async function hasMigrationTransaction({ memberId, category, amount, reference, notes }) {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, reference, notes')
    .eq('member_id', memberId)
    .eq('category', category)
    .eq('amount', amount)
    .limit(20);
  if (error) throw error;
  return (data || []).some(tx => tx.reference === reference || tx.notes === notes);
}

async function createHistoricalTransaction({ memberId, accountId = null, category, type, amount, date, notes, reference, createdBy }) {
  if (!amount || amount <= 0) return 'skipped';
  if (await hasMigrationTransaction({ memberId, category, amount, reference, notes })) return 'skipped';

  await createTransaction({
    member_id: memberId,
    account_id: accountId,
    category,
    type,
    amount,
    transaction_date: date,
    reference,
    notes,
    created_by: createdBy || null,
  });
  return 'created';
}

export async function importMembershipMasterlistMigration(rows, {
  sourceFile = 'WELLServe MEMBERSHIP MASTERLIST 2026.xlsx',
  migrationDate = new Date().toISOString().slice(0, 10),
  createdBy = null,
  onProgress,
} = {}) {
  const existingCache = await fetchExistingMembers();
  const result = {
    membersCreated: 0,
    membersUpdated: 0,
    membershipsCreated: 0,
    membershipsUpdated: 0,
    accountsCreated: 0,
    accountsUpdated: 0,
    transactionsCreated: 0,
    transactionsSkipped: 0,
    failed: 0,
    errors: [],
  };

  for (let index = 0; index < rows.length; index += 1) {
    const row = { ...rows[index], source_file: sourceFile };
    const reference = `MIGRATION-${sourceFile}-${row.row_no}`;
    onProgress?.(index + 1, rows.length, `Importing ${row.display_name}`);

    try {
      const memberResult = await upsertMember(row, existingCache);
      if (memberResult.action === 'created') result.membersCreated += 1;
      else result.membersUpdated += 1;

      const membershipResult = await upsertMembership(memberResult.id, row, createdBy);
      if (membershipResult?.action === 'created') result.membershipsCreated += 1;
      if (membershipResult?.action === 'updated') result.membershipsUpdated += 1;

      const cbuAccount = await upsertAccount(memberResult.id, 'cbu', row.cbu_balance || 0);
      const effectiveSavings = savingsAfterWellifeVip(row);
      const savingsAccount = await upsertAccount(memberResult.id, 'savings', effectiveSavings);
      result.accountsCreated += [cbuAccount, savingsAccount].filter(a => a.action === 'created').length;
      result.accountsUpdated += [cbuAccount, savingsAccount].filter(a => a.action === 'updated').length;

      const baseMembershipPayment = row.total_paid
        ? Math.max(0, row.total_paid - (row.wellife_vip || 0))
        : ((row.membership_paid || 0) + (row.cbu_balance || 0) + effectiveSavings);
      const totalMembershipPayment = baseMembershipPayment + (row.wellife_vip || 0);
      const membershipPaymentNotes = JSON.stringify({
        entry: row.membership_paid || 0,
        cbu: row.cbu_balance || 0,
        savings: effectiveSavings,
        vip_card: row.wellife_vip || 0,
        text: `${MIGRATION_SOURCE}: total membership payment from ${sourceFile}`,
      });

      await createMembershipPayment({
        membershipId: membershipResult?.id,
        memberId: memberResult.id,
        amount: totalMembershipPayment,
        date: migrationDate,
        notes: membershipPaymentNotes,
        createdBy,
      });

      const txRequests = [
        {
          category: 'membership',
          type: 'membership_payment',
          amount: baseMembershipPayment,
          notes: `${MIGRATION_SOURCE}: total membership payment from ${sourceFile} | Membership ${row.membership_paid || 0}, CBU ${row.cbu_balance || 0}, Savings ${effectiveSavings}`,
        },
        {
          accountId: cbuAccount.id,
          category: 'cbu',
          type: 'deposit',
          amount: row.cbu_balance,
          notes: `${MIGRATION_SOURCE}: CBU membership breakdown from ${sourceFile}`,
        },
        {
          accountId: savingsAccount.id,
          category: 'savings',
          type: 'deposit',
          amount: effectiveSavings,
          notes: `${MIGRATION_SOURCE}: savings membership breakdown from ${sourceFile}`,
        },
        {
          category: 'membership',
          type: 'membership_payment',
          amount: row.wellife_vip,
          notes: `${MIGRATION_SOURCE}: WELLife VIP Card from ${sourceFile}`,
        },
      ];

      for (const tx of txRequests) {
        const txResult = await createHistoricalTransaction({
          ...tx,
          memberId: memberResult.id,
          date: migrationDate,
          reference: `${reference}-${tx.category}-${tx.notes.includes('WELLife') ? 'wellife' : tx.type}`,
          createdBy,
        });
        if (txResult === 'created') result.transactionsCreated += 1;
        else result.transactionsSkipped += 1;
      }
    } catch (error) {
      result.failed += 1;
      result.errors.push(`Row ${row.row_no} (${row.display_name}): ${error.message}`);
    }
  }

  return result;
}
