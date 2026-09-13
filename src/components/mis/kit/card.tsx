import { cn } from '@/lib/utils';

/**
 * The mobile stand-in for a table row.
 *
 * At 360px a table becomes a stack of these rather than a horizontal scroll —
 * sideways scrolling on a phone hides columns people need.
 */
export function Card({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const interactive = typeof onClick === 'function';
  const Tag = interactive ? 'button' : 'div';

  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'w-full rounded-xl border border-slate-200 bg-white p-4 text-left',
        interactive &&
          'min-h-11 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function CardRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-base text-slate-900">{value}</span>
    </div>
  );
}
