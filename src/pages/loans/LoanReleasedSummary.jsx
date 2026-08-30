import { Calendar, RefreshCw, Wallet, X } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

export function LoanReleaseDateFilter({ range, onRangeChange, years = [] }) {
  const selectedYear = years.find(year => range.from === `${year}-01-01` && range.to === `${year}-12-31`) || (range.from || range.to ? 'custom' : '');
  const invalidRange = range.from && range.to && range.from > range.to;
  return (
    <section aria-label="Released total date filter" className="mt-6 border-y border-gray-100 bg-white px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Release year" value={selectedYear}
          onChange={event => {
            const year = event.target.value;
            onRangeChange(year ? { from: `${year}-01-01`, to: `${year}-12-31` } : { from: '', to: '' });
          }}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#07A04E] bg-white text-gray-700">
          <option value="">All Years</option>
          {selectedYear === 'custom' && <option value="custom" disabled>Custom dates</option>}
          {years.map(year => <option key={year} value={year}>{year}</option>)}
        </select>
        <label className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-0 w-full sm:w-auto">
          <Calendar size={13} className="text-gray-400 flex-shrink-0" />
          <span className="text-gray-400 text-xs">From</span>
          <input type="date" aria-label="Release period from" value={range.from} max={range.to || undefined}
            onChange={event => onRangeChange({ ...range, from: event.target.value })}
            className="text-sm text-gray-700 bg-transparent border-none outline-none min-w-0 flex-1" />
        </label>
        <span aria-hidden="true" className="hidden sm:inline text-gray-300 text-sm">-</span>
        <label className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-0 w-full sm:w-auto">
          <Calendar size={13} className="text-gray-400 flex-shrink-0" />
          <span className="text-gray-400 text-xs">To</span>
          <input type="date" aria-label="Release period to" value={range.to} min={range.from || undefined}
            onChange={event => onRangeChange({ ...range, to: event.target.value })}
            className="text-sm text-gray-700 bg-transparent border-none outline-none min-w-0 flex-1" />
        </label>
        {(range.from || range.to) && <button type="button" title="Clear release dates" aria-label="Clear release dates"
          onClick={() => onRangeChange({ from: '', to: '' })}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg"><X size={16} /></button>}
      </div>
      {invalidRange && <p role="alert" className="mt-2 text-xs text-red-700">From date must not be after To date.</p>}
    </section>
  );
}

export default function LoanReleasedSummary({ total, loading, error, range, onRefresh }) {
  const invalidRange = range.from && range.to && range.from > range.to;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 min-w-0">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
          <Wallet size={18} className="text-green-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-400">Total Released</p>
          <p className="text-lg font-bold text-gray-900">
            {loading ? 'Loading...' : error || invalidRange || total == null ? 'Unavailable' : formatCurrency(total)}
          </p>
          <p className="text-xs text-gray-500">Net cash out{!range.from && !range.to ? ' | All time' : ''}</p>
        </div>
        <button type="button" title="Refresh released total" aria-label="Refresh released total" disabled={loading}
          onClick={onRefresh} className="p-2 text-gray-500 hover:text-green-700 disabled:opacity-40">
          <RefreshCw size={15} />
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">Released total could not be loaded.</p>}
    </div>
  );
}
