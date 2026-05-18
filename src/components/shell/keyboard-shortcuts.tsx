'use client';

import { useEffect, useState } from 'react';
import { X, Keyboard } from 'lucide-react';

type ShortcutGroup = {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
};

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['⌘', 'K'], description: 'Open search' },
      { keys: ['G', 'then', 'D'], description: 'Go to Dashboard' },
      { keys: ['G', 'then', 'F'], description: 'Go to Files' },
      { keys: ['G', 'then', 'T'], description: 'Go to Trash' },
    ],
  },
  {
    title: 'Files',
    shortcuts: [
      { keys: ['U'], description: 'Upload file' },
      { keys: ['N'], description: 'New folder' },
      { keys: ['⌘', 'A'], description: 'Select all files' },
      { keys: ['Esc'], description: 'Clear selection / Close panel' },
      { keys: ['Del'], description: 'Move selected to trash' },
    ],
  },
  {
    title: 'Preview',
    shortcuts: [
      { keys: ['←', '→'], description: 'Navigate between files' },
      { keys: ['Space'], description: 'Open lightbox (images)' },
      { keys: ['+', '−'], description: 'Zoom in / out (lightbox)' },
      { keys: ['0'], description: 'Reset zoom' },
      { keys: ['R'], description: 'Rotate image' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { keys: ['?'], description: 'Show this help' },
      { keys: ['V'], description: 'Toggle list / grid view' },
    ],
  },
];

export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setOpen((p) => !p);
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="mx-4 w-full max-w-lg overflow-hidden rounded-2xl border border-border/50 bg-card shadow-float animate-in scale-in fade-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/30 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Keyboard className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-bold">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="grid gap-0 p-5 sm:grid-cols-2">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} className="space-y-2 pb-4">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                {group.title}
              </h3>
              <div className="space-y-1.5">
                {group.shortcuts.map((shortcut, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 pr-4">
                    <span className="text-xs text-muted-foreground">{shortcut.description}</span>
                    <div className="flex items-center gap-0.5">
                      {shortcut.keys.map((key, j) => (
                        key === 'then' ? (
                          <span key={j} className="px-0.5 text-[9px] text-muted-foreground/40">then</span>
                        ) : (
                          <kbd
                            key={j}
                            className="flex h-5 min-w-[20px] items-center justify-center rounded-md border border-border/40 bg-muted/30 px-1.5 text-[10px] font-medium text-muted-foreground/70"
                          >
                            {key}
                          </kbd>
                        )
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-border/30 px-5 py-3">
          <p className="text-center text-[10px] text-muted-foreground/50">
            Press <kbd className="mx-0.5 rounded border bg-muted/50 px-1 py-0.5 text-[9px] font-medium">?</kbd> to toggle this panel
          </p>
        </div>
      </div>
    </div>
  );
}
