import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileText, Search, Download, X, Calendar, Printer, RefreshCw,
  ActivitySquare, User, Layers, ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Spinner from '../../components/ui/Spinner';
import Button from '../../components/ui/Button';
import Pagination from '../../components/ui/Pagination';
import usePagination from '../../hooks/usePagination';
import { getLogs, subscribeToLogs, trackActivity } from '../../services/logService';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';
import { formatDateTime } from '../../utils/formatters';
import { printHtmlDocument, wrapWithLetterhead } from '../../utils/print';

const MODULE_COLORS = {
  loan: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  cbu: 'bg-[#D6FADC] text-[#07A04E] ring-1 ring-[#07A04E]/20',
  savings: 'bg-[#AEECEF]/35 text-[#000066] ring-1 ring-[#000066]/15',
  member: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
  voucher: 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200',
  invoice: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  expense: 'bg-red-50 text-red-600 ring-1 ring-red-200',
  checkbook: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
  auth: 'bg-slate-50 text-slate-700 ring-1 ring-slate-200',
  transaction: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
  time_deposit: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  account_monitoring: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  user_management: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  logs: 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200',
};

const ACTION_COLORS = {
  create: 'bg-green-50 text-green-700',
  update: 'bg-blue-50 text-blue-700',
  edit: 'bg-blue-50 text-blue-700',
  delete: 'bg-red-50 text-red-600',
  view: 'bg-gray-50 text-gray-600',
  approve: 'bg-emerald-50 text-emerald-700',
  reject: 'bg-rose-50 text-rose-700',
  release: 'bg-purple-50 text-purple-700',
  void: 'bg-amber-50 text-amber-700',
  payment: 'bg-teal-50 text-teal-700',
  export: 'bg-cyan-50 text-cyan-700',
  login: 'bg-indigo-50 text-indigo-700',
  logout: 'bg-slate-50 text-slate-600',
};

function actionBadgeClass(action = '') {
  const key = action.toLowerCase().replace(/_/g, '');
  for (const [match, className] of Object.entries(ACTION_COLORS)) {
    if (key.includes(match)) return className;
  }
  return 'bg-gray-100 text-gray-600';
}

function displayUser(log) {
  return log.user_name || log.profiles?.email || log.user_id || 'System';
}

function displayText(value) {
  return String(value || '-').replace(/_/g, ' ');
}

function uniqueOptions(rows, key) {
  return [...new Set(rows.map(row => row[key]).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b)));
}

