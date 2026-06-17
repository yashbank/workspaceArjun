'use client';

import { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';

/**
 * Lets a blocked member register the current device with their owner-issued
 * access code. On success it does a full reload so the dashboard layout
 * re-evaluates access with the freshly-set device cookie.
 */
export function DeviceEnrollForm() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/access/enroll-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Could not register this device');
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not register this device');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-2 text-left">
      <label className="block text-xs font-medium text-muted-foreground/70">
        Have an access code? Register this device
      </label>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABCD2345"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 font-mono text-sm tracking-[0.2em] outline-none transition-colors focus:border-primary/30 focus:ring-2 focus:ring-primary/15"
        />
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-card transition-shadow hover:shadow-elevated disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
          Register
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-[11px] leading-relaxed text-muted-foreground/60">
        Ask your workspace owner for your personal access code. Entering it here approves this device.
      </p>
    </form>
  );
}
