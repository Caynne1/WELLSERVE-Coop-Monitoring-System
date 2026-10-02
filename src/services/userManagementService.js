import { supabase } from './supabase';


// ─── Default permission set for a new staff user ─────────────────────────────
export const DEFAULT_PERMISSIONS = {
  members:            { view: true,  create: false, edit: false, delete: false },
  loans:              { view: true,  create: false, edit: false, delete: false, approve: false },
  cbu:                { view: true,  create: false, edit: false, delete: false },
  savings:            { view: true,  create: false, edit: false, delete: false },
  time_deposit:       { view: true,  create: false, edit: false, delete: false },
  savings_booster:    { view: true,  create: false, edit: false, delete: false },
  passbook:           { view: true,  create: false, edit: false, delete: false },
  account_monitoring: { view: true,  create: false, edit: false, delete: false },
  transactions:       { view: true,  create: false, edit: false, delete: false },
  checkbook:          { view: true,  create: false, edit: false, delete: false, approve: false },
  invoices:           { view: true,  create: false, edit: false, delete: false },
  vouchers:           { view: true,  create: false, edit: false, delete: false, approve: false },
  expenses:           { view: true,  create: false, edit: false, delete: false, approve: false },
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
];

export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete', 'approve'];
export const APPROVAL_MODULES = ['loans', 'expenses', 'vouchers', 'checkbook'];

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
export async function createUser(payload) {
  const { data, error } = await supabase.functions.invoke('admin-create-user', { body: payload });
  if (error) {
    let message = 'Account creation failed. Check the account list before retrying.';
    try {
      const details = await error.context?.json();
      if (details?.error) message = details.error;
    } catch { /* A gateway or network error may not have a JSON body. */ }
    throw new Error(message);
  }
  if (!data?.user?.id) throw new Error(data?.error || 'Account creation did not return a user.');
  return data.user;
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
