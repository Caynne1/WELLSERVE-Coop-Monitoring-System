const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function cleanLoanReference(value = '') {
  const text = String(value || '').trim().replace(/^[#:\s]+/, '');
  if (UUID.test(text)) return text;
  // Only strip a separated monetary suffix, never a hyphen inside an identifier.
  return text.replace(/\s+[-\u00b7|]\s+(?:(?:PHP|\u20b1)\s*)?\d[\d,]*(?:\.\d{1,2})?\s*$/i, '').trim();
}

export function extractLoanReferences(value = '') {
  const text = String(value || '');
  const refs = [
    ...text.matchAll(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi),
    ...text.matchAll(/Loan No\.?\s*:\s*(?!Loan ID\b)([^\s\n\r;|]+)/gi),
    ...text.matchAll(/Loan net proceeds\s*-\s*([^\s\n\r;|]+)/gi),
    ...text.matchAll(/\b(LN[-_/][A-Za-z0-9][A-Za-z0-9_/-]*)\b/gi),
  ].map(match => cleanLoanReference(match[1])).filter(Boolean);
  return [...new Set(refs)];
}

function nameKey(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean).sort().join(' ');
}

export function findReleaseMemberIds(members, payees) {
  const names = new Set(payees.filter(Boolean).map(nameKey).filter(Boolean));
  return members.filter(member => member.first_name && member.last_name && [
    [member.first_name, member.last_name],
    [member.first_name, member.middle_name, member.last_name],
  ].some(parts => names.has(nameKey(parts.filter(Boolean).join(' '))))).map(member => member.id);
}
