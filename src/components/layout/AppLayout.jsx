import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useState, useEffect, useRef } from 'react';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024);
  const location = useLocation();
  const mainRef = useRef(null);

  // Auto-open on desktop, auto-close on mobile when resizing across the lg breakpoint
  useEffect(() => {
    let wasDesktop = window.innerWidth >= 1024;
    const handleResize = () => {
      const isDesktop = window.innerWidth >= 1024;
      if (isDesktop !== wasDesktop) {
        setSidebarOpen(isDesktop);
        wasDesktop = isDesktop;
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.style.animation = 'none';
      void mainRef.current.offsetHeight;
      mainRef.current.style.animation = '';
    }
  }, [location.pathname]);

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Mobile/tablet overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Desktop sidebar — collapses by shrinking width, nav clicks do NOT close it */}
      <div
        className="hidden lg:block flex-shrink-0 overflow-hidden transition-all duration-300 ease-out"
        style={{ width: sidebarOpen ? 256 : 0 }}
      >
        <aside className="h-full w-64 bg-white border-r border-gray-100">
          <Sidebar onClose={() => {}} />
        </aside>
      </div>

      {/* Mobile/tablet sidebar — fixed overlay, nav clicks close it */}
      <aside className={`lg:hidden fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-100
        transform transition-transform duration-300 ease-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar onMenuClick={() => setSidebarOpen(prev => !prev)} isSidebarOpen={sidebarOpen} />
        <main ref={mainRef} className="flex-1 overflow-y-auto animate-fade-in-up">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
