'use client';

import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { LogOut, Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '@/components/providers/theme-provider';
import { useState } from 'react';

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
}: {
  userEmail: string;
  userName?: string;
  userRole: string;
}) {
  const { theme, setTheme } = useTheme();

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  const displayName = userName ?? userEmail;

  return (
    <header className="glass flex h-[3.75rem] shrink-0 items-center justify-between gap-4 border-b border-border/40 px-4 sm:px-6">
      <p className="hidden text-[11px] font-medium text-muted-foreground/50 sm:block">
        Premium asset workspace
      </p>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <ThemeToggle theme={theme} setTheme={setTheme} />

        <div className="hidden h-5 w-px bg-border/40 sm:block" />

        <span
          className={`rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ring-1 ${ROLE_COLORS[userRole] ?? ROLE_COLORS.member}`}
        >
          {userRole}
        </span>

        <div className="hidden max-w-[200px] min-w-0 md:block">
          <p className="truncate text-[13px] font-medium text-foreground" title={displayName}>
            {displayName}
          </p>
          {userName && (
            <p className="truncate text-[10px] text-muted-foreground/55" title={userEmail}>
              {userEmail}
            </p>
          )}
        </div>

        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 rounded-xl border border-transparent px-3 py-2 text-xs font-medium text-muted-foreground transition-all hover:border-border/50 hover:bg-accent hover:text-foreground active:scale-[0.97]"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
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
  const options = [
    { value: 'light' as const, icon: Sun, label: 'Light' },
    { value: 'dark' as const, icon: Moon, label: 'Dark' },
    { value: 'system' as const, icon: Monitor, label: 'System' },
  ];
  const current = options.find((o) => o.value === theme) ?? options[2];
  const Icon = current.icon;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center rounded-xl border border-border/40 bg-card/60 p-2 text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-95"
        title={`Theme: ${current.label}`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Icon className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="menu"
            className="absolute right-0 top-11 z-20 w-36 overflow-hidden rounded-xl border border-border/50 bg-popover p-1 shadow-float animate-in scale-in fade-in duration-100"
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                role="menuitem"
                onClick={() => {
                  setTheme(opt.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-all ${theme === opt.value ? 'bg-accent font-semibold text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}`}
              >
                <opt.icon className="h-3.5 w-3.5" />
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
