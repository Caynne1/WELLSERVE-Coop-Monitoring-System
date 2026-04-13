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
      { to: '/coop-monitoring', icon: LayoutDashboard, label: 'Account Monitoring' },
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
        {renderedGroups.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">
              {group.label}
            </p>

            <ul className="space-y-1">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} onClick={onClose} className="block">
                    {({ isActive }) => (
                      <div
                        className={[
                          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-150',
                          isActive
                            ? 'bg-emerald-50 font-semibold text-emerald-700 shadow-sm'
                            : 'font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'flex flex-shrink-0',
                            isActive ? 'text-emerald-600' : 'text-gray-400',
                          ].join(' ')}
                        >
                          <item.icon size={16} strokeWidth={isActive ? 2.4 : 2} />
                        </span>

                        <span className="truncate">{item.label}</span>

                        {isActive && (
                          <span className="ml-auto h-5 w-1.5 rounded-full bg-emerald-600" />
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
          WELLSERVE Coop Monitoring v2.0
        </p>
      </div>
    </div>
  );
}