/** Human-readable audit labels for dashboard and activity views. */

import { getUserDisplayName, type ActorLike } from '@/lib/user-display';

export function formatAuditAction(
  action: string,
  meta?: Record<string, unknown> | null,
): string {
  const name =
    (typeof meta?.name === 'string' && meta.name) ||
    (typeof meta?.fileName === 'string' && meta.fileName) ||
    (typeof meta?.newName === 'string' && meta.newName) ||
    null;

  const quoted = name ? ` '${name}'` : '';

  // Move actions snapshot source/destination names into meta (fromName/toName).
  // Older events only stored ids, so fall back to no path when names are absent.
  const fromName = typeof meta?.fromName === 'string' ? meta.fromName : null;
  const toName = typeof meta?.toName === 'string' ? meta.toName : null;
  const movePath = fromName && toName ? ` from ${fromName} to ${toName}` : '';

  const map: Record<string, string> = {
    'file.upload': `uploaded a file${quoted}`,
    'file.download': `downloaded a file${quoted}`,
    'file.rename': `renamed a file${quoted}`,
    'file.move': `moved a file${quoted}${movePath}`,
    'file.delete': `moved a file to trash${quoted}`,
    'file.restore': `restored a file${quoted}`,
    'file.permanent_delete': `permanently deleted a file${quoted}`,
    'folder.create': `created a folder${quoted}`,
    'folder.rename': `renamed a folder${quoted}`,
    'folder.move': `moved a folder${quoted}${movePath}`,
    'folder.delete': `moved a folder to trash${quoted}`,
    'folder.restore': `restored a folder${quoted}`,
    'folder.permanent_delete': `permanently deleted a folder${quoted}`,
    'version.upload': `uploaded a new version${quoted}`,
    'version.restore': `restored a file version${quoted}`,
    'user.invite': 'invited a user',
    'user.invite_resend': 'resent an invite',
    'user.invite_cancel': 'cancelled an invite',
    'user.role_change': 'changed a user role',
    'user.deactivate': 'deactivated a user',
    'user.reactivate': 'reactivated a user',
    'user.remove': 'removed a user',
    'user.ownership_transfer': 'transferred ownership',
    'settings.change': 'updated workspace settings',
    'login.success': 'signed in',
  };

  return map[action] ?? action.replaceAll('.', ' ');
}

/** Full line: display name + action, e.g. Sarthak uploaded a file 'photo.jpg' */
export function formatActivityLine(
  actor: ActorLike | null,
  action: string,
  meta?: Record<string, unknown> | null,
): string {
  const who = getUserDisplayName(actor);
  return `${who} ${formatAuditAction(action, meta)}`;
}

export function getAuditActionColor(action: string): string {
  if (action.includes('upload')) return 'bg-emerald-500/8 text-emerald-600';
  if (action.includes('delete') || action.includes('permanent_delete')) return 'bg-red-500/8 text-red-500';
  if (action.includes('restore')) return 'bg-blue-500/8 text-blue-500';
  if (action.includes('create') || action.includes('invite')) return 'bg-purple-500/8 text-purple-600';
  return 'bg-muted/30 text-muted-foreground';
}

export const ACTIVITY_ACTION_GROUPS = [
  { value: '', label: 'All actions' },
  { value: 'file.upload', label: 'File upload' },
  { value: 'file.delete', label: 'File deleted' },
  { value: 'file.restore', label: 'File restored' },
  { value: 'file.permanent_delete', label: 'File permanent delete' },
  { value: 'folder.create', label: 'Folder created' },
  { value: 'folder.delete', label: 'Folder deleted' },
  { value: 'folder.restore', label: 'Folder restored' },
  { value: 'version.upload', label: 'New version' },
  { value: 'user.invite', label: 'User invite' },
] as const;
