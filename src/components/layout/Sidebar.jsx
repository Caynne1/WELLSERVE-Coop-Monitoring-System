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
  X,
  Wallet,
  ShieldCheck,
  UserCog,
  Landmark,
  Sprout,
} from 'lucide-react';
import WellserveLogo from '../shared/WellserveLogo';

const navGroups = [
  {
    label: 'Main',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/members', icon: Users, label: 'Members', permKey: 'members' },
      { to: '/passbook', icon: BookOpen, label: 'Passbook', permKey: 'members' },
    ],
  },
  {
    label: 'Financial',
    items: [
      { to: '/loans', icon: CreditCard, label: 'Loans', permKey: 'loans' },
      { to: '/cbu', icon: PiggyBank, label: 'CBU', permKey: 'cbu' },
      { to: '/savings', icon: Wallet, label: 'Savings', permKey: 'savings' },
      { to: '/time-deposit', icon: Landmark, label: 'Time Deposit', permKey: 'time_deposit' },
      { to: '/savings-booster', icon: Sprout, label: 'Savings Booster', permKey: 'savings_booster' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/transactions', icon: ArrowLeftRight, label: 'Transactions', permKey: 'transactions' },
      { to: '/checkbook', icon: BookOpen, label: 'Checkbook', permKey: 'checkbook' },
      { to: '/invoices', icon: Receipt, label: 'Invoices', permKey: 'invoices' },
      { to: '/vouchers', icon: FileText, label: 'Vouchers', permKey: 'vouchers' },
      { to: '/expenses', icon: TrendingUp, label: 'Expenses', permKey: 'expenses' },
      { to: '/coop-monitoring', icon: LayoutDashboard, label: 'Account Monitoring', permKey: 'account_monitoring' },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { to: '/reports', icon: BarChart2, label: 'Reports', permKey: 'reports' },
      { to: '/logs', icon: ActivitySquare, label: 'Activity Logs', permKey: 'logs' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/settings', icon: Settings, label: 'Settings', permKey: 'settings' },
      { to: '/account-management', icon: ShieldCheck, label: 'Accounts', adminOnly: true },
      { to: '/user-management', icon: UserCog, label: 'User Management', adminOnly: true },
    ],
  },
];

export default function Sidebar({ onClose }) {
  const { profile, hasPermission } = useAuth();

  const isAdminUser = profile?.role === 'admin';

  const renderedGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(item => {
        if (item.adminOnly && !isAdminUser) return false;
        // Items without a permKey are always visible (e.g. Dashboard)
        if (!item.permKey) return true;
        return hasPermission(item.permKey, 'view');
      }),
    }))
    .filter(group => group.items.length > 0); // hide empty groups

  return (
    <div className="flex h-full flex-col border-r border-gray-200 bg-white shadow-sm">
      {/* Brand Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-4">
        <div className="flex items-center gap-3">
          <WellserveLogo size={40} variant="dark" />
          <div className="leading-tight">
            <p className="m-0 text-[14px] font-extrabold tracking-[0.16em] text-gray-900">
              WELLSERVE
            </p>
            <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-600">
              Credit Cooperative
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 lg:hidden"
        >
          <X size={16} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {renderedGroups.map((group, groupIdx) => (
          <div key={group.label} className="animate-fade-in-up" style={{ animationDelay: `${groupIdx * 0.06}s` }}>
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">
              {group.label}
            </p>

            <ul className="space-y-1">
              {group.items.map((item, itemIdx) => (
                <li
                  key={item.to}
                  className="animate-slide-in-left"
                  style={{ animationDelay: `${(groupIdx * 0.06) + (itemIdx * 0.04)}s` }}
                >
                  <NavLink to={item.to} onClick={onClose} className="block">
                    {({ isActive }) => (
                      <div
                        className={[
                          'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm',
                          'transition-all duration-200',
                          isActive
                            ? 'font-semibold text-white shadow-sm translate-x-0.5'
                            : 'font-medium text-gray-600 hover:text-white hover:translate-x-0.5',
                        ].join(' ')}
                        style={isActive
                          ? { background: '#07A04E' }
                          : undefined
                        }
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#07A04E'; }}
                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = ''; }}
                      >
                        <span
                          className={[
                            'flex flex-shrink-0 transition-all duration-200',
                            isActive
                              ? 'text-white scale-110'
                              : 'text-gray-400 group-hover:text-white group-hover:scale-110',
                          ].join(' ')}
                        >
                          <item.icon size={16} strokeWidth={isActive ? 2.4 : 2} />
                        </span>

                        <span className="truncate">{item.label}</span>

                        {isActive && (
                          <span className="ml-auto h-5 w-1.5 rounded-full bg-white animate-scale-in" />
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

      {/* Footer */}
      <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
        <p className="text-center text-[10px] font-medium tracking-[0.06em] text-gray-400">
          WELLServe Coop Monitoring System
        </p>
      </div>
    </div>
  );
}