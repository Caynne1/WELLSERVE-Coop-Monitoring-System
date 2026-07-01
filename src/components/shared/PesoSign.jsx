import React from 'react';

/**
 * PesoSign
 * A lucide-react-style icon for the Philippine Peso (₱) sign.
 * lucide-react (as of v0.309.0) does not ship a peso icon, so this
 * hand-drawn SVG mimics the same API as lucide icons (size, color,
 * strokeWidth, className, ...rest) so it can be used as a drop-in
 * replacement for <DollarSign /> wherever currency is Philippine Peso.
 */
const PesoSign = React.forwardRef(function PesoSign(
  { size = 24, color = 'currentColor', strokeWidth = 2, className = '', ...rest },
  ref
) {
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`lucide lucide-peso-sign ${className}`.trim()}
      {...rest}
    >
      <path d="M7 21V3" />
      <path d="M7 3h6.5a4.5 4.5 0 0 1 0 9H7" />
      <path d="M3 9h11" />
      <path d="M3 13h11" />
    </svg>
  );
});

export default PesoSign;