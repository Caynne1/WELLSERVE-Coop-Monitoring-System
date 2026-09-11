export function paymentModeStorageValue(value) {
  const mode = String(value || '').trim();
  return /^for tracing$/i.test(mode) ? 'For Tracing' : (mode || null);
}

export function paymentModeDisplayValue(value, fallback = '') {
  const mode = String(value || '').trim();
  return /^for tracing$/i.test(mode) ? 'FOR TRACING' : (mode || fallback);
}
