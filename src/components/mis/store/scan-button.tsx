'use client';

import { useEffect, useRef, useState } from 'react';

import { scanErrorMessage } from '@/lib/mis/scan-input';

/**
 * R2-68 / R2-78 — scan an item barcode or QR with the phone camera.
 *
 * Uses the browser's built-in BarcodeDetector where it exists (Chrome / Android), and @zxing/browser (loaded only
 * when the camera opens) everywhere else, e.g. iPhone Safari. Either way the result is a raw string handed to
 * `onScan`; matching it to an item is `lib/mis/scan-input.ts`. If the camera is blocked, missing or unsupported the
 * panel says so and the person types — nothing about the cart depends on scanning.
 *
 * Needs a real-device test (camera permission, focus, lighting) — it cannot be exercised in unit tests.
 */

type DetectorLike = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts?: { formats?: string[] }) => DetectorLike;

const FORMATS = ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'data_matrix'];

export function ScanButton({ onScan }: { onScan: (raw: string) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Kept in a ref so a parent re-render (a new onScan closure) never restarts the camera.
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: number | null = null;
    let controls: { stop(): void } | null = null;

    const finish = (raw: string) => {
      if (stopped) return;
      stopped = true;
      setOpen(false);
      onScanRef.current(raw);
    };

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('unsupported'), { name: 'Unsupported' });
        const Detector = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
        const video = videoRef.current;
        if (!video) return;
        if (Detector) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
          if (stopped) return stream.getTracks().forEach((t) => t.stop());
          video.srcObject = stream;
          await video.play();
          const detector = new Detector({ formats: FORMATS });
          timer = window.setInterval(async () => {
            try {
              const found = await detector.detect(video);
              if (found[0]?.rawValue) finish(found[0].rawValue);
            } catch {
              /* a frame that cannot be read is skipped */
            }
          }, 250);
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          const reader = new BrowserMultiFormatReader();
          controls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
            if (result) finish(result.getText());
          });
          if (stopped) controls.stop();
        }
      } catch (cause) {
        if (!stopped) setError(scanErrorMessage((cause as { name?: string } | null)?.name));
      }
    })();

    return () => {
      stopped = true;
      if (timer !== null) window.clearInterval(timer);
      controls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => { setError(null); setOpen(true); }}
        aria-label="Scan a barcode or QR code with the camera"
        className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 active:bg-slate-100"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
          <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M4 12h16" />
        </svg>
        Scan
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Scan an item" className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4">
          <p className="text-center text-sm font-semibold text-white">Point the camera at the item barcode or QR code</p>
          <video ref={videoRef} playsInline muted className="mx-auto my-3 max-h-[60vh] w-full max-w-md flex-1 rounded-2xl bg-black object-cover" />
          {error && <p role="alert" className="mx-auto max-w-md rounded-xl bg-red-50 p-3 text-sm font-medium text-red-800">{error}</p>}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mx-auto mt-3 min-h-12 w-full max-w-md rounded-xl bg-white px-4 text-base font-semibold text-slate-900"
          >
            {error ? 'Type the code instead' : 'Cancel — I will type it'}
          </button>
        </div>
      )}
    </>
  );
}
