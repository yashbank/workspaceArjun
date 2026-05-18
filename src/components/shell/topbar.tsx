'use client';

import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { LogOut, Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '@/components/providers/theme-provider';
import { useState } from 'react';

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  admin: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  member: 'bg-green-500/10 text-green-700 dark:text-green-400',
  viewer: 'bg-gray-500/10 text-gray-700 dark:text-gray-400',
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

  return (
    <header className="glass flex h-14 items-center justify-between border-b border-border/30 px-6">
      <div />
      <div className="flex items-center gap-3">
        <ThemeToggle theme={theme} setTheme={setTheme} />
        <div className="h-4 w-px bg-border/30" />
        <span
          className={`rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${ROLE_COLORS[userRole] ?? ROLE_COLORS.member}`}
        >
          {userRole}
        </span>
        <span className="text-[13px] font-medium text-muted-foreground">{userName ?? userEmail}</span>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground/60 transition-all hover:bg-accent hover:text-foreground active:scale-[0.97]"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
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
        className="flex items-center rounded-lg p-2 text-muted-foreground/50 transition-all hover:bg-accent hover:text-foreground active:scale-95"
        title={`Theme: ${current.label}`}
      >
        <Icon className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-20 w-36 overflow-hidden rounded-xl border border-border/50 bg-popover p-1 shadow-float animate-in scale-in fade-in duration-100">
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setTheme(opt.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-all ${theme === opt.value ? 'bg-accent font-semibold text-foreground' : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'}`}
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
