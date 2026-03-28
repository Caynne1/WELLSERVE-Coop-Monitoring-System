export default function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-gray-500">
            {subtitle}
          </p>
        )}
      </div>

      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}