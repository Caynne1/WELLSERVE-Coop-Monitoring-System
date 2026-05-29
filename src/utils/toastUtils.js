/**
 * toastUtils — enhanced wrappers around react-hot-toast
 *
 * Provides typed helpers with consistent styling and optional "Retry" actions
 * so callers don't need to wire toast internals every time.
 */
import toast from 'react-hot-toast';

/**
 * Show an error toast.
 *
 * @param {string}    message   Human-readable description of what failed.
 * @param {Function}  [onRetry] Optional retry callback — adds a Retry button.
 * @param {number}    [duration] Toast duration (default: 4500ms, 6500ms with retry).
 */
export function toastError(message, onRetry, duration) {
  if (onRetry) {
    const defaultDuration = duration ?? 6500;
    toast.error(
      (t) => (
        <span className="flex items-center gap-3 text-sm leading-snug">
          <span>{message}</span>
          <button
            type="button"
            className="flex-shrink-0 text-xs font-bold text-white underline underline-offset-2"
            onClick={() => {
              toast.dismiss(t.id);
              setTimeout(onRetry, 100);
            }}
          >
            Retry
          </button>
        </span>
      ),
      { duration: defaultDuration }
    );
  } else {
    toast.error(message, { duration: duration ?? 4500 });
  }
}

/**
 * Show a success toast.
 */
export function toastSuccess(message, duration) {
  toast.success(message, { duration: duration ?? 3500 });
}

/**
 * Show a neutral info toast.
 */
export function toastInfo(message, duration) {
  toast(message, {
    icon: 'ℹ️',
    duration: duration ?? 3500,
  });
}

/**
 * Show a warning toast (amber).
 */
export function toastWarning(message, duration) {
  toast(message, {
    icon: '⚠️',
    style: {
      background: '#92400e',
      color: '#fff',
      fontSize: '14px',
    },
    duration: duration ?? 4000,
  });
}

/**
 * Promise-based toast (loading → success/error).
 *
 * Usage:
 *   toastPromise(
 *     deleteMember(id),
 *     { loading: 'Deleting…', success: 'Deleted!', error: 'Failed to delete.' }
 *   );
 */
export function toastPromise(promise, messages) {
  return toast.promise(promise, {
    loading: messages.loading ?? 'Loading…',
    success: messages.success ?? 'Done!',
    error: (err) =>
      messages.error ??
      (err instanceof Error ? err.message : 'Something went wrong.'),
  });
}
