/**
 * Sidebar — supports two modes:
 *   expanded  (collapsed=false) → full labels + groups
 *   collapsed (collapsed=true)  → icon-only, 64px wide
 *
 * Parent wiring example:
 *   const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
 *
 *   <Topbar
 *     onMenuClick={() => setSidebarCollapsed(false)}   // hamburger always expands
 *     isSidebarOpen={!sidebarCollapsed}
 *   />
 *   <Sidebar
 *     collapsed={sidebarCollapsed}
 *     onCollapse={() => setSidebarCollapsed(true)}
 *   />
 */

import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard, Users, CreditCard, Receipt, BookOpen,
  PiggyBank, ArrowLeftRight, FileText, TrendingUp, BarChart2,
  ActivitySquare, Settings, Wallet, ShieldCheck, UserCog,
  Landmark, Sprout,
} from 'lucide-react';
import WellserveLogo from '../shared/WellserveLogo';

const navGroups = [
  {
    label: 'Main',
    items: [
      { to: '/dashboard',          icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/members',            icon: Users,           label: 'Members',            permKey: 'members' },
      { to: '/passbook',           icon: BookOpen,        label: 'Passbook',           permKey: 'members' },
    ],
  },
  {
    label: 'Financial',
    items: [
      { to: '/loans',              icon: CreditCard,      label: 'Loans',              permKey: 'loans' },
      { to: '/cbu',                icon: PiggyBank,       label: 'CBU',                permKey: 'cbu' },
      { to: '/savings',            icon: Wallet,          label: 'Savings',            permKey: 'savings' },
      { to: '/time-deposit',       icon: Landmark,        label: 'Time Deposit',       permKey: 'time_deposit' },
      { to: '/savings-booster',    icon: Sprout,          label: 'Savings Booster',    permKey: 'savings_booster' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/transactions',       icon: ArrowLeftRight,  label: 'Transactions',       permKey: 'transactions' },
      { to: '/checkbook',          icon: BookOpen,        label: 'Checkbook',          permKey: 'checkbook' },
      { to: '/invoices',           icon: Receipt,         label: 'Invoices',           permKey: 'invoices' },
      { to: '/vouchers',           icon: FileText,        label: 'Vouchers',           permKey: 'vouchers' },
      { to: '/expenses',           icon: TrendingUp,      label: 'Expenses',           permKey: 'expenses' },
      { to: '/coop-monitoring',    icon: LayoutDashboard, label: 'Account Monitoring', permKey: 'account_monitoring' },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { to: '/reports',            icon: BarChart2,       label: 'Reports',            permKey: 'reports' },
      { to: '/logs',               icon: ActivitySquare,  label: 'Activity Logs',      permKey: 'logs' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/settings',           icon: Settings,        label: 'Settings',           permKey: 'settings' },
      { to: '/account-management', icon: ShieldCheck,     label: 'Accounts',           adminOnly: true },
      { to: '/user-management',    icon: UserCog,         label: 'User Management',    adminOnly: true },
    ],
  },
];

export default function Sidebar({ collapsed = false, onCollapse }) {
  const { profile, hasPermission } = useAuth();
  const isAdminUser = profile?.role === 'admin';

  const renderedGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(item => {
        if (item.adminOnly && !isAdminUser) return false;
        if (!item.permKey) return true;
        return hasPermission(item.permKey, 'view');
      }),
    }))
    .filter(group => group.items.length > 0);

  // ── COLLAPSED (icon-only) ──────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div
        style={{
          width: '64px',
          display: 'flex', flexDirection: 'column',
          height: '100%', background: '#ffffff',
          borderRight: '1px solid #e5e7eb',
          transition: 'width 0.22s ease',
          overflow: 'hidden',
        }}
      >
        {/* Logo only */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '60px', borderBottom: '1px solid #e5e7eb', flexShrink: 0,
        }}>
          <WellserveLogo size={30} variant="dark" />
        </div>

        {/* Icon nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {renderedGroups.map((group) =>
            group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                title={item.label}
                style={{ textDecoration: 'none', display: 'block' }}
              >
                {({ isActive }) => (
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: '40px', height: '40px', borderRadius: '10px', margin: '0 auto',
                      background: isActive ? '#f0fdf6' : 'transparent',
                      border: isActive ? '1px solid #d1fae5' : '1px solid transparent',
                      color: isActive ? '#07A04E' : '#9ca3af',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={e => {
                      if (!isActive) {
                        e.currentTarget.style.background = '#f6fef9';
                        e.currentTarget.style.color = '#07A04E';
                        e.currentTarget.style.borderColor = '#e6faf0';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#9ca3af';
                        e.currentTarget.style.borderColor = 'transparent';
                      }
                    }}
                  >
                    <item.icon size={16} strokeWidth={isActive ? 2.5 : 2} />
                  </div>
                )}
              </NavLink>
            ))
          )}
        </nav>

        {/* Thin footer spacer */}
        <div style={{ height: '12px', borderTop: '1px solid #e5e7eb', background: '#fafafa' }} />
      </div>
    );
  }

  // ── EXPANDED (full) ────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column',
        height: '100%', background: '#ffffff',
        borderRight: '1px solid #e5e7eb',
        transition: 'width 0.22s ease',
      }}
    >
      {/* Brand Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 12px 0 16px', height: '60px',
        borderBottom: '1px solid #e5e7eb', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <WellserveLogo size={34} variant="dark" />
          <div style={{ lineHeight: 1.1 }}>
            <p style={{
              margin: 0, fontSize: '13px', fontWeight: '800',
              letterSpacing: '0.16em', color: '#111827',
            }}>
              WELLSERVE
            </p>
            <p style={{
              margin: '2px 0 0', fontSize: '8px', fontWeight: '700',
              letterSpacing: '0.14em', textTransform: 'uppercase', color: '#07A04E',
            }}>
              Credit Cooperative
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '14px 10px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {renderedGroups.map((group, groupIdx) => (
            <div
              key={group.label}
              className="animate-fade-in-up"
              style={{ animationDelay: `${groupIdx * 0.05}s` }}
            >
              {/* Group label */}
              <p style={{
                margin: '0 0 5px 8px',
                fontSize: '9.5px', fontWeight: '700',
                letterSpacing: '0.18em', textTransform: 'uppercase',
                color: '#c4c8cf',
              }}>
                {group.label}
              </p>

              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
                {group.items.map((item, itemIdx) => (
                  <li
                    key={item.to}
                    className="animate-slide-in-left"
                    style={{ animationDelay: `${(groupIdx * 0.05) + (itemIdx * 0.03)}s` }}
                  >
                    <NavLink to={item.to} style={{ textDecoration: 'none', display: 'block' }}>
                      {({ isActive }) => (
                        <div
                          style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            padding: '7.5px 10px', borderRadius: '9px',
                            fontSize: '13px',
                            fontWeight: isActive ? '600' : '500',
                            color: isActive ? '#07A04E' : '#4b5563',
                            background: isActive ? '#f0fdf6' : 'transparent',
                            border: isActive ? '1px solid #d1fae5' : '1px solid transparent',
                            transition: 'all 0.15s ease',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={e => {
                            if (!isActive) {
                              e.currentTarget.style.background = '#f6fef9';
                              e.currentTarget.style.color = '#059c4a';
                              e.currentTarget.style.borderColor = '#e6faf0';
                            }
                          }}
                          onMouseLeave={e => {
                            if (!isActive) {
                              e.currentTarget.style.background = 'transparent';
                              e.currentTarget.style.color = '#4b5563';
                              e.currentTarget.style.borderColor = 'transparent';
                            }
                          }}
                        >
                          <span style={{
                            display: 'flex', flexShrink: 0,
                            color: isActive ? '#07A04E' : '#9ca3af',
                            transition: 'color 0.15s ease',
                          }}>
                            <item.icon size={15} strokeWidth={isActive ? 2.5 : 2} />
                          </span>

                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.label}
                          </span>

                          {isActive && (
                            <span
                              className="animate-scale-in"
                              style={{
                                width: '5px', height: '5px', borderRadius: '9999px',
                                background: '#07A04E', flexShrink: 0,
                                boxShadow: '0 0 0 2px #d1fae5',
                              }}
                            />
                          )}
                        </div>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div style={{
        borderTop: '1px solid #e5e7eb',
        padding: '10px 16px',
        background: '#fafafa',
      }}>
        <p style={{
          textAlign: 'center', fontSize: '9.5px', fontWeight: '500',
          letterSpacing: '0.06em', color: '#9ca3af', margin: 0,
        }}>
          WELLServe Coop Monitoring System
        </p>
      </div>
    </div>
  );
}