import { useRef } from 'react';
import { Menu, X, Bell, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import NotificationPanel from '../notifications/NotificationPanel';

export default function Topbar({ onMenuClick, isSidebarOpen = false }) {
  const { user, signOut } = useAuth();
  const { unreadCount, panelOpen, setPanelOpen } = useNotifications();
  const initials = user?.email?.[0]?.toUpperCase() || 'A';
  const bellRef = useRef(null);

  return (
    <>
      <header
        style={{
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: '18px',
          paddingRight: '18px',
          background: 'linear-gradient(135deg, #0F3D91 0%, #1552C0 55%, #1D67E0 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 6px 18px rgba(15, 61, 145, 0.18)',
          flexShrink: 0,
          position: 'relative',
          zIndex: 20,
        }}
      >
        {/* Left */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={onMenuClick}
            title={isSidebarOpen ? 'Close menu' : 'Open menu'}
            style={{
              width: '40px', height: '40px', borderRadius: '12px',
              background: isSidebarOpen ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.14)',
              cursor: 'pointer', color: '#ffffff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.18s ease',
              backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = isSidebarOpen ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
            <p style={{ fontSize: '15px', fontWeight: '800', color: '#ffffff', margin: 0, letterSpacing: '0.3px' }}>Dashboard</p>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.72)', margin: 0, marginTop: '5px' }}>WELLSERVE Credit Cooperative</p>
          </div>
        </div>

        {/* Right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Bell with badge */}
          <div style={{ position: 'relative' }}>
            <button
              ref={bellRef}
              onClick={() => setPanelOpen(prev => !prev)}
              title="Notifications"
              style={{
                width: '38px', height: '38px', borderRadius: '12px',
                background: panelOpen ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.08)',
                border: panelOpen ? '1px solid rgba(255,255,255,0.30)' : '1px solid rgba(255,255,255,0.12)',
                cursor: 'pointer', color: '#ffffff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.18s ease',
                backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = panelOpen ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <Bell size={17} />
            </button>
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: '-4px', right: '-4px',
                minWidth: '18px', height: '18px',
                background: '#EF4444', color: '#ffffff',
                fontSize: '10px', fontWeight: '800',
                borderRadius: '999px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 4px', border: '2px solid #1552C0',
                lineHeight: 1, pointerEvents: 'none',
              }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>

          <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.18)', margin: '0 4px' }} />

          <div style={{
            width: '36px', height: '36px', borderRadius: '9999px',
            background: 'linear-gradient(135deg, #60A5FA, #2563EB)',
            border: '1.5px solid rgba(255,255,255,0.28)',
            boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span style={{ fontSize: '12px', fontWeight: '800', color: '#ffffff' }}>{initials}</span>
          </div>

          <div className="hidden sm:block" style={{ lineHeight: 1.1, marginLeft: '8px' }}>
            <p style={{ fontSize: '12px', fontWeight: '600', color: '#ffffff', margin: 0, maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email || 'Admin'}
            </p>
            <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.68)', marginTop: '4px', letterSpacing: '0.35px' }}>Administrator</p>
          </div>

          <button
            onClick={signOut}
            title="Sign out"
            style={{
              width: '38px', height: '38px', borderRadius: '12px',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              cursor: 'pointer', color: 'rgba(255,255,255,0.76)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginLeft: '2px', transition: 'all 0.18s ease',
              backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.18)'; e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.76)'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      <NotificationPanel anchorRef={bellRef} />
    </>
  );
}
