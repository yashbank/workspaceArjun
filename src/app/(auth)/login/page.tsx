import { Suspense } from 'react';
import { LoginForm } from './login-form';
import { Loader2 } from 'lucide-react';
import { AuthCard } from '@/components/auth/auth-card';

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <AuthCard title="Bhaskar Paper Products" subtitle="Loading…">
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
          </div>
        </AuthCard>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
