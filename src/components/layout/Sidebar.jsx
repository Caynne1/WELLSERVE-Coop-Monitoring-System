import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard, Users, CreditCard, Receipt,
  BookOpen, PiggyBank, ArrowLeftRight, FileText,
  TrendingUp, BarChart2, ActivitySquare, Settings,
  UserCog, X, Wallet, ShieldCheck,
} from 'lucide-react';
import WellserveLogo from '../shared/WellserveLogo';

const navGroups = [
  {
    label: 'Main',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/members',   icon: Users,           label: 'Members' },
    ],
  },
  {
    label: 'Financial',
    items: [
      { to: '/loans',   icon: CreditCard, label: 'Loans' },
      { to: '/cbu',     icon: PiggyBank,  label: 'CBU' },
      { to: '/savings', icon: Wallet,     label: 'Savings' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/transactions', icon: ArrowLeftRight, label: 'Transactions' },
      { to: '/checkbook',    icon: BookOpen,        label: 'Checkbook' },
      { to: '/invoices',     icon: Receipt,         label: 'Invoices' },
      { to: '/vouchers',     icon: FileText,        label: 'Vouchers' },
      { to: '/expenses',     icon: TrendingUp,      label: 'Expenses' },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { to: '/reports', icon: BarChart2,      label: 'Reports' },
      { to: '/logs',    icon: ActivitySquare, label: 'Activity Logs' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
];

// Admin-only items injected at render time based on profile.role
const ADMIN_ONLY_ITEMS = [
  { to: '/account-management', icon: ShieldCheck, label: 'Account Management' },
];

export default function Sidebar({ onClose }) {
  const { isAdmin } = useAuth();

  // Merge admin-only items into the Admin group at render time
  const renderedGroups = navGroups.map(group => {
    if (group.label === 'Admin' && isAdmin) {
      return { ...group, items: [...group.items, ...ADMIN_ONLY_ITEMS] };
    }
    return group;
  });

  return (
    <div className="h-full flex flex-col bg-white border-r border-gray-100">

      {/* ── Brand header ── */}
      <div
        className="flex items-center justify-between px-4 py-4"
        style={{ borderBottom: '1px solid #e8f5eb' }}
      >
        <div className="flex items-center gap-3">
          <WellserveLogo size={40} variant="dark" />
          <div>
            <p style={{ fontSize: '14px', fontWeight: '800', color: '#273C2C', letterSpacing: '1.5px', margin: 0, lineHeight: 1 }}>
              WELLSERVE
            </p>
            <p style={{ fontSize: '9px', color: '#07A04E', fontWeight: '700', marginTop: '3px', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
              Credit Cooperative
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {renderedGroups.map(group => (
          <div key={group.label}>
            <p style={{ fontSize: '9px', fontWeight: '800', color: '#b0b8b2', letterSpacing: '1.8px', textTransform: 'uppercase', paddingLeft: '8px', marginBottom: '6px' }}>
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map(item => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={onClose}
                    className="block"
                  >
                    {({ isActive }) => (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 12px',
                          borderRadius: '10px',
                          fontSize: '13px',
                          fontWeight: isActive ? '600' : '500',
                          color: isActive ? '#273C2C' : '#6b7280',
                          background: isActive ? '#D6FADC' : 'transparent',
                          transition: 'all 0.15s',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = '#f0faf2'; e.currentTarget.style.color = '#273C2C'; } }}
                        onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6b7280'; } }}
                      >
                        <span style={{ flexShrink: 0, color: isActive ? '#07A04E' : '#9ca3af', display: 'flex' }}>
                          <item.icon size={16} strokeWidth={isActive ? 2.5 : 2} />
                        </span>
                        {item.label}
                        {isActive && (
                          <span
                            style={{
                              marginLeft: 'auto', width: '6px', height: '6px',
                              borderRadius: '50%', background: '#07A04E', flexShrink: 0,
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
      </nav>

      {/* ── Footer ── */}
      <div style={{ padding: '10px 16px 12px', borderTop: '1px solid #e8f5eb', background: '#f8fef9' }}>
        <p style={{ fontSize: '9px', color: '#adb5b0', textAlign: 'center', fontWeight: '600', letterSpacing: '0.6px' }}>
          WELLSERVE Coop Monitoring v2.0
        </p>
      </div>
    </div>
  );
}