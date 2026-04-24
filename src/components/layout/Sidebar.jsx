import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Receipt,
  BookOpen,
  PiggyBank,
  ArrowLeftRight,
  FileText,
  TrendingUp,
  BarChart2,
  ActivitySquare,
  Settings,
  Wallet,
  ShieldCheck,
  UserCog,
  Monitor,
} from 'lucide-react';
import WellserveLogo from '../shared/WellserveLogo';

const navGroups = [
  {
    label: 'Main',
    items: [
      { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/members',    icon: Users,            label: 'Members',  permKey: 'members' },
      { to: '/passbook',   icon: BookOpen,         label: 'Passbook', permKey: 'members' },
    ],
  },
  {
    label: 'Financial',
    items: [
      { to: '/loans',   icon: CreditCard, label: 'Loans',   permKey: 'loans' },
      { to: '/cbu',     icon: PiggyBank,  label: 'CBU',     permKey: 'cbu' },
      { to: '/savings', icon: Wallet,     label: 'Savings', permKey: 'savings' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/transactions',    icon: ArrowLeftRight, label: 'Transactions',      permKey: 'transactions' },
      { to: '/checkbook',       icon: BookOpen,       label: 'Checkbook',         permKey: 'checkbook' },
      { to: '/invoices',        icon: Receipt,        label: 'Invoices',           permKey: 'invoices' },
      { to: '/vouchers',        icon: FileText,       label: 'Vouchers',           permKey: 'vouchers' },
      { to: '/expenses',        icon: TrendingUp,     label: 'Expenses',           permKey: 'expenses' },
      { to: '/coop-monitoring', icon: Monitor,        label: 'Account Monitoring' },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { to: '/reports', icon: BarChart2,      label: 'Reports',       permKey: 'reports' },
      { to: '/logs',    icon: ActivitySquare, label: 'Activity Logs', permKey: 'logs' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/settings',          icon: Settings,  label: 'Settings',        permKey: 'settings' },
      { to: '/account-management',icon: ShieldCheck,label: 'Accounts',        adminOnly: true },
      { to: '/user-management',   icon: UserCog,   label: 'User Management', adminOnly: true },
    ],
  },
];

export default function Sidebar({ isOpen, onClose }) {
  const { profile, hasPermission } = useAuth();
  const isAdminUser = profile?.role === 'admin';

  const renderedGroups = navGroups
    .map(group => ({
      ...group,
      items: group.items.filter(item => {
        if (item.adminOnly && !isAdminUser) return false;
        if (!item.permKey) return true;
        return hasPermission(item.permKey, 'view');
      }),
    }))
    .filter(g => g.items.length > 0);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%',
      background: '#ffffff',
      borderRight: '1px solid #E8EAED',
      boxShadow: isOpen ? '4px 0 20px rgba(0,0,0,0.06)' : 'none',
      overflow: 'hidden',
    }}>

      {/* ── Brand header ────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 14px',
        height: '60px',
        flexShrink: 0,
        borderBottom: '1px solid #ECEEF0',
        background: 'linear-gradient(100deg, #0B3580 0%, #1148B8 52%, #1A5CE0 100%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
          <div style={{ flexShrink: 0 }}>
            <WellserveLogo size={32} variant="light" />
          </div>
          <div style={{
            overflow: 'hidden',
            opacity: 1,
            transition: 'opacity 0.2s ease',
            whiteSpace: 'nowrap',
          }}>
            <p style={{ margin: 0, fontSize: '13px', fontWeight: 800, letterSpacing: '0.18em', color: '#ffffff' }}>
              WELLSERVE
            </p>
            <p style={{ margin: 0, marginTop: '2px', fontSize: '9px', fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.68)', textTransform: 'uppercase' }}>
              Credit Cooperative
            </p>
          </div>
        </div>
      </div>

      {/* ── Navigation ──────────────────────────────── */}
      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '12px 8px' }}>
        {renderedGroups.map((group, gi) => (
          <div key={group.label} style={{ marginBottom: gi < renderedGroups.length - 1 ? '20px' : 0 }}>
            {/* Group label */}
            <p style={{
              margin: '0 0 4px 0',
              padding: '0 8px',
              fontSize: '9.5px',
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: '#9CA3AF',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}>
              {group.label}
            </p>

            {/* Items */}
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {group.items.map(item => (
                <li key={item.to}>
                  <NavLink to={item.to} onClick={onClose} style={{ textDecoration: 'none', display: 'block' }}>
                    {({ isActive }) => (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 10px',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        background: isActive ? '#EBF8F1' : 'transparent',
                        transition: 'background 0.14s ease',
                        position: 'relative',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#F5F6F8'; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                      >
                        {/* Active left accent bar */}
                        {isActive && (
                          <span style={{
                            position: 'absolute', left: 0, top: '20%', bottom: '20%',
                            width: '3px', borderRadius: '0 3px 3px 0',
                            background: '#07A04E',
                          }} />
                        )}

                        {/* Icon */}
                        <span style={{
                          flexShrink: 0,
                          color: isActive ? '#07A04E' : '#6B7280',
                          display: 'flex',
                          alignItems: 'center',
                          transition: 'color 0.14s ease',
                        }}>
                          <item.icon size={16} strokeWidth={isActive ? 2.5 : 1.8} />
                        </span>

                        {/* Label */}
                        <span style={{
                          fontSize: '13px',
                          fontWeight: isActive ? 700 : 500,
                          color: isActive ? '#065F46' : '#374151',
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          transition: 'color 0.14s ease',
                        }}>
                          {item.label}
                        </span>
                      </div>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* ── Footer ──────────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        padding: '10px 14px',
        borderTop: '1px solid #ECEEF0',
        background: '#FAFAFA',
      }}>
        <p style={{
          margin: 0, textAlign: 'center',
          fontSize: '10px', color: '#9CA3AF',
          fontWeight: 500, letterSpacing: '0.04em',
          whiteSpace: 'nowrap', overflow: 'hidden',
        }}>
          WELLServe Coop Monitoring v2.0
        </p>
      </div>
    </div>
  );
}