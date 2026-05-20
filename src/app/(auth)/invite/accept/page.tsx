'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { AlertCircle, Loader2, Lock } from 'lucide-react';

type InviteStatus =
  | { status: 'loading' }
  | { status: 'ready'; email: string; role: string }
  | { status: 'no_session'; message: string }
  | { status: 'already_complete'; message: string }
  | { status: 'error'; message: string };

export default function InviteAcceptPage() {
  const [inviteStatus, setInviteStatus] = useState<InviteStatus>({ status: 'loading' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function init() {
      const supabase = createSupabaseBrowserClient();

      // Handle hash tokens from some Supabase invite links (implicit flow).
      if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
        const { error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          setInviteStatus({
            status: 'no_session',
            message: 'This invite link is invalid or has expired.',
          });
          return;
        }
        window.history.replaceState(null, '', window.location.pathname);
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
          message:
            data.message ??
            'This invite link is invalid or has expired. Ask your administrator to resend the invite.',
        });
        return;
      }
      setInviteStatus({
        status: 'error',
        message: data.message ?? 'Unable to verify your invite.',
      });
    }

    void init();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      const completeRes = await fetch('/api/auth/complete-invite', {
        method: 'POST',
        credentials: 'include',
      });
      const completeData = (await completeRes.json()) as { error?: string };

      if (!completeRes.ok) {
        setError(completeData.error ?? 'Failed to finish account setup.');
        return;
      }

      window.location.href = '/';
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (inviteStatus.status === 'loading') {
    return (
      <div className="flex w-full max-w-sm flex-col items-center justify-center rounded-2xl border border-border/50 bg-card p-12 shadow-float">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/40" />
        <p className="mt-4 text-sm text-muted-foreground">Verifying your invite…</p>
      </div>
    );
  }

  if (inviteStatus.status === 'no_session' || inviteStatus.status === 'error') {
    return (
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-border/50 bg-card shadow-float">
        <div className="p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <h1 className="mt-4 text-lg font-bold tracking-tight">Invite unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground/70">{inviteStatus.message}</p>
          <Link
            href="/login"
            className="mt-6 inline-flex rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-card"
          >
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  if (inviteStatus.status === 'already_complete') {
    return (
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-border/50 bg-card shadow-float">
        <div className="p-8 text-center">
          <h1 className="text-lg font-bold tracking-tight">Already set up</h1>
          <p className="mt-2 text-sm text-muted-foreground/70">{inviteStatus.message}</p>
          <Link
            href="/login"
            className="mt-6 inline-flex rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-card"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-border/50 bg-card shadow-float">
      <div className="border-b border-border/30 px-8 pt-8 pb-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary shadow-card">
          <Lock className="h-5 w-5 text-primary-foreground" />
        </div>
        <h1 className="text-xl font-bold tracking-tight">Set your password</h1>
        <p className="mt-1 text-[13px] text-muted-foreground/60">
          Welcome — create a password for{' '}
          <span className="font-medium text-foreground">{inviteStatus.email}</span>
        </p>
        <p className="mt-2 text-[11px] capitalize text-muted-foreground/45">
          Role: {inviteStatus.role}
        </p>
      </div>

      <div className="p-8">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-medium">
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
              className="w-full rounded-xl border border-border/50 bg-background px-3.5 py-2.5 text-sm outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/15"
            />
          </div>

          <div>
            <label htmlFor="confirm" className="mb-1.5 block text-xs font-medium">
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
              className="w-full rounded-xl border border-border/50 bg-background px-3.5 py-2.5 text-sm outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/15"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/15 bg-destructive/4 px-3.5 py-2.5 text-xs text-destructive">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-card transition-all hover:shadow-elevated disabled:opacity-50 active:scale-[0.98]"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {submitting ? 'Saving…' : 'Create account & continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
