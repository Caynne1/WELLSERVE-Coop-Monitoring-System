import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabase';

// Isolated client for user creation — never touches the admin's active session.
function createIsolatedClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

// ─── Default permission set for a new staff user ─────────────────────────────
export const DEFAULT_PERMISSIONS = {
  members:            { view: true,  create: false, edit: false, delete: false },
  loans:              { view: true,  create: false, edit: false, delete: false },
  cbu:                { view: true,  create: false, edit: false, delete: false },
  savings:            { view: true,  create: false, edit: false, delete: false },
  time_deposit:       { view: true,  create: false, edit: false, delete: false },
  savings_booster:    { view: true,  create: false, edit: false, delete: false },
  passbook:           { view: true,  create: false, edit: false, delete: false },
  account_monitoring: { view: true,  create: false, edit: false, delete: false },
  transactions:       { view: true,  create: false, edit: false, delete: false },
  checkbook:          { view: true,  create: false, edit: false, delete: false },
  invoices:           { view: true,  create: false, edit: false, delete: false },
  vouchers:           { view: true,  create: false, edit: false, delete: false },
  expenses:           { view: true,  create: false, edit: false, delete: false },
  reports:            { view: true,  create: false, edit: false, delete: false },
  logs:               { view: false, create: false, edit: false, delete: false },
  settings:           { view: false, create: false, edit: false, delete: false },
};

export const PERMISSION_MODULES = [
  { key: 'members',            label: 'Members',            group: 'Main' },
  { key: 'loans',              label: 'Loans',              group: 'Financial' },
  { key: 'cbu',                label: 'CBU',                group: 'Financial' },
  { key: 'savings',            label: 'Savings',            group: 'Financial' },
  { key: 'time_deposit',       label: 'Time Deposit',       group: 'Financial' },
  { key: 'savings_booster',   label: 'Savings Booster',    group: 'Financial' },
  { key: 'passbook',           label: 'Passbook',           group: 'Financial' },
  { key: 'account_monitoring', label: 'Account Monitoring', group: 'Financial' },
  { key: 'transactions',       label: 'Transactions',       group: 'Operations' },
  { key: 'checkbook',          label: 'Checkbook',          group: 'Operations' },
  { key: 'invoices',           label: 'Invoices',           group: 'Operations' },
  { key: 'vouchers',           label: 'Vouchers',           group: 'Operations' },
  { key: 'expenses',           label: 'Expenses',           group: 'Operations' },
  { key: 'reports',            label: 'Reports',            group: 'Analytics' },
  { key: 'logs',               label: 'Activity Logs',      group: 'Analytics' },
  { key: 'settings',           label: 'Settings',           group: 'Admin' },
];

export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete'];

// ─── Fetch all users (profiles table) ────────────────────────────────────────
export async function getUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ─── Fetch a single user ──────────────────────────────────────────────────────
export async function getUserById(id) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

// ─── Create a new staff user ─────────────────────────────────────────────────
// Strategy: We use a Supabase RPC function (create_staff_user) that runs with
// elevated privileges to create the auth user + profile in one transaction.
// If the RPC doesn't exist, we fall back to inserting a pending profile row
// that the staff member completes when they sign up via invite link.
export async function createUser({ full_name, email, password, role, permissions }) {
  // Try calling a server-side RPC first (if you set one up)
  // For now: use the invite approach — create a profile row with a generated UUID
  // and send an invite. The profile row will be linked when they sign up.

  // Use Supabase's built-in invite (sends email, no session switch)
  const { data: inviteData, error: inviteError } = await supabase.auth.admin?.inviteUserByEmail
    ? await supabase.auth.admin.inviteUserByEmail(email, {
        data: { full_name, role: role || 'staff' },
      })
    : { data: null, error: new Error('admin_unavailable') };

  // If admin API unavailable (client-side), fall back to signUp in a
  // separate temporary client so the current admin session is preserved.
  let userId;

  if (inviteError || !inviteData?.user) {
    // Fallback: create auth user via isolated client (admin session stays intact)
    const isolated = createIsolatedClient();
    const { data: authData, error: authError } = await isolated.auth.signUp({
      email,
      password,
      options: { data: { full_name } },
    });
    if (authError) throw authError;
    userId = authData.user?.id;
  } else {
    userId = inviteData.user?.id;
  }

  if (!userId) throw new Error('User creation failed — could not get user ID');

  // Insert profile row using service role privileges via RLS bypass
  // The admin's RLS policy must allow inserting rows for other users OR
  // you need an "admin can insert any profile" policy in Supabase.
  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      full_name,
      email,
      role: role || 'staff',
      status: 'active',
      permissions: permissions || DEFAULT_PERMISSIONS,
    });

  if (profileError) throw profileError;

  return { id: userId, full_name, email, role: role || 'staff', status: 'active', created_at: new Date().toISOString() };
}

// ─── Update user profile (name, role, status, permissions) ───────────────────
export async function updateUser(id, payload) {
  const { data, error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Toggle user active/inactive status ──────────────────────────────────────
export async function setUserStatus(id, status) {
  return updateUser(id, { status });
}

// ─── Update just permissions ──────────────────────────────────────────────────
export async function updateUserPermissions(id, permissions) {
  return updateUser(id, { permissions });
}