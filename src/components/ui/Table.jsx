export default function Table({ children, className = '' }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="data-table">{children}</table>
    </div>
  );
}

export function Thead({ children }) {
  return (
    <thead>
      <tr>{children}</tr>
    </thead>
  );
}

export function Th({ children, className = '', align = 'left' }) {
  const a = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return <th className={`${a} ${className}`}>{children}</th>;
}

export function Tbody({ children }) {
  return <tbody>{children}</tbody>;
}

export function Tr({ children, onClick, className = '' }) {
  return (
    <tr
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick(e); } : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={[onClick ? 'cursor-pointer' : '', className].join(' ').trim()}
    >
      {children}
    </tr>
  );
}

export function Td({ children, className = '' }) {
  return <td className={className}>{children}</td>;
}

/** Full-width message row for empty / loading tables */
export function TableEmpty({ colSpan = 1, children = 'No records found.' }) {
  return (
    <tr>
      <td colSpan={colSpan} className="!py-12 text-center text-sm text-gray-500">{children}</td>
    </tr>
  );
}