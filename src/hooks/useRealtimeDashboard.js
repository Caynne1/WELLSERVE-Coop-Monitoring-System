import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { getDashboardStats } from '../services/dashboardService';

export function useRealtimeDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  async function fetchStats() {
    try {
      const data = await getDashboardStats();
      setStats(data);
    } catch (err) {
      console.error('Dashboard stats error:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStats();

    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, fetchStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loans' }, fetchStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, fetchStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, fetchStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_deposits' }, fetchStats)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  return { stats, loading, refetch: fetchStats };
}
