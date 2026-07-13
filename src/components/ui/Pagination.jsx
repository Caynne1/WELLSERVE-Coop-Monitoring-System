import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Pagination — WELLSERVE shared list-page pagination control.
 *
 * Renders "Showing X–Y of Z" summary + numbered page buttons with
 * Prev/Next and ellipses for large page counts. Also offers a
 * page-size selector when `onPageSizeChange` is provided.
 *
 * Usage:
 *   const { page, pageSize, setPage, setPageSize, pageItems, totalPages } =
 *     usePagination(filtered);
 *   ...
 *   <Pagination
 *     page={page}
 *     totalPages={totalPages}
 *     totalItems={filtered.length}
 *     pageSize={pageSize}
 *     onPageChange={setPage}
 *     onPageSizeChange={setPageSize}
 *   />
 */

function getPageList(current, total) {
  // Always show first, last, current, and a couple of neighbors; collapse the rest into '…'
  const pages = new Set([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);

  const result = [];
  let prev = null;
  for (const p of sorted) {
    if (prev !== null && p - prev > 1) result.push('…');
    result.push(p);
    prev = p;
  }
  return result;
}

export default function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  itemLabel = 'items',
  className = '',
}) {
  if (totalItems === 0) return null;

  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);
  const pages = getPageList(page, totalPages);

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 bg-white print:hidden ${className}`}
    >
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>
          Showing <span className="font-medium text-gray-700">{start}</span>–
          <span className="font-medium text-gray-700">{end}</span> of{' '}
          <span className="font-medium text-gray-700">{totalItems}</span> {itemLabel}
        </span>

        {onPageSizeChange && (
          <label className="flex items-center gap-1.5">
            <span className="hidden sm:inline">Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="border border-gray-200 rounded-lg text-xs py-1 pl-2 pr-6 text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 bg-white"
            >
              {pageSizeOptions.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            aria-label="Previous page"
          >
            <ChevronLeft size={15} />
          </button>

          {pages.map((p, i) =>
            p === '…' ? (
              <span key={`ellipsis-${i}`} className="px-2 text-xs text-gray-400 select-none">…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                className={`min-w-[28px] h-7 px-1.5 rounded-lg text-xs font-medium transition-colors ${
                  p === page
                    ? 'bg-[#07A04E] text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {p}
              </button>
            )
          )}

          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            aria-label="Next page"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}