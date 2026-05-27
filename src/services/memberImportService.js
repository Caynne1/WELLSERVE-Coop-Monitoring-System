import * as XLSX from 'xlsx';
import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────

export const IMPORT_BATCH_SIZE = 200;
export const HEADER_SEARCH_DEPTH = 30;

// ─────────────────────────────────────────────────────────────
// COLUMN ALIASES
// ─────────────────────────────────────────────────────────────

const COLUMN_ALIASES = {
  member_no: [
    'member no',
    'member no.',
    'member number',
    'membership no',
    'membership number',
    'member id',
    'id no',
  ],

  first_name: [
    'first name',
    'firstname',
    'given name',
    'fname',
  ],

  last_name: [
    'last name',
    'lastname',
    'surname',
    'family name',
    'lname',
    'apellido',
  ],

  full_name: [
    'full name',
    'fullname',
    'member name',
    'complete name',
    'name',
  ],

  middle_initial: [
    'middle name',
    'middle initial',
    'middlename',
    'mi',
    'm.i.',
  ],

  date_joined: [
    'date joined',
    'join date',
    'joining date',
    'membership date',
    'registration date',
  ],

  date_of_birth: [
    'date of birth',
    'birthdate',
    'birth date',
    'dob',
    'birthday',
  ],

  civil_status: [
    'civil status',
    'marital status',
  ],

  sex: [
    'sex',
    'gender',
  ],

  occupation: [
    'occupation',
    'profession',
    'job',
  ],

  tin_no: [
    'tin',
    'tin no',
    'tin number',
    'tax id',
  ],

  sss_id_no: [
    'sss',
    'sss no',
    'sss number',
    'sss id',
  ],

  email: [
    'email',
    'email address',
    'e-mail',
  ],

  phone: [
    'cellphone number',
    'cellphone',
    'mobile number',
    'mobile',
    'contact number',
    'cp no',
    'cp number',
    'phone',
  ],

  res_tel_no: [
    'telephone number',
    'telephone',
    'landline',
    'tel no',
  ],

  recruiter_name: [
    'inviter',
    'recruiter',
    'inviter/recruiter',
    'referred by',
    'referrer',
    'sponsor',
    'invited by',
  ],

  membership_type: [
    'membership type',
    'member type',
    'membership classification',
    'member classification',
    'membership status',
    'regular or associate',
    'classification',
    'member category',
    'member class',
  ],

  membership_paid: [
    'membership paid',
    'membership fee',
    'membership amount',
  ],

  total_paid: [
    'total paid',
    'amount paid',
    'payment total',
    'total collection',
    'total collected',
    'total amount collected',
    'collected amount',
    'amount collected',
    'overall payment',
    'running total',
    'total contribution',
    'total contributions',
    'total shares',
    'total deposits',
    'share capital',
    'deposit total',
  ],

  closed_account: [
    'closed account',
    'withdrawn',
    'closed/withdrawn',
    'account closed',
  ],
};

// ─────────────────────────────────────────────────────────────
// NORMALIZERS
// ─────────────────────────────────────────────────────────────

