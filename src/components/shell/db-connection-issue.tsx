'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';

export function DbConnectionIssue() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10">
          <AlertCircle className="h-7 w-7 text-amber-600" />
        </div>
        <h1 className="mt-5 text-lg font-semibold tracking-tight">
          Database connection issue
        </h1>
        <p className="mt-2 text-sm text-muted-foreground/70">
          Please retry in a few seconds. Your account and files are safe; we could not reach the
          workspace database right now.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground shadow-card transition-all hover:shadow-elevated active:scale-[0.97]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    </div>
  );
}
