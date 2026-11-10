import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden lg:block"><Sidebar /></aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-navy-950/60" onClick={() => setMobileOpen(false)} aria-hidden />
          <div className="relative h-full w-64"><Sidebar onNavigate={() => setMobileOpen(false)} onClose={() => setMobileOpen(false)} /></div>
        </div>
      )}
      <div className="lg:pl-64">
        <Header onMenu={() => setMobileOpen(true)} />
        <main className="mx-auto max-w-7xl p-4 sm:p-6">
          <ErrorBoundary key={pathname}><Outlet /></ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
