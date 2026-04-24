import { useRef } from 'react';
import { Bell, LogOut, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import NotificationPanel from '../notifications/NotificationPanel';

/* ── Animated hamburger → X icon ─────────────────────────────────────────── */
function HamburgerIcon({ isOpen }) {
  const base = {
    display: 'block',
    position: 'absolute',
    left: 0,
    height: '2px',
    borderRadius: '2px',
    background: '#ffffff',
    transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.22s ease, width 0.22s ease',
  };
  return (
    <span style={{ position: 'relative', width: '18px', height: '14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flexShrink: 0 }}>
      {/* Top bar */}
      <span style={{
        ...base, width: '18px', top: 0,
        transform: isOpen ? 'translateY(6px) rotate(45deg)' : 'none',
      }} />
      {/* Middle bar */}
      <span style={{
        ...base, width: isOpen ? '0px' : '13px', top: '6px', left: 'auto', right: 0,
        opacity: isOpen ? 0 : 1,
      }} />
      {/* Bottom bar */}
      <span style={{
        ...base, width: '18px', top: '12px',
        transform: isOpen ? 'translateY(-6px) rotate(-45deg)' : 'none',
      }} />
    </span>
  );
}

/* ── Icon button wrapper ─────────────────────────────────────────────────── */
function TopbarBtn({ onClick, title, active = false, danger = false, children, style = {} }) {
  const baseStyle = {
    width: '36px', height: '36px',
    borderRadius: '10px',
    background: active ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.09)',
    border: `1px solid ${active ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.13)'}`,
    cursor: 'pointer',
    color: '#ffffff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.18s ease',
    flexShrink: 0,
    outline: 'none',
    ...style,
  };
  return (
    <button
      onClick={onClick}
      title={title}
      style={baseStyle}
      onMouseEnter={e => {
        e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.22)' : 'rgba(255,255,255,0.22)';
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.borderColor = danger ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.3)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = active ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.09)';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.borderColor = active ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.13)';
      }}
    >
      {children}
    </button>
  );
}

/* ── Main Topbar ─────────────────────────────────────────────────────────── */
export default function Topbar({ onMenuClick, isSidebarOpen = false, pageTitle = 'Dashboard' }) {
  const { user, profile, signOut } = useAuth();
  const { unreadCount, panelOpen, setPanelOpen } = useNotifications();
  const bellRef = useRef(null);

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'User';
  const role = profile?.role === 'admin' ? 'Administrator' : (profile?.role || 'Staff');
  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase() || 'U';

  return (
    <>
      <header
        style={{
          height: '60px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: '14px',
          paddingRight: '16px',
          background: 'linear-gradient(100deg, #0B3580 0%, #1148B8 52%, #1A5CE0 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.09)',
          boxShadow: '0 2px 12px rgba(11,53,128,0.22)',
          flexShrink: 0,
          position: 'relative',
          zIndex: 20,
          gap: '12px',
        }}
      >
        {/* ── Left: toggle + breadcrumb ───────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>

          {/* Animated hamburger button */}
          <TopbarBtn
            onClick={onMenuClick}
            title={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            active={isSidebarOpen}
          >
            <HamburgerIcon isOpen={isSidebarOpen} />
          </TopbarBtn>

          {/* Divider */}
          <span style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.18)', flexShrink: 0 }} />

          {/* Page breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.52)', fontWeight: 500, flexShrink: 0 }}>
              WELLSERVE
            </span>
            <ChevronRight size={12} style={{ color: 'rgba(255,255,255,0.35)', flexShrink: 0 }} />
            <span style={{
              fontSize: '14px',
              fontWeight: 700,
              color: '#ffffff',
              letterSpacing: '0.01em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {pageTitle}
            </span>
          </div>
        </div>

        {/* ── Right: notifications + user ─────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>

          {/* Bell */}
          <div style={{ position: 'relative' }}>
            <TopbarBtn
              ref={bellRef}
              onClick={() => setPanelOpen(prev => !prev)}
              title="Notifications"
              active={panelOpen}
            >
              <span ref={bellRef} style={{ display: 'flex' }}>
                <Bell size={16} />
              </span>
            </TopbarBtn>
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: '-5px', right: '-5px',
                minWidth: '17px', height: '17px',
                background: '#EF4444',
                color: '#ffffff',
                fontSize: '9px', fontWeight: 800,
                borderRadius: '999px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 3px',
                border: '2px solid #1148B8',
                lineHeight: 1,
                pointerEvents: 'none',
                boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
              }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>

          {/* Separator */}
          <span style={{ width: '1px', height: '22px', background: 'rgba(255,255,255,0.16)', margin: '0 2px' }} />

          {/* Avatar + name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Avatar circle */}
            <div style={{
              width: '33px', height: '33px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #38BDF8 0%, #0EA5E9 50%, #0284C7 100%)',
              border: '2px solid rgba(255,255,255,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
            }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#ffffff', letterSpacing: '0.02em' }}>
                {initials}
              </span>
            </div>

            {/* Name + role (hidden on small screens) */}
            <div style={{ lineHeight: 1.15 }} className="ws-user-label">
              <p style={{
                margin: 0, fontSize: '12px', fontWeight: 700,
                color: '#ffffff',
                maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {displayName}
              </p>
              <p style={{
                margin: 0, marginTop: '2px',
                fontSize: '10px', color: 'rgba(255,255,255,0.60)',
                letterSpacing: '0.04em',
              }}>
                {role}
              </p>
            </div>
          </div>

          {/* Sign out */}
          <TopbarBtn onClick={signOut} title="Sign out" danger>
            <LogOut size={14} />
          </TopbarBtn>
        </div>
      </header>

      <NotificationPanel anchorRef={bellRef} />

      <style>{`
        @media (max-width: 640px) { .ws-user-label { display: none; } }
      `}</style>
    </>
  );
}