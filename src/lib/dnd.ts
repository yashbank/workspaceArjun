/**
 * Shared client-side drag-and-drop contract for Finder-style file/folder moves.
 *
 * The dragged item's identity travels two ways:
 *  - in the native `DataTransfer` (the source of truth, read on `drop`), and
 *  - in a module-scoped `activeDrag` ref, because `DataTransfer.getData` is
 *    blocked during `dragover` for security — drop targets read the ref there to
 *    suppress self-drop highlighting. The ref is plain module state, never React
 *    state, so a drag never triggers a re-render.
 */
import type { DragEvent } from 'react';

export const DND_MIME = 'application/x-arjun-dnd';

export type DndKind = 'file' | 'folder';
export type DndPayload = { kind: DndKind; id: string };

let activeDrag: DndPayload | null = null;

/** Begin a drag: stamp the payload into both the DataTransfer and the ref. */
export function startDrag(e: DragEvent, payload: DndPayload): void {
  activeDrag = payload;
  e.dataTransfer.setData(DND_MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'move';
}

/** End a drag (fires regardless of drop success). Clears the ref. */
export function endDrag(): void {
  activeDrag = null;
}

/** The in-flight drag payload, available during `dragover` (where getData isn't). */
export function getActiveDrag(): DndPayload | null {
  return activeDrag;
}

/** True when the current drag is an internal item move (not an OS file upload). */
export function isInternalDrag(e: DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes(DND_MIME);
}

/** Parse the payload on `drop`. Returns null for foreign/malformed drags. */
export function readDragPayload(e: DragEvent): DndPayload | null {
  try {
    const raw = e.dataTransfer.getData(DND_MIME);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DndPayload;
    if ((parsed.kind === 'file' || parsed.kind === 'folder') && typeof parsed.id === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
