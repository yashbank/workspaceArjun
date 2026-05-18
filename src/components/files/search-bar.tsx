'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, FileText, Folder, X, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';

type SearchResult = {
  id: string;
  name: string;
  type: 'file' | 'folder';
  folderId?: string | null;
};

export function SearchBar({
  onNavigateToFolder,
  onPreviewFile,
}: {
  onNavigateToFolder: (id: string | null) => void;
  onPreviewFile?: (fileId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
        setQuery('');
        setResults([]);
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const data = await apiFetch<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`);
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleInput(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 250);
  }

  function selectResult(r: SearchResult) {
    if (r.type === 'folder') {
      onNavigateToFolder(r.id);
    } else {
      if (r.folderId) onNavigateToFolder(r.folderId);
      if (onPreviewFile) onPreviewFile(r.id);
    }
    setOpen(false);
    setQuery('');
    setResults([]);
  }

  if (!open) {
    return (
      <button
        data-search-trigger
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="flex items-center gap-2 rounded-xl border border-border/50 bg-card px-3 py-2 text-xs text-muted-foreground shadow-card transition-all hover:shadow-elevated active:scale-[0.97]"
      >
        <Search className="h-3.5 w-3.5 text-muted-foreground/60" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="ml-2 hidden rounded-md border border-border/40 bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/70 sm:inline">
          ⌘K
        </kbd>
      </button>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm animate-in fade-in duration-150" onClick={() => { setOpen(false); setQuery(''); setResults([]); }} />
      <div className="fixed left-1/2 top-[18%] z-[60] w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-2xl border border-border/50 bg-card shadow-float animate-in scale-in fade-in duration-200">
        <div className="flex items-center gap-3 border-b border-border/30 px-4 py-3.5">
          <Search className="h-4 w-4 text-muted-foreground/50" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            placeholder="Search files and folders…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
            autoFocus
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" />}
          <button onClick={() => { setOpen(false); setQuery(''); setResults([]); }} className="rounded-lg p-1.5 transition-all hover:bg-accent active:scale-90">
            <X className="h-4 w-4 text-muted-foreground/50" />
          </button>
        </div>

        <div className="max-h-72 overflow-y-auto">
          {!loading && query && results.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-muted-foreground">No results found</p>
              <p className="mt-1 text-xs text-muted-foreground/60">Try a different search term</p>
            </div>
          )}
          {results.map((r) => (
            <button
              key={`${r.type}-${r.id}`}
              onClick={() => selectResult(r)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-all hover:bg-accent/30 active:scale-[0.99]"
            >
              <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${r.type === 'folder' ? 'bg-blue-500/10' : 'bg-muted/50'}`}>
                {r.type === 'folder' ? (
                  <Folder className="h-3.5 w-3.5 text-blue-500" />
                ) : (
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </div>
              <span className="truncate text-sm font-medium">{r.name}</span>
              <span className="ml-auto rounded-md bg-muted/50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60">{r.type}</span>
            </button>
          ))}
        </div>

        {!query && (
          <div className="border-t border-border/30 px-4 py-3 text-center text-[11px] text-muted-foreground/40">
            Type to search files and folders
          </div>
        )}
      </div>
    </>
  );
}
