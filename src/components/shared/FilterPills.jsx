export default function FilterPills({ options, value, onChange }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors
            ${value === opt.value
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
