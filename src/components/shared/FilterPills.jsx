export default function FilterPills({ options, value, onChange }) {
  return (
    <div className="flex items-center gap-2 flex-wrap" role="group">
      {options.map(opt => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors
              ${active
                ? 'bg-[#07A04E] border-[#07A04E] text-white shadow-sm'
                : 'bg-white border-gray-200 text-gray-600 hover:border-[#7EB751] hover:bg-[#D6FADC]/35'}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}