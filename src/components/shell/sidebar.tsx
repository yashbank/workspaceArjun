'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FolderOpen, Trash2, Shield, Settings, Activity, Lock } from 'lucide-react';
import { BppMonogram } from './bpp-monogram';

type DockNav = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  match: (p: string) => boolean;
};

const NAV_ITEMS: DockNav[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard, color: 'from-indigo-500 to-violet-500', match: (p) => p === '/' },
  { label: 'Files', href: '/files', icon: FolderOpen, color: 'from-blue-500 to-sky-500', match: (p) => p === '/files' || p.startsWith('/files/') },
  { label: 'Trash', href: '/trash', icon: Trash2, color: 'from-rose-500 to-red-500', match: (p) => p === '/trash' },
];

const ACTIVITY_NAV: DockNav = {
  label: 'Activity',
  href: '/activity',
  icon: Activity,
  color: 'from-emerald-500 to-teal-500',
  match: (p) => p === '/activity',
};
const ADMIN_NAV: DockNav = {
  label: 'Admin',
  href: '/admin',
  icon: Shield,
  color: 'from-violet-500 to-fuchsia-500',
  match: (p) =>
    p === '/admin' ||
    (p.startsWith('/admin') && !p.startsWith('/admin/settings') && !p.startsWith('/admin/security')),
};
const SECURITY_NAV: DockNav = {
  label: 'Security',
  href: '/admin/security',
  icon: Lock,
  color: 'from-amber-500 to-orange-500',
  match: (p) => p.startsWith('/admin/security'),
};
const SETTINGS_NAV: DockNav = {
  label: 'Settings',
  href: '/admin/settings',
  icon: Settings,
  color: 'from-slate-500 to-zinc-500',
  match: (p) => p.startsWith('/admin/settings'),
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
    <aside className="flex h-full w-64 shrink-0 flex-col gap-1.5 border-r border-border/50 bg-card/80 px-3 py-4 backdrop-blur-xl md:w-[78px] md:items-center">
      {/* Brand */}
      <Link
        href="/"
        onClick={() => onNavigate?.()}
        className="mb-2 flex items-center gap-3 rounded-2xl transition-opacity hover:opacity-90 md:mb-3 md:justify-center"
      >
        <BppMonogram />
        <div className="min-w-0 md:hidden">
          <p className="truncate text-[13px] font-semibold leading-tight tracking-tight text-foreground">
            Bhaskar Paper
          </p>
          <p className="truncate text-[10px] font-medium text-muted-foreground/70">Products Workspace</p>
        </div>
      </Link>

      <nav className="flex flex-1 flex-col gap-1.5 md:items-center">
        {NAV_ITEMS.map((item) => (
          <DockItem key={item.href} {...item} active={item.match(pathname)} onNavigate={onNavigate} />
        ))}

        {showActivityNav && (
          <DockItem {...ACTIVITY_NAV} active={ACTIVITY_NAV.match(pathname)} onNavigate={onNavigate} />
        )}

        {showAdminNav && (
          <>
            <div className="my-1.5 h-px w-full bg-border/40 md:w-8" />
            <DockItem {...ADMIN_NAV} active={ADMIN_NAV.match(pathname)} onNavigate={onNavigate} />
            <DockItem {...SECURITY_NAV} active={SECURITY_NAV.match(pathname)} onNavigate={onNavigate} />
            {showSettingsNav && (
              <DockItem {...SETTINGS_NAV} active={SETTINGS_NAV.match(pathname)} onNavigate={onNavigate} />
            )}
          </>
        )}
      </nav>

      <div className="flex items-center justify-center gap-1 pt-1 text-[9px] text-muted-foreground/40">
        <kbd className="rounded-md border border-border/50 bg-muted/40 px-1.5 py-0.5 font-mono text-[8px]">?</kbd>
        <span className="md:hidden">shortcuts</span>
      </div>
    </aside>
  );
}

function DockItem({
  label,
  href,
  icon: Icon,
  color,
  active = false,
  onNavigate,
}: DockNav & { active?: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      onClick={() => onNavigate?.()}
      className="group relative flex items-center gap-3 rounded-2xl transition-all md:justify-center"
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 transition-all duration-200 group-hover:scale-110 group-active:scale-95 ${
          active
            ? `bg-gradient-to-br ${color} text-white shadow-card ring-white/25`
            : 'bg-card/70 text-muted-foreground/80 ring-border/40 group-hover:text-foreground group-hover:ring-border/70'
        }`}
      >
        <Icon className="h-5 w-5" />
      </span>

      {/* Inline label (mobile drawer only) */}
      <span
        className={`text-[13px] md:hidden ${active ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'}`}
      >
        {label}
      </span>

      {/* Hover tooltip (desktop dock only) */}
      <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-border/50 bg-popover px-2.5 py-1 text-xs font-medium text-foreground shadow-float md:group-hover:block">
        {label}
      </span>
    </Link>
  );
}
