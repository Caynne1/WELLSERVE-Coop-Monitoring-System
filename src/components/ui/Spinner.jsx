export default function Spinner({ size = 24, className = '' }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24" fill="none"
      className={`animate-spin text-blue-600 ${className}`}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"
        strokeLinecap="round" strokeDasharray="40" strokeDashoffset="10" opacity="0.3" />
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"
        strokeLinecap="round" strokeDasharray="10" strokeDashoffset="0" />
    </svg>
  );
}
