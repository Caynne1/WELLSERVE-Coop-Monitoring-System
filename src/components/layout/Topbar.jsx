import { useRef, useState } from 'react';
import { Menu, X, Bell, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import NotificationPanel from '../notifications/NotificationPanel';

const btnBase = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: '12px', border: '1px solid rgba(255,255,255,0.18)',
  background: 'rgba(255,255,255,0.10)', cursor: 'pointer', color: '#ffffff',
  transition: 'all 0.18s ease', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
  flexShrink: 0,
};

export default function Topbar({ onMenuClick, isSidebarOpen = false }) {
  const { user, profile, signOut } = useAuth();
  const { unreadCount, panelOpen, setPanelOpen } = useNotifications();
  const initials = user?.email?.[0]?.toUpperCase() || 'A';
  const bellRef = useRef(null);

  return (
    <>
      <header style={{
        height: '64px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: '18px', paddingRight: '18px',
        background: '#07A04E', borderBottom: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)', flexShrink: 0,
        position: 'relative', zIndex: 20, gap: '12px',
      }}>

        {/* Left — hamburger */}
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <button
            onClick={onMenuClick}
            title={isSidebarOpen ? 'Close menu' : 'Open menu'}
            style={{ ...btnBase, width: '40px', height: '40px',
              background: isSidebarOpen ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.10)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.24)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = isSidebarOpen ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.10)'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Right — actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: 'auto' }}>

          {/* Bell */}
          <div style={{ position: 'relative' }}>
            <button
              ref={bellRef}
              onClick={() => setPanelOpen(prev => !prev)}
              title="Notifications"
              style={{ ...btnBase, width: '38px', height: '38px',
                background: panelOpen ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.10)',
                border: panelOpen ? '1px solid rgba(255,255,255,0.34)' : '1px solid rgba(255,255,255,0.18)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.22)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = panelOpen ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.10)'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <Bell size={17} />
            </button>
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: '-4px', right: '-4px',
                minWidth: '18px', height: '18px', background: '#EF4444', color: '#ffffff',
                fontSize: '10px', fontWeight: '800', borderRadius: '999px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 4px', border: '2px solid #07A04E',
                lineHeight: 1, pointerEvents: 'none',
              }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>

          <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.22)', margin: '0 2px' }} />

          {/* Avatar */}
          <div style={{
            width: '34px', height: '34px', borderRadius: '9999px',
            background: 'linear-gradient(135deg, #4ADE80, #16A34A)',
            border: '2px solid rgba(255,255,255,0.35)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span style={{ fontSize: '12px', fontWeight: '800', color: '#ffffff' }}>{initials}</span>
          </div>

          {/* User info — hidden on mobile */}
          <div className="hidden sm:block" style={{ lineHeight: 1.1, marginLeft: '2px' }}>
            <p style={{ fontSize: '12px', fontWeight: '600', color: '#ffffff', margin: 0, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email || 'Admin'}
            </p>
            <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.72)', marginTop: '3px', letterSpacing: '0.35px', textTransform: 'capitalize' }}>
              {profile?.role === 'admin' ? 'Administrator' : profile?.role || 'Staff'}
            </p>
          </div>

          {/* Sign out */}
          <button
            onClick={signOut}
            title="Sign out"
            style={{ ...btnBase, width: '38px', height: '38px', marginLeft: '2px', color: 'rgba(255,255,255,0.80)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.22)'; e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(255,255,255,0.80)'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      <NotificationPanel anchorRef={bellRef} />
    </>
  );
}
