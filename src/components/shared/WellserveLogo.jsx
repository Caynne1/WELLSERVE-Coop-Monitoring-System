import logo from '../../assets/ws-logo.svg';

/**
 * WellserveLogo — uses official logo asset
 *
 * variant="light" → for dark backgrounds (login, topbar)
 * variant="dark"  → for light backgrounds (sidebar)
 */
export default function WellserveLogo({
  size = 40,
  variant = 'dark',
  className = '',
}) {
  const isLight = variant === 'light';

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isLight
          ? 'rgba(255,255,255,0.12)'
          : '#D6FADC',
        padding: '6px',
        boxShadow: isLight
          ? '0 4px 18px rgba(0,0,0,0.35)'
          : '0 2px 10px rgba(0,0,0,0.08)',
      }}
      className={className}
    >
      <img
        src={logo}
        alt="WELLSERVE Logo"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
      />
    </div>
  );
}