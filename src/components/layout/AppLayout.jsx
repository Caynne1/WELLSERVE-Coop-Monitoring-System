import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useState, useEffect, useRef } from 'react';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const mainRef = useRef(null);

  // Re-trigger page entrance animation on route change
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.style.animation = 'none';
      // Force reflow
      void mainRef.current.offsetHeight;
      mainRef.current.style.animation = '';
    }
  }, [location.pathname]);

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-100
        transform transition-transform duration-300 ease-out lg:static lg:translate-x-0
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
