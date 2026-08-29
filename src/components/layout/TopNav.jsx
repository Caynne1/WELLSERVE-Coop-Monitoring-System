/**
 * TopNav — multi-level enterprise navigation.
 * Only top-level categories are shown; each (except Dashboard) reveals
 * a dropdown submenu on click. Single-open-at-a-time, keyboard accessible,
 * sticky beneath the Topbar. All routes/permissions are unchanged — presentation only.
 */

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard, Users, ChevronDown,
  CreditCard, PiggyBank, Wallet, Landmark, Sprout,
  Receipt, ArrowLeftRight, TrendingUp, FileText, BookOpen,
  ActivitySquare, BarChart2, ShieldCheck, UserCog, Settings,
  Wallet2, LineChart, X,
} from 'lucide-react';

// ── Nav model ───────────────────────────────────────────────────────────────
// Flat links show directly; `children` items render inside a dropdown panel.
const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  {
    key: 'members', label: 'Members', icon: Users,
    children: [
      { to: '/members', icon: Users, label: 'Members', permKey: 'members' },
      { to: '/membership-monitoring', icon: ShieldCheck, label: 'Membership Monitoring', permKey: 'members' },
    ],
  },
  {
    key: 'products', label: 'Products & Services', icon: Wallet2,
    children: [
      { to: '/loans',           icon: CreditCard, label: 'Loans',            permKey: 'loans' },
      { to: '/cbu',             icon: PiggyBank,  label: 'Capital Build-Up (CBU)', permKey: 'cbu' },
      { to: '/savings',         icon: Wallet,     label: 'Savings',          permKey: 'savings' },
      { to: '/time-deposit',    icon: Landmark,   label: 'Time Deposits',    permKey: 'time_deposit' },
      { to: '/savings-booster', icon: Sprout,     label: 'Savings Booster',  permKey: 'savings_booster' },
    ],
  },
  {
    key: 'financial', label: 'Financial Management', icon: Receipt,
    children: [
      { to: '/invoices',     icon: Receipt,        label: 'Invoices',     permKey: 'invoices' },
      { to: '/transactions', icon: ArrowLeftRight, label: 'Transactions', permKey: 'transactions' },
      { to: '/expenses',     icon: TrendingUp,     label: 'Expenses',     permKey: 'expenses' },
      { to: '/vouchers',     icon: FileText,       label: 'Vouchers',     permKey: 'vouchers' },
      { to: '/checkbook',    icon: BookOpen,       label: 'Checkbook',    permKey: 'checkbook' },
    ],
  },
  {
    key: 'monitoring', label: 'Cooperative Monitoring', icon: LineChart,
    children: [
      { to: '/passbook',        icon: BookOpen,        label: 'Passbook',        permKey: 'members' },
      { to: '/coop-monitoring', icon: LayoutDashboard, label: 'Fund Monitoring', permKey: 'account_monitoring' },
    ],
  },
  {
    key: 'reports', label: 'Reports & Audit', icon: BarChart2,
    children: [
      { to: '/reports', icon: BarChart2,      label: 'Reports',       permKey: 'reports' },
      { to: '/logs',    icon: ActivitySquare, label: 'Activity Logs', permKey: 'logs' },
    ],
  },
  {
    key: 'admin', label: 'Admin Control', icon: ShieldCheck,
    children: [
      { to: '/user-management',    icon: UserCog,     label: 'User & Access', adminOnly: true },
      { to: '/settings',           icon: Settings,    label: 'Settings', permKey: 'settings' },
    ],
  },
];

function NavPill({ to, icon: Icon, label, isActive }) {
  return (
    <NavLink to={to} style={{ textDecoration: 'none', flexShrink: 0 }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '7px',
          padding: '8px 14px', borderRadius: '10px',
          fontSize: '13px', fontWeight: isActive ? '600' : '500',
          color: isActive ? '#07A04E' : '#4b5563',
          background: isActive ? '#f0fdf6' : 'transparent',
          border: isActive ? '1px solid #d1fae5' : '1px solid transparent',
          whiteSpace: 'nowrap', cursor: 'pointer', transition: 'all 0.15s ease',
        }}
        onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = '#f6fef9'; e.currentTarget.style.color = '#059c4a'; } }}
        onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#4b5563'; } }}
      >
        <Icon size={15} strokeWidth={isActive ? 2.5 : 2} />
        {label}
      </div>
    </NavLink>
  );
}

