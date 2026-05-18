'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  FolderOpen,
  Upload,
  Trash2,
  Settings,
  ArrowRight,
  X,
  Sparkles,
} from 'lucide-react';

const TOUR_KEY = 'arjun-tour-completed';

interface TourStep {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  route?: string;
}

const STEPS: TourStep[] = [
  {
    title: 'Your Dashboard',
    description: 'Get a quick overview of your workspace — files, storage, and recent activity all in one place.',
    icon: LayoutDashboard,
    color: 'text-blue-500',
    bg: 'bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/30 dark:to-blue-800/20',
    route: '/',
  },
  {
    title: 'Files Workspace',
    description: 'Browse, upload, and organize your files and folders. Switch between list and grid view, search, sort, and preview.',
    icon: FolderOpen,
    color: 'text-amber-500',
    bg: 'bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/30 dark:to-amber-800/20',
    route: '/files',
  },
  {
    title: 'Upload & Versions',
    description: 'Drag and drop files to upload. Each file keeps a version history — re-upload to create new versions anytime.',
    icon: Upload,
    color: 'text-emerald-500',
    bg: 'bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900/30 dark:to-emerald-800/20',
  },
  {
    title: 'Trash & Restore',
    description: 'Deleted files go to trash first. Restore them anytime, or permanently delete when you\'re sure.',
    icon: Trash2,
    color: 'text-red-500',
    bg: 'bg-gradient-to-br from-red-100 to-red-50 dark:from-red-900/30 dark:to-red-800/20',
    route: '/trash',
  },
  {
    title: 'Admin & Settings',
    description: 'Manage team members, roles, storage limits, and workspace configuration from one place.',
    icon: Settings,
    color: 'text-purple-500',
    bg: 'bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900/30 dark:to-purple-800/20',
    route: '/admin/settings',
  },
];

export function GuidedTour() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const completed = localStorage.getItem(TOUR_KEY);
    if (!completed) {
      const timer = setTimeout(() => setActive(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    function handleTourStart() {
      setStep(0);
      setActive(true);
    }
    window.addEventListener('arjun:start-tour', handleTourStart);
    return () => window.removeEventListener('arjun:start-tour', handleTourStart);
  }, []);

  const completeTour = useCallback(() => {
    setActive(false);
    localStorage.setItem(TOUR_KEY, 'true');
  }, []);

  const skipTour = useCallback(() => {
    setActive(false);
    localStorage.setItem(TOUR_KEY, 'true');
  }, []);

  const nextStep = useCallback(() => {
    if (step < STEPS.length - 1) {
      const next = step + 1;
      setStep(next);
      const nextRoute = STEPS[next].route;
      if (nextRoute && nextRoute !== pathname) {
        router.push(nextRoute);
      }
    } else {
      completeTour();
    }
  }, [step, pathname, router, completeTour]);

  const prevStep = useCallback(() => {
    if (step > 0) {
      const prev = step - 1;
      setStep(prev);
      const prevRoute = STEPS[prev].route;
      if (prevRoute && prevRoute !== pathname) {
        router.push(prevRoute);
      }
    }
  }, [step, pathname, router]);

  if (!active) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={skipTour} />

      <div className="relative mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-border/50 bg-card shadow-float animate-in scale-in fade-in duration-300">
        {/* Progress bar */}
        <div className="flex gap-1 px-5 pt-4">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                i <= step ? 'bg-primary' : 'bg-muted/40'
              }`}
            />
          ))}
        </div>

        {/* Close button */}
        <button
          onClick={skipTour}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground/40 transition-all hover:bg-accent hover:text-foreground active:scale-90"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Content */}
        <div className="px-6 pb-6 pt-5">
          {step === 0 && (
            <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-primary/60">
              <Sparkles className="h-3 w-3" />
              Welcome Tour
            </div>
          )}

          <div key={step} className="animate-in fade-in slide-up-fade duration-300">
            <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl ${current.bg}`}>
              <Icon className={`h-6 w-6 ${current.color} drop-shadow-sm`} />
            </div>

            <h2 className="text-lg font-bold tracking-tight">{current.title}</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground/70">
              {current.description}
            </p>
          </div>

          {/* Actions */}
          <div className="mt-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {step > 0 ? (
                <button
                  onClick={prevStep}
                  className="rounded-xl px-4 py-2.5 text-xs font-medium text-muted-foreground transition-all hover:bg-accent active:scale-[0.97]"
                >
                  Back
                </button>
              ) : (
                <button
                  onClick={skipTour}
                  className="rounded-xl px-4 py-2.5 text-xs font-medium text-muted-foreground transition-all hover:bg-accent active:scale-[0.97]"
                >
                  Skip tour
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] tabular-nums text-muted-foreground/40">
                {step + 1} / {STEPS.length}
              </span>
              <button
                onClick={nextStep}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-card transition-all hover:shadow-elevated active:scale-[0.97]"
              >
                {isLast ? 'Get started' : 'Next'}
                {!isLast && <ArrowRight className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
