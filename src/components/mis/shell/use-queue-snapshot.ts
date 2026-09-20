'use client';

import { useEffect, useState } from 'react';

import { getOfflineQueue, type QueueSnapshot } from '@/lib/mis/offline/queue';

/** The offline queue's current state, or `null` until the first read (and always on the server). */
export function useQueueSnapshot(): QueueSnapshot | null {
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  useEffect(() => getOfflineQueue().subscribe(setSnapshot), []);
  return snapshot;
}
