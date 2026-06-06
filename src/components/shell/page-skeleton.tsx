// Lightweight route-transition skeletons shown by each (dashboard) loading.tsx
// while the server component resolves. Keeps the sidebar in place and fills the
// content area with a shimmer that roughly matches the destination layout.

const SHIMMER = 'bg-shimmer bg-[length:200%_100%] animate-shimmer';

export function PageSkeleton({
  title = true,
  variant = 'list',
}: {
  title?: boolean;
  variant?: 'list' | 'cards' | 'stats' | 'form';
}) {
  return (
    <div className="space-y-6">
      {title && (
        <div className="space-y-2">
          <div className={`h-6 w-44 rounded-lg ${SHIMMER}`} />
          <div className={`h-3 w-72 rounded-full ${SHIMMER}`} />
        </div>
      )}

      {variant === 'stats' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bpp-card p-4">
                <div className={`h-7 w-12 rounded-lg ${SHIMMER}`} style={{ animationDelay: `${i * 60}ms` }} />
                <div className={`mt-3 h-2.5 w-16 rounded-full ${SHIMMER}`} />
              </div>
            ))}
          </div>
          <ListSkeleton rows={6} />
        </>
      )}

      {variant === 'cards' && (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col overflow-hidden rounded-2xl border border-border/40 bg-card/50 shadow-card"
            >
              <div className={`aspect-[4/3] ${SHIMMER}`} style={{ animationDelay: `${i * 50}ms` }} />
              <div className="space-y-2 p-3.5">
                <div className={`h-3.5 w-4/5 rounded-lg ${SHIMMER}`} />
                <div className={`h-3 w-1/2 rounded-md ${SHIMMER}`} />
              </div>
            </div>
          ))}
        </div>
      )}

      {variant === 'list' && <ListSkeleton rows={8} />}

      {variant === 'form' && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bpp-card space-y-3 p-5">
              <div className={`h-4 w-40 rounded-lg ${SHIMMER}`} style={{ animationDelay: `${i * 60}ms` }} />
              <div className={`h-9 w-full rounded-lg ${SHIMMER}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="bpp-card overflow-hidden">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-border/30 px-4 py-3 last:border-0">
          <div className={`h-8 w-8 shrink-0 rounded-lg ${SHIMMER}`} style={{ animationDelay: `${i * 50}ms` }} />
          <div className={`h-3.5 flex-1 rounded-full ${SHIMMER}`} style={{ maxWidth: `${42 + ((i * 11) % 40)}%` }} />
          <div className={`hidden h-3 w-20 shrink-0 rounded-full sm:block ${SHIMMER}`} />
        </div>
      ))}
    </div>
  );
}
