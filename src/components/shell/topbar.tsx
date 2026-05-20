'use client';

import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { LogOut, Sun, Moon, Monitor, Menu, User, ChevronDown } from 'lucide-react';
import { useTheme } from '@/components/providers/theme-provider';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { FixedMenu } from '@/components/ui/fixed-menu';
import { getUserDisplayName } from '@/lib/user-display';

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-amber-500/12 text-amber-800 ring-amber-500/20 dark:text-amber-300',
  admin: 'bg-sky-500/10 text-sky-800 ring-sky-500/15 dark:text-sky-300',
  member: 'bg-emerald-500/10 text-emerald-800 ring-emerald-500/15 dark:text-emerald-300',
  viewer: 'bg-muted text-muted-foreground ring-border/50',
};

export function Topbar({
  userEmail,
  userName,
  userRole,
  onMenuClick,
}: {
  userEmail: string;
  userName?: string;
  userRole: string;
  onMenuClick?: () => void;
}) {
  const { theme, setTheme } = useTheme();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLButtonElement>(null);

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  const displayName = getUserDisplayName({ email: userEmail, name: userName ?? null });

  return (
    <header className="glass flex h-[3.75rem] shrink-0 items-center justify-between gap-4 border-b border-border/40 px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            className="rounded-xl border border-border/40 bg-card/60 p-2 text-muted-foreground transition-all hover:bg-accent hover:text-foreground md:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-4 w-4" />
          </button>
        )}
        <p className="truncate text-[11px] font-medium text-muted-foreground/50 sm:text-xs">
          Premium asset workspace
        </p>
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <ThemeToggle theme={theme} setTheme={setTheme} />

        <div className="hidden h-5 w-px bg-border/40 sm:block" />

        <span
          className={`rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ring-1 ${ROLE_COLORS[userRole] ?? ROLE_COLORS.member}`}
        >
          {userRole}
        </span>

        <button
          ref={accountRef}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            setAccountOpen((v) => !v);
          }}
          className="flex max-w-[220px] min-w-0 items-center gap-2 rounded-xl border border-border/40 bg-card/60 px-2.5 py-1.5 text-left transition-all hover:bg-accent"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[10px] font-bold text-primary">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-[13px] font-semibold text-foreground" title={displayName}>
              {displayName}
            </p>
            <p className="truncate text-[10px] text-muted-foreground/55" title={userEmail}>
              {userEmail}
            </p>
          </div>
          <ChevronDown className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground/50 sm:block" />
        </button>

        <FixedMenu
          open={accountOpen}
          onClose={() => setAccountOpen(false)}
          anchorRef={accountRef}
          align="right"
          width={200}
        >
          <Link
            href="/account/name"
            role="menuitem"
            onClick={() => setAccountOpen(false)}
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition-all hover:bg-accent"
          >
            <User className="h-3.5 w-3.5" />
            Edit display name
          </Link>
          <div className="my-1 border-t border-border/30" />
          <button
            type="button"
            role="menuitem"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => {
              setAccountOpen(false);
              void handleSignOut();
            }}
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-muted-foreground transition-all hover:bg-accent hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </FixedMenu>
      </div>
    </header>
  );
}

function ThemeToggle({
  theme,
  setTheme,
}: {
  theme: string;
  setTheme: (t: 'light' | 'dark' | 'system') => void;
}) {
  const [open, setOpen] = useState(false);
  const themeBtnRef = useRef<HTMLButtonElement>(null);
  const options = [
    { value: 'light' as const, icon: Sun, label: 'Light' },
    { value: 'dark' as const, icon: Moon, label: 'Dark' },
    { value: 'system' as const, icon: Monitor, label: 'System' },
  ];
  const current = options.find((o) => o.value === theme) ?? options[2];
  const Icon = current.icon;

  return (
    <>
      <button
        ref={themeBtnRef}
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        className="flex items-center rounded-xl border border-border/40 bg-card/60 p-2 text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-95"
        title={`Theme: ${current.label}`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Icon className="h-4 w-4" />
      </button>
      <FixedMenu open={open} onClose={() => setOpen(false)} anchorRef={themeBtnRef} align="right" width={144}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="menuitem"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => {
              setTheme(opt.value);
              setOpen(false);
            }}
            className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-all ${theme === opt.value ? 'bg-accent font-semibold text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}`}
          >
            <opt.icon className="h-3.5 w-3.5" />
            {opt.label}
          </button>
        ))}
      </FixedMenu>
    </>
  );
}
