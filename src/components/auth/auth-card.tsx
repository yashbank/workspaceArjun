import { BppMonogram } from '@/components/shell/bpp-monogram';
import type { ReactNode } from 'react';

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-border/55 bg-card/95 shadow-float backdrop-blur-md">
      <div className="border-b border-border/40 px-8 pb-6 pt-8 text-center">
        <div className="mx-auto mb-4 flex justify-center">
          <BppMonogram className="!h-12 !w-12" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground/70">{subtitle}</p>
      </div>
      <div className="p-8">{children}</div>
      {footer && (
        <div className="border-t border-border/35 px-8 py-4 text-center text-[11px] text-muted-foreground/55">
          {footer}
        </div>
      )}
    </div>
  );
}
