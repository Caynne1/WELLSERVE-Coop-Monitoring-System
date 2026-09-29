export function readRecoveryLink(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (params.has('error') || params.has('error_code')) return null;
  if (params.get('type') !== 'recovery') return null;
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  return access_token && refresh_token ? { access_token, refresh_token } : null;
}

export function isRecoveryPage(location) {
  return ['/reset-password', '/forgot-password'].includes(location.pathname)
    || new URLSearchParams(location.hash.replace(/^#/, '')).get('type') === 'recovery';
}
