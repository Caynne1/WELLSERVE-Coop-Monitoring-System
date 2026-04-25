/**
 * Badge — WELLSERVE brand color system
 *
 * success  → #D6FADC bg + #07A04E text  (brand mint + brand green)
 * info     → #AEECEF/40 bg + #000066 text (brand cyan + brand navy)
 * warning  → amber tones
 * danger   → red tones
 * green    → #D6FADC  (alias for success)
 */

const variants = {
  default:  'bg-gray-100          text-gray-600      ring-gray-200',
  success:  'bg-[#D6FADC]         text-[#07A04E]     ring-[#07A04E]/25',
  warning:  'bg-amber-50          text-amber-700     ring-amber-200',
  danger:   'bg-red-50            text-red-700       ring-red-200',
  info:     'bg-[#AEECEF]/40      text-[#000066]     ring-[#000066]/15',
  purple:   'bg-purple-50         text-purple-700    ring-purple-200',
  green:    'bg-[#D6FADC]         text-[#07A04E]     ring-[#07A04E]/25',
  orange:   'bg-orange-50         text-orange-700    ring-orange-200',
  dark:     'bg-[#273C2C]         text-white         ring-[#273C2C]/30',
  navy:     'bg-[#000066]/10      text-[#000066]     ring-[#000066]/15',
};

const dotColors = {
  default:  'bg-gray-400',
  success:  'bg-[#07A04E]',
  warning:  'bg-amber-500',
  danger:   'bg-red-500',
  info:     'bg-[#000066]',
  purple:   'bg-purple-500',
  green:    'bg-[#07A04E]',
  orange:   'bg-orange-500',
  dark:     'bg-[#7EB751]',
  navy:     'bg-[#000066]',
};

export default function Badge({ children, variant = 'default', dot = false, className = '' }) {
  const v = variants[variant] ?? variants.default;
  const d = dotColors[variant] ?? dotColors.default;

  return (
    <span className={`
      inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full
      text-xs font-semibold ring-1 ring-inset
      ${v} ${className}
    `.replace(/\s+/g, ' ').trim()}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 animate-dot-pulse ${d}`} />}
      {children}
    </span>
  );
}