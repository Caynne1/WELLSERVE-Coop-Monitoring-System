export default function Table({ children, className = '' }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function Thead({ children }) {
  return (
    <thead>
      <tr className="bg-gray-50 border-b border-gray-100">{children}</tr>
    </thead>
  );
}

export function Th({ children, className = '' }) {
  return (
    <th className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide ${className}`}>
      {children}
    </th>
  );
}

export function Tbody({ children }) {
  return <tbody className="divide-y divide-gray-50">{children}</tbody>;
}

export function Tr({ children, onClick, className = '' }) {
  return (
    <tr
      onClick={onClick}
      className={[
        'transition-all duration-150',
        onClick
          ? 'cursor-pointer hover:bg-emerald-50/30 hover:shadow-sm hover:scale-[1.001] active:bg-emerald-50/50'
          : 'hover:bg-gray-50/60',
        className,
      ].join(' ')}
      style={onClick ? { transformOrigin: 'center' } : undefined}
    >
      {children}
    </tr>
  );
}

export function Td({ children, className = '' }) {
  return <td className={`px-4 py-3 text-gray-700 ${className}`}>{children}</td>;
}
