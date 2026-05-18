'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export function GlobalKeys() {
  const router = useRouter();
  const pendingG = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const isCmd = e.metaKey || e.ctrlKey;

      if (isCmd && e.key === 'k') {
        e.preventDefault();
        const searchBtn = document.querySelector('[data-search-trigger]') as HTMLButtonElement | null;
        searchBtn?.click();
        return;
      }

      if (pendingG.current) {
        pendingG.current = false;
        if (timerRef.current) clearTimeout(timerRef.current);
        if (e.key === 'd') { e.preventDefault(); router.push('/'); return; }
        if (e.key === 'f') { e.preventDefault(); router.push('/files'); return; }
        if (e.key === 't') { e.preventDefault(); router.push('/trash'); return; }
        return;
      }

      if (e.key === 'g' && !isCmd) {
        pendingG.current = true;
        timerRef.current = setTimeout(() => { pendingG.current = false; }, 800);
        return;
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [router]);

  return null;
}
