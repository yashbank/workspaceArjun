'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, User } from 'lucide-react';
import { AuthCard } from '@/components/auth/auth-card';
import { apiFetch } from '@/lib/api';

export default function SetDisplayNamePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      router.replace('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save display name');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-8">
      <AuthCard
        title="Set your display name"
        subtitle="This is how you appear in activity, comments, and the team directory."
      >
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
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sarthak"
                className="w-full rounded-xl border border-border/50 bg-background py-2.5 pl-10 pr-3.5 text-sm outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/15"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/15 bg-destructive/4 px-3.5 py-2.5 text-xs text-destructive">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || name.trim().length < 2}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-card disabled:opacity-50"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {loading ? 'Saving…' : 'Continue to workspace'}
          </button>
        </form>
      </AuthCard>
    </div>
  );
}
