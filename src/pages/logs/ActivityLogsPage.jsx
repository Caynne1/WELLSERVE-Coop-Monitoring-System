import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileText, Search, Download, X, Calendar, Printer,
  ActivitySquare, User, Layers, ShieldCheck, FileSearch, Pencil,
} from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import Spinner from '../../components/ui/Spinner';
import Button from '../../components/ui/Button';
import Pagination from '../../components/ui/Pagination';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import { getLogs, getLogUsers, subscribeToLogs, trackActivity } from '../../services/logService';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';
import { printHtmlDocument, wrapWithLetterhead } from '../../utils/print';
import { activityActionOptions, formatActivityLogDescription } from '../../utils/activityLogActions';
import { getDocumentsForTracing, traceDocumentNumber } from '../../services/documentTracingService';

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
  return log.user_name || log.profiles?.email || (log.user_id ? 'Unknown user' : 'System');
}

function displayText(value) {
  return String(value || '-').replace(/_/g, ' ');
}

function uniqueOptions(rows, key) {
  return [...new Set(rows.map(row => row[key]).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b)));
}

function exportLogsToCSV(logs) {
  const headers = ['Date & Time', 'User Name', 'Module', 'Action Performed', 'Description'];
  const rows = logs.map(log => [
    formatDateTime(log.created_at),
    displayUser(log),
    log.module || '',
    displayText(log.action),
    formatActivityLogDescription(log).replace(/,/g, ';'),
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

function DescriptionCell({ log, onView }) {
  const description = formatActivityLogDescription(log);
  const limit = 100;
  const canExpand = description.length > limit;
  const preview = canExpand
    ? `${description.slice(0, limit).trimEnd()}...`
    : description;

  if (!canExpand) return <span>{preview}</span>;

  return (
    <button
      type="button"
      onClick={() => onView(log)}
      className="block w-full text-left text-gray-500 hover:text-[#000066] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#000066]/30 rounded-sm transition-colors"
      title="View full description"
      aria-label="View full activity description"
    >
      {preview}
    </button>
  );
}

export default function ActivityLogsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('logs');
  const [logs, setLogs] = useState([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [logUsers, setLogUsers] = useState([]);
  const [userFilter, setUserFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [descriptionTarget, setDescriptionTarget] = useState(null);
  const [tracingDocuments, setTracingDocuments] = useState([]);
  const [tracingLoading, setTracingLoading] = useState(true);
  const [tracingSearch, setTracingSearch] = useState('');
  const [tracingType, setTracingType] = useState('all');
  const [traceTarget, setTraceTarget] = useState(null);
  const [tracedNumber, setTracedNumber] = useState('');
  const [traceSaving, setTraceSaving] = useState(false);

  const fetchLogs = useCallback(async ({ quiet = false } = {}) => {
    try {
      if (!quiet) setLoading(true);
      const result = await getLogs({
        page, pageSize, search: appliedSearch, dateFrom: dateFrom || null,
        dateTo: dateTo || null, userId: userFilter,
        module: moduleFilter, action: actionFilter,
      });
      setLogs(result.rows);
      setTotalLogs(result.total);
    } catch (error) {
      console.error('[ActivityLogsPage]', error);
      toast.error(error.message || 'Failed to load activity logs');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, appliedSearch, dateFrom, dateTo, userFilter, moduleFilter, actionFilter]);

  useEffect(() => {
    getLogUsers().then(setLogUsers).catch(error => {
      console.warn('[ActivityLogsPage] Could not load user filter:', error);
      toast.error('Unable to load registered user list');
    });
  }, []);

  useEffect(() => {
    fetchLogs();
    const channel = subscribeToLogs(() => fetchLogs({ quiet: true }));
    return () => supabase.removeChannel(channel);
  }, [fetchLogs]);

  // Applying any filter starts the paged query from its first page.
  useEffect(() => { setPage(1); }, [appliedSearch, dateFrom, dateTo, userFilter, moduleFilter, actionFilter, pageSize]);

  const fetchTracingDocuments = useCallback(async () => {
    try {
      setTracingLoading(true);
      setTracingDocuments(await getDocumentsForTracing());
    } catch {
      toast.error('Failed to load documents for tracing');
    } finally {
      setTracingLoading(false);
    }
  }, []);

  useEffect(() => { fetchTracingDocuments(); }, [fetchTracingDocuments]);

  const filteredTracingDocuments = useMemo(() => {
    const query = tracingSearch.trim().toLowerCase();
    return tracingDocuments.filter(document => {
      if (tracingType !== 'all' && document.document_type !== tracingType) return false;
      if (!query) return true;
      return [document.document_label, document.party, document.current_number, document.status]
        .some(value => String(value || '').toLowerCase().includes(query));
    });
  }, [tracingDocuments, tracingSearch, tracingType]);

  function openTraceModal(document) {
    setTraceTarget(document);
    setTracedNumber('');
  }

  async function handleTraceDocument() {
    if (!traceTarget) return;
    setTraceSaving(true);
    try {
      await traceDocumentNumber(traceTarget, tracedNumber, user?.id);
      setTracingDocuments(current => current.filter(document => (
        document.document_type !== traceTarget.document_type || document.id !== traceTarget.id
      )));
      setTraceTarget(null);
      setTracedNumber('');
      toast.success(`${traceTarget.document_label} number updated.`);
    } catch (error) {
      toast.error(error.message || 'Unable to update the document number.');
    } finally {
      setTraceSaving(false);
    }
  }

  const filteredLogs = logs; // Already filtered by Supabase before paging.
  const moduleOptions = ['account_monitoring', 'auth', 'cbu', 'checkbook', 'expense',
    'invoice', 'loan', 'logs', 'member', 'savings', 'savings_booster', 'time_deposit',
    'transaction', 'user_management', 'voucher'];
  const actionOptions = activityActionOptions(logs);
  const userCount = new Set(filteredLogs.map(log => log.user_id).filter(Boolean)).size;
  const latestLog = filteredLogs[0]?.created_at ? formatDateTime(filteredLogs[0].created_at) : 'No activity';
  const hasActiveFilters = appliedSearch || dateFrom || dateTo || moduleFilter || actionFilter || userFilter;
  const totalPages = Math.max(1, Math.ceil(totalLogs / pageSize));
  const pageItems = filteredLogs;

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
    setUserFilter('');
  }

  async function handleExport() {
    setExporting(true);
    try {
      const collected = [];
      let expected = 0;
      for (let batchPage = 1; ; batchPage++) {
        const result = await getLogs({ page: batchPage, pageSize: 500,
          search: appliedSearch, dateFrom: dateFrom || null, dateTo: dateTo || null,
          userId: userFilter, module: moduleFilter, action: actionFilter });
        if (batchPage === 1) expected = result.total;
        collected.push(...result.rows);
        if (collected.length >= expected || !result.rows.length) break;
      }
      exportLogsToCSV(collected);
      toast.success(`Exported ${collected.length} records`);
      if (user?.id) trackActivity({ userId: user.id, module: 'logs', action: 'export',
        description: `Exported audit trail CSV (${collected.length} records).` });
    } catch (error) {
      console.error('[ActivityLogsPage] Export:', error);
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
      <td style="max-width:240px">${formatActivityLogDescription(log)}</td>
    </tr>`).join('');
    const html = `
      <h1 class="report-title">Activity Logs</h1>
      <div class="report-meta">System audit trail | Current page: ${filteredLogs.length} of ${totalLogs} matching records | Generated: ${new Date().toLocaleString('en-PH')}</div>
      <table>
        <thead><tr><th>Date &amp; Time</th><th>User Name</th><th>Module</th><th>Action Performed</th><th>Description</th></tr></thead>
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
    <div className="p-4 sm:p-6">
      <PageHeader title="Activity Logs" />

      <div className="mt-5 flex flex-wrap gap-2">
        {[
          { key: 'logs', label: 'Activity Logs', count: totalLogs },
          { key: 'tracing', label: 'Document Tracing', count: tracingDocuments.length },
        ].map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-all ${
              activeTab === tab.key
                ? 'border-[#07A04E] bg-[#07A04E] text-white shadow-sm shadow-emerald-200'
                : 'border-gray-100 bg-white text-gray-600 shadow-sm hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700'
            }`}
          >
            <span>{tab.label}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${
              activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {activeTab === 'logs' ? (
        <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-5">
        <StatCard
          icon={<ActivitySquare size={20} />}
          label="Visible Events"
          value={totalLogs.toLocaleString('en-PH')}
          sub={`${logs.length.toLocaleString('en-PH')} on current page`}
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
          sub="Active users on current page"
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
        <div className="flex w-full gap-2 sm:flex-1 sm:min-w-[220px] sm:max-w-sm">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
              placeholder="Search action, module, user, description..."
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
          aria-label="Filter activity by user"
          value={userFilter}
          onChange={e => setUserFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700"
        >
          <option value="">All Users</option>
          {logUsers.map(profile => (
            <option key={profile.id} value={profile.id}>{profile.full_name || profile.email || 'Unnamed account'}</option>
          ))}
        </select>

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
          {userFilter && (
            <span className="inline-flex items-center gap-1 text-xs bg-[#000066]/8 text-[#000066] px-2.5 py-1 rounded-full">
              User: {logUsers.find(p => p.id === userFilter)?.full_name || 'Selected user'}
              <button onClick={() => setUserFilter('')}><X size={11} /></button>
            </span>
          )}
          {actionFilter && (
            <span className="inline-flex items-center gap-1 text-xs bg-[#000066]/8 text-[#000066] px-2.5 py-1 rounded-full">
              Action: {displayText(actionFilter)}
              <button onClick={() => setActionFilter('')}><X size={11} /></button>
            </span>
          )}
          <span className="text-xs text-gray-400 ml-1">{totalLogs} result{totalLogs !== 1 ? 's' : ''}</span>
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
                  {['Date & Time', 'User Name', 'Module', 'Action Performed', 'Description'].map(header => (
                    <th key={header} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {totalLogs === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-16 text-gray-400">
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
                    <td className="px-4 py-3 text-gray-500 max-w-md">
                      <DescriptionCell log={log} onView={setDescriptionTarget} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredLogs.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-xs text-gray-400 text-right">
              Showing {logs.length} on this page of {totalLogs} matching records
            </div>
          )}

          <Pagination
            page={page}
            totalPages={totalPages}
            totalItems={totalLogs}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemLabel="records"
          />
        </div>
      )}
        </>
      ) : (
        <div className="mt-5 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Documents Awaiting Reference Numbers</h2>
              <p className="mt-1 text-xs text-gray-400">Resolve missing SI, voucher, and check numbers without changing any financial amount.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={tracingSearch}
                  onChange={event => setTracingSearch(event.target.value)}
                  placeholder="Search document or payee"
                  className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 sm:w-64"
                />
              </div>
              <select
                value={tracingType}
                onChange={event => setTracingType(event.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              >
                <option value="all">All Documents</option>
                <option value="invoice">Invoices</option>
                <option value="voucher">Vouchers</option>
                <option value="checkbook">Checks</option>
              </select>
            </div>
          </div>

          {tracingLoading ? (
            <div className="flex justify-center py-20"><Spinner /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Document', 'Current Number', 'Member / Payee', 'Date', 'Amount', 'Status', 'Action'].map(header => (
                      <th key={header} className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredTracingDocuments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-16 text-center text-gray-400">
                        <FileSearch size={30} className="mx-auto mb-2 text-gray-200" />
                        No documents are waiting for tracing.
                      </td>
                    </tr>
                  ) : filteredTracingDocuments.map(document => (
                    <tr key={`${document.document_type}-${document.id}`} className="transition-colors hover:bg-emerald-50/30">
                      <td className="px-4 py-3 text-center font-medium text-gray-800">{document.document_label}</td>
                      <td className="px-4 py-3 text-center font-mono text-xs text-gray-500">FOR TRACING</td>
                      <td className="max-w-[240px] truncate px-4 py-3 text-center font-medium text-gray-700" title={document.party}>{document.party}</td>
                      <td className="px-4 py-3 text-center text-xs text-gray-500">{formatDate(document.date || document.created_at)}</td>
                      <td className="px-4 py-3 text-center font-semibold tabular-nums text-gray-800">{formatCurrency(document.amount || 0)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">FOR TRACING</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => openTraceModal(document)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                          title={`Enter actual ${document.document_label} number`}
                        >
                          <Pencil size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/50 px-5 py-3 text-xs text-gray-400">
            <span>{filteredTracingDocuments.length} unresolved document{filteredTracingDocuments.length !== 1 ? 's' : ''}</span>
            <span>Reference-number updates only</span>
          </div>
        </div>
      )}

      <Modal
        open={!!descriptionTarget}
        onClose={() => setDescriptionTarget(null)}
        title="Activity Details"
        size="md"
      >
        {descriptionTarget && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400 mb-1">Date &amp; Time</p>
                <p className="font-medium text-gray-800">{formatDateTime(descriptionTarget.created_at)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">User</p>
                <p className="font-medium text-gray-800">{displayUser(descriptionTarget)}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Description</p>
              <p className="text-sm text-gray-700 leading-6 whitespace-pre-wrap break-words">
                {formatActivityLogDescription(descriptionTarget)}
              </p>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(traceTarget)}
        onClose={() => !traceSaving && setTraceTarget(null)}
        title={`Trace ${traceTarget?.document_label || 'Document'} Number`}
        size="md"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This updates the document number only. No payment, cash IN/OUT, approval, or release transaction will be created.
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm">
            <div>
              <p className="text-xs text-gray-400">Member / Payee</p>
              <p className="mt-1 font-medium text-gray-800">{traceTarget?.party || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Amount</p>
              <p className="mt-1 font-semibold text-gray-800">{formatCurrency(traceTarget?.amount || 0)}</p>
            </div>
          </div>
          <Input
            label={traceTarget?.document_type === 'invoice'
              ? 'Actual SI No.'
              : traceTarget?.document_type === 'voucher'
                ? 'Actual Voucher No.'
                : 'Actual Check No.'}
            value={tracedNumber}
            onChange={event => setTracedNumber(event.target.value)}
            placeholder="Enter the traced document number"
            autoFocus
          />
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
            <Button variant="outline" onClick={() => setTraceTarget(null)} disabled={traceSaving}>Cancel</Button>
            <Button onClick={handleTraceDocument} loading={traceSaving} disabled={!tracedNumber.trim()}>
              Save Traced Number
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
