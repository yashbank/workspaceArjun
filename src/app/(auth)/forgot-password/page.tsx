'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { getClientRecoveryAuthCallbackUrl } from '@/lib/app-url-client';
import { Loader2, Mail } from 'lucide-react';
import { AuthCard } from '@/components/auth/auth-card';

const inputClass =
  'w-full rounded-xl border border-border/50 bg-background px-3.5 py-2.5 text-sm outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/15';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createSupabaseBrowserClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getClientRecoveryAuthCallbackUrl(),
    });

    setSent(true);
    setLoading(false);
  }

  return (
    <AuthCard
      title="Reset password"
      subtitle="Enter your email and we&apos;ll send a secure reset link."
      footer={
        <a href="/login" className="transition-colors hover:text-foreground">
          Back to sign in
        </a>
      }
    >
      {sent ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10">
            <Mail className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <p className="text-sm font-semibold">Check your inbox</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground/60">
              If an account exists for <strong className="text-foreground/70">{email}</strong>, a reset
              link has been sent.
            </p>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="bpp-label-caps mb-1.5 block">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="you@company.com"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-card transition-all hover:shadow-elevated disabled:opacity-50 active:scale-[0.98]"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
    </AuthCard>
  );
}
