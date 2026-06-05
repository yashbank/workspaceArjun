'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { AlertCircle, Loader2, Lock } from 'lucide-react';
import { AuthCard } from '@/components/auth/auth-card';
import { PasswordChecklist } from '@/components/auth/password-checklist';
import { validatePassword, isPasswordValid } from '@/lib/password-policy';

type InviteStatus =
  | { status: 'loading' }
  | { status: 'ready'; email: string; role: string }
  | { status: 'no_session'; message: string }
  | { status: 'already_complete'; message: string }
  | { status: 'error'; message: string };

const EXPIRED_MESSAGE =
  'This invite link is invalid or has expired. Ask your administrator to resend the invite.';

const inputClass =
  'w-full rounded-xl border border-border/50 bg-background px-3.5 py-2.5 text-sm outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/15';

function InviteAcceptContent() {
  const searchParams = useSearchParams();
  const [inviteStatus, setInviteStatus] = useState<InviteStatus>({ status: 'loading' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function init() {
      if (searchParams.get('error') === 'expired') {
        setInviteStatus({ status: 'no_session', message: EXPIRED_MESSAGE });
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.user?.email) {
        setInviteStatus({
          status: 'no_session',
          message: EXPIRED_MESSAGE,
        });
        return;
      }

      const res = await fetch('/api/auth/invite-status', { credentials: 'include' });
      const data = (await res.json()) as {
        status: string;
        message?: string;
        email?: string;
        role?: string;
      };

      if (data.status === 'ready' && data.email) {
        setInviteStatus({ status: 'ready', email: data.email, role: data.role ?? 'member' });
        return;
      }
      if (data.status === 'already_complete') {
        setInviteStatus({
          status: 'already_complete',
          message: data.message ?? 'Your account is already set up.',
        });
        return;
      }
      if (data.status === 'no_session') {
        setInviteStatus({
          status: 'no_session',
          message: data.message ?? EXPIRED_MESSAGE,
        });
        return;
      }
      setInviteStatus({
        status: 'error',
        message: data.message ?? 'Unable to verify your invite.',
      });
    }

    void init();
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const pw = validatePassword(password);
    if (!pw.ok) {
      setError(`Password must include: ${pw.errors.join(', ').toLowerCase()}.`);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError(EXPIRED_MESSAGE);
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      const completeRes = await fetch('/api/auth/complete-invite', {
        method: 'POST',
        credentials: 'include',
      });
      const completeData = (await completeRes.json()) as {
        error?: string;
        profile?: { name?: string | null };
      };

      if (!completeRes.ok) {
        setError(completeData.error ?? 'Failed to finish account setup.');
        return;
      }

      const needsName = !completeData.profile?.name?.trim();
      window.location.href = needsName ? '/account/name' : '/';
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (inviteStatus.status === 'loading') {
    return (
      <AuthCard title="Verifying invite" subtitle="Please wait…">
        <div className="flex justify-center py-6">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/40" />
        </div>
      </AuthCard>
    );
  }

  if (inviteStatus.status === 'no_session' || inviteStatus.status === 'error') {
    return (
      <AuthCard title="Invite unavailable" subtitle={inviteStatus.message}>
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <Link
            href="/login"
            className="inline-flex rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-card"
          >
            Go to sign in
          </Link>
        </div>
      </AuthCard>
    );
  }

  if (inviteStatus.status === 'already_complete') {
    return (
      <AuthCard title="Already set up" subtitle={inviteStatus.message}>
        <div className="flex justify-center py-2">
          <Link
            href="/login"
            className="inline-flex rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-card"
          >
            Sign in
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Set your password"
      subtitle={`Welcome — create a password for ${inviteStatus.email}`}
      footer={`Role: ${inviteStatus.role}`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="password" className="bpp-label-caps mb-1.5 block">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
          <div className="mt-2.5">
            <PasswordChecklist password={password} />
          </div>
        </div>

        <div>
          <label htmlFor="confirm" className="bpp-label-caps mb-1.5 block">
            Confirm password
          </label>
          <input
            id="confirm"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
          />
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/15 bg-destructive/4 px-3.5 py-2.5 text-xs text-destructive">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !isPasswordValid(password) || password !== confirm}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-card transition-all hover:shadow-elevated disabled:opacity-50 active:scale-[0.98]"
        >
          {submitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Lock className="h-3.5 w-3.5" />
          )}
          {submitting ? 'Saving…' : 'Create account & continue'}
        </button>
      </form>
    </AuthCard>
  );
}

export default function InviteAcceptPage() {
  return (
    <Suspense
      fallback={
        <AuthCard title="Verifying invite" subtitle="Please wait…">
          <div className="flex justify-center py-6">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/40" />
          </div>
        </AuthCard>
      }
    >
      <InviteAcceptContent />
    </Suspense>
  );
}
