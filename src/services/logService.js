import { supabase } from './supabase';

export async function getLogs(limit = 100) {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function createLog(payload) {
  const { error } = await supabase.from('activity_logs').insert(payload);
  if (error) console.warn('Log write failed:', error);
}

// ─── Realtime subscription ───────────────────────────────────────────────────
// Call this to listen for any INSERT on the activity_logs table.
// The trigger writes logs automatically — this just tells the page to re-fetch.
// Returns the channel so the caller can unsubscribe on cleanup.
//
// Usage:
//   const channel = subscribeToLogs(() => refetch());
//   return () => supabase.removeChannel(channel);
//
export function subscribeToLogs(onChange) {
  const channel = supabase
    .channel('activity-logs-realtime')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'activity_logs' },
      onChange
    )
    .subscribe();
  return channel;
}