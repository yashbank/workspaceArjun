/** BPP brand mark — a glossy, animated, multi-color 3D badge. */
export function BppMonogram({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-gradient-pan relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-amber-400 shadow-lg ring-1 ring-white/30 ${className}`}
      aria-hidden
    >
      {/* top-left gloss highlight */}
      <span
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(circle at 30% 22%, rgba(255,255,255,0.6), transparent 55%)' }}
      />
      {/* bottom depth shadow */}
      <span
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.25), transparent)' }}
      />
      <span className="relative font-mono text-[12px] font-black tracking-tighter text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]">
        BP
      </span>
    </div>
  );
}
