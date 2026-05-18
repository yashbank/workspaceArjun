'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Settings,
  HardDrive,
  Files,
  FolderOpen,
  Layers,
  Save,
  AlertCircle,
  Loader2,
  Sparkles,
  HelpCircle,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface WorkspaceSettings {
  totalFiles: number;
  totalFolders: number;
  totalVersions: number;
  storageUsedBytes: number;
  fileSizeCapBytes: number;
  versionRetentionCount: number;
  workspaceQuotaBytes: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(0);
}

export default function SettingsPage() {
  const [data, setData] = useState<WorkspaceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [fileSizeCapMB, setFileSizeCapMB] = useState('');
  const [versionRetention, setVersionRetention] = useState('');

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const d = await apiFetch<WorkspaceSettings>('/api/admin/settings');
      setData(d);
      setFileSizeCapMB(formatMB(d.fileSizeCapBytes));
      setVersionRetention(String(d.versionRetentionCount));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching on mount
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await apiFetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileSizeCapBytes: Number(fileSizeCapMB) * 1024 * 1024,
          versionRetentionCount: Number(versionRetention),
        }),
      });
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center text-sm text-destructive">
        {error || 'Failed to load settings'}
      </div>
    );
  }

  const usagePct = data.workspaceQuotaBytes > 0
    ? Math.min(100, (data.storageUsedBytes / data.workspaceQuotaBytes) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Workspace configuration and storage overview
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-destructive/15 bg-destructive/4 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Storage overview */}
      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-card">
        <div className="flex items-center gap-2 border-b border-border/30 px-5 py-3.5">
          <HardDrive className="h-4 w-4 text-muted-foreground/40" />
          <span className="text-sm font-semibold">Storage Overview</span>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-semibold">{formatBytes(data.storageUsedBytes)} used</span>
              <span className="text-muted-foreground/50">of {formatBytes(data.workspaceQuotaBytes)}</span>
            </div>
            <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-muted/25">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700"
                style={{ width: `${usagePct}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-2">
            <StatTile icon={Files} label="Total Files" value={data.totalFiles} color="text-blue-500" bg="bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/30 dark:to-blue-800/20" />
            <StatTile icon={FolderOpen} label="Total Folders" value={data.totalFolders} color="text-amber-500" bg="bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/30 dark:to-amber-800/20" />
            <StatTile icon={Layers} label="Total Versions" value={data.totalVersions} color="text-purple-500" bg="bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900/30 dark:to-purple-800/20" />
          </div>
        </div>
      </div>

      {/* Upload settings */}
      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-card">
        <div className="flex items-center gap-2 border-b border-border/30 px-5 py-3.5">
          <Settings className="h-4 w-4 text-muted-foreground/40" />
          <span className="text-sm font-semibold">Upload Settings</span>
        </div>
        <div className="space-y-5 p-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Maximum file size (MB)
            </label>
            <input
              type="number"
              min={1}
              value={fileSizeCapMB}
              onChange={(e) => setFileSizeCapMB(e.target.value)}
              className="w-40 rounded-xl border border-border/50 bg-background px-3 py-2.5 text-sm tabular-nums outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/15"
            />
            <p className="mt-1.5 text-xs text-muted-foreground/70">
              Files larger than this will be rejected during upload
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Version retention count
            </label>
            <input
              type="number"
              min={1}
              value={versionRetention}
              onChange={(e) => setVersionRetention(e.target.value)}
              className="w-40 rounded-xl border border-border/50 bg-background px-3 py-2.5 text-sm tabular-nums outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/15"
            />
            <p className="mt-1.5 text-xs text-muted-foreground/70">
              Maximum number of versions to keep per file
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-card transition-all hover:shadow-elevated disabled:opacity-50 active:scale-[0.97]"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save Changes
            </button>
          </div>
        </div>
      </div>

      {/* Help & About */}
      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-card">
        <div className="flex items-center gap-2 border-b border-border/30 px-5 py-3.5">
          <HelpCircle className="h-4 w-4 text-muted-foreground/40" />
          <span className="text-sm font-semibold">Help & About</span>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-primary/5">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Take a tour</p>
                <p className="text-[11px] text-muted-foreground/60">Walk through the key features of Arjun</p>
              </div>
            </div>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('arjun:start-tour'))}
              className="rounded-xl border border-border/50 px-4 py-2.5 text-xs font-semibold shadow-card transition-all hover:shadow-elevated active:scale-[0.97]"
            >
              Start tour
            </button>
          </div>
          <div className="border-t border-border/20 pt-4">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground/40">
              <span>Arjun File Manager</span>
              <span className="tabular-nums">v0.1.0</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  color,
  bg,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
  bg: string;
}) {
  return (
    <div className="rounded-xl border border-border/30 bg-card p-3.5 shadow-card">
      <div className="flex items-center gap-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${bg}`}>
          <Icon className={`h-3.5 w-3.5 ${color} drop-shadow-sm`} />
        </div>
        <span className="text-[11px] font-medium text-muted-foreground/50">{label}</span>
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums tracking-tight">{value.toLocaleString()}</p>
    </div>
  );
}
