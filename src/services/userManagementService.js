import { supabase } from './supabase';

// ─── Default permission set for a new staff user ─────────────────────────────
export const DEFAULT_PERMISSIONS = {
  members:      { view: true,  create: false, edit: false, delete: false },
  loans:        { view: true,  create: false, edit: false, delete: false },
  cbu:          { view: true,  create: false, edit: false, delete: false },
  savings:      { view: true,  create: false, edit: false, delete: false },
  transactions: { view: true,  create: false, edit: false, delete: false },
  checkbook:    { view: true,  create: false, edit: false, delete: false },
  invoices:     { view: true,  create: false, edit: false, delete: false },
  vouchers:     { view: true,  create: false, edit: false, delete: false },
  expenses:     { view: true,  create: false, edit: false, delete: false },
  reports:      { view: true,  create: false, edit: false, delete: false },
  logs:         { view: false, create: false, edit: false, delete: false },
  settings:     { view: false, create: false, edit: false, delete: false },
};

export const PERMISSION_MODULES = [
  { key: 'members',      label: 'Members',         group: 'Main' },
  { key: 'loans',        label: 'Loans',            group: 'Financial' },
  { key: 'cbu',          label: 'CBU',              group: 'Financial' },
  { key: 'savings',      label: 'Savings',          group: 'Financial' },
  { key: 'transactions', label: 'Transactions',     group: 'Operations' },
  { key: 'checkbook',    label: 'Checkbook',        group: 'Operations' },
  { key: 'invoices',     label: 'Invoices',         group: 'Operations' },
  { key: 'vouchers',     label: 'Vouchers',         group: 'Operations' },
  { key: 'expenses',     label: 'Expenses',         group: 'Operations' },
  { key: 'reports',      label: 'Reports',          group: 'Analytics' },
  { key: 'logs',         label: 'Activity Logs',    group: 'Analytics' },
  { key: 'settings',     label: 'Settings',         group: 'Admin' },
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

// ─── Create a new staff user via Supabase Admin API ──────────────────────────
// NOTE: Supabase admin user creation requires calling supabase.auth.admin.createUser
// which is only available server-side. For a client-side app, we use signUp instead
// and then update the profile.
export async function createUser({ full_name, email, password, role, permissions }) {
  // 1. Create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name },
    },
  });
  if (authError) throw authError;

  const userId = authData.user?.id;
  if (!userId) throw new Error('User creation failed — no ID returned');

  // 2. Upsert profile row
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      full_name,
      email,
      role: role || 'staff',
      status: 'active',
      permissions: permissions || DEFAULT_PERMISSIONS,
    });

  if (profileError) throw profileError;

  return { id: userId, full_name, email, role, status: 'active' };
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
