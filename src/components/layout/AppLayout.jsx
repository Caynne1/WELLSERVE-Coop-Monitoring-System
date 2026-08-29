import { Outlet, useLocation } from 'react-router-dom';
import Topbar from './Topbar';
import TopNav from './TopNav';
import { useEffect, useRef, useState } from 'react';

export default function AppLayout() {
  const location = useLocation();
  const mainRef = useRef(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.style.animation = 'none';
      void mainRef.current.offsetHeight;
      mainRef.current.style.animation = '';
    }
  }, [location.pathname]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-screen h-[100dvh] flex-col overflow-hidden bg-gray-50">
      {/* Sticky header + horizontal top navigation (replaces the old sidebar) */}
      <Topbar onMenuClick={() => setMobileNavOpen(true)} />
      <TopNav mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />

      {/* Main content */}
      <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden animate-fade-in-up">
        <Outlet />
      </main>
    </div>
  );
}
