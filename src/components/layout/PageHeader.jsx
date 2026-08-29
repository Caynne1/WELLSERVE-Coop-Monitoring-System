export default function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
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