// ── Category with dropdown submenu ─────────────────────────────────────────
function NavCategory({ item, isOpen, isActive, onOpen, onClose, registerBtnRef }) {
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const itemRefs = useRef([]);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [shouldRender, setShouldRender] = useState(false);
  const closeTimerRef = useRef(null);

  useEffect(() => { registerBtnRef(item.key, btnRef); }, [item.key, registerBtnRef]);

  const updateCoords = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({ top: rect.bottom + 8, left: rect.left });
  }, []);

  // Keep the panel mounted a little longer than `isOpen` so the closing
  // transition (fade + slide up) has time to play before it's removed.
  useEffect(() => {
    if (isOpen) {
      clearTimeout(closeTimerRef.current);
      setShouldRender(true);
    } else if (shouldRender) {
      closeTimerRef.current = setTimeout(() => setShouldRender(false), 160);
    }
    return () => clearTimeout(closeTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Recompute position whenever the menu opens, and keep it pinned to the
  // trigger button on scroll/resize. Since the menu is portaled to <body>
  // and positioned with `fixed`, it's no longer clipped by the nav's own
  // overflow/height — it just needs to track the button's screen position.
  useLayoutEffect(() => {
    if (!shouldRender) return;
    updateCoords();
    window.addEventListener('scroll', updateCoords, true);
    window.addEventListener('resize', updateCoords);
    return () => {
      window.removeEventListener('scroll', updateCoords, true);
      window.removeEventListener('resize', updateCoords);
    };
  }, [shouldRender, updateCoords]);

  const focusItem = (idx) => {
    const el = itemRefs.current[idx];
    if (el) el.focus();
  };

  const handleBtnKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(item.key);
      setTimeout(() => focusItem(0), 0);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleMenuKeyDown = (e, idx) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusItem(Math.min(idx + 1, item.children.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (idx === 0) { btnRef.current?.focus(); onClose(); }
      else focusItem(idx - 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      btnRef.current?.focus();
    } else if (e.key === 'Tab') {
      onClose();
    }
  };

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (isOpen ? onClose() : onOpen(item.key))}
        onKeyDown={handleBtnKeyDown}
        aria-expanded={isOpen}
        aria-haspopup="true"
        style={{
          display: 'flex', alignItems: 'center', gap: '7px',
          padding: '8px 12px', borderRadius: '10px',
          fontSize: '13px', fontWeight: isActive ? '600' : '500',
          color: isActive || isOpen ? '#07A04E' : '#4b5563',
          background: isActive || isOpen ? '#f0fdf6' : 'transparent',
          border: isActive || isOpen ? '1px solid #d1fae5' : '1px solid transparent',
          whiteSpace: 'nowrap', cursor: 'pointer', transition: 'all 0.15s ease',
        }}
      >
        <item.icon size={15} strokeWidth={isActive ? 2.5 : 2} />
        {item.label}
        <ChevronDown
          size={13}
          style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s ease' }}
        />
      </button>

      {shouldRender && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="topnav-dropdown"
          style={{
            position: 'fixed', top: `${coords.top}px`, left: `${coords.left}px`,
            minWidth: '240px', background: '#ffffff',
            border: '1px solid #e5e7eb', borderRadius: '16px',
            boxShadow: '0 16px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)',
            padding: '8px', zIndex: 1000,
            opacity: isOpen ? 1 : 0,
            transform: isOpen ? 'translateY(0) scale(1)' : 'translateY(-6px) scale(0.98)',
            transformOrigin: 'top left',
            pointerEvents: isOpen ? 'auto' : 'none',
            transition: 'opacity 0.16s ease, transform 0.16s ease',
          }}
        >
          {item.children.map((child, idx) => (
            <NavLink
              key={child.to}
              to={child.to}
              role="menuitem"
              ref={el => { itemRefs.current[idx] = el; }}
              onClick={onClose}
              onKeyDown={e => handleMenuKeyDown(e, idx)}
              style={{ textDecoration: 'none', display: 'block', outline: 'none' }}
            >
              {({ isActive: childActive }) => (
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '9px 11px', borderRadius: '10px',
                    fontSize: '13.5px', fontWeight: childActive ? '600' : '500',
                    color: childActive ? '#07A04E' : '#374151',
                    background: childActive ? '#f0fdf6' : 'transparent',
                    transition: 'background 0.12s ease, color 0.12s ease',
                  }}
                  onMouseEnter={e => { if (!childActive) { e.currentTarget.style.background = '#f6fef9'; e.currentTarget.style.color = '#059c4a'; } }}
                  onMouseLeave={e => { if (!childActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#374151'; } }}
                >
                  <span style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0,
                    background: childActive ? '#d1fae5' : '#f3f4f6',
                    color: childActive ? '#07A04E' : '#6b7280',
                  }}>
                    <child.icon size={14} strokeWidth={childActive ? 2.5 : 2} />
                  </span>
                  {child.label}
                </div>
              )}
            </NavLink>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

export default function TopNav({ mobileOpen = false, onMobileClose }) {
  const { profile, hasPermission } = useAuth();
  const location = useLocation();
  const isAdmin = profile?.role === 'admin';

  const [openKey, setOpenKey] = useState(null);
  const [mobileSection, setMobileSection] = useState(null);
  const navRef = useRef(null);
  const btnRefs = useRef({});

  const registerBtnRef = useCallback((key, ref) => { btnRefs.current[key] = ref; }, []);

  const allowed = (item) => {
    if (item.adminOnly && !isAdmin) return false;
    if (!item.permKey) return true;
    return hasPermission(item.permKey, 'view');
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      // The open dropdown is portaled to <body> to escape the nav's
      // overflow/height clipping, so it won't be inside navRef — check for
      // it explicitly via its class instead of just navRef.contains(...).
      const inNav = navRef.current && navRef.current.contains(e.target);
      const inDropdown = e.target.closest && e.target.closest('.topnav-dropdown');
      if (!inNav && !inDropdown) setOpenKey(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Global Escape
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && openKey) {
        const ref = btnRefs.current[openKey];
        setOpenKey(null);
        ref?.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [openKey]);

  useEffect(() => {
    if (!mobileOpen) {
      setMobileSection(null);
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleEscape = (event) => {
      if (event.key === 'Escape') onMobileClose?.();
    };
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [mobileOpen, onMobileClose]);

  const renderedItems = NAV_ITEMS
    .map(item => {
      if (item.children) {
        const children = item.children.filter(allowed);
        return children.length > 0 ? { ...item, children } : null;
      }
      return allowed(item) ? item : null;
    })
    .filter(Boolean);

  return (
    <>
      <nav
        ref={navRef}
        className="topnav-scroll hidden md:flex"
        style={{
        alignItems: 'center', gap: '4px',
        height: '52px', padding: '0 16px',
        background: '#ffffff', borderBottom: '1px solid #e5e7eb',
        overflowX: 'auto', overflowY: 'visible',
        position: 'sticky', top: '60px', zIndex: 15,
      }}
      >
        {renderedItems.map(item => {
          if (item.children) {
            const isActive = item.children.some(c => location.pathname.startsWith(c.to));
            return (
              <NavCategory
                key={item.key}
                item={item}
                isOpen={openKey === item.key}
                isActive={isActive}
                onOpen={setOpenKey}
                onClose={() => setOpenKey(null)}
                registerBtnRef={registerBtnRef}
              />
            );
          }
          return (
            <NavPill
              key={item.to}
              to={item.to}
              icon={item.icon}
              label={item.label}
              isActive={location.pathname.startsWith(item.to)}
            />
          );
        })}
      </nav>

      {mobileOpen && createPortal(
        <div className="fixed inset-0 z-[9998] md:hidden" role="dialog" aria-modal="true" aria-label="Main navigation">
          <button
            type="button"
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            onClick={onMobileClose}
            aria-label="Close navigation menu"
          />
          <aside className="relative flex h-full w-[min(88vw,340px)] flex-col bg-white shadow-2xl animate-slide-in-left">
            <div className="flex h-[60px] flex-shrink-0 items-center justify-between border-b border-gray-100 px-4">
              <div>
                <p className="text-sm font-bold tracking-wide text-gray-900">WELLSERVE</p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase text-[#07A04E]">Main Navigation</p>
              </div>
              <button
                type="button"
                onClick={onMobileClose}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                aria-label="Close navigation menu"
              >
                <X size={19} />
              </button>
            </div>

            <nav className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="space-y-1">
                {renderedItems.map(item => {
                  if (!item.children) {
                    const active = location.pathname.startsWith(item.to);
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={onMobileClose}
                        className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${active ? 'bg-emerald-50 text-[#07A04E]' : 'text-gray-700 hover:bg-gray-50'}`}
                      >
                        <item.icon size={18} strokeWidth={active ? 2.5 : 2} />
                        <span>{item.label}</span>
                      </NavLink>
                    );
                  }

                  const sectionActive = item.children.some(child => location.pathname.startsWith(child.to));
                  const expanded = mobileSection === item.key || sectionActive;
                  return (
                    <div key={item.key}>
                      <button
                        type="button"
                        onClick={() => setMobileSection(current => current === item.key ? null : item.key)}
                        className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${sectionActive ? 'bg-emerald-50 text-[#07A04E]' : 'text-gray-700 hover:bg-gray-50'}`}
                        aria-expanded={expanded}
                      >
                        <item.icon size={18} strokeWidth={sectionActive ? 2.5 : 2} />
                        <span className="min-w-0 flex-1">{item.label}</span>
                        <ChevronDown size={16} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                      </button>

                      {expanded && (
                        <div className="ml-5 mt-1 space-y-1 border-l border-emerald-100 pl-3">
                          {item.children.map(child => {
                            const childActive = location.pathname.startsWith(child.to);
                            return (
                              <NavLink
                                key={child.to}
                                to={child.to}
                                onClick={onMobileClose}
                                className={`flex min-h-10 items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${childActive ? 'bg-emerald-50 text-[#07A04E]' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
                              >
                                <child.icon size={16} strokeWidth={childActive ? 2.5 : 2} />
                                <span>{child.label}</span>
                              </NavLink>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </nav>
          </aside>
        </div>,
        document.body
      )}
    </>
  );
}
