import { useRef, useState, useEffect, useCallback } from 'react';
import { Menu, X, Bell, LogOut, Search, LayoutDashboard, Users, BookOpen,
  CreditCard, PiggyBank, Wallet, ArrowLeftRight, CheckSquare, FileText,
  Ticket, Receipt, BarChart3, ScrollText, Settings, UserCog, Building2,
  Clock, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import NotificationPanel from '../notifications/NotificationPanel';

const NAV_ITEMS = [
  { label: 'Dashboard',          path: '/dashboard',          icon: LayoutDashboard,  keywords: ['home', 'overview'] },
  { label: 'Members',            path: '/members',            icon: Users,            keywords: ['member', 'people', 'person'] },
  { label: 'Passbook',           path: '/passbook',           icon: BookOpen,         keywords: ['passbook', 'book'] },
  { label: 'Loans',              path: '/loans',              icon: CreditCard,       keywords: ['loan', 'lending', 'credit'] },
  { label: 'CBU',                path: '/cbu',                icon: PiggyBank,        keywords: ['capital build-up', 'cbu'] },
  { label: 'Savings',            path: '/savings',            icon: Wallet,           keywords: ['savings', 'deposit', 'save'] },
  { label: 'Transactions',       path: '/transactions',       icon: ArrowLeftRight,   keywords: ['transaction', 'payment', 'transfer'] },
  { label: 'Checkbook',          path: '/checkbook',          icon: CheckSquare,      keywords: ['check', 'cheque'] },
  { label: 'Invoices',           path: '/invoices',           icon: FileText,         keywords: ['invoice', 'billing', 'bill'] },
  { label: 'Vouchers',           path: '/vouchers',           icon: Ticket,           keywords: ['voucher', 'receipt'] },
  { label: 'Expenses',           path: '/expenses',           icon: Receipt,          keywords: ['expense', 'cost', 'spending'] },
  { label: 'Coop Monitoring',    path: '/coop-monitoring',    icon: Building2,        keywords: ['cooperative', 'fund', 'monitoring', 'coop'] },
  { label: 'Time Deposit',       path: '/time-deposit',       icon: Clock,            keywords: ['time deposit', 'td', 'fixed'] },
  { label: 'Reports',            path: '/reports',            icon: BarChart3,        keywords: ['report', 'analytics', 'statistics'] },
  { label: 'Activity Logs',      path: '/logs',               icon: ScrollText,       keywords: ['log', 'activity', 'audit', 'history'] },
  { label: 'Settings',           path: '/settings',           icon: Settings,         keywords: ['setting', 'configuration', 'config'] },
  { label: 'Staff',              path: '/staff',              icon: Shield,           keywords: ['staff', 'employee', 'team'] },
  { label: 'Account Management', path: '/account-management', icon: UserCog,          keywords: ['account', 'manage'] },
  { label: 'User Management',    path: '/user-management',    icon: UserCog,          keywords: ['user', 'manage', 'admin'] },
];

const btnBase = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: '12px', border: '1px solid rgba(255,255,255,0.18)',
  background: 'rgba(255,255,255,0.10)', cursor: 'pointer', color: '#ffffff',
  transition: 'all 0.18s ease', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
  flexShrink: 0,
};

