import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, List, X } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import { formatCurrency } from '../../utils/formatters';
import { incomeCategoryRoute } from '../../utils/incomeCategoryRoutes';

const COLORS = ['#07a04e', '#f97316', '#0f766e', '#65a30d', '#475569', '#dc2626', '#2563eb', '#0284c7', '#d97706', '#9333ea', '#14b8a6', '#a16207', '#7c3aed', '#db2777'];

export default function IncomeBreakdown({ rows = [], loading = false }) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(null);
  const [focused, setFocused] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const tooltipId = useId();
  // These are the exact category/value pairs used by Income Monitoring's report.
  const categories = rows.filter(([label]) => label !== 'Total Coop Income')
    .map(([label, value], index) => ({ label, value: Number(value || 0), color: COLORS[index % COLORS.length] }));
  const visibleCategories = categories.filter(row => row.value !== 0);
  const active = visibleCategories.find(row => row.label === (hovered ?? focused));
  const total = categories.reduce((sum, row) => sum + row.value, 0);
  const chartable = total > 0 && categories.every(row => row.value >= 0);
  const circumference = 2 * Math.PI * 38;
  let cumulative = 0;
  const segments = chartable ? categories.filter(row => row.value > 0).map(row => {
    const segment = { ...row, length: row.value / total * circumference, offset: -cumulative };
    cumulative += segment.length;
    return segment;
  }) : [];
  const clear = () => { setHovered(null); setFocused(null); };
  const openCategory = label => {
    setShowAll(false);
    clear();
    navigate(incomeCategoryRoute(label));
  };

  return (
    <section aria-label="Income Breakdown" className="relative bg-white rounded-lg border border-gray-100 shadow-sm p-5 min-w-0"
      onKeyDown={event => { if (event.key === 'Escape') clear(); }}>
      <h3 className="text-sm font-semibold text-gray-800 mb-4">Income Breakdown</h3>
      {loading ? <p role="status" className="text-xs text-gray-500 py-8 text-center">Loading income...</p> : categories.length === 0 ? (
        <p className="text-xs text-gray-500 py-8 text-center">No income data available.</p>
      ) : (
        <div className="flex items-start gap-3">
          <div className="w-28 h-28 flex-shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" aria-label="Income categories">
              <circle cx="50" cy="50" r="38" fill="none" stroke="#f3f4f6" strokeWidth="14" />
              {segments.map(row => (
                <circle key={row.label} cx="50" cy="50" r="38" fill="none" stroke={row.color}
                  strokeWidth={active?.label === row.label ? 17 : 14}
                  strokeDasharray={`${row.length} ${circumference}`} strokeDashoffset={row.offset}
                  transform="rotate(-90 50 50)" className="cursor-pointer transition-opacity"
                  style={{ opacity: !active || active.label === row.label ? 1 : 0.35 }}
                  onMouseEnter={() => setHovered(row.label)} onMouseLeave={() => setHovered(null)}
                  onClick={() => openCategory(row.label)}>
                  <title>{row.label}: {formatCurrency(row.value)}</title>
                </circle>
              ))}
              <text x="50" y="53" textAnchor="middle" fontSize="10" fill="#6b7280">Income</text>
            </svg>
          </div>
          <div className="flex-1 min-w-0 space-y-0.5">
            {visibleCategories.length === 0 && <p className="text-xs text-gray-500 py-2">No nonzero income categories.</p>}
            {visibleCategories.map(row => (
              <button key={row.label} type="button"
                aria-describedby={active?.label === row.label ? tooltipId : undefined}
                onMouseEnter={() => setHovered(row.label)} onMouseLeave={() => setHovered(null)}
                onFocus={() => setFocused(row.label)} onBlur={() => setFocused(null)}
                onClick={() => openCategory(row.label)}
                className="w-full flex items-start gap-2 rounded-md px-1.5 py-1 text-left text-xs leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
                style={{ background: active?.label === row.label ? `${row.color}12` : undefined }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: row.color }} />
                <span className="flex-1 min-w-0 break-words text-gray-600">{row.label}</span>
                {chartable && <span className="tabular-nums text-gray-500 flex-shrink-0">{(row.value / total * 100).toFixed(1)}%</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      {!loading && categories.length > 0 && <button type="button" aria-haspopup="dialog" aria-expanded={showAll}
        onClick={() => { clear(); setShowAll(true); }}
        className="mt-3 flex items-center gap-2 text-xs text-gray-600 hover:text-green-700 rounded-md py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600">
        <List size={15} />
        Show all categories
      </button>}
      {!loading && !showAll && active && <div id={tooltipId} role="tooltip"
        className="pointer-events-none absolute z-20 top-12 left-5 right-5 rounded-md bg-gray-900 px-3 py-2 text-xs text-white shadow-lg">
        <p className="break-words">{active.label}</p>
        <p className="font-semibold tabular-nums mt-1 break-all">{formatCurrency(active.value)}</p>
      </div>}
      <Modal open={showAll} onClose={() => setShowAll(false)} title="All Income Categories" size="lg">
        {loading ? <p role="status" className="text-sm text-gray-500">Loading income...</p> : (
          <div className="divide-y divide-gray-100">
            {categories.map(row => (
              <button key={row.label} type="button" onClick={() => openCategory(row.label)}
                className="w-full grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_auto_16px] items-center gap-x-3 gap-y-1 py-3 px-2 rounded-md text-left hover:bg-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600">
                <span className="flex items-start gap-2 min-w-0 text-sm text-gray-700">
                  <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: row.color }} />
                  <span className="break-words">{row.label}</span>
                </span>
                <span className="text-sm font-semibold tabular-nums text-gray-900 text-right">{formatCurrency(row.value)}</span>
                <ArrowUpRight size={16} className="hidden sm:block text-gray-400" />
              </button>
            ))}
          </div>
        )}
        <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end">
          <button type="button" onClick={() => setShowAll(false)} className="inline-flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
            <X size={15} /> Close
          </button>
        </div>
      </Modal>
    </section>
  );
}
