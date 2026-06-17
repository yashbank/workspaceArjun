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
} from 'lucide-react';
import { StorageWidget } from '@/components/dashboard/storage-widget';
import { ClientGreeting, ClientDate } from '@/components/dashboard/client-greeting';
import { ActivityLineChart, FileTypePie } from '@/components/dashboard/charts';

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
      activityByDay: [],
      fileTypes: [],
    };
  }

  const {
    fileCount,
    folderCount,
    versionCount,
    activityCount,
    totalBytes,
    quotaBytes,
    pinnedFileDetails,
    activityByDay,
    fileTypes,
  } = data;

  const isNewWorkspace = fileCount === 0 && folderCount === 0;
  const canSeeAnalytics = profile?.role === 'owner' || profile?.role === 'admin';

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
        {canSeeAnalytics && (
          <StatCard icon={Activity} label="Activity (7d)" value={activityCount.toString()} />
        )}
        <StorageWidget usedBytes={totalBytes} quotaBytes={quotaBytes} fileCount={fileCount} />
      </div>

      {/* Analytics — Owner/Admin only */}
      {canSeeAnalytics && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ActivityLineChart data={activityByDay} />
          </div>
          <FileTypePie data={fileTypes} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="bpp-card p-5 transition-all duration-200 hover:shadow-elevated">
          <h2 className="bpp-label-caps">Quick actions</h2>
          <div className="mt-3 space-y-0.5">
            <QuickAction href="/files" icon={Upload} label="Upload files" />
            <QuickAction href="/files" icon={Plus} label="New folder" />
            <QuickAction href="/trash" icon={Trash2} label="View trash" />
          </div>
        </div>

        {pinnedFileDetails.length > 0 && (
          <div className="bpp-card p-5 transition-all duration-200 hover:shadow-elevated lg:col-span-2">
            <h2 className="bpp-label-caps">Starred files</h2>
            <div className="mt-3 grid gap-0.5 sm:grid-cols-2">
              {pinnedFileDetails.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-accent/30"
                >
                  <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
                  <span className="truncate text-xs font-medium" title={f.name}>
                    {f.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
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