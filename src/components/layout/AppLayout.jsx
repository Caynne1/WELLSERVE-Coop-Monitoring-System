import { Outlet, useLocation } from 'react-router-dom';
import Topbar from './Topbar';
import TopNav from './TopNav';
import { useEffect, useRef } from 'react';

export default function AppLayout() {
  const location = useLocation();
  const mainRef = useRef(null);

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.style.animation = 'none';
      void mainRef.current.offsetHeight;
      mainRef.current.style.animation = '';
    }
  }, [location.pathname]);

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      {/* Sticky header + horizontal top navigation (replaces the old sidebar) */}
      <Topbar />
      <TopNav />

      {/* Main content */}
      <main ref={mainRef} className="flex-1 overflow-y-auto animate-fade-in-up">
        <Outlet />
      </main>
    </div>
  );
}