function GlobalSearch({ autoFocus = false, onClose }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (autoFocus) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [autoFocus]);

  const results = query.trim().length === 0 ? [] : NAV_ITEMS.filter(item => {
    const q = query.toLowerCase();
    return item.label.toLowerCase().includes(q) || item.keywords.some(k => k.includes(q));
  });

  const handleSelect = useCallback((path) => {
    navigate(path);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
    onClose?.();
  }, [navigate, onClose]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && results[activeIndex]) { handleSelect(results[activeIndex].path); }
    else if (e.key === 'Escape') { setQuery(''); setOpen(false); inputRef.current?.blur(); onClose?.(); }
  };

  useEffect(() => { setActiveIndex(0); }, [query]);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        background: '#ffffff',
        border: focused ? '2px solid #04522A' : '2px solid transparent',
        borderRadius: '10px', padding: '0 12px', height: '38px',
        transition: 'border-color 0.18s ease',
        boxShadow: '0 1px 4px rgba(0,0,0,0.10)',
      }}>
        <Search size={15} style={{ color: '#07A04E', flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Search pages..."
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { setFocused(true); if (query.trim()) setOpen(true); }}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          style={{
            border: 'none', outline: 'none', background: 'transparent',
            color: '#111827', fontSize: '13px', width: '100%',
            caretColor: '#07A04E',
          }}
        />
        {query && (
          <button
            onMouseDown={() => { setQuery(''); setOpen(false); inputRef.current?.focus(); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#9ca3af', display: 'flex', alignItems: 'center' }}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0,
          background: '#ffffff', borderRadius: '14px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08)',
          overflow: 'hidden', zIndex: 9999, border: '1px solid rgba(0,0,0,0.06)',
        }}>
          <div style={{ padding: '6px' }}>
            {results.map((item, idx) => {
              const Icon = item.icon;
              const isActive = idx === activeIndex;
              return (
                <button
                  key={item.path}
                  onMouseDown={() => handleSelect(item.path)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    width: '100%', padding: '9px 12px', borderRadius: '9px',
                    border: 'none', cursor: 'pointer',
                    background: isActive ? '#f0fdf4' : 'transparent',
                    color: isActive ? '#07A04E' : '#374151',
                    fontSize: '13px', fontWeight: isActive ? '600' : '500',
                    textAlign: 'left', transition: 'all 0.12s ease',
                  }}
                >
                  <span style={{
                    width: '28px', height: '28px', borderRadius: '8px',
                    background: isActive ? 'rgba(7,160,78,0.12)' : '#f3f4f6',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Icon size={14} style={{ color: isActive ? '#07A04E' : '#9ca3af' }} />
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
          <div style={{ borderTop: '1px solid #f3f4f6', padding: '8px 14px 9px', background: '#fafafa' }}>
            <p style={{ margin: 0, fontSize: '11px', color: '#9ca3af' }}>
              <kbd style={{ background: '#e5e7eb', borderRadius: '4px', padding: '1px 5px', fontFamily: 'monospace', fontSize: '10px' }}>↑↓</kbd> navigate &nbsp;·&nbsp;
              <kbd style={{ background: '#e5e7eb', borderRadius: '4px', padding: '1px 5px', fontFamily: 'monospace', fontSize: '10px' }}>Enter</kbd> open &nbsp;·&nbsp;
              <kbd style={{ background: '#e5e7eb', borderRadius: '4px', padding: '1px 5px', fontFamily: 'monospace', fontSize: '10px' }}>Esc</kbd> close
            </p>
          </div>
        </div>
      )}

      {open && query.trim() && results.length === 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0,
          background: '#ffffff', borderRadius: '14px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.16)', padding: '20px',
          textAlign: 'center', zIndex: 9999, border: '1px solid rgba(0,0,0,0.06)',
        }}>
          <p style={{ margin: 0, fontSize: '13px', color: '#9ca3af' }}>
            No pages found for "<strong style={{ color: '#374151' }}>{query}</strong>"
          </p>
        </div>
      )}
    </div>
  );
}

export default function Topbar({ onMenuClick, isSidebarOpen = false }) {
  const { user, profile, signOut } = useAuth();
  const { unreadCount, panelOpen, setPanelOpen } = useNotifications();
  const initials = user?.email?.[0]?.toUpperCase() || 'A';
  const bellRef = useRef(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  // Mobile search mode — full-width input replaces topbar content
  if (mobileSearchOpen) {
    return (
      <header style={{
        height: '64px', display: 'flex', alignItems: 'center',
        paddingLeft: '12px', paddingRight: '12px', gap: '10px',
        background: '#07A04E', borderBottom: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)', flexShrink: 0,
        position: 'relative', zIndex: 20,
      }}>
        <button
          onClick={() => setMobileSearchOpen(false)}
          style={{ ...btnBase, width: '38px', height: '38px', flexShrink: 0 }}
        >
          <X size={20} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <GlobalSearch autoFocus onClose={() => setMobileSearchOpen(false)} />
        </div>
      </header>
    );
  }

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

        {/* Center — search bar (hidden on mobile, shown on sm+) */}
        <div className="hidden sm:flex" style={{ flex: 1, justifyContent: 'center', minWidth: 0 }}>
          <GlobalSearch />
        </div>

        {/* Right — actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>

          {/* Mobile search icon — only visible below sm */}
          <button
            className="sm:hidden"
            onClick={() => setMobileSearchOpen(true)}
            title="Search"
            style={{ ...btnBase, width: '38px', height: '38px' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.22)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; }}
          >
            <Search size={17} />
          </button>

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
