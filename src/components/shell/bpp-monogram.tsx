/** BPP brand monogram placeholder — replace with logo asset in a later phase. */
export function BppMonogram({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary shadow-card ring-1 ring-black/5 dark:ring-white/10 ${className}`}
      aria-hidden
    >
      <span className="font-mono text-[11px] font-bold tracking-tighter text-primary-foreground">BP</span>
    </div>
  );
}
