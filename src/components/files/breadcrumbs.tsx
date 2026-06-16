'use client';

import { ChevronRight, Home } from 'lucide-react';

type Crumb = { id: string; name: string };

export function Breadcrumbs({
  crumbs,
  onNavigate,
}: {
  crumbs: Crumb[];
  onNavigate: (id: string | null) => void;
}) {
  return (
    <nav className="mt-1.5 flex flex-wrap items-center gap-1 text-sm">
      <button
        onClick={() => onNavigate(null)}
        className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-muted-foreground transition-all hover:bg-accent hover:text-foreground"
      >
        <Home className="h-3 w-3" />
        <span className="text-xs">Root</span>
      </button>
      {crumbs.map((crumb, i) => (
        <span key={crumb.id} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
          <button
            onClick={() => onNavigate(crumb.id)}
            className={`max-w-full break-words rounded-lg px-1.5 py-0.5 text-left text-xs transition-all hover:bg-accent [overflow-wrap:anywhere] ${
              i === crumbs.length - 1 ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {crumb.name}
          </button>
        </span>
      ))}
    </nav>
  );
}
