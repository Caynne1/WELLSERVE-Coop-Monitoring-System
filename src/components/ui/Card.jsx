export default function Card({ children, className = '', hoverable = false, padded = false }) {
  return (
    <div
      className={`
        bg-white rounded-xl border border-gray-200 shadow-[0_1px_2px_rgba(16,24,40,0.04)]
        transition-all duration-200
        ${padded ? 'p-5' : ''}
        ${hoverable ? 'hover:-translate-y-0.5 hover:shadow-md hover:border-[#07A04E]/30 cursor-pointer' : ''}
        ${className}
      `.replace(/\s+/g, ' ').trim()}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-gray-100">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ children, className = '' }) {
  return <div className={`p-5 ${className}`}>{children}</div>;
}