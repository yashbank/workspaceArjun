'use client';

import {
  Eye,
  Download,
  FolderInput,
  Pencil,
  History,
  UploadCloud,
  Star,
  Trash2,
  ShieldX,
} from 'lucide-react';
import { FixedMenu } from '@/components/ui/fixed-menu';

export type FileActionMenuProps = {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onPreview?: () => void;
  onDownload: () => void;
  onMove?: () => void;
  /** When false, "Move to folder" is shown disabled with explanatory text. */
  canMove?: boolean;
  onRename: () => void;
  onVersions: () => void;
  onNewVersion?: () => void;
  onFavorite?: () => void;
  isFavorited?: boolean;
  onTrash: () => void;
  /** Permanent delete is only offered when both provided and permitted. */
  onPermanentDelete?: () => void;
  canPermanentDelete?: boolean;
};

/**
 * Shared, portal-rendered action menu used by both the list (file-table) and
 * grid (file-grid) views so the two stay consistent. Rendering through
 * FixedMenu (a document.body portal) keeps the menu from being clipped or
 * mispositioned by transformed / overflow-hidden ancestors.
 */
export function FileActionMenu({
  open,
  onClose,
  anchorRef,
  onPreview,
  onDownload,
  onMove,
  canMove = true,
  onRename,
  onVersions,
  onNewVersion,
  onFavorite,
  isFavorited = false,
  onTrash,
  onPermanentDelete,
  canPermanentDelete = false,
}: FileActionMenuProps) {
  const run = (fn?: () => void) => () => {
    onClose();
    fn?.();
  };

  const showPermanent = canPermanentDelete && !!onPermanentDelete;

  return (
    <FixedMenu open={open} onClose={onClose} anchorRef={anchorRef} align="right" width={200}>
      {onPreview && <MenuItem icon={Eye} label="Preview" onClick={run(onPreview)} />}
      <MenuItem icon={Download} label="Download" onClick={run(onDownload)} />
      {onMove &&
        (canMove ? (
          <MenuItem icon={FolderInput} label="Move to folder" onClick={run(onMove)} />
        ) : (
          <MenuItem
            icon={FolderInput}
            label="Move to folder"
            hint="Create a folder first"
            disabled
          />
        ))}
      <MenuItem icon={Pencil} label="Rename" onClick={run(onRename)} />
      <MenuItem icon={History} label="Previous versions" onClick={run(onVersions)} />
      {onNewVersion && (
        <MenuItem icon={UploadCloud} label="Upload new version" onClick={run(onNewVersion)} />
      )}
      {onFavorite && (
        <MenuItem
          icon={Star}
          label={isFavorited ? 'Remove star' : 'Add star'}
          onClick={run(onFavorite)}
        />
      )}

      <div className="my-1 border-t border-border/30" />

      <MenuItem icon={Trash2} label="Move to trash" onClick={run(onTrash)} destructive />
      {showPermanent && (
        <MenuItem
          icon={ShieldX}
          label="Delete permanently"
          onClick={run(onPermanentDelete)}
          destructive
        />
      )}
    </FixedMenu>
  );
}

function MenuItem({
  icon: Icon,
  label,
  hint,
  onClick,
  destructive,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  onClick?: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100 ${
        destructive ? 'text-destructive hover:bg-destructive/8' : 'hover:bg-accent'
      } ${disabled ? 'hover:bg-transparent' : ''}`}
    >
      <Icon className={`h-3.5 w-3.5 shrink-0 ${destructive ? '' : 'text-muted-foreground/50'}`} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && <span className="shrink-0 text-[10px] text-muted-foreground/45">{hint}</span>}
    </button>
  );
}
