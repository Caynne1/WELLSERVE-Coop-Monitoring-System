import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabase';

// Isolated client for user creation — never touches the admin's session.
// Uses the same public anon key but a separate auth state.
function createIsolatedClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

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
 *   1. Use an isolated Supabase client for signUp (admin session untouched)
 *   2. Insert matching row into profiles via the admin's main client
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

  // Step 1 — create auth user via isolated client (never touches admin session)
  const isolated = createIsolatedClient();
  const { data: signUpData, error: signUpError } = await isolated.auth.signUp({
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

  // Step 2 — insert profile row (uses admin's session, which was never disrupted)
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