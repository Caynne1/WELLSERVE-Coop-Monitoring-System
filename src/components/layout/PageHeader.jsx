import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

/**
 * PageHeader — the single title block used on every page.
 * Optional `backTo` renders a consistent "Back" link for detail/form pages.
 */
export default function PageHeader({ title, subtitle, action, backTo, backLabel = 'Back' }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        {backTo && (
          <Link
            to={backTo}
            className="mb-1.5 inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-[#07A04E] transition-colors"
          >
            <ChevronLeft size={14} /> {backLabel}
          </Link>
        )}
        <h1 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-gray-500">
            {subtitle}
          </p>
        )}
      </div>

      {action && (
        <div className="w-full flex-shrink-0 [&>div]:flex-wrap [&>*]:w-full sm:w-auto sm:[&>*]:w-auto">
          {action}
        </div>
      )}
    </div>
  );
}