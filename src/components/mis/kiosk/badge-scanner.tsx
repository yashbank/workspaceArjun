'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/mis/kit/button';

/**
 * R2-105 — scan a badge QR / barcode with the device camera, with a typed fallback.
 *
 * The camera path uses the browser's built-in `BarcodeDetector` (Chrome / Android, the kiosk
 * tablet). Where that or the camera is missing or refused, the typed box below still works - and
 * a USB/Bluetooth scanner that "types" the code and presses Enter lands in the same box.
 * This component only reports the raw decoded string; matching it to a person is `resolveScan`.
 */

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts?: { formats?: string[] }) => Detector;

function detectorCtor(): DetectorCtor | null {
  if (typeof window === 'undefined') return null;
  const ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  return ctor ?? null;
}

interface Props {
  /** Called with the raw text of each accepted scan or typed entry. */
  onScan: (raw: string) => void;
  /** Shown under the box - the result of the last scan ("Not found", ...). */
  feedback?: { tone: 'ok' | 'error'; text: string } | null;
}

export function BadgeScanner({ onScan, feedback }: Props) {
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastRef = useRef<{ value: string; at: number } | null>(null);
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  useEffect(() => {
    if (!cameraOn) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const Ctor = detectorCtor();
    if (!Ctor || !navigator.mediaDevices?.getUserMedia) {
      // Reported through the timer so no state is set synchronously in the effect body.
      timer = setTimeout(() => { setCameraError('This device cannot scan with the camera. Type the badge code below.'); setCameraOn(false); }, 0);
      return () => { if (timer) clearTimeout(timer); };
    }
    const detector = new Ctor({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'itf', 'codabar'] });

    const tick = async () => {
      const video = videoRef.current;
      if (stopped) return;
      if (video && video.readyState >= 2) {
        try {
          const hits = await detector.detect(video);
          const value = hits[0]?.rawValue;
          const now = Date.now();
          // The same badge held in view fires every frame; accept it once per 3 seconds.
          if (value && !(lastRef.current && lastRef.current.value === value && now - lastRef.current.at < 3000)) {
            lastRef.current = { value, at: now };
            onScanRef.current(value);
          }
        } catch {
          /* a frame that cannot be read is just skipped */
        }
      }
      if (!stopped) timer = setTimeout(tick, 250);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        if (stopped) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play().catch(() => undefined);
        }
        setCameraError(null);
        tick();
      })
      .catch(() => {
        if (stopped) return;
        setCameraError('The camera is blocked or missing. Allow camera access, or type the badge code below.');
        setCameraOn(false);
      });

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [cameraOn]);

  const submitTyped = () => {
    const value = typed.trim();
    if (!value) return;
    onScan(value);
    setTyped('');
  };

  return (
    <div className="flex flex-col gap-2" data-testid="badge-scanner">
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Badge code"
          className="min-h-12 min-w-0 flex-1 rounded-lg border border-gray-200 px-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Scan or type badge code, then Enter"
          value={typed}
          autoComplete="off"
          autoCapitalize="characters"
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitTyped(); } }}
        />
        <Button variant="secondary" onClick={submitTyped} disabled={!typed.trim()}>Go</Button>
        <Button variant="secondary" onClick={() => { setCameraError(null); setCameraOn((on) => !on); }}>
          {cameraOn ? 'Stop camera' : 'Scan with camera'}
        </Button>
      </div>
      {cameraOn && (
        <video ref={videoRef} playsInline muted className="max-h-64 w-full rounded-lg bg-black object-cover" aria-label="Camera preview" />
      )}
      {cameraError && <p role="alert" className="text-sm text-amber-700">{cameraError}</p>}
      {feedback && (
        <p role={feedback.tone === 'error' ? 'alert' : 'status'} className={`text-sm ${feedback.tone === 'error' ? 'text-red-600' : 'text-green-700'}`}>{feedback.text}</p>
      )}
    </div>
  );
}
