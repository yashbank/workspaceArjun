'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { AlertCircle, Loader2 } from 'lucide-react';

const EXPIRED_MESSAGE =
  'This password reset link is invalid or has expired. Request a new link from the sign-in page.';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const [sessionReady, setSessionReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function checkSession() {
      if (searchParams.get('error') === 'expired') {
        setSessionReady(false);
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      setSessionReady(!sessionError && !!session);
    }

    void checkSession();
  }, [searchParams]);

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

    setLoading(true);
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

      window.location.href = '/login?reset=success';
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (sessionReady === null) {
    return (
      <div className="flex w-full max-w-sm flex-col items-center justify-center rounded-2xl border border-border/50 bg-card p-12 shadow-float">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/40" />
        <p className="mt-4 text-sm text-muted-foreground">Verifying reset link…</p>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-border/50 bg-card shadow-float">
        <div className="p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <h1 className="mt-4 text-lg font-bold tracking-tight">Reset link unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground/70">{EXPIRED_MESSAGE}</p>
          <Link
            href="/forgot-password"
            className="mt-6 inline-flex rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-card"
          >
            Request new link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-border/50 bg-card shadow-float">
      <div className="border-b border-border/30 px-8 pt-8 pb-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary shadow-card">
          <span className="text-lg font-bold text-primary-foreground">A</span>
        </div>
        <h1 className="text-xl font-bold tracking-tight">Set new password</h1>
        <p className="mt-1 text-[13px] text-muted-foreground/60">
          Choose a strong password for your account.
        </p>
      </div>

      <div className="p-8">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-medium">
              New password
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
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-card transition-all hover:shadow-elevated disabled:opacity-50 active:scale-[0.98]"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {loading ? 'Saving…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex w-full max-w-sm flex-col items-center justify-center rounded-2xl border border-border/50 bg-card p-12 shadow-float">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/40" />
          <p className="mt-4 text-sm text-muted-foreground">Verifying reset link…</p>
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
