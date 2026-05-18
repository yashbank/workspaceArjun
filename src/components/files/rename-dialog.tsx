'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';

export function RenameDialog({
  currentName,
  itemType,
  onConfirm,
  onClose,
}: {
  currentName: string;
  itemType: 'folder' | 'file';
  onConfirm: (newName: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(currentName);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim() && name.trim() !== currentName) {
      onConfirm(name.trim());
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-in fade-in duration-150" onClick={onClose}>
      <div className="mx-4 w-full max-w-sm overflow-hidden rounded-2xl border border-border/50 bg-card shadow-float animate-in scale-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-border/30 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/8">
            <Pencil className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight">Rename {itemType}</h2>
            <p className="text-[11px] text-muted-foreground/60">Enter a new name</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <input
            id="rename-input"
            type="text"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onClose()}
            className="w-full rounded-xl border border-border/50 bg-background px-3.5 py-2.5 text-sm outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/15"
          />
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-xs font-medium text-muted-foreground transition-all hover:bg-accent active:scale-[0.97]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || name.trim() === currentName}
              className="rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-card transition-all hover:shadow-elevated disabled:opacity-50 active:scale-[0.97]"
            >
              Rename
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
