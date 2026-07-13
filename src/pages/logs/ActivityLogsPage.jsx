import { useState, useEffect, useCallback, useRef } from 'react';
import { FileText, Search, Download, X, Calendar, Printer, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Spinner from '../../components/ui/Spinner';
import Button from '../../components/ui/Button';
import { getLogs, subscribeToLogs, trackActivity } from '../../services/logService';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';
import { formatDateTime } from '../../utils/formatters';
import { printHtmlDocument, wrapWithLetterhead } from '../../utils/print';

// ─── Module badge colours ─────────────────────────────────────────────────────
const MODULE_COLORS = {
  loan:       'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  cbu:        'bg-[#D6FADC] text-[#07A04E] ring-1 ring-[#07A04E]/20',
  savings:    'bg-[#AEECEF]/35 text-[#000066] ring-1 ring-[#000066]/15',
  member:     'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
  voucher:    'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200',
  invoice:    'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  expense:    'bg-red-50 text-red-600 ring-1 ring-red-200',
  checkbook:  'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
  auth:       'bg-slate-50 text-slate-700 ring-1 ring-slate-200',
  transaction:   'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
  time_deposit:  'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  account_monitoring: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  user_management: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
};

// ─── Action badge colours ─────────────────────────────────────────────────────
const ACTION_COLORS = {
  create:  'bg-green-50 text-green-700',
  update:  'bg-blue-50 text-blue-700',
  edit:    'bg-blue-50 text-blue-700',
  delete:  'bg-red-50 text-red-600',
  view:    'bg-gray-50 text-gray-600',
  approve: 'bg-emerald-50 text-emerald-700',
  reject:  'bg-rose-50 text-rose-700',
  release: 'bg-purple-50 text-purple-700',
  void:    'bg-amber-50 text-amber-700',
  payment: 'bg-teal-50 text-teal-700',
  export:  'bg-cyan-50 text-cyan-700',
  login:   'bg-indigo-50 text-indigo-700',
  logout:  'bg-slate-50 text-slate-600',
};

function actionBadgeClass(action = '') {
  const key = action.toLowerCase().replace(/_/g, '');
  for (const [k, cls] of Object.entries(ACTION_COLORS)) {
    if (key.includes(k)) return cls;
  }
  return 'bg-gray-100 text-gray-600';
}

// ─── CSV export helper ────────────────────────────────────────────────────────
function displayUser(log) {
  return log.user_name || log.profiles?.email || log.user_id || 'System';
}

function exportToCSV(logs) {
  const headers = ['Date & Time', 'User Name', 'Module', 'Action Performed', 'Description'];
  const rows = logs.map(log => [
    formatDateTime(log.created_at),
    displayUser(log),
    log.module || '',
    (log.action || '').replace(/_/g, ' '),
    (log.description || '').replace(/,/g, ';'),   // escape commas
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ActivityLogsPage() {
  const { user } = useAuth();
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Filter state
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  const searchRef = useRef(null);

  // ── Fetch (respects applied filters only) ──
  const fetchLogs = useCallback(async (opts = {}) => {
    try {
      const data = await getLogs({
        limit:    500,
        search:   opts.search   ?? appliedSearch,
        dateFrom: (opts.dateFrom ?? dateFrom)  || null,
        dateTo:   (opts.dateTo   ?? dateTo)    || null,
      });
      setLogs(data);
    } catch {
      toast.error(
        (t) => (
          <span className="flex items-center gap-3 text-sm">
            Failed to load activity logs
            <button
              className="flex-shrink-0 text-xs font-bold underline"
              onClick={() => { toast.dismiss(t.id); fetchLogs(opts); }}
            >
              Retry
            </button>
          </span>
        ),
        { duration: 6000 }
      );
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, dateFrom, dateTo]);

  // ── Initial load + realtime subscription ──
  useEffect(() => {
    fetchLogs();
    const channel = subscribeToLogs(() => fetchLogs());
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);                          // run once on mount

  // ── Re-fetch when applied filters change ──
  useEffect(() => {
    setLoading(true);
    fetchLogs({ search: appliedSearch, dateFrom: dateFrom || null, dateTo: dateTo || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedSearch, dateFrom, dateTo]);

  // ── Search handlers ──
  const handleSearch = () => {
    setAppliedSearch(searchInput.trim());
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  const clearSearch = () => {
    setSearchInput('');
    setAppliedSearch('');
  };

  const clearDates = () => {
    setDateFrom('');
    setDateTo('');
  };

  const refreshLogs = () => {
    setLoading(true);
    fetchLogs({ search: appliedSearch, dateFrom: dateFrom || null, dateTo: dateTo || null });
  };

  const hasActiveFilters = appliedSearch || dateFrom || dateTo;

  // ── Export ──
  const handleExport = async () => {
    setExporting(true);
    try {
      // Export with current filters but higher limit
      const data = await getLogs({
        limit:    5000,
        search:   appliedSearch,
        dateFrom: dateFrom || null,
        dateTo:   dateTo   || null,
      });
      exportToCSV(data);
      toast.success(`Exported ${data.length} records`);

      // Track the export action
      if (user?.id) {
        trackActivity({
          userId:      user.id,
          module:      'logs',
          action:      'export',
          description: `Exported audit trail CSV (${data.length} records).`,
        });
      }
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  function handlePrint() {
    const rows = logs.map(log => `<tr>
      <td style="white-space:nowrap">${log.created_at ? new Date(log.created_at).toLocaleString('en-PH') : '—'}</td>
      <td>${displayUser(log)}</td>
      <td style="text-transform:capitalize">${log.module||'—'}</td>
      <td style="text-transform:capitalize">${(log.action||'').replace(/_/g,' ')}</td>
      <td style="max-width:240px">${log.description||'—'}</td>
    </tr>`).join('');
    const html = `
      <h1 class="report-title">Activity Logs</h1>
      <div class="report-meta">System audit trail &nbsp;|&nbsp; ${logs.length} records &nbsp;|&nbsp; Generated: ${new Date().toLocaleString('en-PH')}</div>
      <table>
        <thead><tr><th>Date &amp; Time</th><th>User Name</th><th>Module</th><th>Action Performed</th><th>Description</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="confidential">WELLSERVE Cooperative Monitoring System — Authorized personnel only.</div>
    `;
    const win = printHtmlDocument(wrapWithLetterhead(html, {title:'Activity Logs — WELLSERVE'}), {
      onBlocked: () => toast.error('Pop-up blocked. Please allow pop-ups and try again.'),
    });
    if (win) toast.success('Print dialog opened.');
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-6">
      <PageHeader title="Activity Logs" subtitle="System audit trail" />

      {/* ── Toolbar ── */}
      <div className="mt-5 flex flex-wrap gap-3 items-end">

        {/* Search box */}
        <div className="flex gap-2 flex-1 min-w-[220px] max-w-sm">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search action, module, user…"
              className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#000066]/30 focus:border-[#000066]/60"
            />
            {searchInput && (
              <button onClick={clearSearch} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={13} />
              </button>
            )}
          </div>
          <Button variant="blue" size="sm" onClick={handleSearch} icon={<Search size={13} />}>
            Search
          </Button>
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-gray-400 flex-shrink-0" />
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#000066]/30 focus:border-[#000066]/60 text-gray-700"
          />
          <span className="text-gray-400 text-xs">to</span>
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={e => setDateTo(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#000066]/30 focus:border-[#000066]/60 text-gray-700"
          />
          {(dateFrom || dateTo) && (
            <button onClick={clearDates} className="text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Action buttons */}
        <Button
          variant="outline"
          size="sm"
          onClick={refreshLogs}
          icon={<RefreshCw size={13} className={loading ? 'animate-spin' : ''} />}
        >
          Refresh
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrint}
          icon={<Printer size={13} />}
        >
          Print
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          loading={exporting}
          icon={<Download size={13} />}
        >
          Export CSV
        </Button>
      </div>

      {/* Active filter pills */}
      {hasActiveFilters && (
        <div className="mt-2 flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-400">Filters:</span>
          {appliedSearch && (
            <span className="inline-flex items-center gap-1 text-xs bg-[#000066]/8 text-[#000066] px-2.5 py-1 rounded-full">
              &ldquo;{appliedSearch}&rdquo;
              <button onClick={clearSearch}><X size={11} /></button>
            </span>
          )}
          {(dateFrom || dateTo) && (
            <span className="inline-flex items-center gap-1 text-xs bg-[#000066]/8 text-[#000066] px-2.5 py-1 rounded-full">
              {dateFrom || '…'} → {dateTo || '…'}
              <button onClick={clearDates}><X size={11} /></button>
            </span>
          )}
          <span className="text-xs text-gray-400 ml-1">{logs.length} result{logs.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* ── Table ── */}
      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Date & Time', 'User Name', 'Module', 'Action Performed', 'Description'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-16 text-gray-400">
                      <FileText size={32} className="mx-auto mb-2 text-gray-200" />
                      {hasActiveFilters ? 'No logs match your filters.' : 'No activity logs found.'}
                    </td>
                  </tr>
                ) : logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50/60 transition-colors">

                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {formatDateTime(log.created_at)}
                    </td>

                    <td className="px-4 py-3">
                      {log.user_name ? (
                        <span className="text-gray-700 font-medium">{log.user_name}</span>
                      ) : log.user_id ? (
                        <span className="text-gray-400 text-xs font-mono">{log.user_id.slice(0, 8)}…</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {log.module ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full capitalize font-medium ${MODULE_COLORS[log.module] || 'bg-gray-100 text-gray-600'}`}>
                          {log.module}
                        </span>
                      ) : '—'}
                    </td>

                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-md font-medium capitalize ${actionBadgeClass(log.action)}`}>
                        {(log.action || '—').replace(/_/g, ' ')}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-gray-500 max-w-md truncate" title={log.description}>
                      {log.description || '—'}
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer row count */}
          {logs.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-xs text-gray-400 text-right">
              Showing {logs.length} record{logs.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}