function normalizeHeader(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\u00A0/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanCellValue(value) {
  if (value == null) return '';

  return String(value)
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function preserveNumericString(value) {
  if (value == null) return '';

  return String(value)
    .replace(/\.0$/, '')
    .trim();
}

// ─────────────────────────────────────────────────────────────
// ALIAS LOOKUP
// ─────────────────────────────────────────────────────────────

const ALIAS_LOOKUP = new Map();

for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
  aliases.forEach(alias => {
    ALIAS_LOOKUP.set(
      normalizeHeader(alias),
      field
    );
  });
}

// ─────────────────────────────────────────────────────────────
// FIELD RESOLVER
// ─────────────────────────────────────────────────────────────

function resolveFieldName(header) {
  const normalized = normalizeHeader(header);

  if (ALIAS_LOOKUP.has(normalized)) {
    return ALIAS_LOOKUP.get(normalized);
  }

  for (const [alias, field] of ALIAS_LOOKUP.entries()) {
    if (
      normalized.includes(alias) ||
      alias.includes(normalized)
    ) {
      return field;
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// PROPAGATE MERGED HEADERS
// ─────────────────────────────────────────────────────────────

function propagateMergedHeaders(row) {
  const output = [...row];

  let last = '';

  for (let i = 0; i < output.length; i++) {
    const value = cleanCellValue(output[i]);

    if (value) {
      last = value;
    } else if (last) {
      output[i] = last;
    }
  }

  return output;
}

// ─────────────────────────────────────────────────────────────
// DATE FORMATTER
// ─────────────────────────────────────────────────────────────

export function formatDateValue(value) {
  if (value == null || value === '') {
    return '';
  }

  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);

    if (!date) return '';

    return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
  }

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '';

    return value.toISOString().split('T')[0];
  }

  const s = cleanCellValue(value);

  if (!s) return '';

  const parsed = new Date(s);

  if (isNaN(parsed.getTime())) return '';

  return parsed.toISOString().split('T')[0];
}

// ─────────────────────────────────────────────────────────────
// PHONE NORMALIZER
// ─────────────────────────────────────────────────────────────

function normalizePhone(value) {
  const s = preserveNumericString(value)
    .replace(/[^\d+]/g, '');

  if (!s) return '';

  if (s.length === 10 && s.startsWith('9')) {
    return '0' + s;
  }

  return s;
}

// ─────────────────────────────────────────────────────────────
// MONEY PARSER
// ─────────────────────────────────────────────────────────────

function parseMoney(value) {
  if (value == null) return 0;

  if (typeof value === 'number') {
    return isNaN(value) ? 0 : Number(value);
  }

  const cleaned = String(value)
    .replace(/₱/g, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '')
    .trim();

  if (!cleaned) return 0;

  const parsed = parseFloat(cleaned);

  return isNaN(parsed) ? 0 : parsed;
}

// ─────────────────────────────────────────────────────────────
// MEMBERSHIP TYPE NORMALIZER
// ─────────────────────────────────────────────────────────────

function normalizeMembershipType(value) {
  if (value == null) {
    return 'regular';
  }

  const raw = String(value)
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  if (!raw) {
    return 'regular';
  }

  const regularValues = new Set([
    'regular',
    'reg',
    'r',
    'regular member',
    'regular membership',
  ]);

  const associateValues = new Set([
    'associate',
    'assoc',
    'assoc.',
    'associate member',
    'associate membership',
    'a',
  ]);

  if (regularValues.has(raw)) {
    return 'regular';
  }

  if (associateValues.has(raw)) {
    return 'associate';
  }

  if (
    raw.includes('associate') ||
    raw.includes('assoc')
  ) {
    return 'associate';
  }

  if (
    raw.includes('regular') ||
    raw.includes('reg')
  ) {
    return 'regular';
  }

  return 'regular';
}

// ─────────────────────────────────────────────────────────────
// NAME SPLITTER
// ─────────────────────────────────────────────────────────────

function splitFullName(name) {
  if (!name) {
    return {
      first_name: '',
      last_name: '',
      middle_initial: '',
    };
  }

  const s = cleanCellValue(name);

  if (s.includes(',')) {
    const [last, rest] = s.split(',');

    const parts = rest.trim().split(/\s+/);

    return {
      last_name: last.trim(),
      first_name: parts[0] ?? '',
      middle_initial: parts[1]?.charAt(0) ?? '',
    };
  }

  const parts = s.split(/\s+/);

  return {
    first_name: parts[0] ?? '',
    middle_initial:
      parts.length > 2
        ? parts[1]?.charAt(0)
        : '',
    last_name:
      parts.slice(parts.length > 2 ? 2 : 1).join(' '),
  };
}

// ─────────────────────────────────────────────────────────────
// DETECT HEADER ROW
// ─────────────────────────────────────────────────────────────

function detectHeaderRow(rows) {
  const limit = Math.min(
    rows.length,
    HEADER_SEARCH_DEPTH
  );

  let bestIndex = -1;
  let bestScore = -1;

  for (let i = 0; i < limit; i++) {
    const row = rows[i] ?? [];

    let score = 0;

    for (const cell of row) {
      const field = resolveFieldName(cell);

      if (field) {
        score += 10;

        if (
          ['first_name', 'last_name', 'full_name'].includes(field)
        ) {
          score += 100;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

// ─────────────────────────────────────────────────────────────
// FLEXIBLE SHEET PARSER
// ─────────────────────────────────────────────────────────────

function parseFlexibleSheet(rows, sheetName) {
  const headerIndex = detectHeaderRow(rows);

  if (headerIndex === -1) return null;

  let headerRow = propagateMergedHeaders(
    rows[headerIndex] ?? []
  );

  headerRow = headerRow.map(cleanCellValue);

  const columnMap = {};

  headerRow.forEach((header, index) => {
    const field = resolveFieldName(header);

    if (
      field &&
      !Object.values(columnMap).includes(field)
    ) {
      columnMap[index] = field;
    }
  });

  const parsed = [];
  const errors = [];

  rows.slice(headerIndex + 1).forEach((row, rowIndex) => {
    const actualRow = headerIndex + rowIndex + 2;

    if (!row) return;

    const raw = {};

    Object.entries(columnMap).forEach(([colIndex, field]) => {
      raw[field] = cleanCellValue(
        row[Number(colIndex)]
      );
    });

    if (
      !raw.first_name &&
      !raw.last_name &&
      raw.full_name
    ) {
      Object.assign(
        raw,
        splitFullName(raw.full_name)
      );
    }

    const firstName = cleanCellValue(raw.first_name);
    const lastName = cleanCellValue(raw.last_name);

    const hasData =
      firstName ||
      lastName ||
      raw.member_no ||
      raw.phone ||
      raw.email;

    if (!hasData) return;

    if (!firstName || !lastName) {
      errors.push({
        row: actualRow,
        sheet: sheetName,
        errors: ['Missing first or last name'],
      });

      return;
    }

    const detectedMembershipValue =
      raw.membership_type ??
      raw.membership_status ??
      raw.member_classification ??
      raw.membership_classification ??
      raw.classification ??
      '';

    const closedRaw = String(
      raw.closed_account ?? ''
    )
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    const isClosedAccount =
      closedRaw.includes('closed') ||
      closedRaw.includes('withdraw') ||
      closedRaw.includes('inactive') ||
      closedRaw === 'yes' ||
      closedRaw === 'y' ||
      closedRaw === 'true' ||
      closedRaw === '1';

    const status = isClosedAccount
      ? 'inactive'
      : 'active';

    const membershipType =
      isClosedAccount
        ? 'closed_account'
        : normalizeMembershipType(
            detectedMembershipValue
          );

    const membershipPaid = parseMoney(
      raw.membership_paid
    );

    let totalPaid = parseMoney(
      raw.total_paid
    );

    if (totalPaid <= 0) {
      totalPaid = membershipPaid;
    }

    if (totalPaid < membershipPaid) {
      totalPaid = membershipPaid;
    }

    parsed.push({
      _row: actualRow,
      _sheet: sheetName,

      member_no:
        preserveNumericString(raw.member_no),

      first_name: firstName.toUpperCase(),

      last_name: lastName.toUpperCase(),

      middle_initial:
        cleanCellValue(raw.middle_initial)
          .charAt(0)
          .toUpperCase(),

      date_joined:
        formatDateValue(raw.date_joined),

      date_of_birth:
        formatDateValue(raw.date_of_birth),

      civil_status:
        cleanCellValue(raw.civil_status),

      sex: cleanCellValue(raw.sex),

      occupation:
        cleanCellValue(raw.occupation),

      tin_no:
        preserveNumericString(raw.tin_no),

      sss_id_no:
        preserveNumericString(raw.sss_id_no),

      email:
        cleanCellValue(raw.email),

      phone:
        normalizePhone(raw.phone),

      res_tel_no:
        preserveNumericString(raw.res_tel_no),

      recruiter_name:
        cleanCellValue(raw.recruiter_name),

      membership_type:
        membershipType,

      membership_paid:
        membershipPaid,

      total_paid:
        totalPaid,

      status,
    });
  });

  return {
    parsed,
    rowErrors: errors,
  };
}

// ─────────────────────────────────────────────────────────────
// MAIN PARSER
// ─────────────────────────────────────────────────────────────

export async function parseImportFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = e => {
      try {
        const data = new Uint8Array(
          e.target.result
        );

        const workbook = XLSX.read(data, {
          type: 'array',
          cellDates: true,
          raw: false,
        });

        let allMembers = [];
        let allErrors = [];

        workbook.SheetNames.forEach(sheetName => {
          const sheet = workbook.Sheets[sheetName];

          const rows = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            raw: true,
            defval: '',
          });

          const result = parseFlexibleSheet(
            rows,
            sheetName
          );

          if (result) {
            allMembers.push(...result.parsed);
            allErrors.push(...result.rowErrors);
          }
        });

        const seen = new Set();

        const deduped = [];

        for (const member of allMembers) {
          const key = [
            member.last_name,
            member.first_name,
            member.middle_initial,
            member.date_of_birth,
          ]
            .join('|')
            .toUpperCase();

          if (!seen.has(key)) {
            seen.add(key);
            deduped.push(member);
          }
        }

        resolve({
          format: 'flexible',

          members: deduped,

          validationErrors: allErrors,

          totalDetected: allMembers.length,

          duplicatesInFile:
            allMembers.length - deduped.length,

          regularCount:
            deduped.filter(
              m => m.membership_type === 'regular'
            ).length,

          associateCount:
            deduped.filter(
              m => m.membership_type === 'associate'
            ).length,

          closedCount:
            deduped.filter(
              m =>
                m.membership_type ===
                'closed_account'
            ).length,

          mappedFields: [
            ...new Set(
              deduped.flatMap(m =>
                Object.keys(m)
              )
            ),
          ],
        });
      } catch (error) {
        reject(
          new Error(
            'Failed to parse file: ' +
              error.message
          )
        );
      }
    };

    reader.readAsArrayBuffer(file);
  });
}

// ─────────────────────────────────────────────────────────────
// BATCH IMPORT
// ─────────────────────────────────────────────────────────────

export async function batchImportMembers(
  members,
  onProgress
) {
  const results = {
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (let i = 0; i < members.length; i++) {
    const member = members[i];

    onProgress?.(
      i + 1,
      members.length,
      `Importing ${member.last_name}, ${member.first_name}`
    );

    try {
      // CLEAN PAYLOAD
      // ONLY SEND REAL DATABASE FIELDS

      const cleanedMember = {
        member_no:
          member.member_no || null,

        first_name:
          member.first_name || '',

        last_name:
          member.last_name || '',

        middle_initial:
          member.middle_initial || '',

        date_joined:
          member.date_joined || null,

        date_of_birth:
          member.date_of_birth || null,

        civil_status:
          member.civil_status || '',

        sex:
          member.sex || '',

        occupation:
          member.occupation || '',

        tin_no:
          member.tin_no || '',

        sss_id_no:
          member.sss_id_no || '',

        email:
          member.email || '',

        phone:
          member.phone || '',

        res_tel_no:
          member.res_tel_no || '',

        recruiter_name:
          member.recruiter_name || '',

        membership_type:
          member.membership_type || 'regular',

        membership_paid:
          Number(
            member.membership_paid || 0
          ),

        total_paid:
          Number(
            member.total_paid || 0
          ),

        status:
          member.status || 'active',
      };

      // CHECK EXISTING MEMBER

      const { data: existing, error: existingError } =
        await supabase
          .from('members')
          .select('id')
          .eq(
            'first_name',
            cleanedMember.first_name
          )
          .eq(
            'last_name',
            cleanedMember.last_name
          )
          .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      // UPDATE EXISTING MEMBER

      if (existing) {
        const { error: updateError } =
          await supabase
            .from('members')
            .update(cleanedMember)
            .eq(
              'id',
              existing.id
            );

        if (updateError) {
          throw updateError;
        }

        results.updated++;
      }

      // INSERT NEW MEMBER

      else {
        const { error: insertError } =
          await supabase
            .from('members')
            .insert([
              cleanedMember,
            ]);

        if (insertError) {
          throw insertError;
        }

        results.created++;
      }
    } catch (error) {
      console.error(
        'MEMBER IMPORT ERROR:',
        error
      );

      results.failed++;

      results.errors.push(
        `Row ${member._row}: ${error.message}`
      );
    }
  }

  // FORCE PAGE REFRESH EVENTS

  window.dispatchEvent(
    new CustomEvent(
      'members-imported',
      {
        detail: {
          timestamp:
            Date.now(),
        },
      }
    )
  );

  window.dispatchEvent(
    new Event(
      'dashboard-refresh'
    )
  );

  return results;
}

// ─────────────────────────────────────────────────────────────
// TEMPLATE DOWNLOAD
// ─────────────────────────────────────────────────────────────

export function downloadImportTemplate() {
  const template = [
    {
      'Member No.': '0001',
      'Last Name': 'DELA CRUZ',
      'First Name': 'JUAN',
      'Middle Name': 'SANTOS',
      'Date Joined': '2025-01-15',
      'Date of Birth': '1995-05-10',
      'Civil Status': 'Single',
      Sex: 'Male',
      Occupation: 'Teacher',
      'TIN Number': '123456789',
      'SSS Number': '987654321',
      Email: 'juan@example.com',
      'Cellphone Number': '09171234567',
      'Telephone Number': '0321234567',
      'Inviter/Recruiter': 'PEDRO REYES',
      'Membership Type': 'Regular',
      'Membership Paid': 500,
      'Total Paid': 1500,
      'Closed Account / Withdrawn': '',
    },
  ];

  const worksheet =
    XLSX.utils.json_to_sheet(template);

  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    'Members'
  );

  XLSX.writeFile(
    workbook,
    'member_import_template.xlsx'
  );
}