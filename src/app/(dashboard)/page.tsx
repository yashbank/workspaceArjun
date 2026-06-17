import type { Metadata } from 'next';
import { getCurrentUser } from '@/server/auth';
import { loadDashboardData, type ActivityDayPoint } from '@/server/dashboard/load-dashboard-data';
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
import { ActivityAreaChart, FileTypePie, ActivityHeatmap } from '@/components/dashboard/charts';

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

      {/* Stat tiles */}
      <div className={`grid gap-4 sm:grid-cols-2 ${canSeeAnalytics ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        <StatCard icon={FileText} label="Total files" value={fileCount.toString()} tone="blue" />
        <StatCard icon={FolderOpen} label="Folders" value={folderCount.toString()} tone="violet" />
        <StatCard icon={Layers} label="Versions" value={versionCount.toString()} tone="amber" />
        {canSeeAnalytics && (
          <StatCard icon={Activity} label="Activity (7d)" value={activityCount.toString()} tone="emerald" />
        )}
      </div>

      {canSeeAnalytics ? (
        /* Bento — varied sizes: big chart, square widgets, circular gauge, long heatmap */
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-6 lg:items-start">
          <Reveal i={0} className="lg:col-span-4">
            <ActivityAreaChart data={activityByDay} />
          </Reveal>
          <Reveal i={1} className="lg:col-span-2">
            <FileTypePie data={fileTypes} />
          </Reveal>
          <Reveal i={2} className="lg:col-span-2">
            <StorageWidget usedBytes={totalBytes} quotaBytes={quotaBytes} fileCount={fileCount} />
          </Reveal>
          <Reveal i={3} className="lg:col-span-2">
            <BusiestDayCard data={activityByDay} />
          </Reveal>
          <Reveal i={4} className="lg:col-span-2">
            <QuickActionsCard />
          </Reveal>
          <Reveal i={5} className="lg:col-span-6">
            <ActivityHeatmap data={activityByDay} />
          </Reveal>
          {pinnedFileDetails.length > 0 && (
            <Reveal i={6} className="lg:col-span-6">
              <StarredCard files={pinnedFileDetails} />
            </Reveal>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StorageWidget usedBytes={totalBytes} quotaBytes={quotaBytes} fileCount={fileCount} />
          <QuickActionsCard />
          {pinnedFileDetails.length > 0 && <StarredCard files={pinnedFileDetails} />}
        </div>
      )}
    </div>
  );
}

/** Staggered first-load reveal wrapper for bento widgets. */
function Reveal({
  i = 0,
  className = '',
  children,
}: {
  i?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`animate-in content-reveal duration-500 ${className}`}
      style={{ animationDelay: `${i * 70}ms` }}
    >
      {children}
    </div>
  );
}

function BusiestDayCard({ data }: { data: ActivityDayPoint[] }) {
  const busiest = data.reduce<ActivityDayPoint>(
    (m, d) => (d.count > m.count ? d : m),
    { date: '', count: 0 },
  );
  const label = busiest.date
    ? new Date(`${busiest.date}T00:00:00Z`).toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      })
    : '';
  return (
    <div className="bpp-card h-full p-5 transition-all duration-200 hover:shadow-elevated">
      <h2 className="bpp-label-caps">Busiest day</h2>
      {busiest.count === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground/50">No activity yet</p>
      ) : (
        <div className="mt-4">
          <p className="bg-gradient-to-br from-fuchsia-500 to-indigo-500 bg-clip-text text-4xl font-bold tabular-nums tracking-tight text-transparent">
            {busiest.count}
          </p>
          <p className="mt-1 text-[12px] font-medium text-muted-foreground/70">events</p>
          <p className="mt-2 text-[11px] text-muted-foreground/50">{label}</p>
        </div>
      )}
    </div>
  );
}

function QuickActionsCard() {
  return (
    <div className="bpp-card h-full p-5 transition-all duration-200 hover:shadow-elevated">
      <h2 className="bpp-label-caps">Quick actions</h2>
      <div className="mt-3 space-y-0.5">
        <QuickAction href="/files" icon={Upload} label="Upload files" />
        <QuickAction href="/files" icon={Plus} label="New folder" />
        <QuickAction href="/trash" icon={Trash2} label="View trash" />
      </div>
    </div>
  );
}

function StarredCard({ files }: { files: { id: string; name: string }[] }) {
  return (
    <div className="bpp-card h-full p-5 transition-all duration-200 hover:shadow-elevated">
      <h2 className="bpp-label-caps">Starred files</h2>
      <div className="mt-3 grid gap-0.5 sm:grid-cols-2 lg:grid-cols-3">
        {files.map((f) => (
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
  );
}

const STAT_TONES: Record<string, string> = {
  blue: 'from-blue-500 to-sky-400',
  violet: 'from-violet-500 to-fuchsia-400',
  amber: 'from-amber-500 to-orange-400',
  emerald: 'from-emerald-500 to-teal-400',
};

function StatCard({
  icon: Icon,
  label,
  value,
  tone = 'blue',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: keyof typeof STAT_TONES;
}) {
  return (
    <div className="bpp-card-interactive p-4 hover:-translate-y-0.5 active:scale-[0.99]">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br shadow-card ring-1 ring-white/15 ${STAT_TONES[tone] ?? STAT_TONES.blue}`}
        >
          <Icon className="h-[18px] w-[18px] text-white drop-shadow-sm" />
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