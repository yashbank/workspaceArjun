import type { Metadata } from 'next';
import { getCurrentUser } from '@/server/auth';
import { loadDashboardData } from '@/server/dashboard/load-dashboard-data';
import { PAGE_TITLES } from '@/lib/site';
import Link from 'next/link';

export const metadata: Metadata = {
  title: PAGE_TITLES.dashboard,
};
import {
  FolderOpen,
  FileText,
  Upload,
  Plus,
  Activity,
  Star,
  Trash2,
  Layers,
  ArrowRight,
  Sparkles,
  ImageIcon,
  FileArchive,
  Pen,
} from 'lucide-react';
import { StorageWidget } from '@/components/dashboard/storage-widget';
import { ClientGreeting, ClientDate } from '@/components/dashboard/client-greeting';
import { formatActivityLine, getAuditActionColor } from '@/lib/audit-display';

export default async function DashboardHome() {
  let profile = null;
  try {
    profile = await getCurrentUser();
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[dashboard] getCurrentUser failed:', e);
    }
  }

  let data;
  try {
    data = await loadDashboardData(profile);
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[dashboard] loadDashboardData failed:', e);
    }
    data = {
      fileCount: 0,
      folderCount: 0,
      versionCount: 0,
      activityCount: 0,
      totalBytes: 0,
      quotaBytes: 10 * 1024 * 1024 * 1024,
      recentFiles: [],
      recentActivity: [],
      pinnedFileDetails: [],
    };
  }

  const {
    fileCount,
    folderCount,
    versionCount,
    activityCount,
    totalBytes,
    quotaBytes,
    recentFiles,
    recentActivity,
    pinnedFileDetails,
  } = data;

  const isNewWorkspace = fileCount === 0 && folderCount === 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <ClientGreeting name={profile?.name || 'there'} />
          <p className="mt-1 text-[13px] text-muted-foreground/60">
            {isNewWorkspace
              ? 'Start by uploading your first file.'
              : 'Here\u2019s your workspace at a glance.'}
          </p>
        </div>
        <div className="hidden items-center gap-2 text-[11px] text-muted-foreground/30 lg:flex">
          <ClientDate />
        </div>
      </div>

      {isNewWorkspace && (
        <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card px-5 py-4 shadow-card sm:flex-row sm:items-center">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent">
            <Sparkles className="h-5 w-5 text-foreground/80" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold tracking-tight">Start by uploading your first file</p>
            <p className="mt-0.5 text-xs text-muted-foreground/60">
              Create folders, share with your team, and track activity from here.
            </p>
          </div>
          <Link
            href="/files"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-card transition-all hover:shadow-elevated active:scale-[0.97]"
          >
            Go to Files
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard icon={FileText} label="Total files" value={fileCount.toString()} />
        <StatCard icon={FolderOpen} label="Folders" value={folderCount.toString()} />
        <StatCard icon={Layers} label="Versions" value={versionCount.toString()} />
        <StatCard icon={Activity} label="Activity (7d)" value={activityCount.toString()} />
        <StorageWidget usedBytes={totalBytes} quotaBytes={quotaBytes} fileCount={fileCount} />
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="space-y-4">
          <div className="bpp-card p-5 transition-all duration-200 hover:shadow-elevated">
            <h2 className="bpp-label-caps">Quick actions</h2>
            <div className="mt-3 space-y-0.5">
              <QuickAction href="/files" icon={Upload} label="Upload files" />
              <QuickAction href="/files" icon={Plus} label="New folder" />
              <QuickAction href="/trash" icon={Trash2} label="View trash" />
            </div>
          </div>

          {pinnedFileDetails.length > 0 && (
            <div className="bpp-card p-5 transition-all duration-200 hover:shadow-elevated">
              <h2 className="bpp-label-caps">Starred files</h2>
              <div className="mt-3 space-y-0.5">
                {pinnedFileDetails.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-accent/30"
                  >
                    <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
                    <span className="truncate text-xs font-medium" title={f.name}>{f.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bpp-card p-5 transition-all duration-200 hover:shadow-elevated lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="bpp-label-caps">Recent files</h2>
            {recentFiles.length > 0 && (
              <Link href="/files" className="text-[11px] font-semibold text-primary transition-colors hover:text-primary/70">
                View all →
              </Link>
            )}
          </div>
          {recentFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/30">
                <FileText className="h-6 w-6 text-muted-foreground/30" />
              </div>
              <p className="mt-3 text-sm font-semibold text-muted-foreground/60">No files yet</p>
              <p className="mt-1 text-xs text-muted-foreground/40">
                Upload your first file to see it here.
              </p>
              <Link
                href="/files"
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-card transition-all hover:shadow-elevated active:scale-[0.97]"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload a file
              </Link>
            </div>
          ) : (
            <div className="mt-3 space-y-0.5">
              {recentFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-all hover:bg-accent/20"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/30">
                      <RecentFileIcon mimeType={file.mimeType} name={file.name} />
                    </div>
                    <span className="truncate text-[13px] font-medium tracking-tight" title={file.name}>{file.name}</span>
                  </div>
                  <span className="shrink-0 pl-3 text-[10px] tabular-nums text-muted-foreground/40">
                    {new Date(file.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bpp-card p-5 transition-all duration-200 hover:shadow-elevated">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="bpp-label-caps">Recent activity</h2>
          <div className="flex items-center gap-3">
            {recentActivity.length > 0 && (
              <span className="text-[10px] tabular-nums text-muted-foreground/30">{recentActivity.length} events</span>
            )}
            {(profile?.role === 'owner' || profile?.role === 'admin') && (
              <Link
                href="/activity"
                className="text-[11px] font-semibold text-primary transition-colors hover:text-primary/80"
              >
                View all activity →
              </Link>
            )}
          </div>
        </div>
        {recentActivity.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Activity className="h-8 w-8 text-muted-foreground/15" />
            <p className="mt-3 text-sm font-semibold text-muted-foreground/50">No activity yet</p>
            <p className="mt-1 text-xs text-muted-foreground/40">Actions you take will appear here.</p>
          </div>
        ) : (
          <div className="mt-3 space-y-0.5">
            {recentActivity.map((event) => (
              <div
                key={event.id}
                className="flex items-start gap-3 rounded-xl px-3 py-2.5 text-xs transition-all hover:bg-accent/15 sm:items-center"
              >
                <div
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full sm:mt-0 ${getAuditActionColor(event.action)}`}
                >
                  <Activity className="h-3 w-3" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[13px] leading-snug text-foreground/85">
                    {formatActivityLine(event.actor, event.action, event.meta)}
                  </p>
                </div>
                <span className="shrink-0 pt-0.5 text-[10px] tabular-nums text-muted-foreground/35 sm:pt-0">
                  {timeAgo(event.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RecentFileIcon({ mimeType, name }: { mimeType: string | null; name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const cls = 'h-4 w-4';
  if (mimeType?.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext))
    return <ImageIcon className={`${cls} text-sky-500`} />;
  if (['cdr', 'ai', 'eps', 'psd'].includes(ext))
    return <Pen className={`${cls} text-purple-500`} />;
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext))
    return <FileArchive className={`${cls} text-amber-500`} />;
  return <FileText className={`${cls} text-muted-foreground/60`} />;
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="bpp-card-interactive p-4 hover:-translate-y-0.5 active:scale-[0.99]">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent ring-1 ring-border/40">
          <Icon className="h-[18px] w-[18px] text-foreground/75" />
        </div>
        <div>
          <p className="text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
          <p className="text-[11px] text-muted-foreground/60">{label}</p>
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-medium text-muted-foreground/60 transition-all hover:bg-accent/30 hover:text-foreground active:scale-[0.97]"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}

function timeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}