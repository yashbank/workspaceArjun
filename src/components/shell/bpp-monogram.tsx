/** BPP brand monogram — a vibrant, gently-animated gradient mark. */
export function BppMonogram({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-gradient-pan flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-amber-400 shadow-card ring-1 ring-white/25 ${className}`}
      aria-hidden
    >
      <span className="font-mono text-[11px] font-extrabold tracking-tighter text-white drop-shadow-sm">
        BP
      </span>
    </div>
  );
}
