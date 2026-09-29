import { createClient } from '@supabase/supabase-js';
import { readRecoveryLink } from '../utils/recoveryLink';

// Recovery credentials never replace the operator's normal session.
const client = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'wellserve-recovery' },
});
let validation;

export async function requestPasswordRecovery(email) {
  const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: new URL('/reset-password', window.location.origin).href,
  });
  if (error) throw new Error('Unable to send a reset email. Please wait a minute and try again.');
}

export function validateRecoveryLink() {
  // Share the promise across React StrictMode's repeated effect setup.
  if (!validation) {
    const tokens = readRecoveryLink(window.location.hash);
    window.history.replaceState(null, '', '/reset-password');
    validation = (async () => {
      if (!tokens) return false;
      const { error } = await client.auth.setSession(tokens);
      if (error) return false;
      const { data, error: userError } = await client.auth.getUser();
      return !userError && !!data.user;
    })().catch(() => false);
  }
  return validation;
}

export async function saveRecoveredPassword(password) {
  if (!validation || !(await validation)) throw new Error('Request a new password-reset link.');
  const { error } = await client.auth.updateUser({ password });
  if (error) throw new Error('The password could not be saved. Check password requirements or request a new link.');
  // Saving has succeeded even if revoking the recovery session encounters a network error.
  validation = Promise.resolve(false);
  await client.auth.signOut({ scope: 'local' }).catch(() => {});
}
