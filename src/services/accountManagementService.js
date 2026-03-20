import { supabase } from './supabase';

// ── Read ──────────────────────────────────────────────────────

export async function getManagedAccounts() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, status, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[accountManagementService] getManagedAccounts error:', error.message);
    throw error;
  }

  return data || [];
}

export async function getProfileById(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, status, created_at')
    .eq('id', userId)
    .single();

  if (error) return null;
  return data;
}

// ── Create ────────────────────────────────────────────────────

/**
 * Create a new system account:
 *   1. Save current admin session
 *   2. signUp the new user in auth
 *   3. Restore admin session
 *   4. Insert matching row into profiles
 */
export async function createAccount({ full_name, email, password, role = 'staff' }) {
  const {
    data: { session: adminSession },
  } = await supabase.auth.getSession();

  if (!adminSession) {
    throw new Error('No active admin session found.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedName = full_name.trim();

  // Step 1 — create auth user
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
  });

  if (signUpError) {
    console.error('[accountManagementService] signUp error:', signUpError.message);
    throw signUpError;
  }

  const newUserId = signUpData?.user?.id;
  if (!newUserId) {
    throw new Error('Sign up succeeded but no user ID was returned.');
  }

  // Step 2 — restore admin session immediately
  const { error: restoreError } = await supabase.auth.setSession({
    access_token: adminSession.access_token,
    refresh_token: adminSession.refresh_token,
  });

  if (restoreError) {
    console.warn(
      '[accountManagementService] Failed to restore admin session:',
      restoreError.message
    );
  }

  // Step 3 — insert profile row
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: newUserId,
      full_name: normalizedName,
      email: normalizedEmail,
      role,
      status: 'active',
    })
    .select()
    .single();

  if (profileError) {
    console.error(
      '[accountManagementService] profile insert error:',
      profileError.message
    );
    throw profileError;
  }

  return profile;
}

// ── Activate / Deactivate ─────────────────────────────────────

export async function setAccountStatus(id, status) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error(
      '[accountManagementService] setAccountStatus error:',
      error.message
    );
    throw error;
  }

  return data;
}

export async function deactivateAccount(id) {
  return setAccountStatus(id, 'inactive');
}

export async function reactivateAccount(id) {
  return setAccountStatus(id, 'active');
}