import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { ShieldAlert } from 'lucide-react';
import { getCurrentUser } from '@/server/auth';
import { extractRequestIp, isAccessEnforced } from '@/server/access';
import { resolveAccessDecision } from '@/server/access/decision';

export const metadata: Metadata = {
  title: 'Access blocked | BPP Workspace',
};

export default async function AccessBlockedPage() {
  const profile = await getCurrentUser();
  if (!profile) {
    redirect('/login');
  }

  // Don't strand anyone here: if enforcement is off, or the user is actually
  // allowed (owner/admin or on an approved IP/device), send them to the app.
  if (!isAccessEnforced()) {
    redirect('/');
  }
  const decision = await resolveAccessDecision(profile);
  if (!decision.wouldBlock) {
    redirect('/');
  }

  const ip = extractRequestIp(await headers());

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-destructive/20 bg-card p-8 text-center shadow-card">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
          <ShieldAlert className="h-7 w-7 text-destructive" />
        </div>
        <h1 className="mt-5 text-lg font-bold tracking-tight">
          Access blocked outside approved office/device.
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          This workspace can only be used from approved office premises or registered devices.
        </p>

        <div className="mt-6 space-y-1.5 rounded-xl border border-border/40 bg-muted/20 px-4 py-3 text-left text-xs">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground/60">Signed in as</span>
            <span className="truncate font-medium">{profile.email}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground/60">Detected IP</span>
            <span className="font-mono">{ip ?? 'unknown'}</span>
          </div>
        </div>

        <p className="mt-6 text-xs leading-relaxed text-muted-foreground/70">
          If you believe this is a mistake, contact your workspace owner or administrator to
          approve your office IP or this device.
        </p>
      </div>
    </main>
  );
}
