'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Loader2, User } from 'lucide-react';
import { AuthCard } from '@/components/auth/auth-card';
import { apiFetch } from '@/lib/api';
import { DISPLAY_NAME_DUPLICATE_WARNING } from '@/lib/display-name';

export default function SetDisplayNamePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [hasDuplicateName, setHasDuplicateName] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void apiFetch<{ name: string | null; hasDuplicateName?: boolean }>('/api/profile')
      .then((data) => {
        if (cancelled) return;
        if (data.name?.trim()) setName(data.name.trim());
        setHasDuplicateName(Boolean(data.hasDuplicateName));
      })
      .catch(() => {
        if (!cancelled) setError('Could not load your profile');
      })
      .finally(() => {
        if (!cancelled) setBootLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setLoading(true);
    try {
      await apiFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      setHasDuplicateName(false);
      setSaved(true);
      setTimeout(() => {
        router.replace('/');
        router.refresh();
      }, 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save display name');
    } finally {
      setLoading(false);
    }
  }

  if (bootLoading) {
    return (
      <div className="mx-auto flex max-w-md justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/40" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-8">
      <AuthCard
        title="Set your display name"
        subtitle="This is how you appear in activity, the team directory, and file history. Choose something unique your team will recognize."
      >
        {hasDuplicateName && (
          <div className="mb-4 flex gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3.5 py-3 text-xs text-amber-900 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p>{DISPLAY_NAME_DUPLICATE_WARNING}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="displayName" className="bpp-label-caps mb-1.5 block">
              Display name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/40" />
              <input
                id="displayName"
                type="text"
                required
                minLength={2}
                maxLength={64}
                autoFocus
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setSaved(false);
                }}
                placeholder="e.g. Sarthak"
                className="w-full rounded-xl border border-border/50 bg-background py-2.5 pl-10 pr-3.5 text-sm outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground/55">
              2–64 characters · unique (case-insensitive)
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/15 bg-destructive/4 px-3.5 py-2.5 text-xs text-destructive">
              {error}
            </div>
          )}

          {saved && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-3.5 py-2.5 text-xs text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Display name saved — opening workspace…
            </div>
          )}

          <button
            type="submit"
            disabled={loading || saved || name.trim().length < 2}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-card disabled:opacity-50"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {loading ? 'Saving…' : saved ? 'Saved' : 'Continue to workspace'}
          </button>
        </form>
      </AuthCard>
    </div>
  );
}
