'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FolderOpen, Trash2, Shield, Settings } from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Files', href: '/files', icon: FolderOpen },
  { label: 'Trash', href: '/trash', icon: Trash2 },
];

const ADMIN_ITEMS = [
  { label: 'Admin', href: '/admin', icon: Shield },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
];

export function Sidebar({ showAdminNav = false }: { showAdminNav?: boolean }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 flex-col border-r border-border/40 bg-card">
      <div className="flex h-14 items-center border-b border-border/40 px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary shadow-card">
            <span className="text-sm font-bold text-primary-foreground">A</span>
          </div>
          <span className="text-[15px] font-bold tracking-tight">Arjun</span>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} {...item} active={pathname === item.href} />
        ))}

        {showAdminNav && (
          <>
            <div className="my-4 border-t border-border/30" />
            <p className="mb-2 px-3 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">
              Admin
            </p>
            {ADMIN_ITEMS.map((item) => (
              <NavLink
                key={item.href}
                {...item}
                active={item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)}
              />
            ))}
          </>
        )}
      </nav>

      <div className="border-t border-border/30 px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground/30">v0.1.0</p>
          <span className="flex items-center gap-1 text-[9px] text-muted-foreground/25">
            <kbd className="rounded border border-border/40 bg-muted/30 px-1 py-0.5 font-mono text-[8px]">?</kbd>
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
}: {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  disabled?: boolean;
}) {
  const base =
    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150';

  if (disabled) {
    return (
      <span className={`${base} cursor-not-allowed text-muted-foreground/30`} title="Coming soon">
        <Icon className="h-[18px] w-[18px]" />
        {label}
        <span className="ml-auto rounded-md bg-muted/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase">
          Soon
        </span>
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={`${base} active:scale-[0.98] ${
        active
          ? 'bg-primary/8 font-semibold text-foreground shadow-card'
          : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
      }`}
    >
      <Icon className={`h-[18px] w-[18px] ${active ? 'text-primary' : ''}`} />
      {label}
    </Link>
  );
}
