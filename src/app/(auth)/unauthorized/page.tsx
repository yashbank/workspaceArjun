'use client';

import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { ShieldX } from 'lucide-react';

export default function UnauthorizedPage() {
  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-border/50 bg-card shadow-float">
      <div className="px-8 pt-8 pb-2 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10">
          <ShieldX className="h-5 w-5 text-destructive" />
        </div>
        <h1 className="text-xl font-bold tracking-tight">Access Denied</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground/60">
          Your account has been deactivated or you do not have permission to access this workspace. Please contact your administrator.
        </p>
      </div>

      <div className="p-8">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-card transition-all hover:shadow-elevated active:scale-[0.98]"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
