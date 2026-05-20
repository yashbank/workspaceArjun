'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FolderOpen, Trash2, Shield, Settings, Activity } from 'lucide-react';
import { BppMonogram } from './bpp-monogram';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard, match: (p: string) => p === '/' },
  { label: 'Files', href: '/files', icon: FolderOpen, match: (p: string) => p === '/files' || p.startsWith('/files/') },
  { label: 'Trash', href: '/trash', icon: Trash2, match: (p: string) => p === '/trash' },
];

const ADMIN_NAV = {
  label: 'Admin',
  href: '/admin',
  icon: Shield,
  match: (p: string) => p === '/admin' || (p.startsWith('/admin') && !p.startsWith('/admin/settings')),
};
const SETTINGS_NAV = {
  label: 'Settings',
  href: '/admin/settings',
  icon: Settings,
  match: (p: string) => p.startsWith('/admin/settings'),
};

const ACTIVITY_NAV = {
  label: 'Activity',
  href: '/activity',
  icon: Activity,
  match: (p: string) => p === '/activity',
};

export function Sidebar({
  showAdminNav = false,
  showSettingsNav = false,
  showActivityNav = false,
  onNavigate,
}: {
  showAdminNav?: boolean;
  showSettingsNav?: boolean;
  showActivityNav?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-border/50 bg-card/95 backdrop-blur-sm sm:w-[248px]">
      <div className="flex h-[3.75rem] items-center border-b border-border/40 px-5">
        <Link href="/" className="flex min-w-0 items-center gap-3 transition-opacity hover:opacity-90">
          <BppMonogram />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold leading-tight tracking-tight text-foreground">
              Bhaskar Paper
            </p>
            <p className="truncate text-[10px] font-medium text-muted-foreground/70">Products Workspace</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-5">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} {...item} active={item.match(pathname)} onNavigate={onNavigate} />
        ))}

        {showActivityNav && (
          <NavLink {...ACTIVITY_NAV} active={ACTIVITY_NAV.match(pathname)} onNavigate={onNavigate} />
        )}

        {showAdminNav && (
          <>
            <div className="my-4 border-t border-border/35" />
            <p className="bpp-label-caps mb-2 px-3">Administration</p>
            <NavLink {...ADMIN_NAV} active={ADMIN_NAV.match(pathname)} onNavigate={onNavigate} />
            {showSettingsNav && (
              <NavLink {...SETTINGS_NAV} active={SETTINGS_NAV.match(pathname)} onNavigate={onNavigate} />
            )}
          </>
        )}
      </nav>

      <div className="border-t border-border/35 px-4 py-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground/45">v0.1.0</p>
          <span className="flex items-center gap-1 text-[9px] text-muted-foreground/40">
            <kbd className="rounded-md border border-border/50 bg-muted/40 px-1.5 py-0.5 font-mono text-[8px]">?</kbd>
            shortcuts
          </span>
        </div>
      </div>
    </aside>
  );
}

function NavLink({
  label,
  href,
  icon: Icon,
  active = false,
  disabled = false,
  onNavigate,
}: {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  disabled?: boolean;
  match?: (p: string) => boolean;
  onNavigate?: () => void;
}) {
  const base =
    'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150';

  if (disabled) {
    return (
      <span className={`${base} cursor-not-allowed text-muted-foreground/35`} title="Coming soon">
        <Icon className="h-[18px] w-[18px]" />
        {label}
        <span className="ml-auto rounded-md bg-muted/50 px-1.5 py-0.5 text-[9px] font-semibold uppercase">
          Soon
        </span>
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      onClick={() => onNavigate?.()}
      className={`${base} active:scale-[0.98] ${
        active
          ? 'bg-accent font-semibold text-foreground shadow-card'
          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" aria-hidden />
      )}
      <Icon className={`h-[18px] w-[18px] ${active ? 'text-foreground' : 'text-muted-foreground/70'}`} />
      {label}
    </Link>
  );
}