function exportLogsToCSV(logs) {
  const headers = ['Date & Time', 'User Name', 'Module', 'Action Performed', 'Record ID', 'Description'];
  const rows = logs.map(log => [
    formatDateTime(log.created_at),
    displayUser(log),
    log.module || '',
    displayText(log.action),
    log.record_id || '',
    (log.description || '').replace(/,/g, ';'),
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function StatCard({ icon, label, value, sub, tone = 'gray' }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    purple: 'bg-purple-50 text-purple-700',
    gray: 'bg-gray-50 text-gray-700',
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${tones[tone] || tones.gray}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold text-gray-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function ActivityLogsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const fetchLogs = useCallback(async ({ quiet = false } = {}) => {
    try {
      if (!quiet) setLoading(true);
      const data = await getLogs({
        limit: 2000,
        search: appliedSearch,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
      });
      setLogs(data);
    } catch {
      toast.error('Failed to load activity logs');
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, dateFrom, dateTo]);

  useEffect(() => {
    fetchLogs();
    const channel = subscribeToLogs(() => fetchLogs({ quiet: true }));
    return () => supabase.removeChannel(channel);
  }, [fetchLogs]);

  const filteredLogs = useMemo(() => logs.filter(log => {
    const matchesModule = !moduleFilter || log.module === moduleFilter;
    const matchesAction = !actionFilter || log.action === actionFilter;
    return matchesModule && matchesAction;
  }), [logs, moduleFilter, actionFilter]);

  const moduleOptions = useMemo(() => uniqueOptions(logs, 'module'), [logs]);
  const actionOptions = useMemo(() => uniqueOptions(logs, 'action'), [logs]);
  const userCount = useMemo(
    () => new Set(filteredLogs.map(log => displayUser(log)).filter(Boolean)).size,
    [filteredLogs]
  );
  const latestLog = filteredLogs[0]?.created_at ? formatDateTime(filteredLogs[0].created_at) : 'No activity';
  const hasActiveFilters = appliedSearch || dateFrom || dateTo || moduleFilter || actionFilter;

  const { page, setPage, pageSize, setPageSize, pageItems, totalPages } = usePagination(filteredLogs, { pageSize: 25 });

  useEffect(() => {
    setPage(1);
  }, [filteredLogs, setPage]);

  function handleSearch() {
    setAppliedSearch(searchInput.trim());
  }

  function clearSearch() {
    setSearchInput('');
    setAppliedSearch('');
  }

  function clearDates() {
    setDateFrom('');
    setDateTo('');
  }

  function clearAllFilters() {
    setSearchInput('');
    setAppliedSearch('');
    setDateFrom('');
    setDateTo('');
    setModuleFilter('');
    setActionFilter('');
  }

  async function handleExport() {
    setExporting(true);
    try {
      const data = await getLogs({
        limit: 10000,
        search: appliedSearch,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
      });
      const scopedData = data.filter(log =>
        (!moduleFilter || log.module === moduleFilter) &&
        (!actionFilter || log.action === actionFilter)
      );
      exportLogsToCSV(scopedData);
      toast.success(`Exported ${scopedData.length} records`);

      if (user?.id) {
        trackActivity({
          userId: user.id,
          module: 'logs',
          action: 'export',
          description: `Exported audit trail CSV (${scopedData.length} records).`,
        });
      }
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  }

  function handlePrint() {
    const rows = filteredLogs.map(log => `<tr>
      <td style="white-space:nowrap">${log.created_at ? new Date(log.created_at).toLocaleString('en-PH') : '-'}</td>
      <td>${displayUser(log)}</td>
      <td style="text-transform:capitalize">${displayText(log.module)}</td>
      <td style="text-transform:capitalize">${displayText(log.action)}</td>
      <td style="font-family:monospace;font-size:8pt">${log.record_id || '-'}</td>
      <td style="max-width:240px">${log.description || '-'}</td>
    </tr>`).join('');
    const html = `
      <h1 class="report-title">Activity Logs</h1>
      <div class="report-meta">System audit trail | ${filteredLogs.length} records | Generated: ${new Date().toLocaleString('en-PH')}</div>
      <table>
        <thead><tr><th>Date &amp; Time</th><th>User Name</th><th>Module</th><th>Action Performed</th><th>Record ID</th><th>Description</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="confidential">WELLSERVE Cooperative Monitoring System - Authorized personnel only.</div>
    `;
    const win = printHtmlDocument(wrapWithLetterhead(html, { title: 'Activity Logs - WELLSERVE' }), {
      onBlocked: () => toast.error('Pop-up blocked. Please allow pop-ups and try again.'),
    });
    if (win) toast.success('Print dialog opened.');
  }

  return (
    <div className="p-6">
      <PageHeader title="Activity Logs" subtitle="Audit trail of who did what, where, and when" />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-5">
        <StatCard
          icon={<ActivitySquare size={20} />}
          label="Visible Events"
          value={filteredLogs.length.toLocaleString('en-PH')}
          sub={`${logs.length.toLocaleString('en-PH')} loaded`}
          tone="blue"
        />
        <StatCard
          icon={<Layers size={20} />}
          label="Modules"
          value={moduleOptions.length.toLocaleString('en-PH')}
          sub={moduleFilter ? `Filtered to ${displayText(moduleFilter)}` : 'Across loaded logs'}
          tone="purple"
        />
        <StatCard
          icon={<User size={20} />}
          label="Users"
          value={userCount.toLocaleString('en-PH')}
          sub="Users in current view"
          tone="green"
        />
        <StatCard
          icon={<ShieldCheck size={20} />}
          label="Latest Activity"
          value={latestLog}
          sub="Auto-refreshes live"
          tone="gray"
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-3 items-end">
        <div className="flex gap-2 flex-1 min-w-[220px] max-w-sm">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
              placeholder="Search action, module, user, record..."
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

        <select
          value={moduleFilter}
          onChange={e => setModuleFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#000066]/30 focus:border-[#000066]/60 capitalize"
        >
          <option value="">All Modules</option>
          {moduleOptions.map(module => (
            <option key={module} value={module}>{displayText(module)}</option>
          ))}
        </select>

        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#000066]/30 focus:border-[#000066]/60 capitalize"
        >
          <option value="">All Actions</option>
          {actionOptions.map(action => (
            <option key={action} value={action}>{displayText(action)}</option>
          ))}
        </select>

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

        <div className="flex-1" />

        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchLogs({ quiet: true })}
          icon={<RefreshCw size={13} className={loading ? 'animate-spin' : ''} />}
        >
          Refresh
        </Button>
        <Button variant="outline" size="sm" onClick={handlePrint} icon={<Printer size={13} />}>
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

      {hasActiveFilters && (
        <div className="mt-2 flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-400">Filters:</span>
          {appliedSearch && (
            <span className="inline-flex items-center gap-1 text-xs bg-[#000066]/8 text-[#000066] px-2.5 py-1 rounded-full">
              "{appliedSearch}"
              <button onClick={clearSearch}><X size={11} /></button>
            </span>
          )}
          {(dateFrom || dateTo) && (
            <span className="inline-flex items-center gap-1 text-xs bg-[#000066]/8 text-[#000066] px-2.5 py-1 rounded-full">
              {dateFrom || '...'} to {dateTo || '...'}
              <button onClick={clearDates}><X size={11} /></button>
            </span>
          )}
          {moduleFilter && (
            <span className="inline-flex items-center gap-1 text-xs bg-[#000066]/8 text-[#000066] px-2.5 py-1 rounded-full">
              Module: {displayText(moduleFilter)}
              <button onClick={() => setModuleFilter('')}><X size={11} /></button>
            </span>
          )}
          {actionFilter && (
            <span className="inline-flex items-center gap-1 text-xs bg-[#000066]/8 text-[#000066] px-2.5 py-1 rounded-full">
              Action: {displayText(actionFilter)}
              <button onClick={() => setActionFilter('')}><X size={11} /></button>
            </span>
          )}
          <span className="text-xs text-gray-400 ml-1">{filteredLogs.length} result{filteredLogs.length !== 1 ? 's' : ''}</span>
          <button onClick={clearAllFilters} className="text-xs text-gray-500 hover:text-gray-700 underline">
            Clear all
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Date & Time', 'User Name', 'Module', 'Action Performed', 'Record ID', 'Description'].map(header => (
                    <th key={header} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-16 text-gray-400">
                      <FileText size={32} className="mx-auto mb-2 text-gray-200" />
                      {hasActiveFilters ? 'No logs match your filters.' : 'No activity logs found.'}
                    </td>
                  </tr>
                ) : pageItems.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {formatDateTime(log.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-700 font-medium">{displayUser(log)}</span>
                      {!log.user_name && log.user_id && (
                        <p className="text-[10px] text-gray-400 font-mono">{log.user_id.slice(0, 8)}...</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {log.module ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full capitalize font-medium ${MODULE_COLORS[log.module] || 'bg-gray-100 text-gray-600'}`}>
                          {displayText(log.module)}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-md font-medium capitalize ${actionBadgeClass(log.action)}`}>
                        {displayText(log.action)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs font-mono">
                      {log.record_id ? String(log.record_id).slice(0, 12) : '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-md truncate" title={log.description}>
                      {log.description || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredLogs.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-xs text-gray-400 text-right">
              Showing {filteredLogs.length} of {logs.length} record{logs.length !== 1 ? 's' : ''}
            </div>
          )}

          <Pagination
            page={page}
            totalPages={totalPages}
            totalItems={filteredLogs.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemLabel="records"
          />
        </div>
      )}
    </div>
  );
}
