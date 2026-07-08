import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { getDashboardStats } from '../services/dashboardService';

export function useRealtimeDashboard(period = 'month') {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  async function fetchStats(p = period) {
    try {
      const data = await getDashboardStats(p);
      setStats(data);
    } catch (err) {
      console.error('Dashboard stats error:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    fetchStats(period);

    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, () => fetchStats(period))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loans' }, () => fetchStats(period))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, () => fetchStats(period))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => fetchStats(period))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => fetchStats(period))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vouchers' }, () => fetchStats(period))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_deposits' }, () => fetchStats(period))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kiddy_savings' }, () => fetchStats(period))
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  return { stats, loading, refetch: () => fetchStats(period) };
}