'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useSearchParams } from 'next/navigation';
import { checkBootstrapNeeded, bootstrapFirstUser } from './actions';
import { Loader2 } from 'lucide-react';
import { AuthCard } from '@/components/auth/auth-card';

const inputClass =
  'w-full rounded-xl border border-border/50 bg-background px-3.5 py-2.5 text-sm outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/15';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bootstrapMode, setBootstrapMode] = useState(false);
  const [bootstrapDone, setBootstrapDone] = useState(false);
  const searchParams = useSearchParams();

  const callbackError = searchParams.get('error');
  const resetSuccess = searchParams.get('reset') === 'success';
  const next = searchParams.get('next') ?? '/';

  useEffect(() => {
    checkBootstrapNeeded().then(setBootstrapMode);
  }, []);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError('Invalid email or password.');
      setLoading(false);
      return;
    }

    window.location.href = next;
  }

  async function handleBootstrap(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await bootstrapFirstUser(email, password);
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setBootstrapDone(true);
    setBootstrapMode(false);
    setLoading(false);
    setError(null);
  }

  return (
    <AuthCard
      title="Bhaskar Paper Products"
      subtitle={
        bootstrapMode
          ? 'Create your admin account to get started'
          : 'Sign in to your secure workspace'
      }
      footer="Bhaskar Paper Products · Internal file workspace"
    >
      {callbackError && (
        <div className="mb-4 rounded-xl border border-destructive/15 bg-destructive/4 px-3.5 py-2.5 text-xs text-destructive">
          Authentication failed. Please try again.
        </div>
      )}

      {resetSuccess && (
        <div className="mb-4 rounded-xl border border-emerald-500/15 bg-emerald-500/4 px-3.5 py-2.5 text-xs text-emerald-700 dark:text-emerald-400">
          Password updated. Sign in with your new password.
        </div>
      )}

      {bootstrapDone && (
        <div className="mb-4 rounded-xl border border-emerald-500/15 bg-emerald-500/4 px-3.5 py-2.5 text-xs text-emerald-700 dark:text-emerald-400">
          Admin account created. Sign in below.
        </div>
      )}

      <form onSubmit={bootstrapMode ? handleBootstrap : handleSignIn} className="space-y-4">
        <div>
          <label htmlFor="email" className="bpp-label-caps mb-1.5 block">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="you@company.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="bpp-label-caps mb-1.5 block">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete={bootstrapMode ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-card transition-all hover:shadow-elevated disabled:opacity-50 active:scale-[0.98]"
        >
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {loading
            ? bootstrapMode
              ? 'Creating account…'
              : 'Signing in…'
            : bootstrapMode
              ? 'Create admin account'
              : 'Sign in'}
        </button>
      </form>

      {!bootstrapMode && (
        <p className="mt-4 text-center text-[11px] text-muted-foreground/50">
          <a href="/forgot-password" className="transition-colors hover:text-foreground">
            Forgot password?
          </a>
        </p>
      )}

      {bootstrapMode && (
        <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground/50">
          This creates the first Owner account. Remove{' '}
          <code className="rounded-md border border-border/40 bg-muted/30 px-1 py-0.5 text-[10px]">
            ALLOW_BOOTSTRAP=true
          </code>{' '}
          from your env after setup.
        </p>
      )}
    </AuthCard>
  );
}
