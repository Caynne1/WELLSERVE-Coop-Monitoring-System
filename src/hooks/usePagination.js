import { useEffect, useMemo, useState } from 'react';

/**
 * usePagination — client-side pagination over an already-filtered array.
 *
 * const { page, setPage, pageSize, setPageSize, pageItems, totalPages } =
 *   usePagination(filtered, { pageSize: 25 });
 *
 * Automatically clamps/resets the current page back to 1 whenever the
 * source list changes length in a way that would leave the page out of
 * range (e.g. a new search/filter is applied).
 */
export default function usePagination(items, { pageSize: initialPageSize = 25 } = {}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Keep page in range whenever the filtered list or page size changes.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages]); // eslint-disable-line react-hooks/exhaustive-deps

  const pageItems = useMemo(() => {
    const start = (Math.min(page, totalPages) - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize, totalPages]);

  function changePageSize(size) {
    setPageSize(size);
    setPage(1);
  }

  return {
    page: Math.min(page, totalPages),
    setPage,
    pageSize,
    setPageSize: changePageSize,
    pageItems,
    totalPages,
    totalItems,
  };
}