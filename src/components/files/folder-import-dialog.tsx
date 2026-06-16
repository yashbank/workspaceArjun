'use client';

import { useMemo, useState } from 'react';
import { FolderUp, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { formatUploadError, uploadFileDirect } from '@/lib/direct-upload';
import { planFolderImport } from '@/lib/folder-import-plan';

/** Human-readable reason for a folder-create failure, for the import summary. */
function describeFolderFailure(err: unknown): string {
  const msg = err instanceof Error ? err.message : '';
  if (msg === 'Unauthorized') return 'your session has expired — sign in again';
  if (msg === 'Forbidden') return "you don't have permission to create folders here";
  return 'a network or server error occurred';
}

/** Run `fn` over `items` with at most `limit` in flight at once. */
async function runPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      await fn(items[cursor++]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

export function FolderImportDialog({
  files,
  parentFolderId,
  onComplete,
  onCancel,
}: {
  files: File[];
  parentFolderId: string | null;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  // Plan once (pure): junk files are filtered and paths NFC-normalized here, so
  // the header count and progress denominator reflect what will actually import.
  const plan = useMemo(() => planFolderImport(files), [files]);
  const folderName = plan.rootName;
  const fileCount = plan.files.length;

  async function handleConfirm() {
    setUploading(true);
    setProgress(0);

    try {
      // Create folders level-by-level so a parent always exists before its
      // children. Folders within one level are independent, so create up to 3 at
      // once. A folder that fails to create is left out of the map; its children
      // and the files under it are then skipped (and counted) below.
      const pathToId = new Map<string, string>();
      let foldersFailed = 0;
      let firstFolderError: unknown;
      const failedFolderPaths: string[] = [];
      for (const level of plan.levels) {
        await runPool(level, 3, async (dir) => {
          const parentId =
            dir.parentPath === null ? parentFolderId : pathToId.get(dir.parentPath);
          if (dir.parentPath !== null && parentId === undefined) {
            foldersFailed++; // parent missing — this folder can't be created
            return;
          }
          try {
            const { id } = await apiFetch<{ id: string }>('/api/folders', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: dir.name, parentId: parentId ?? null }),
            });
            pathToId.set(dir.path, id);
          } catch (e) {
            foldersFailed++;
            firstFolderError ??= e; // keep the first real error to explain the failure
            failedFolderPaths.push(dir.path);
          }
        });
      }

      // Upload each file into its mapped folder (max 3 concurrent). `skipped` =
      // its folder could not be created; `failed` = the upload itself threw.
      let done = 0;
      let failed = 0;
      let skipped = 0;
      await runPool(plan.files, 3, async ({ file, dirPath }) => {
        const folderId = dirPath === '' ? parentFolderId : pathToId.get(dirPath);
        if (dirPath !== '' && folderId === undefined) {
          skipped++;
          setProgress((p) => p + 1);
          return;
        }
        try {
          await uploadFileDirect(file, folderId ?? null, () => {});
          done++;
        } catch (e) {
          failed++;
          if (failed === 1) {
            toast('error', formatUploadError(e));
          }
        } finally {
          setProgress((p) => p + 1);
        }
      });

      if (failed + skipped + foldersFailed > 0) {
        const parts = [`${done} uploaded`];
        if (failed > 0) parts.push(`${failed} failed`);
        if (skipped > 0) parts.push(`${skipped} skipped`);
        if (foldersFailed > 0)
          parts.push(`${foldersFailed} folder${foldersFailed === 1 ? '' : 's'} not created`);
        let message = `Imported "${folderName}": ${parts.join(', ')}`;
        if (foldersFailed > 0) {
          message += ` — ${describeFolderFailure(firstFolderError)}`;
          const sample = failedFolderPaths.slice(0, 2);
          if (sample.length > 0) message += ` (${sample.join(', ')})`;
        }
        toast('error', message);
      } else {
        toast('success', `Imported folder "${folderName}" with ${done} file${done === 1 ? '' : 's'}`);
      }
      onComplete();
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Folder import failed');
      onCancel();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-border/50 bg-card shadow-float animate-in scale-in fade-in duration-200">
        <div className="flex items-center gap-3 border-b border-border/30 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/8">
            <FolderUp className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight">Import folder</h2>
            <p className="text-[11px] text-muted-foreground/60">
              Create &ldquo;{folderName}&rdquo; and upload {fileCount} file{fileCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {uploading && (
          <div className="border-b border-border/20 px-5 py-3">
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground/50">
              <span className="font-medium">Uploading…</span>
              <span className="tabular-nums">{progress}/{fileCount}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted/25">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${fileCount > 0 ? (progress / fileCount) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-5 py-4">
          <button
            onClick={onCancel}
            disabled={uploading}
            className="rounded-xl px-4 py-2.5 text-xs font-medium text-muted-foreground transition-all hover:bg-accent disabled:opacity-50 active:scale-[0.97]"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-card transition-all hover:shadow-elevated disabled:opacity-50 active:scale-[0.97]"
          >
            {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {uploading ? 'Uploading…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
