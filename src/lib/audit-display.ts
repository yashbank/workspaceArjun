/** Human-readable audit labels for dashboard activity. */

export function formatAuditAction(
  action: string,
  meta?: Record<string, unknown> | null,
): string {
  const name =
    (typeof meta?.name === 'string' && meta.name) ||
    (typeof meta?.fileName === 'string' && meta.fileName) ||
    (typeof meta?.newName === 'string' && meta.newName) ||
    null;

  const quoted = name ? ` “${name}”` : '';

  const map: Record<string, string> = {
    'file.upload': `uploaded a file${quoted}`,
    'file.download': `downloaded a file${quoted}`,
    'file.rename': `renamed a file${quoted}`,
    'file.move': `moved a file${quoted}`,
    'file.delete': `moved a file to trash${quoted}`,
    'file.restore': `restored a file${quoted}`,
    'file.permanent_delete': `permanently deleted a file${quoted}`,
    'folder.create': `created a folder${quoted}`,
    'folder.rename': `renamed a folder${quoted}`,
    'folder.move': `moved a folder${quoted}`,
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

export function getAuditActionColor(action: string): string {
  if (action.includes('upload')) return 'bg-emerald-500/8 text-emerald-600';
  if (action.includes('delete') || action.includes('permanent_delete')) return 'bg-red-500/8 text-red-500';
  if (action.includes('restore')) return 'bg-blue-500/8 text-blue-500';
  if (action.includes('create') || action.includes('invite')) return 'bg-purple-500/8 text-purple-600';
  return 'bg-muted/30 text-muted-foreground';
}
