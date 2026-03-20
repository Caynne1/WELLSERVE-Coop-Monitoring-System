import { Menu, Bell, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import WellserveLogo from '../../components/shared/WellserveLogo';

// ── Logic unchanged ────────────────────────────────────────────
export default function Topbar({ onMenuClick }) {
  const { user, signOut } = useAuth();
  const initials = user?.email?.[0]?.toUpperCase() || 'A';

  return (
    <header
      style={{
        height: '56px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: '16px',
        paddingRight: '16px',
        // Brand dark green #273C2C background — matches login overlay
        background: '#273C2C',
        boxShadow: '0 2px 10px rgba(39,60,44,0.35)',
        flexShrink: 0,
        position: 'relative',
        zIndex: 10,
      }}
    >

      {/* ── Left — mobile menu + logo wordmark ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>

        {/* Mobile hamburger */}
        <button
          onClick={onMenuClick}
          className="lg:hidden"
          style={{
            padding: '7px', borderRadius: '9px',
            background: 'transparent', border: 'none',
            cursor: 'pointer', color: 'rgba(255,255,255,0.80)',
            display: 'flex', alignItems: 'center', transition: 'background 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <Menu size={20} />
        </button>

        {/* Logo + wordmark (desktop) */}
        <div className="hidden lg:flex" style={{ alignItems: 'center', gap: '10px' }}>
          <WellserveLogo size={34} variant="light" />
          <div style={{ lineHeight: 1 }}>
            <p style={{
              fontSize: '14px', fontWeight: '800', color: '#ffffff',
              letterSpacing: '2.5px', margin: 0, textTransform: 'uppercase',
            }}>
              WELLSERVE
            </p>
            <p style={{
              fontSize: '8.5px', color: 'rgba(255,255,255,0.48)',
              letterSpacing: '1.2px', margin: 0, textTransform: 'uppercase',
              marginTop: '2px',
            }}>
              Credit Cooperative
            </p>
          </div>
        </div>
      </div>

      {/* ── Right — bell + user + sign out ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>

        {/* Notification bell */}
        <button
          title="Notifications"
          style={{
            padding: '7px', borderRadius: '9px',
            background: 'transparent', border: 'none',
            cursor: 'pointer', color: 'rgba(255,255,255,0.60)',
            display: 'flex', alignItems: 'center', transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = '#ffffff'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.60)'; }}
        >
          <Bell size={17} />
        </button>

        {/* Separator */}
        <div style={{ width: '1px', height: '22px', background: 'rgba(255,255,255,0.15)', margin: '0 5px' }} />

        {/* Avatar */}
        <div style={{
          width: '32px', height: '32px', borderRadius: '9px',
          background: '#07A04E',
          border: '1.5px solid rgba(255,255,255,0.30)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <span style={{ fontSize: '12px', fontWeight: '800', color: '#ffffff' }}>
            {initials}
          </span>
        </div>

        {/* Email + role (desktop) */}
        <div
          className="hidden sm:block"
          style={{ lineHeight: 1, marginLeft: '8px' }}
        >
          <p style={{
            fontSize: '12px', fontWeight: '600', color: '#ffffff',
            margin: 0, maxWidth: '160px', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {user?.email || 'Admin'}
          </p>
          <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.45)', marginTop: '2px', letterSpacing: '0.4px' }}>
            Administrator
          </p>
        </div>

        {/* Sign out */}
        <button
          onClick={signOut}
          title="Sign out"
          style={{
            padding: '7px', borderRadius: '9px',
            background: 'transparent', border: 'none',
            cursor: 'pointer', color: 'rgba(255,255,255,0.50)',
            display: 'flex', alignItems: 'center', marginLeft: '4px',
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,60,60,0.18)'; e.currentTarget.style.color = '#fca5a5'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.50)'; }}
        >
          <LogOut size={15} />
        </button>
      </div>
    </header>
  );
}