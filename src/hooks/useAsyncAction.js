import { useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';

/**
 * useAsyncAction
 *
 * Wraps an async function with:
 *  - loading state so buttons can show spinners / go disabled
 *  - duplicate-click guard (fires once; ignores re-clicks while running)
 *  - automatic toast.error on failure (with optional Retry action)
 *
 * Usage:
 *   const { execute: doDelete, loading: deleting } = useAsyncAction(
 *     () => deleteMember(id),
 *     { errorMessage: 'Failed to delete member', showRetry: true }
 *   );
 *
 *   <Button loading={deleting} onClick={doDelete}>Delete</Button>
 *
 * Options:
 *   errorMessage  – static fallback message (falls back to err.message then generic)
 *   showRetry     – show a "Retry" action inside the error toast
 *   onError(err)  – custom error handler (skips auto-toast when provided)
 *   onSuccess(v)  – callback fired with the return value on success
 */
export function useAsyncAction(fn, options = {}) {
  const { errorMessage, showRetry = false, onError, onSuccess } = options;
  const [loading, setLoading] = useState(false);
  const inFlightRef = useRef(false);

  const execute = useCallback(
    async (...args) => {
      // Prevent overlapping calls
      if (inFlightRef.current) return;

      inFlightRef.current = true;
      setLoading(true);

      try {
        const result = await fn(...args);
        onSuccess?.(result);
        return result;
      } catch (err) {
        const msg =
          errorMessage ||
          (err instanceof Error ? err.message : null) ||
          'Something went wrong. Please try again.';

        if (onError) {
          onError(err);
        } else if (showRetry) {
          toast.error(
            (t) => (
              <span className="flex items-center gap-3 text-sm">
                <span>{msg}</span>
                <button
                  className="flex-shrink-0 text-xs font-bold underline"
                  onClick={() => {
                    toast.dismiss(t.id);
                    // Small delay so the previous toast clears first
                    setTimeout(() => execute(...args), 150);
                  }}
                >
                  Retry
                </button>
              </span>
            ),
            { duration: 6000 }
          );
        } else {
          toast.error(msg, { duration: 4500 });
        }

        throw err;
      } finally {
        inFlightRef.current = false;
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn, errorMessage, showRetry, onError, onSuccess]
  );

  return { execute, loading };
}
