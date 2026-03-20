import { Loader2 } from 'lucide-react';

/**
 * Button — WELLSERVE brand color system
 *
 * primary / green  → #07A04E  create / add actions
 * blue             → #000066  edit / view actions  (brand navy)
 * finance          → #273C2C  deposit / pay / post (brand dark green)
 * danger           → #dc2626  delete / destructive
 * success          → #7EB751  positive / confirm    (brand accent green)
 * outline          → border   secondary / cancel
 * ghost            → no bg    icon-only / tertiary
 */

// Using Tailwind arbitrary values for exact brand hex codes (Tailwind v3 JIT)
const variants = {
  primary: 'bg-[#07A04E] hover:bg-[#059040] active:bg-[#047535] text-white focus:ring-[#07A04E] shadow-sm',
  green:   'bg-[#07A04E] hover:bg-[#059040] active:bg-[#047535] text-white focus:ring-[#07A04E] shadow-sm',
  blue:    'bg-[#000066] hover:bg-[#000055] active:bg-[#000044] text-white focus:ring-[#000066] shadow-sm',
  finance: 'bg-[#273C2C] hover:bg-[#1e2f22] active:bg-[#162419] text-white focus:ring-[#273C2C] shadow-sm',
  danger:  'bg-red-600   hover:bg-red-700   active:bg-red-800   text-white focus:ring-red-500 shadow-sm',
  success: 'bg-[#7EB751] hover:bg-[#6a9e42] active:bg-[#5a8836] text-white focus:ring-[#7EB751] shadow-sm',
  outline: 'border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 active:bg-gray-100 focus:ring-gray-300',
  ghost:   'text-gray-600 hover:bg-gray-100 active:bg-gray-200 focus:ring-gray-300',
};

const sizes = {
  xs: 'px-2.5 py-1   text-xs gap-1',
  sm: 'px-3   py-1.5 text-xs gap-1.5',
  md: 'px-4   py-2   text-sm gap-2',
  lg: 'px-5   py-2.5 text-sm gap-2',
};

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  className = '',
  ...props
}) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center font-medium rounded-lg
        transition-all duration-150
        focus:outline-none focus:ring-2 focus:ring-offset-1
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant] ?? variants.primary}
        ${sizes[size] ?? sizes.md}
        ${className}
      `.replace(/\s+/g, ' ').trim()}
    >
      {loading
        ? <Loader2 size={size === 'xs' || size === 'sm' ? 12 : 14} className="animate-spin flex-shrink-0" />
        : icon
          ? <span className="flex-shrink-0 leading-none">{icon}</span>
          : null}
      {children}
    </button>
  );
}