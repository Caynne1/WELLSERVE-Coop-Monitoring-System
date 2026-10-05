/**
 * EmptyState — one consistent "nothing here" block for tables, lists and panels.
 * icon: a lucide-react component (not an element).
 */
export default function EmptyState({ icon: Icon, title, description, action, className = '' }) {
  return (
    <div className={`empty-state ${className}`}>
      {Icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#D6FADC]/60 text-[#07A04E]">
          <Icon size={22} />
        </div>
      )}
      {title && <h3 className="text-sm font-semibold text-gray-800">{title}</h3>}
      {description && <p className="mt-1 max-w-sm text-sm text-gray-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
