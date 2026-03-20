import { useState, useEffect, useCallback } from 'react';
import { FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Spinner from '../../components/ui/Spinner';
import { getLogs, subscribeToLogs } from '../../services/logService';
import { supabase } from '../../services/supabase';
import { formatDateTime } from '../../utils/formatters';

const MODULE_COLORS = {
  loan:    'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  cbu:     'bg-[#D6FADC] text-[#07A04E] ring-1 ring-[#07A04E]/20',
  savings: 'bg-[#AEECEF]/35 text-[#000066] ring-1 ring-[#000066]/15',
};

export default function ActivityLogsPage() {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    try {
      const data = await getLogs(200);
      setLogs(data);
    } catch {
      toast.error('Failed to load activity logs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();

    // Re-fetch whenever the trigger writes a new row to activity_logs.
    // This fires automatically after every successful transaction insert.
    const channel = subscribeToLogs(() => fetchLogs());
    return () => supabase.removeChannel(channel);
  }, [fetchLogs]);

  return (
    <div className="p-6">
      <PageHeader title="Activity Logs" subtitle="System audit trail" />

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <div className="mt-5 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Action', 'Module', 'Description', 'User', 'Date'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-gray-400">
                      <FileText size={32} className="mx-auto mb-2 text-gray-200" />
                      No activity logs found.
                    </td>
                  </tr>
                ) : logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-700 capitalize">
                      {log.action?.replace(/_/g, ' ') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {log.module ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full capitalize font-medium ${MODULE_COLORS[log.module] || 'bg-gray-100 text-gray-600'}`}>
                          {log.module}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs">
                      {log.description || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                      {log.user_email || (log.user_id ? log.user_id.slice(0, 8) + '…' : '—')}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {formatDateTime(log.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}