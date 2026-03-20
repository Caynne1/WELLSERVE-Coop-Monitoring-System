import { supabase } from './supabase';

// ─── Detect the correct staff table name ────────────────────────────────────
// Try 'staff' first, then 'users', then 'profiles'.
// If none match, returns empty array gracefully.

async function getStaffTableName() {
  // Try common table names
  for (const table of ['staff', 'users', 'profiles']) {
    const { error } = await supabase.from(table).select('id').limit(1);
    if (!error) return table;
  }
  return null;
}

export async function getStaff() {
  const table = await getStaffTableName();
  if (!table) return []; // No staff table found — return empty list

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('Staff load error:', error.message);
    return [];
  }
  return data || [];
}

export async function createStaff(payload) {
  const table = await getStaffTableName();
  if (!table) throw new Error('No staff table found in database');

  const { data, error } = await supabase.from(table).insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateStaff(id, payload) {
  const table = await getStaffTableName();
  if (!table) throw new Error('No staff table found in database');

  const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteStaff(id) {
  const table = await getStaffTableName();
  if (!table) throw new Error('No staff table found in database');

  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
}