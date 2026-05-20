'use client';

import { useState, useSyncExternalStore } from 'react';

type Variant = 'auth' | 'dashboard';

function subscribeReducedMotion(onStoreChange: () => void) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', onStoreChange);
  return () => mq.removeEventListener('change', onStoreChange);
}

function getReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function BppAmbientBackground({ variant = 'dashboard' }: { variant?: Variant }) {
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);
  const [videoFailed, setVideoFailed] = useState(false);

  if (reducedMotion || videoFailed) {
    return (
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-gradient-to-b from-background via-background to-muted/30"
        aria-hidden
      />
    );
  }

  const opacity = variant === 'auth' ? 'opacity-[0.12]' : 'opacity-[0.10]';

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <div className={`absolute inset-0 bg-background/85`} />
      <video
        className={`absolute inset-0 h-full w-full object-cover ${opacity}`}
        src="/assets/bpp/backgrounds/bpp-ambient-motion.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        onError={() => setVideoFailed(true)}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-transparent to-background/70" />
    </div>
  );
}
