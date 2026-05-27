import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Modal — generic overlay dialog rendered via React Portal.
 *
 * Portaling directly onto document.body means the modal is never trapped
 * inside a scrolled ancestor (e.g. the <main> overflow-y-auto container in
 * AppLayout). Without a portal, clicking a row deep in a long table can
 * cause the fixed overlay to be composited incorrectly by the browser until
 * the next scroll event forces a repaint — which is exactly the symptom of
 * "modal only appears after scrolling."
 *
 * size: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full'
 */
export default function Modal({ open, onClose, title, children, size = 'md' }) {
  const sizes = {
    sm:    'max-w-sm',
    md:    'max-w-lg',
    lg:    'max-w-2xl',
    xl:    'max-w-4xl',
    '2xl': 'max-w-5xl',
    '3xl': 'max-w-6xl',
    full:  'max-w-[95vw]',
  };

  // Find the actual scroll container (AppLayout's <main>) and lock it when
  // open, rather than locking document.body (which isn't the scroller).
  const scrollerRef = useRef(null);

  useEffect(() => {
    if (!open) {
      // Restore whatever container we locked
      if (scrollerRef.current) {
        scrollerRef.current.style.overflow = '';
        scrollerRef.current = null;
      }
      return;
    }

    // Walk up from body to find the first overflow-y-auto / overflow-y-scroll element.
    // In practice this is the <main> element rendered by AppLayout.
    let el = document.querySelector('main') || document.body;
    scrollerRef.current = el;
    el.style.overflow = 'hidden';

    return () => {
      if (scrollerRef.current) {
        scrollerRef.current.style.overflow = '';
        scrollerRef.current = null;
      }
    };
  }, [open]);

  // Keyboard: close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    /*
     * Outer: full-viewport fixed overlay. No overflow on this element —
     * it just needs to cover the screen and center the panel.
     * We use flex + items-center here (not items-start) so the dialog
     * always appears centered in the visible viewport regardless of how
     * far the page is scrolled.
     */
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
    >
      {/* Backdrop — click outside to close */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel — sits above the backdrop via relative stacking */}
      <div
        className={[
          'relative bg-white rounded-2xl shadow-xl w-full flex flex-col',
          'max-h-[90vh]',          // never taller than 90 % of viewport
          sizes[size] ?? sizes.md,
          'animate-scale-in',
        ].join(' ')}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500
                       transition-all duration-150 hover:scale-110 active:scale-95"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body — tall content scrolls inside the panel, not the page */}
        <div className="overflow-y-auto flex-1 p-6 min-h-0">
          {children}
        </div>
      </div>
    </div>,
    document.body          // ← portal target: bypasses the <main> scroll container
  );
}