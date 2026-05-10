/**
 * Topbar
 *
 * Props:
 *   onMenuClick     — called when hamburger is clicked; parent should expand sidebar
 *   isSidebarOpen   — true when sidebar is fully expanded (not collapsed)
 *
 * Parent wiring example:
 *   const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
 *
 *   <Topbar
 *     onMenuClick={() => setSidebarCollapsed(false)}
 *     isSidebarOpen={!sidebarCollapsed}
 *   />
 *   <Sidebar
 *     collapsed={sidebarCollapsed}
 *     onCollapse={() => setSidebarCollapsed(true)}
 *   />
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Menu, X, Bell, LogOut, Search,
  LayoutDashboard, Users, CreditCard, Receipt, BookOpen,
  PiggyBank, ArrowLeftRight, FileText, TrendingUp, BarChart2,
  ActivitySquare, Settings, Wallet, ShieldCheck, UserCog,
  Landmark, Sprout,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import NotificationPanel from '../notifications/NotificationPanel';

const ALL_NAV_ITEMS = [
  { to: '/dashboard',          icon: LayoutDashboard, label: 'Dashboard',          group: 'Main' },
  { to: '/members',            icon: Users,           label: 'Members',            group: 'Main',       permKey: 'members' },
  { to: '/passbook',           icon: BookOpen,        label: 'Passbook',           group: 'Main',       permKey: 'members' },
  { to: '/loans',              icon: CreditCard,      label: 'Loans',              group: 'Financial',  permKey: 'loans' },
  { to: '/cbu',                icon: PiggyBank,       label: 'CBU',                group: 'Financial',  permKey: 'cbu' },
  { to: '/savings',            icon: Wallet,          label: 'Savings',            group: 'Financial',  permKey: 'savings' },
  { to: '/time-deposit',       icon: Landmark,        label: 'Time Deposit',       group: 'Financial',  permKey: 'time_deposit' },
  { to: '/savings-booster',    icon: Sprout,          label: 'Savings Booster',    group: 'Financial',  permKey: 'savings_booster' },
  { to: '/transactions',       icon: ArrowLeftRight,  label: 'Transactions',       group: 'Operations', permKey: 'transactions' },
  { to: '/checkbook',          icon: BookOpen,        label: 'Checkbook',          group: 'Operations', permKey: 'checkbook' },
  { to: '/invoices',           icon: Receipt,         label: 'Invoices',           group: 'Operations', permKey: 'invoices' },
  { to: '/vouchers',           icon: FileText,        label: 'Vouchers',           group: 'Operations', permKey: 'vouchers' },
  { to: '/expenses',           icon: TrendingUp,      label: 'Expenses',           group: 'Operations', permKey: 'expenses' },
  { to: '/coop-monitoring',    icon: LayoutDashboard, label: 'Account Monitoring', group: 'Operations', permKey: 'account_monitoring' },
  { to: '/reports',            icon: BarChart2,       label: 'Reports',            group: 'Analytics',  permKey: 'reports' },
  { to: '/logs',               icon: ActivitySquare,  label: 'Activity Logs',      group: 'Analytics',  permKey: 'logs' },
  { to: '/settings',           icon: Settings,        label: 'Settings',           group: 'Admin',      permKey: 'settings' },
  { to: '/account-management', icon: ShieldCheck,     label: 'Accounts',           group: 'Admin',      adminOnly: true },
  { to: '/user-management',    icon: UserCog,         label: 'User Management',    group: 'Admin',      adminOnly: true },
];

function Highlight({ text, query }) {
  if (!query) return <span>{text}</span>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, idx)}
      <mark style={{
        background: '#d1fae5', color: '#065f46',
        borderRadius: '2px', padding: '0 1px', fontWeight: '700',
      }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </span>
  );
}

export default function Topbar({ onMenuClick, isSidebarOpen = true }) {
  const { user, profile, signOut, hasPermission } = useAuth();
  const { unreadCount, panelOpen, setPanelOpen } = useNotifications();
  const navigate   = useNavigate();
  const isAdmin    = profile?.role === 'admin';
  const initials   = user?.email?.[0]?.toUpperCase() || 'A';

  const bellRef     = useRef(null);
  const searchRef   = useRef(null);
  const inputRef    = useRef(null);
  const dropdownRef = useRef(null);

  const [searchValue,   setSearchValue]   = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeIdx,     setActiveIdx]     = useState(-1);

  const results = searchValue.trim()
    ? ALL_NAV_ITEMS.filter(item => {
        if (item.adminOnly && !isAdmin) return false;
        if (item.permKey && !hasPermission(item.permKey, 'view')) return false;
        return item.label.toLowerCase().includes(searchValue.toLowerCase());
      })
    : [];

  const showDropdown = searchFocused && searchValue.trim().length > 0;

  const goTo = useCallback((item) => {
    navigate(item.to);
    setSearchValue('');
    setActiveIdx(-1);
    inputRef.current?.blur();
  }, [navigate]);

  const handleKeyDown = (e) => {
    if (!showDropdown) return;
    if (e.key === 'ArrowDown')  { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const target = activeIdx >= 0 ? results[activeIdx] : results[0];
      if (target) goTo(target);
    } else if (e.key === 'Escape') {
      setSearchValue(''); setActiveIdx(-1); inputRef.current?.blur();
    }
  };

  useEffect(() => { setActiveIdx(-1); }, [searchValue]);

  useEffect(() => {
    const handler = (e) => {
      if (
        searchRef.current   && !searchRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) setSearchFocused(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Hamburger button: shows Menu icon when sidebar is collapsed, X when expanded (desktop-only X is gone — we use arrow in sidebar now)
  // We always show Menu icon since the arrow in the sidebar handles collapsing.
  // Clicking hamburger always expands (onMenuClick).
  const showMenuIcon = !isSidebarOpen; // hamburger when collapsed, nothing special when expanded

  return (
    <>
      <header style={{
        height: '60px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: '16px', paddingRight: '20px',
        background: '#ffffff', borderBottom: '1px solid #e5e7eb',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        flexShrink: 0, position: 'relative', zIndex: 20, gap: '12px',
      }}>

        {/* Left — hamburger (only visible when sidebar is collapsed) */}
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <button
            onClick={onMenuClick}
            title={isSidebarOpen ? 'Sidebar open' : 'Expand sidebar'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '36px', height: '36px', borderRadius: '10px',
              border: '1px solid #e5e7eb',
              background: !isSidebarOpen ? '#f0fdf6' : '#fafafa',
              cursor: !isSidebarOpen ? 'pointer' : 'default',
              color: !isSidebarOpen ? '#07A04E' : '#d1d5db',
              transition: 'all 0.18s ease',
              opacity: isSidebarOpen ? 0.45 : 1,
            }}
            onMouseEnter={e => {
              if (!isSidebarOpen) {
                e.currentTarget.style.background = '#f0fdf6';
                e.currentTarget.style.color = '#07A04E';
                e.currentTarget.style.borderColor = '#bbf7d0';
              }
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = !isSidebarOpen ? '#f0fdf6' : '#fafafa';
              e.currentTarget.style.color = !isSidebarOpen ? '#07A04E' : '#d1d5db';
              e.currentTarget.style.borderColor = '#e5e7eb';
            }}
          >
            <Menu size={18} />
          </button>
        </div>

        {/* Right — actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, marginLeft: 'auto' }}>

          {/* Search */}
          <div style={{ position: 'relative' }} ref={searchRef}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              height: '36px', borderRadius: '10px',
              border: searchFocused ? '1px solid #bbf7d0' : '1px solid #e5e7eb',
              background: searchFocused ? '#f6fef9' : '#fafafa',
              padding: '0 10px',
              transition: 'all 0.2s ease',
              width: searchFocused ? '220px' : '180px',
              boxShadow: searchFocused ? '0 0 0 3px rgba(7,160,78,0.08)' : 'none',
            }}>
              <Search size={13} style={{
                color: searchFocused ? '#07A04E' : '#9ca3af',
                flexShrink: 0, transition: 'color 0.18s ease',
              }} />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search pages..."
                value={searchValue}
                onChange={e => setSearchValue(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onKeyDown={handleKeyDown}
                style={{
                  border: 'none', outline: 'none', background: 'transparent',
                  fontSize: '12.5px', fontWeight: '500', color: '#111827', width: '100%',
                }}
              />
              {searchValue && (
                <button
                  onMouseDown={e => { e.preventDefault(); setSearchValue(''); setActiveIdx(-1); inputRef.current?.focus(); }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '16px', height: '16px', borderRadius: '50%',
                    background: '#e5e7eb', border: 'none', cursor: 'pointer',
                    color: '#6b7280', padding: 0, flexShrink: 0,
                  }}
                >
                  <X size={9} />
                </button>
              )}
            </div>

            {/* Dropdown */}
            {showDropdown && (
              <div ref={dropdownRef} style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                width: '268px', background: '#ffffff',
                border: '1px solid #e5e7eb', borderRadius: '14px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)',
                overflow: 'hidden', zIndex: 50,
              }}>
                {results.length > 0 ? (
                  <>
                    <div style={{ padding: '10px 12px 6px', borderBottom: '1px solid #f3f4f6' }}>
                      <p style={{
                        margin: 0, fontSize: '10px', fontWeight: '700',
                        color: '#9ca3af', letterSpacing: '0.12em', textTransform: 'uppercase',
                      }}>
                        {results.length} result{results.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <ul style={{ margin: 0, padding: '6px', listStyle: 'none', maxHeight: '300px', overflowY: 'auto' }}>
                      {results.map((item, idx) => {
                        const Icon = item.icon;
                        const isHot = idx === activeIdx;
                        return (
                          <li key={item.to}>
                            <button
                              onMouseDown={e => { e.preventDefault(); goTo(item); }}
                              onMouseEnter={() => setActiveIdx(idx)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                width: '100%', padding: '8px 10px', borderRadius: '9px',
                                border: 'none', cursor: 'pointer', textAlign: 'left',
                                background: isHot ? '#f0fdf6' : 'transparent',
                                transition: 'background 0.1s ease',
                              }}
                            >
                              <span style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: '30px', height: '30px', borderRadius: '8px', flexShrink: 0,
                                background: isHot ? '#d1fae5' : '#f3f4f6',
                                color: isHot ? '#07A04E' : '#6b7280',
                                transition: 'all 0.1s ease',
                              }}>
                                <Icon size={13} strokeWidth={2} />
                              </span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{
                                  margin: 0, fontSize: '13px', fontWeight: '500',
                                  color: isHot ? '#065f46' : '#111827',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                  <Highlight text={item.label} query={searchValue} />
                                </p>
                                <p style={{ margin: '1px 0 0', fontSize: '10px', color: '#9ca3af', fontWeight: '500' }}>
                                  {item.group}
                                </p>
                              </div>
                              {isHot && (
                                <span style={{
                                  fontSize: '9px', color: '#07A04E', fontWeight: '700',
                                  background: '#d1fae5', borderRadius: '5px', padding: '2px 6px', flexShrink: 0,
                                }}>↵</span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <div style={{
                      padding: '6px 14px 8px', borderTop: '1px solid #f3f4f6',
                      display: 'flex', gap: '12px',
                    }}>
                      {[['↑↓', 'navigate'], ['↵', 'select'], ['Esc', 'close']].map(([key, desc]) => (
                        <span key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <kbd style={{
                            fontSize: '9px', fontWeight: '600', color: '#6b7280',
                            background: '#f3f4f6', border: '1px solid #e5e7eb',
                            borderRadius: '4px', padding: '1px 4px',
                          }}>{key}</kbd>
                          <span style={{ fontSize: '10px', color: '#9ca3af' }}>{desc}</span>
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ padding: '28px 16px', textAlign: 'center' }}>
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '12px',
                      background: '#f3f4f6', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', margin: '0 auto 10px',
                    }}>
                      <Search size={18} style={{ color: '#d1d5db' }} />
                    </div>
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: '#374151' }}>No pages found</p>
                    <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#9ca3af' }}>Try "loans", "reports", etc.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bell */}
          <div style={{ position: 'relative' }}>
            <button
              ref={bellRef}
              onClick={() => setPanelOpen(prev => !prev)}
              title="Notifications"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '36px', height: '36px', borderRadius: '10px',
                border: panelOpen ? '1px solid #bbf7d0' : '1px solid #e5e7eb',
                background: panelOpen ? '#f0fdf6' : '#fafafa',
                cursor: 'pointer',
                color: panelOpen ? '#07A04E' : '#6b7280',
                transition: 'all 0.18s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#f0fdf6';
                e.currentTarget.style.color = '#07A04E';
                e.currentTarget.style.borderColor = '#bbf7d0';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = panelOpen ? '#f0fdf6' : '#fafafa';
                e.currentTarget.style.color = panelOpen ? '#07A04E' : '#6b7280';
                e.currentTarget.style.borderColor = panelOpen ? '#bbf7d0' : '#e5e7eb';
              }}
            >
              <Bell size={16} />
            </button>
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: '-4px', right: '-4px',
                minWidth: '17px', height: '17px',
                background: '#EF4444', color: '#ffffff',
                fontSize: '9px', fontWeight: '800', borderRadius: '999px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 3px', border: '2px solid #ffffff',
                lineHeight: 1, pointerEvents: 'none',
              }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>

          {/* Divider */}
          <div style={{ width: '1px', height: '22px', background: '#e5e7eb', margin: '0 4px' }} />

          {/* Avatar */}
          <div style={{
            width: '32px', height: '32px', borderRadius: '9999px',
            background: 'linear-gradient(135deg, #4ADE80, #07A04E)',
            border: '2px solid #d1fae5',
            boxShadow: '0 1px 4px rgba(7,160,78,0.20)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span style={{ fontSize: '11px', fontWeight: '800', color: '#ffffff' }}>{initials}</span>
          </div>

          {/* User info */}
          <div className="hidden sm:block" style={{ lineHeight: 1.15, marginLeft: '2px', marginRight: '4px' }}>
            <p style={{
              fontSize: '12px', fontWeight: '600', color: '#111827',
              margin: 0, maxWidth: '140px',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {user?.email || 'Admin'}
            </p>
            <p style={{
              fontSize: '9px', color: '#07A04E', marginTop: '2px',
              letterSpacing: '0.4px', textTransform: 'capitalize', fontWeight: '600',
            }}>
              {profile?.role === 'admin' ? 'Administrator' : profile?.role || 'Staff'}
            </p>
          </div>

          {/* Sign out */}
          <button
            onClick={signOut}
            title="Sign out"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '36px', height: '36px', borderRadius: '10px',
              border: '1px solid #e5e7eb', background: '#fafafa',
              cursor: 'pointer', color: '#9ca3af', transition: 'all 0.18s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#fef2f2';
              e.currentTarget.style.color = '#ef4444';
              e.currentTarget.style.borderColor = '#fecaca';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = '#fafafa';
              e.currentTarget.style.color = '#9ca3af';
              e.currentTarget.style.borderColor = '#e5e7eb';
            }}
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      <NotificationPanel anchorRef={bellRef} />
    </>
  );
}