import { Menu, Bell, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import WellserveLogo from '../../components/shared/WellserveLogo';

export default function Topbar({ onMenuClick }) {
  const { user, signOut } = useAuth();
  const initials = user?.email?.[0]?.toUpperCase() || 'A';

  return (
    <header
      style={{
        height: '60px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: '18px',
        paddingRight: '18px',
        background: 'linear-gradient(135deg, #14532D, #1F7A63)',
        boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
        flexShrink: 0,
        position: 'relative',
        zIndex: 10,
      }}
    >
      {/* Left */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={onMenuClick}
          className="lg:hidden"
          style={{
            padding: '7px',
            borderRadius: '10px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'rgba(255,255,255,0.82)',
            display: 'flex',
            alignItems: 'center',
            transition: 'background 0.15s ease, color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
            e.currentTarget.style.color = '#ffffff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'rgba(255,255,255,0.82)';
          }}
        >
          <Menu size={20} />
        </button>

        <div className="hidden lg:flex" style={{ alignItems: 'center', gap: '10px' }}>
          <WellserveLogo size={34} variant="light" />
          <div style={{ lineHeight: 1 }}>
            <p
              style={{
                fontSize: '14px',
                fontWeight: '800',
                color: '#ffffff',
                letterSpacing: '2px',
                margin: 0,
                textTransform: 'uppercase',
              }}
            >
              WELLSERVE
            </p>
            <p
              style={{
                fontSize: '8.5px',
                color: 'rgba(255,255,255,0.62)',
                letterSpacing: '1.1px',
                margin: 0,
                textTransform: 'uppercase',
                marginTop: '3px',
              }}
            >
              Credit Cooperative
            </p>
          </div>
        </div>
      </div>

      {/* Right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <button
          title="Notifications"
          style={{
            padding: '7px',
            borderRadius: '10px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'rgba(255,255,255,0.70)',
            display: 'flex',
            alignItems: 'center',
            transition: 'background 0.15s ease, color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
            e.currentTarget.style.color = '#ffffff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'rgba(255,255,255,0.70)';
          }}
        >
          <Bell size={17} />
        </button>

        <div
          style={{
            width: '1px',
            height: '22px',
            background: 'rgba(255,255,255,0.18)',
            margin: '0 6px',
          }}
        />

        <div
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '9999px',
            background: '#22C55E',
            border: '1.5px solid rgba(255,255,255,0.30)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: '12px',
              fontWeight: '800',
              color: '#ffffff',
            }}
          >
            {initials}
          </span>
        </div>

        <div
          className="hidden sm:block"
          style={{ lineHeight: 1.1, marginLeft: '8px' }}
        >
          <p
            style={{
              fontSize: '12px',
              fontWeight: '600',
              color: '#ffffff',
              margin: 0,
              maxWidth: '170px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {user?.email || 'Admin'}
          </p>
          <p
            style={{
              fontSize: '9px',
              color: 'rgba(255,255,255,0.60)',
              marginTop: '3px',
              letterSpacing: '0.4px',
            }}
          >
            Administrator
          </p>
        </div>

        <button
          onClick={signOut}
          title="Sign out"
          style={{
            padding: '7px',
            borderRadius: '10px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'rgba(255,255,255,0.62)',
            display: 'flex',
            alignItems: 'center',
            marginLeft: '4px',
            transition: 'background 0.15s ease, color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(220,60,60,0.16)';
            e.currentTarget.style.color = '#fecaca';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'rgba(255,255,255,0.62)';
          }}
        >
          <LogOut size={15} />
        </button>
      </div>
    </header>
  );
}