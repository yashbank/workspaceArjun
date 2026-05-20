'use client';

import { useState } from 'react';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { BppAmbientBackground } from './bpp-ambient-background';

export function DashboardShell({
  showAdminNav,
  showSettingsNav,
  showActivityNav = false,
  userEmail,
  userName,
  userRole,
  children,
}: {
  showAdminNav: boolean;
  showSettingsNav: boolean;
  showActivityNav?: boolean;
  userEmail: string;
  userName?: string;
  userRole: string;
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="relative flex h-screen overflow-hidden bg-background bpp-subtle-bg">
      <BppAmbientBackground variant="dashboard" />
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-50 transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <Sidebar
          showAdminNav={showAdminNav}
          showSettingsNav={showSettingsNav}
          showActivityNav={showActivityNav}
          onNavigate={() => setMobileNavOpen(false)}
        />
      </div>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          userEmail={userEmail}
          userName={userName}
          userRole={userRole}
          onMenuClick={() => setMobileNavOpen(true)}
        />
        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          <div className="animate-in content-reveal duration-300">{children}</div>
        </main>
      </div>
    </div>
  );
}
