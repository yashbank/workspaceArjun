import { BppAmbientBackground } from '@/components/shell/bpp-ambient-background';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center p-4">
      <BppAmbientBackground variant="auth" />
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </div>
  );
}
