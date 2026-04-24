import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useState, useEffect } from 'react';

const PAGE_TITLES = {
  '/dashboard':          'Dashboard',
  '/members':            'Members',
  '/members/new':        'New Member',
  '/passbook':           'Passbook',
  '/loans':              'Loans',
  '/loans/new':          'New Loan',
  '/cbu':                'CBU',
  '/savings':            'Savings',
  '/transactions':       'Transactions',
  '/checkbook':          'Checkbook',
  '/invoices':           'Invoices',
  '/vouchers':           'Vouchers',
  '/expenses':           'Expenses',
  '/coop-monitoring':    'Account Monitoring',
  '/reports':            'Reports',
  '/logs':               'Activity Logs',
  '/settings':           'Settings',
  '/account-management': 'Account Management',
  '/user-management':    'User Management',
};

function getPageTitle(pathname) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length >= 2) {
    const last = segments[segments.length - 1];
    const base = PAGE_TITLES['/' + segments[0]];
    if (last === 'edit') return base ? `Edit ${base.replace(/s$/, '')}` : 'Edit';
    return base ? `${base} Detail` : 'Detail';
  }
  return 'WELLServe';
}

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024);
  const location = useLocation();

  // Auto-close on mobile when navigating
  useEffect(() => {
    if (window.innerWidth < 1024) setSidebarOpen(false);
  }, [location.pathname]);

  const pageTitle = getPageTitle(location.pathname);

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#F0F1F3', overflow: 'hidden' }}>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.42)',
            zIndex: 29,
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
          }}
          className="ws-mobile-backdrop"
        />
      )}

      {/* Sidebar — pushes content on desktop, overlays on mobile */}
      <aside
        style={{
          width: sidebarOpen ? '248px' : '0px',
          minWidth: sidebarOpen ? '248px' : '0px',
          transition: 'width 0.27s cubic-bezier(0.4,0,0.2,1), min-width 0.27s cubic-bezier(0.4,0,0.2,1)',
          overflow: 'hidden',
          flexShrink: 0,
          position: 'relative',
          zIndex: 30,
        }}
        className="ws-sidebar-aside"
      >
        {/* Inner wrapper keeps content at 248px while outer animates */}
        <div style={{ width: '248px', height: '100%' }}>
          <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        </div>
      </aside>

      {/* Main column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <Topbar
          onMenuClick={() => setSidebarOpen(p => !p)}
          isSidebarOpen={sidebarOpen}
          pageTitle={pageTitle}
        />
        <main style={{ flex: 1, overflowY: 'auto' }}>
          <Outlet />
        </main>
      </div>

      <style>{`
        /* On mobile, sidebar is fixed/overlay instead of pushing */
        @media (max-width: 1023px) {
          .ws-sidebar-aside {
            position: fixed !important;
            top: 0; left: 0; bottom: 0;
            z-index: 30;
          }
          .ws-mobile-backdrop { display: block; }
        }
        @media (min-width: 1024px) {
          .ws-mobile-backdrop { display: none !important; }
        }
      `}</style>
    </div>
  );
}