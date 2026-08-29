import wellserveLogo from '../../assets/WS-Logo Transparent.png';

/**
 * WellserveLogo — uses the approved transparent WELLSERVE logo asset.
 *
 * The layout prop remains supported for existing callers, but both layouts
 * intentionally render the same approved full wordmark.
 * variant="light"     → approved white mark for dark backgrounds
 * variant="dark"      → full-color mark for light backgrounds
 */
export default function WellserveLogo({
  size = 40,
  variant = 'dark',
  layout = 'icon',
  className = '',
}) {
  const width = Math.round(size * (2048 / 768));

  return (
    <div
      style={{
        width,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
      className={className}
    >
      <img
        src={wellserveLogo}
        alt="WELLSERVE Credit Cooperative"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          filter: variant === 'light' ? 'brightness(0) invert(1)' : 'none',
        }}
      />
    </div>
  );
}
