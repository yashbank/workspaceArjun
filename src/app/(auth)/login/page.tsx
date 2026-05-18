import { Suspense } from 'react';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-border/50 bg-card shadow-float">
          <div className="border-b border-border/30 px-8 pt-8 pb-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary shadow-card">
              <span className="text-lg font-bold text-primary-foreground">A</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight">Arjun</h1>
            <p className="mt-1 text-[13px] text-muted-foreground/60">Loading…</p>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
